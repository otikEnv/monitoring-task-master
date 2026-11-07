import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError, type FetchFileResult, type ProviderAdapter } from "@/lib/providers/types";
import { syncSource, type SyncDeps } from "@/lib/sync/sync-source";
import type { SourceRecord, SuccessPayload, SyncResult, SyncStore } from "@/lib/sync/types";

const TOKEN = "ghp_TOKEN_ASLI_RAHASIA";
const STORED = "v1.enc.enc.enc"; // token terenkripsi (tiruan)
const ID_A = "00000000-0000-0000-0000-00000000000a";
const ID_B = "00000000-0000-0000-0000-00000000000b";

const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "echoapp.sanitized.json"), "utf8");
const FILE_OK: FetchFileResult = {
  status: "ok",
  content: fixture,
  etag: '"etag-baru"',
  lastCommitAt: "2026-11-06T03:52:39Z",
  tokenExpiresAt: "2027-02-04T09:30:29.000Z",
};

const source = (over: Partial<SourceRecord> = {}): SourceRecord => ({
  id: ID_A,
  name: "App A",
  provider: "github",
  repo_url: "https://github.com/o/a",
  branch: "stg",
  file_path: ".taskmaster/tasks/tasks.json",
  token_encrypted: STORED,
  token_expires_at: null,
  is_active: true,
  etag: '"etag-lama"',
  last_synced_at: "2026-11-05T00:00:00Z",
  ...over,
});

/** Penyimpanan di memori yang merekam semua penulisan. */
function fakeStore(sources: SourceRecord[]) {
  const log = {
    applied: [] as Array<{ id: string; payload: SuccessPayload }>,
    notModified: [] as string[],
    failed: [] as Array<{ id: string; message: string }>,
  };
  const failures = { apply: false, markFailed: false };
  const store: SyncStore = {
    getSource: async (id) => sources.find((s) => s.id === id) ?? null,
    applySuccess: async (id, payload) => {
      if (failures.apply) throw new Error(`DB error rahasia ${TOKEN}`);
      log.applied.push({ id, payload });
    },
    markNotModified: async (id) => void log.notModified.push(id),
    markFailed: async (id, message) => {
      if (failures.markFailed) throw new Error("DB mati");
      log.failed.push({ id, message });
    },
  };
  return { store, log, failures };
}

function setup(opts: {
  sources?: SourceRecord[];
  fetchFile?: (p: Parameters<ProviderAdapter["fetchFile"]>[0]) => Promise<FetchFileResult>;
  decrypt?: (s: string) => string;
  /** Time awal jam tiruan (ms). Bawaan 1000 (1970); atur ke waktu nyata untuk menguji kedaluwarsa. */
  nowBase?: number;
} = {}) {
  const fs_ = fakeStore(opts.sources ?? [source()]);
  const fetchFile = vi.fn(opts.fetchFile ?? (async () => FILE_OK));
  const adapter: ProviderAdapter = { provider: "github", validateRepoUrl: () => null, fetchFile };
  let t = opts.nowBase ?? 1000;
  const deps: SyncDeps = {
    store: fs_.store,
    decrypt: opts.decrypt ?? ((s) => (s === STORED ? TOKEN : "salah")),
    getAdapter: () => adapter,
    now: () => (t += 10),
  };
  return { ...fs_, fetchFile, deps };
}

const noSecrets = (r: SyncResult) => {
  const text = JSON.stringify(r);
  expect(text).not.toContain(TOKEN);
  expect(text).not.toContain(STORED);
  expect(text).not.toContain("token_encrypted");
};

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("sinkronisasi berhasil", () => {
  it("mengambil file dengan token terdekripsi dan ETag tersimpan, lalu menyimpan task dan snapshot", async () => {
    const t = setup();
    const r = await syncSource(ID_A, t.deps);

    expect(t.fetchFile).toHaveBeenCalledWith({
      repoUrl: "https://github.com/o/a",
      branch: "stg",
      path: ".taskmaster/tasks/tasks.json",
      token: TOKEN,
      etag: '"etag-lama"',
    });
    expect(r).toMatchObject({ status: "success", name: "App A", taskCount: 6, lastCommitAt: FILE_OK.status === "ok" ? FILE_OK.lastCommitAt : null });
    expect(t.log.applied).toHaveLength(1);
    const { payload } = t.log.applied[0];
    expect(payload.tasks).toHaveLength(6);
    expect(payload.etag).toBe('"etag-baru"');
    expect(payload.lastCommitAt).toBe("2026-11-06T03:52:39Z");
    expect(payload.tokenExpiresAt).toBe("2027-02-04T09:30:29.000Z");
    expect(t.log.failed).toEqual([]);
    noSecrets(r);
  });

  it("mencatat satu snapshot per tag dengan hitungan status yang benar (termasuk blocked)", async () => {
    const t = setup();
    await syncSource(ID_A, t.deps);
    const { snapshots } = t.log.applied[0].payload;
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ source_id: ID_A, tag: "master", total: 6, blocked: 1, other: 0 });
  });

  it("file banyak tag menghasilkan satu snapshot per tag", async () => {
    const multi = JSON.stringify({
      master: { tasks: [{ id: "1", title: "a", status: "done" }] },
      fitur: { tasks: [{ id: "1", title: "b", status: "pending" }, { id: "2", title: "c", status: "blocked" }] },
    });
    const t = setup({ fetchFile: async () => ({ ...FILE_OK, content: multi }) });
    const r = await syncSource(ID_A, t.deps);
    expect(t.log.applied[0].payload.snapshots.map((s) => [s.tag, s.total])).toEqual([["master", 1], ["fitur", 2]]);
    expect(r).toMatchObject({ status: "success", taskCount: 3, tags: [{ tag: "master", total: 1 }, { tag: "fitur", total: 2 }] });
  });

  it("file valid dengan 0 task adalah sinkronisasi sah (bukan galat)", async () => {
    const t = setup({ fetchFile: async () => ({ ...FILE_OK, content: '{"master":{"tasks":[]}}' }) });
    const r = await syncSource(ID_A, t.deps);
    expect(r).toMatchObject({ status: "success", taskCount: 0 });
    expect(t.log.applied[0].payload.snapshots[0]).toMatchObject({ total: 0 });
  });

  it("meneruskan peringatan normalizer ke hasil", async () => {
    const dupSub = JSON.stringify({ tasks: [{ id: "1", title: "a", status: "done", subtasks: [{ id: 1, title: "x" }, { id: 1, title: "y" }] }] });
    const t = setup({ fetchFile: async () => ({ ...FILE_OK, content: dupSub }) });
    const r = await syncSource(ID_A, t.deps);
    expect(r.status === "success" && r.warnings.some((w) => /subtask IDs are not unique/.test(w))).toBe(true);
  });
});

describe("tidak berubah (304)", () => {
  it("hanya memperbarui waktu sinkron: tanpa tulis task, tanpa snapshot", async () => {
    const t = setup({ fetchFile: async () => ({ status: "not_modified", etag: '"etag-lama"' }) });
    const r = await syncSource(ID_A, t.deps);
    expect(r).toMatchObject({ status: "not_modified", name: "App A" });
    expect(t.log.notModified).toEqual([ID_A]);
    expect(t.log.applied).toEqual([]);
    expect(t.log.failed).toEqual([]);
  });
});

describe("kegagalan mempertahankan data terakhir yang berhasil", () => {
  const kinds = ["unauthorized", "forbidden", "not_found", "rate_limited", "server_error", "timeout", "network", "too_large", "invalid_url", "unexpected"] as const;

  it.each(kinds)("galat penyedia '%s' -> ditandai gagal, task tidak disentuh", async (kind) => {
    const t = setup({
      fetchFile: async () => {
        throw new ProviderError(kind, `pesan ${kind}`);
      },
    });
    const r = await syncSource(ID_A, t.deps);
    expect(r).toMatchObject({
      status: "failed",
      error: { kind, message: `pesan ${kind}` },
      lastSyncedAt: "2026-11-05T00:00:00Z", // waktu data terakhir yang berhasil
    });
    expect(t.log.failed).toEqual([{ id: ID_A, message: `pesan ${kind}` }]);
    expect(t.log.applied).toEqual([]);
    expect(t.log.notModified).toEqual([]);
    noSecrets(r);
  });

  it("file rusak (bukan JSON) -> invalid_file, bukan 0 task", async () => {
    const t = setup({ fetchFile: async () => ({ ...FILE_OK, content: "{ rusak" }) });
    const r = await syncSource(ID_A, t.deps);
    expect(r).toMatchObject({ status: "failed", error: { kind: "invalid_file" } });
    expect(t.log.applied).toEqual([]);
  });

  it("bentuk file tidak dikenal (mis. package.json) -> invalid_file", async () => {
    const t = setup({ fetchFile: async () => ({ ...FILE_OK, content: '{"name":"x","version":"1"}' }) });
    const r = await syncSource(ID_A, t.deps);
    expect(r).toMatchObject({ status: "failed", error: { kind: "invalid_file" } });
    expect(t.log.applied).toEqual([]);
  });

  it("token belum diisi -> no_token tanpa memanggil penyedia", async () => {
    const t = setup({ sources: [source({ token_encrypted: null })] });
    const r = await syncSource(ID_A, t.deps);
    expect(r).toMatchObject({ status: "failed", error: { kind: "no_token" } });
    expect(t.fetchFile).not.toHaveBeenCalled();
  });

  it("token tersimpan tidak bisa didekripsi -> token_decrypt tanpa memanggil penyedia", async () => {
    const t = setup({
      decrypt: () => {
        throw new Error("Token tidak bisa didekripsi (data rusak atau kunci berbeda). Isi ulang token sumber.");
      },
    });
    const r = await syncSource(ID_A, t.deps);
    expect(r).toMatchObject({ status: "failed", error: { kind: "token_decrypt" } });
    expect(t.fetchFile).not.toHaveBeenCalled();
    expect(t.log.failed).toHaveLength(1);
  });

  it("gagal menyimpan ke database -> storage, pesan generik tanpa detail DB", async () => {
    const t = setup();
    t.failures.apply = true;
    const r = await syncSource(ID_A, t.deps);
    expect(r).toMatchObject({ status: "failed", error: { kind: "storage" } });
    expect(JSON.stringify(r)).not.toContain("DB error rahasia");
    noSecrets(r);
    expect(t.log.failed).toHaveLength(1);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(TOKEN);
  });

  it("galat tak terduga -> internal; pesan asli (yang memuat token) tidak bocor ke hasil maupun log", async () => {
    const t = setup({
      fetchFile: async () => {
        throw new Error(`boom: ${TOKEN}`);
      },
    });
    const r = await syncSource(ID_A, t.deps);
    expect(r).toMatchObject({ status: "failed", error: { kind: "internal" } });
    noSecrets(r);
    expect(JSON.stringify(t.log.failed)).not.toContain(TOKEN);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(TOKEN);
  });
});

describe("token kedaluwarsa yang sudah diketahui", () => {
  // Jam tiruan: 7 Nov 2026 12.00 UTC.
  const NOW = Date.UTC(2026, 10, 7, 12);
  const unauthorized = async () => { throw new ProviderError("unauthorized", "Token rejected (401): wrong, revoked, or expired."); };
  const run = async (expiresAt: string | null, fetchFile: () => Promise<FetchFileResult> = unauthorized) => {
    const t = setup({ sources: [source({ token_expires_at: expiresAt })], fetchFile, nowBase: NOW });
    return { t, r: await syncSource(ID_A, t.deps) };
  };

  it("401 dan tanggal kedaluwarsa sudah lewat -> pesan token kedaluwarsa dengan tanggalnya", async () => {
    const { t, r } = await run("2026-11-01T09:30:29.000Z");
    expect(r).toMatchObject({ status: "failed", error: { kind: "token_expired" } });
    const msg = r.status === "failed" ? r.error.message : "";
    expect(msg).toContain("The token expired on 01 Nov 2026");
    expect(msg).toContain("Source settings"); // tahu apa yang harus dilakukan
    expect(t.log.failed).toEqual([{ id: ID_A, message: msg }]); // pesan yang sama tersimpan untuk dashboard
    expect(t.log.applied).toEqual([]);
    noSecrets(r);
  });

  it("tanggal ditampilkan menurut WIB (tidak bergeser sehari)", async () => {
    // 4 Feb 2027 23:59:59 WIB = 16:59:59 UTC pada hari yang sama -> tetap 04 Feb
    const { r } = await run("2026-02-04T16:59:59.000Z");
    expect(r.status === "failed" && r.error.message).toContain("04 Feb 2026");
    // 20.00 UTC = 03.00 WIB hari berikutnya -> 05 Feb
    const { r: r2 } = await run("2026-02-04T20:00:00.000Z");
    expect(r2.status === "failed" && r2.error.message).toContain("05 Feb 2026");
  });

  it("401 tetapi kedaluwarsa masih di masa depan -> pesan umum (kita tidak tahu penyebabnya)", async () => {
    const { r } = await run("2027-02-04T09:30:29.000Z");
    expect(r).toMatchObject({ status: "failed", error: { kind: "unauthorized" } });
    expect(r.status === "failed" && r.error.message).toMatch(/wrong, revoked, or expired/);
  });

  it("401 tanpa tanggal kedaluwarsa -> pesan umum", async () => {
    const { r } = await run(null);
    expect(r).toMatchObject({ status: "failed", error: { kind: "unauthorized" } });
  });

  it("tanggal kedaluwarsa tidak valid -> pesan umum, tanpa galat", async () => {
    const { r } = await run("bukan-tanggal");
    expect(r).toMatchObject({ status: "failed", error: { kind: "unauthorized" } });
  });

  it("tepat pada saat kedaluwarsa dianggap sudah kedaluwarsa (batas <=)", async () => {
    const at = (expiresAt: number) => {
      const t = setup({ sources: [source({ token_expires_at: new Date(expiresAt).toISOString() })], fetchFile: unauthorized });
      t.deps.now = () => NOW; // jam TETAP: batasnya terukur sampai milidetik
      return syncSource(ID_A, t.deps);
    };
    expect(await at(NOW)).toMatchObject({ status: "failed", error: { kind: "token_expired" } }); // tepat = kedaluwarsa
    expect(await at(NOW - 1)).toMatchObject({ error: { kind: "token_expired" } });
    expect(await at(NOW + 1)).toMatchObject({ error: { kind: "unauthorized" } }); // 1 ms lagi = belum
  });

  it("jenis galat lain tidak diubah walau tanggalnya sudah lewat (404, 403, jaringan, rate limit)", async () => {
    for (const kind of ["not_found", "forbidden", "network", "rate_limited", "server_error", "timeout"] as const) {
      const { r } = await run("2026-01-01T00:00:00.000Z", async () => { throw new ProviderError(kind, `pesan ${kind}`); });
      expect(r).toMatchObject({ status: "failed", error: { kind, message: `pesan ${kind}` } });
    }
  });

  it("sinkronisasi yang berhasil tidak terpengaruh tanggal kedaluwarsa yang sudah lewat", async () => {
    // mis. penyedia tidak menegakkan kedaluwarsa, atau tanggal di database sudah usang
    const { r } = await run("2026-01-01T00:00:00.000Z", async () => FILE_OK);
    expect(r.status).toBe("success");
  });

  it("pesan tidak memuat token", async () => {
    const { r } = await run("2026-11-01T00:00:00.000Z");
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });
});

describe("kasus khusus", () => {
  it("sumber tidak aktif dilewati tanpa menyentuh penyedia atau penyimpanan", async () => {
    const t = setup({ sources: [source({ is_active: false })] });
    const r = await syncSource(ID_A, t.deps);
    expect(r).toEqual({ sourceId: ID_A, name: "App A", status: "skipped", reason: "inactive" });
    expect(t.fetchFile).not.toHaveBeenCalled();
    expect(t.log.failed).toEqual([]);
    expect(t.log.applied).toEqual([]);
  });

  it("sumber tidak ada -> not_found", async () => {
    const t = setup();
    expect(await syncSource("tidak-ada", t.deps)).toEqual({ sourceId: "tidak-ada", status: "not_found" });
    expect(t.fetchFile).not.toHaveBeenCalled();
  });

  it("bila penyimpanan tidak bisa menandai gagal, galat dilempar (bukan ditelan)", async () => {
    const t = setup({ fetchFile: async () => { throw new ProviderError("network", "x"); } });
    t.failures.markFailed = true;
    await expect(syncSource(ID_A, t.deps)).rejects.toThrow("DB mati");
  });

  it("satu sumber gagal tidak menggagalkan sumber lain (dijalankan paralel)", async () => {
    const sources = [source({ id: ID_A, name: "A" }), source({ id: ID_B, name: "B", repo_url: "https://github.com/o/b" })];
    const t = setup({
      sources,
      fetchFile: async (p) => {
        if (p.repoUrl.endsWith("/b")) throw new ProviderError("unauthorized", "token ditolak");
        return FILE_OK;
      },
    });
    const [a, b] = await Promise.all([syncSource(ID_A, t.deps), syncSource(ID_B, t.deps)]);
    expect(a.status).toBe("success");
    expect(b).toMatchObject({ status: "failed", error: { kind: "unauthorized" } });
    expect(t.log.applied.map((x) => x.id)).toEqual([ID_A]);
    expect(t.log.failed.map((x) => x.id)).toEqual([ID_B]);
  });

  it("durasi tercatat pada hasil", async () => {
    const t = setup();
    const r = await syncSource(ID_A, t.deps);
    expect(r.status === "success" && r.durationMs).toBeGreaterThan(0);
  });
});
