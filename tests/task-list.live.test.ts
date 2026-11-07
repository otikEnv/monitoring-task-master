import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, PAGE_SIZE, type TaskListParams } from "@/lib/tasks/list-params";
import { loadTaskList } from "@/lib/tasks/list";

/**
 * Daftar task dengan SESI VIEWER NYATA terhadap Supabase asli. Hanya lewat `npm run test:live`.
 * Prasyarat: migrasi 20261107020000_task_list_views.sql diterapkan.
 * Data uji berawalan TMP-LIST- dan dihapus di akhir.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENABLED = Boolean(URL_ && ANON && SERVICE);

describe.skipIf(!ENABLED)("daftar task (Supabase asli, sesi viewer)", () => {
  const opt = { auth: { persistSession: false, autoRefreshToken: false } };
  const run = randomBytes(3).toString("hex");
  const email = `tmp-list-${run}@example.com`;
  const password = "Tmp!" + randomBytes(9).toString("base64url");
  let admin: SupabaseClient;
  let viewer: SupabaseClient;
  let userId: string;
  const ids: Record<string, string> = {};
  const P = (over: Partial<TaskListParams> = {}): TaskListParams => ({ ...DEFAULT_PARAMS, ...over });
  const A = () => P({ source: ids.a });

  const addSource = async (key: string, name: string) => {
    const { data, error } = await admin
      .from("sources")
      .insert({
        name: `TMP-LIST-${run}-${name}`, provider: "github", repo_url: `https://github.com/tmp/${run}-${key}`,
        token_encrypted: "v1.RAHASIA.RAHASIA.RAHASIA",
      })
      .select("id").single();
    if (error) throw error;
    ids[key] = data.id as string;
  };
  type T = { tag: string; id: string; title?: string; status?: string; priority?: string | null; st?: number; sd?: number };
  const addTasks = async (key: string, tasks: T[]) => {
    const rows = tasks.map((t) => ({
      source_id: ids[key], tag: t.tag, task_id: t.id, title: t.title ?? `Task ${t.id}`,
      status: t.status ?? "pending", priority: t.priority === undefined ? "medium" : t.priority,
      subtasks_total: t.st ?? 0, subtasks_done: t.sd ?? 0,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("tasks").insert(rows.slice(i, i + 500));
      if (error) throw error;
    }
  };
  const list = (p: TaskListParams) => loadTaskList(viewer, p);
  const idsOf = async (p: TaskListParams) => (await list(p)).rows.map((r) => r.taskId);

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, opt);
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;

    await addSource("a", "Zeta");
    await addTasks("a", [
      { tag: "master", id: "1", status: "done", priority: "high", st: 4, sd: 4 },
      { tag: "master", id: "2", status: "in-progress", priority: "low", st: 2, sd: 1 },
      { tag: "master", id: "3", status: "blocked", priority: "medium", st: 0 },
      { tag: "master", id: "10", status: "pending", priority: "high", st: 5, sd: 0 },
      { tag: "master", id: "11", status: "review", priority: null },
      { tag: "master", id: "12", status: "deferred", priority: "low" },
      { tag: "master", id: "20", status: "cancelled", priority: "medium" },
      { tag: "fitur", id: "1", status: "pending", priority: "high", title: "Tag <fitur> & 'khusus'" },
      { tag: "fitur", id: "abc", status: "aneh", priority: "medium" },
    ]);
    await addSource("b", "Alfa");
    await addTasks("b", [{ tag: "khusus", id: "1", status: "done", priority: "low", title: "Milik Alfa" }]);
    await addSource("besar", "Besar");
    await addTasks("besar", Array.from({ length: 1200 }, (_, i) => ({ tag: "master", id: String(i + 1), status: i % 3 === 0 ? "done" : "pending" })));

    viewer = createClient(URL_!, ANON!, opt);
    const { error: signInError } = await viewer.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  }, 90_000);

  afterAll(async () => {
    await admin.from("sources").delete().like("name", `TMP-LIST-${run}-%`);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  describe("filter", () => {
    it("tanpa filter: halaman pertama berisi data dengan bentuk yang benar", async () => {
      const r = await list(P());
      expect(r.rows.length).toBeGreaterThan(0);
      expect(r.rows.length).toBeLessThanOrEqual(PAGE_SIZE);
      expect(r.total).toBeGreaterThanOrEqual(1210);
      expect(r.rows[0]).toEqual({
        sourceId: expect.any(String), sourceName: expect.any(String), tag: expect.any(String), taskId: expect.any(String),
        title: expect.any(String), status: expect.any(String), priority: expect.toBeOneOf([null, expect.any(String)]),
        subtasksTotal: expect.any(Number), subtasksDone: expect.any(Number),
      });
    });

    it("filter aplikasi", async () => {
      const r = await list(A());
      expect(r.total).toBe(9);
      expect(new Set(r.rows.map((x) => x.sourceId))).toEqual(new Set([ids.a]));
    });

    it("filter tag di dalam aplikasi", async () => {
      expect((await list({ ...A(), tag: "fitur" })).total).toBe(2);
      expect((await list({ ...A(), tag: "master" })).total).toBe(7);
    });

    it.each([
      ["pending", 2], ["in-progress", 1], ["review", 1], ["blocked", 1], ["done", 1], ["deferred", 1], ["cancelled", 1],
    ])("filter status %s", async (status, n) => {
      const r = await list({ ...A(), status });
      expect(r.total).toBe(n);
      expect(r.rows.every((x) => x.status === status)).toBe(true);
    });

    it("filter status 'other' hanya mengembalikan status yang tidak dikenal", async () => {
      const r = await list({ ...A(), status: "other" });
      expect(r.rows.map((x) => [x.taskId, x.status])).toEqual([["abc", "aneh"]]);
    });

    it("filter prioritas", async () => {
      expect((await list({ ...A(), priority: "high" })).total).toBe(3);
      expect((await list({ ...A(), priority: "low" })).total).toBe(2);
      expect((await list({ ...A(), priority: "medium" })).total).toBe(3);
    });

    it("filter digabung (AND)", async () => {
      const r = await list({ ...A(), tag: "master", priority: "high", status: "pending" });
      expect(r.rows.map((x) => x.taskId)).toEqual(["10"]);
    });

    it("tidak ada yang cocok -> kosong, bukan galat", async () => {
      const r = await list({ ...A(), tag: "master", status: "blocked", priority: "high" });
      expect(r).toMatchObject({ total: 0, rows: [], page: 1, pageCount: 1 });
    });

    it("judul dengan karakter khusus dikembalikan apa adanya", async () => {
      const r = await list({ ...A(), tag: "fitur", priority: "high" });
      expect(r.rows[0].title).toBe("Tag <fitur> & 'khusus'");
    });
  });

  describe("opsi filter dan tag yang tidak cocok", () => {
    it("daftar tag mengikuti aplikasi terpilih", async () => {
      expect((await list(A())).tags).toEqual(["fitur", "master"]);
      expect((await list(P({ source: ids.b }))).tags).toEqual(["khusus"]);
    });

    it("tanpa aplikasi terpilih, tag dari semua aplikasi tersedia", async () => {
      const tags = (await list(P())).tags;
      expect(tags).toEqual(expect.arrayContaining(["fitur", "master", "khusus"]));
    });

    it("daftar aplikasi memuat sumber uji", async () => {
      const names = (await list(P())).sources.map((s) => s.id);
      expect(names).toEqual(expect.arrayContaining([ids.a, ids.b, ids.besar]));
    });

    it("tag milik aplikasi lain diabaikan dan dilaporkan (bukan daftar kosong)", async () => {
      const r = await list({ ...A(), tag: "khusus" });
      expect(r.ignoredTag).toBe("khusus");
      expect(r.params.tag).toBeNull();
      expect(r.total).toBe(9); // semua task aplikasi A
    });

    it("tag yang valid untuk aplikasinya tidak diabaikan", async () => {
      const r = await list({ ...A(), tag: "fitur" });
      expect(r.ignoredTag).toBeNull();
      expect(r.params.tag).toBe("fitur");
    });

    it("tag yang tidak ada di mana pun diabaikan", async () => {
      expect((await list({ ...P(), tag: "tidak-ada-sama-sekali" })).ignoredTag).toBe("tidak-ada-sama-sekali");
    });
  });

  describe("urutan", () => {
    const master = (over: Partial<TaskListParams>) => idsOf({ ...A(), tag: "master", ...over });

    it("ID diurutkan sebagai angka (1, 2, 3, 10, 11, 12, 20), bukan teks", async () => {
      expect(await master({ sort: "id", dir: "asc" })).toEqual(["1", "2", "3", "10", "11", "12", "20"]);
      expect(await master({ sort: "id", dir: "desc" })).toEqual(["20", "12", "11", "10", "3", "2", "1"]);
    });

    it("ID non-angka selalu di akhir, up maupun down", async () => {
      const asc = await idsOf({ ...A(), sort: "id", dir: "asc" });
      const desc = await idsOf({ ...A(), sort: "id", dir: "desc" });
      expect(asc[asc.length - 1]).toBe("abc");
      expect(desc[desc.length - 1]).toBe("abc");
    });

    it("status: yang paling perlu perhatian dulu (blocked, in progress, ditinjau, pending, ditunda, selesai, dibatalkan)", async () => {
      const r = await list({ ...A(), tag: "master", sort: "status", dir: "asc" });
      expect(r.rows.map((x) => x.status)).toEqual(["blocked", "in-progress", "review", "pending", "deferred", "done", "cancelled"]);
      const d = await list({ ...A(), tag: "master", sort: "status", dir: "desc" });
      expect(d.rows.map((x) => x.status)).toEqual(["cancelled", "done", "deferred", "pending", "review", "in-progress", "blocked"]);
    });

    it("prioritas: tinggi, sedang, rendah, lalu kosong", async () => {
      const r = await list({ ...A(), tag: "master", sort: "priority", dir: "asc" });
      expect(r.rows.map((x) => x.priority)).toEqual(["high", "high", "medium", "medium", "low", "low", null]);
    });

    it("subtask: menurut rasio selesai; yang tanpa subtask selalu di akhir", async () => {
      const asc = await list({ ...A(), tag: "master", sort: "subtasks", dir: "asc" });
      const ratios = asc.rows.map((x) => (x.subtasksTotal ? x.subtasksDone / x.subtasksTotal : null));
      expect(ratios.slice(0, 3)).toEqual([0, 0.5, 1]);
      expect(ratios.slice(3).every((x) => x === null)).toBe(true);
      const desc = await list({ ...A(), tag: "master", sort: "subtasks", dir: "desc" });
      const dr = desc.rows.map((x) => (x.subtasksTotal ? x.subtasksDone / x.subtasksTotal : null));
      expect(dr.slice(0, 3)).toEqual([1, 0.5, 0]);
      expect(dr.slice(3).every((x) => x === null)).toBe(true);
    });

    it("aplikasi: menurut nama, up dan down", async () => {
      // Tidak depends on data lain di database: telusuri halaman demi halaman sampai kedua sumber uji
      // (keduanya punya task berprioritas rendah) ditemukan, lalu catat urutan kemunculannya.
      const orderOf = async (dir: "asc" | "desc") => {
        const seen: string[] = [];
        for (let page = 1; page <= 50 && seen.length < 2; page++) {
          const r = await list(P({ sort: "app", dir, priority: "low", page }));
          for (const row of r.rows) {
            if ([ids.a, ids.b].includes(row.sourceId) && !seen.includes(row.sourceId)) seen.push(row.sourceId);
          }
          if (page >= r.pageCount) break;
        }
        return seen;
      };
      expect(await orderOf("asc")).toEqual([ids.b, ids.a]); // Alfa sebelum Zeta
      expect(await orderOf("desc")).toEqual([ids.a, ids.b]);
    });

    it("judul: urutan menurun adalah kebalikan persis dari urutan up", async () => {
      // Pengurutan teks memakai collation database (bisa berbeda dari JavaScript), jadi yang diperiksa
      // adalah konsistensi: judul semuanya unik, sehingga desc harus tepat kebalikan asc.
      const asc = (await list({ ...A(), sort: "title", dir: "asc" })).rows.map((x) => `${x.tag}/${x.taskId}`);
      const desc = (await list({ ...A(), sort: "title", dir: "desc" })).rows.map((x) => `${x.tag}/${x.taskId}`);
      expect(asc).toHaveLength(9);
      expect(desc).toEqual([...asc].reverse());
    });

    it("tag: up dan down", async () => {
      const g = (await list({ ...A(), sort: "tag", dir: "asc" })).rows.map((x) => x.tag);
      expect(g[0]).toBe("fitur");
      expect(g.at(-1)).toBe("master");
      const d = (await list({ ...A(), sort: "tag", dir: "desc" })).rows.map((x) => x.tag);
      expect(d[0]).toBe("master");
      expect(d.at(-1)).toBe("fitur");
    });
  });

  describe("paginasi", () => {
    const B = () => P({ source: ids.besar, sort: "id", dir: "asc" });

    it("hitungan total tidak terpotong pada 1000+ task (batas baris PostgREST)", async () => {
      const r = await list(B());
      expect(r.total).toBe(1200);
      expect(r.pageCount).toBe(24);
      expect(r.pageSize).toBe(50);
    });

    it("semua halaman bersama-sama memuat tepat 1200 task unik, berurutan, tanpa celah atau tumpang tindih", async () => {
      const all: string[] = [];
      for (let page = 1; page <= 24; page++) {
        const r = await list({ ...B(), page });
        expect(r.page).toBe(page);
        expect(r.rows).toHaveLength(50);
        all.push(...r.rows.map((x) => x.taskId));
      }
      expect(new Set(all).size).toBe(1200);
      expect(all).toEqual(Array.from({ length: 1200 }, (_, i) => String(i + 1)));
    }, 60_000);

    it("urutan stabil untuk nilai kolom yang sama (status) antar halaman", async () => {
      const seen = new Set<string>();
      for (let page = 1; page <= 24; page++) {
        for (const r of (await list({ ...B(), sort: "status", page })).rows) {
          expect(seen.has(r.taskId)).toBe(false);
          seen.add(r.taskId);
        }
      }
      expect(seen.size).toBe(1200);
    }, 60_000);

    it("halaman melewati akhir -> dipotong ke halaman terakhir (tanpa galat 416)", async () => {
      const r = await list({ ...B(), page: 999 });
      expect(r.page).toBe(24);
      expect(r.rows).toHaveLength(50);
      expect(r.rows.at(-1)?.taskId).toBe("1200");
    });

    it("halaman melewati akhir pada hasil kosong -> halaman 1 dan kosong", async () => {
      const r = await list({ ...A(), status: "blocked", priority: "high", page: 5 });
      expect(r).toMatchObject({ total: 0, rows: [], page: 1 });
    });

    it("filter mengurangi total dengan benar pada dataset besar", async () => {
      const r = await list({ ...B(), status: "done" });
      expect(r.total).toBe(400);
      expect(r.pageCount).toBe(8);
    });

    it("waktu muat satu halaman pada 1200+ task wajar (< 1,5 dtk)", async () => {
      await list(B()); // panaskan
      const t0 = Date.now();
      await list({ ...B(), sort: "status" });
      expect(Date.now() - t0).toBeLessThan(1500);
    });
  });

  describe("keamanan", () => {
    it("viewer tidak melihat token lewat jalur apa pun", async () => {
      const r = JSON.stringify(await list(P({ source: ids.a })));
      expect(r).not.toContain("RAHASIA");
      expect(r).not.toContain("token_encrypted");
      expect((await viewer.from("sources").select("token_encrypted")).error).toBeTruthy();
    });

    it("anon (tanpa login) tidak bisa membaca view", async () => {
      const anon = createClient(URL_!, ANON!, opt);
      expect((await anon.from("task_list").select("*")).error).toBeTruthy();
      expect((await anon.from("source_tags").select("*")).error).toBeTruthy();
    });

    it("viewer tidak bisa menulis ke view", async () => {
      expect((await viewer.from("task_list").delete().eq("source_id", ids.a)).error).toBeTruthy();
      expect((await viewer.from("source_tags").delete().eq("source_id", ids.a)).error).toBeTruthy();
    });

    it("nilai filter yang berbahaya diperlakukan sebagai teks biasa", async () => {
      const r = await list({ ...P(), tag: "x\"); drop table tasks;--" });
      expect(r.total).toBeGreaterThanOrEqual(0);
      expect(r.ignoredTag).toBe("x\"); drop table tasks;--");
      expect((await admin.from("tasks").select("*", { count: "exact", head: true })).count).toBeGreaterThan(0);
    });
  });
});
