// Fase 0: validasi data. Menarik tasks.json dari semua repo di daftar sumber,
// mengenali bentuknya, dan mencetak jumlah task per aplikasi, tag, dan status.
//
// Jalankan:  npm run aggregate            (ringkasan)
//            npm run aggregate -- --fixtures   (juga tulis fixture tersanitasi ke tests/fixtures)
//
// Konfigurasi: scripts/aggregate.sources.json (tidak di-commit; contoh: aggregate.sources.example.json)
// Token: dibaca dari .env.local lewat nama variabel di "tokenEnv". Token tidak pernah dicetak.
// Keluaran penuh (mentah): .aggregate-out/ (tidak di-commit).

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONFIG = process.env.AGG_CONFIG ?? path.join(ROOT, "scripts", "aggregate.sources.json");
const OUT_DIR = path.join(ROOT, ".aggregate-out");
const FIXTURE_DIR = path.join(ROOT, "tests", "fixtures");
const WRITE_FIXTURES = process.argv.includes("--fixtures");

const STATUSES = ["pending", "in-progress", "review", "blocked", "done", "deferred", "cancelled"];

// ---------------------------------------------------------------- pengambilan (GitHub)

class FetchError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

function parseGithubUrl(repoUrl) {
  const m = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/.exec(repoUrl.trim());
  if (!m) throw new FetchError("config", `URL repo GitHub tidak valid: ${repoUrl}`);
  return { owner: m[1], repo: m[2] };
}

async function githubRequest(url, token, accept) {
  let res;
  try {
    res = await fetch(url, {
      headers: {
        Accept: accept,
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "monitoring-task-master-aggregate",
      },
    });
  } catch (e) {
    throw new FetchError("network", `Tidak bisa menjangkau GitHub (${e.cause?.code ?? e.message}).`);
  }
  return res;
}

function explainStatus(res, ctx) {
  const remaining = res.headers.get("x-ratelimit-remaining");
  switch (res.status) {
    case 401:
      return new FetchError("token", "Token ditolak (401): salah, dicabut, atau kedaluwarsa.");
    case 403:
      return remaining === "0"
        ? new FetchError("rate_limit", "Rate limit GitHub habis; coba lagi nanti.")
        : new FetchError("forbidden", "Akses dilarang (403): token tidak punya izin Contents: Read-only ke repo ini.");
    case 404:
      return new FetchError(
        "not_found",
        `Tidak ditemukan (404): cek URL repo, branch "${ctx.branch}", dan path "${ctx.path}". ` +
          "Repo privat yang tidak boleh diakses token juga memberi 404.",
      );
    default:
      return new FetchError("http", `GitHub menjawab HTTP ${res.status}.`);
  }
}

async function fetchGithub(source, token) {
  const { owner, repo } = parseGithubUrl(source.repoUrl);
  const filePath = source.path.replace(/^\/+/, "");
  const encPath = filePath.split("/").map(encodeURIComponent).join("/");
  const ref = encodeURIComponent(source.branch);
  const ctx = { branch: source.branch, path: filePath };

  const res = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encPath}?ref=${ref}`,
    token,
    "application/vnd.github.raw+json",
  );
  if (!res.ok) throw explainStatus(res, ctx);
  const content = await res.text();
  const etag = res.headers.get("etag");

  // Waktu commit terakhir file (mitigasi risiko: tasks.json belum di-commit).
  let lastCommitAt = null;
  const cres = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/commits?path=${encodeURIComponent(filePath)}&sha=${ref}&per_page=1`,
    token,
    "application/vnd.github+json",
  ).catch(() => null);
  if (cres?.ok) {
    const list = await cres.json();
    lastCommitAt = list?.[0]?.commit?.committer?.date ?? null;
  }
  return { content, etag, lastCommitAt, bytes: Buffer.byteLength(content) };
}

const ADAPTERS = { github: fetchGithub };

// ---------------------------------------------------------------- parsing

const isTaskArray = (v) => Array.isArray(v);

/** Mengenali { tasks: [...] } dan { <tag>: { tasks: [...] } }. Lainnya = galat. */
function parseTasksFile(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new FetchError("parse", `Bukan JSON valid: ${e.message}`);
  }
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new FetchError("shape", "Bentuk tidak dikenal: akar file bukan objek.");
  }
  if (isTaskArray(json.tasks)) {
    return { shape: "{ tasks }", tags: { master: json.tasks } };
  }
  const tags = {};
  for (const [key, val] of Object.entries(json)) {
    if (val && typeof val === "object" && isTaskArray(val.tasks)) tags[key] = val.tasks;
  }
  if (Object.keys(tags).length === 0) {
    throw new FetchError("shape", "Bentuk tidak dikenal: tidak ada { tasks: [...] } maupun { <tag>: { tasks: [...] } }.");
  }
  return { shape: "{ <tag>: { tasks } }", tags };
}

function countStatuses(tasks) {
  const c = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  c.other = 0;
  for (const t of tasks) {
    const s = String(t?.status ?? "");
    if (s in c && s !== "other") c[s]++;
    else c.other++;
  }
  const total = tasks.length;
  const subtasks = tasks.reduce((n, t) => n + (Array.isArray(t?.subtasks) ? t.subtasks.length : 0), 0);
  return { total, subtasks, ...c, percentDone: total ? Math.round((c.done / total) * 1000) / 10 : 0 };
}

// ---------------------------------------------------------------- fixture tersanitasi

/** Mempertahankan struktur dan status, mengganti semua teks bebas dengan placeholder. */
function sanitize(tasksByTag, shape) {
  const MAX = 6;
  const cleanSub = (s, i) => ({
    id: s?.id ?? i + 1,
    title: `Subtask ${i + 1}`,
    description: "Deskripsi disanitasi.",
    status: s?.status ?? "pending",
    dependencies: Array.isArray(s?.dependencies) ? s.dependencies : [],
    details: "Detail disanitasi.",
  });
  const cleanTask = (t, i) => ({
    id: t?.id ?? i + 1,
    title: `Task ${i + 1}`,
    description: "Deskripsi disanitasi.",
    status: t?.status ?? "pending",
    priority: t?.priority ?? "medium",
    dependencies: Array.isArray(t?.dependencies) ? t.dependencies.filter((d) => typeof d !== "object") : [],
    details: "Detail disanitasi.",
    testStrategy: "Strategi pengujian disanitasi.",
    subtasks: (Array.isArray(t?.subtasks) ? t.subtasks : []).slice(0, 3).map(cleanSub),
  });
  const pick = (tasks) => {
    // Ambil contoh yang mencakup tiap status yang ada, lalu isi sisanya.
    const seen = new Set();
    const chosen = [];
    for (const t of tasks) {
      if (!seen.has(t?.status)) { seen.add(t?.status); chosen.push(t); }
    }
    for (const t of tasks) {
      if (chosen.length >= MAX) break;
      if (!chosen.includes(t)) chosen.push(t);
    }
    return chosen.slice(0, Math.max(MAX, seen.size)).map(cleanTask);
  };
  if (shape === "{ tasks }") return { tasks: pick(tasksByTag.master) };
  return Object.fromEntries(
    Object.entries(tasksByTag).map(([tag, tasks]) => [tag, { tasks: pick(tasks), metadata: { sanitized: true } }]),
  );
}

// ---------------------------------------------------------------- utilitas tampilan

const fmtKB = (b) => `${(b / 1024).toFixed(1)} KB`;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function printTable(rows) {
  const head = ["tag", "task", "sub", "pending", "in-prog", "review", "blocked", "done", "deferred", "cancel", "other", "%done"];
  const body = rows.map((r) => [
    r.tag, r.total, r.subtasks, r.pending, r["in-progress"], r.review, r.blocked, r.done, r.deferred, r.cancelled, r.other, `${r.percentDone}%`,
  ].map(String));
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells) => "  " + cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log(line(head));
  console.log("  " + widths.map((w) => "-".repeat(w)).join("  "));
  body.forEach((b) => console.log(line(b)));
}

// ---------------------------------------------------------------- utama

if (!fs.existsSync(CONFIG)) {
  console.error(
    "scripts/aggregate.sources.json belum ada.\n" +
      "Salin scripts/aggregate.sources.example.json menjadi aggregate.sources.json lalu isi.",
  );
  process.exit(1);
}
const sources = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
if (!Array.isArray(sources) || sources.length === 0) {
  console.error("aggregate.sources.json harus berupa array dengan minimal satu sumber.");
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const summary = [];
let failed = 0;

for (const source of sources) {
  console.log(`\n== ${source.name}  (${source.provider}, ${source.repoUrl}, branch ${source.branch})`);
  const started = Date.now();
  try {
    const adapter = ADAPTERS[source.provider];
    if (!adapter) {
      throw new FetchError("config", `Penyedia "${source.provider}" belum didukung script ini (adapter lengkap ada di task 6).`);
    }
    const token = process.env[source.tokenEnv];
    if (!token) {
      throw new FetchError("config", `Variabel ${source.tokenEnv} kosong atau tidak ada di .env.local.`);
    }

    const file = await adapter(source, token);
    const { shape, tags } = parseTasksFile(file.content);
    const rows = Object.entries(tags).map(([tag, tasks]) => ({ tag, ...countStatuses(tasks) }));

    console.log(`  file    : ${fmtKB(file.bytes)} dalam ${Date.now() - started} ms, ETag ${file.etag ?? "-"}`);
    console.log(`  commit  : ${file.lastCommitAt ?? "tidak diketahui"} (terakhir file ini diubah)`);
    console.log(`  bentuk  : ${shape}, ${rows.length} tag`);
    printTable(rows);

    const unknown = rows.reduce((n, r) => n + r.other, 0);
    if (unknown) console.log(`  PERHATIAN: ${unknown} task dengan status di luar tujuh status baku (dihitung "other").`);
    if (rows.every((r) => r.total === 0)) console.log("  PERHATIAN: semua tag berisi 0 task (file valid tapi kosong).");

    fs.writeFileSync(path.join(OUT_DIR, `${slug(source.name)}.raw.json`), file.content);
    summary.push({
      name: source.name, provider: source.provider, repoUrl: source.repoUrl, branch: source.branch,
      path: source.path, ok: true, bytes: file.bytes, etag: file.etag, lastCommitAt: file.lastCommitAt, shape, tags: rows,
    });

    if (WRITE_FIXTURES) {
      fs.mkdirSync(FIXTURE_DIR, { recursive: true });
      const out = path.join(FIXTURE_DIR, `${slug(source.name)}.sanitized.json`);
      fs.writeFileSync(out, JSON.stringify(sanitize(tags, shape), null, 2) + "\n");
      console.log(`  fixture : ${path.relative(ROOT, out)} (tersanitasi)`);
    }
  } catch (e) {
    failed++;
    const kind = e instanceof FetchError ? e.kind : "internal";
    console.log(`  GAGAL [${kind}]: ${e.message}`);
    summary.push({ name: source.name, provider: source.provider, ok: false, error: { kind, message: e.message } });
  }
}

fs.writeFileSync(
  path.join(OUT_DIR, "aggregate.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), sources: summary }, null, 2) + "\n",
);

console.log(`\nRingkasan: ${sources.length - failed} dari ${sources.length} sumber berhasil.`);
console.log(`Hasil gabungan: ${path.relative(ROOT, path.join(OUT_DIR, "aggregate.json"))}`);
process.exit(failed ? 1 : 0);
