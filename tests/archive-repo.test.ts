import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { ARCHIVE_PAGE_SIZE, archiveHref, parseArchiveParams } from "@/lib/archive/params";
import { clampPage, loadArchivedReleases, loadArchivedSources } from "@/lib/archive/load";
import { countOpenReleasesForSource, ReleaseNotFoundError, setReleaseArchived } from "@/lib/releases/repo";
import { SourceNotFoundError, setSourceArchived } from "@/lib/sources/repo";

type Q = { table: string; ops: [string, unknown[]][] };

/** Klien palsu: mencatat rantai operasi dan menjawab per (tabel, operasi). */
function fakeDb(answer: (q: Q) => unknown) {
  const log: Q[] = [];
  const db = {
    from(table: string) {
      const q: Q = { table, ops: [] };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "update", "eq", "is", "in", "not", "order", "range"]) {
        chain[m] = (...args: unknown[]) => { q.ops.push([m, args]); return chain; };
      }
      chain.maybeSingle = async () => { q.ops.push(["maybeSingle", []]); log.push(q); return answer(q); };
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        log.push(q);
        return Promise.resolve(answer(q)).then(res, rej);
      };
      return chain;
    },
  };
  return { db: db as never, log };
}
const has = (q: Q, op: string, ...args: unknown[]) =>
  q.ops.some(([o, a]) => o === op && args.every((x, i) => JSON.stringify(a[i]) === JSON.stringify(x)));

describe("setSourceArchived dan setReleaseArchived", () => {
  it("mengarsipkan hanya baris yang masih aktif dan mengisi waktu sekarang", async () => {
    const { db, log } = fakeDb(() => ({ data: [{ id: "x" }], error: null }));
    await setSourceArchived("x", true, db);
    const q = log[0];
    const update = q.ops.find(([o]) => o === "update")!;
    expect((update[1][0] as { archived_at: string }).archived_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(has(q, "eq", "id", "x")).toBe(true);
    expect(has(q, "is", "archived_at", null)).toBe(true);
  });

  it("restore mengosongkan archived_at tanpa syarat tambahan", async () => {
    const { db, log } = fakeDb(() => ({ data: [{ id: "x" }], error: null }));
    await setReleaseArchived("x", false, db);
    const update = log[0].ops.find(([o]) => o === "update")!;
    expect(update[1][0]).toEqual({ archived_at: null });
    expect(has(log[0], "is", "archived_at")).toBe(false);
  });

  it("sudah terarsip (tidak ada baris berubah) tetapi ada: idempoten, tidak galat", async () => {
    const { db } = fakeDb((q) => (q.ops.some(([o]) => o === "update") ? { data: [], error: null } : { data: { id: "x" }, error: null }));
    await expect(setSourceArchived("x", true, db)).resolves.toBeUndefined();
    await expect(setReleaseArchived("x", true, db)).resolves.toBeUndefined();
  });

  it("tidak ada sama sekali: SourceNotFoundError dan ReleaseNotFoundError", async () => {
    const { db } = fakeDb((q) => (q.ops.some(([o]) => o === "update") ? { data: [], error: null } : { data: null, error: null }));
    await expect(setSourceArchived("x", true, db)).rejects.toBeInstanceOf(SourceNotFoundError);
    await expect(setReleaseArchived("x", false, db)).rejects.toBeInstanceOf(ReleaseNotFoundError);
  });

  it("galat database dilaporkan", async () => {
    const { db } = fakeDb(() => ({ data: null, error: { message: "boom" } }));
    await expect(setSourceArchived("x", true, db)).rejects.toThrow("Gagal mengubah status arsip sumber: boom");
    await expect(setReleaseArchived("x", true, db)).rejects.toThrow("Gagal mengubah status arsip release: boom");
  });
});

describe("countOpenReleasesForSource", () => {
  it("menghitung release belum rilis dan belum terarsip yang punya komponen aplikasi itu", async () => {
    const { db, log } = fakeDb((q) =>
      q.table === "release_components"
        ? { data: [{ release_id: "a" }, { release_id: "a" }, { release_id: "b" }], error: null }
        : { count: 2, error: null });
    expect(await countOpenReleasesForSource("S", db)).toBe(2);
    const releases = log.find((q) => q.table === "releases")!;
    expect(has(releases, "in", "id", ["a", "b"])).toBe(true);
    expect(has(releases, "is", "released_on", null)).toBe(true);
    expect(has(releases, "is", "archived_at", null)).toBe(true);
  });

  it("tanpa komponen: 0 tanpa membaca release", async () => {
    const { db, log } = fakeDb(() => ({ data: [], error: null }));
    expect(await countOpenReleasesForSource("S", db)).toBe(0);
    expect(log.map((q) => q.table)).toEqual(["release_components"]);
  });

  it("galat database dilaporkan", async () => {
    const { db } = fakeDb(() => ({ data: null, error: { message: "boom" } }));
    await expect(countOpenReleasesForSource("S", db)).rejects.toThrow("Gagal membaca komponen release");
  });
});

describe("parameter halaman Archive", () => {
  it("bawaan: tab applications, halaman 1", () => {
    expect(parseArchiveParams({})).toEqual({ tab: "applications", page: 1 });
  });

  it("nilai valid dibaca; array memakai elemen pertama", () => {
    expect(parseArchiveParams({ tab: "releases", page: "3" })).toEqual({ tab: "releases", page: 3 });
    expect(parseArchiveParams({ tab: ["releases", "applications"], page: ["2", "9"] })).toEqual({ tab: "releases", page: 2 });
  });

  it("nilai tidak valid diabaikan, bukan galat", () => {
    for (const tab of ["", "x", "constructor", "__proto__", "Releases"]) {
      expect(parseArchiveParams({ tab }).tab).toBe("applications");
    }
    for (const page of ["0", "-1", "abc", "1.5", "1e3", "", "9999999", " 2"]) {
      const p = parseArchiveParams({ page }).page;
      expect(p, `page "${page}"`).toBeGreaterThanOrEqual(1);
    }
    expect(parseArchiveParams({ page: "0" }).page).toBe(1);
    expect(parseArchiveParams({ page: "abc" }).page).toBe(1);
    expect(parseArchiveParams({ page: "9999999" }).page).toBe(1); // 7 digit ditolak
  });

  it("href pendek: nilai bawaan tidak ikut", () => {
    expect(archiveHref()).toBe("/archive");
    expect(archiveHref({ tab: "applications", page: 1 })).toBe("/archive");
    expect(archiveHref({ tab: "releases" })).toBe("/archive?tab=releases");
    expect(archiveHref({ tab: "releases", page: 2 })).toBe("/archive?tab=releases&page=2");
    expect(archiveHref({ page: 3 })).toBe("/archive?page=3");
  });
});

describe("clampPage", () => {
  it("memotong halaman ke rentang yang ada", () => {
    expect(clampPage(1, 0)).toEqual({ page: 1, pageCount: 1, from: 0 });
    expect(clampPage(5, 25)).toEqual({ page: 3, pageCount: 3, from: 2 * ARCHIVE_PAGE_SIZE });
    expect(clampPage(2, 25)).toEqual({ page: 2, pageCount: 3, from: ARCHIVE_PAGE_SIZE });
    expect(clampPage(0, 25).page).toBe(1);
    expect(clampPage(1, ARCHIVE_PAGE_SIZE).pageCount).toBe(1);
    expect(clampPage(1, ARCHIVE_PAGE_SIZE + 1).pageCount).toBe(2);
  });
});

describe("loadArchivedSources", () => {
  const row = (id: string, name: string) => ({
    id, name, is_active: true, last_sync_status: "success", last_synced_at: "2026-11-10T00:00:00Z", archived_at: "2026-11-14T00:00:00Z",
  });

  it("kosong: tidak membaca baris maupun jumlah task", async () => {
    const { db, log } = fakeDb(() => ({ count: 0, error: null }));
    expect(await loadArchivedSources(db, 1)).toEqual({ rows: [], total: 0, page: 1, pageCount: 1, pageSize: ARCHIVE_PAGE_SIZE });
    expect(log).toHaveLength(1);
  });

  it("memetakan baris, jumlah task, urutan terbaru dulu, dan rentang halaman", async () => {
    const { db, log } = fakeDb((q) => {
      if (q.table === "source_status_counts") return { data: [{ source_id: "a", total: 9 }], error: null };
      if (q.ops.some(([o, a]) => o === "select" && (a[1] as { head?: boolean } | undefined)?.head)) return { count: 25, error: null };
      return { data: [row("a", "Alfa"), row("b", "Beta")], error: null };
    });
    const page = await loadArchivedSources(db, 3);
    expect([page.total, page.page, page.pageCount]).toEqual([25, 3, 3]);
    expect(page.rows.map((r) => [r.id, r.taskCount, r.isActive])).toEqual([["a", 9, true], ["b", 0, true]]);
    const list = log.find((q) => q.table === "sources" && has(q, "range"))!;
    expect(has(list, "range", 20, 29)).toBe(true);
    expect(has(list, "order", "archived_at", { ascending: false })).toBe(true);
    // hanya kolom yang boleh dibaca klien: tidak memilih token
    expect(JSON.stringify(list.ops)).not.toContain("token");
  });

  it("halaman melewati akhir dipotong ke halaman terakhir", async () => {
    const { db, log } = fakeDb((q) => {
      if (q.table === "source_status_counts") return { data: [], error: null };
      if (q.ops.some(([o, a]) => o === "select" && (a[1] as { head?: boolean } | undefined)?.head)) return { count: 12, error: null };
      return { data: [row("a", "Alfa")], error: null };
    });
    const page = await loadArchivedSources(db, 99);
    expect([page.page, page.pageCount]).toEqual([2, 2]);
    expect(has(log.find((q) => has(q, "range"))!, "range", 10, 19)).toBe(true);
  });

  it("galat database dilaporkan", async () => {
    const { db } = fakeDb(() => ({ count: null, error: { message: "boom" } }));
    await expect(loadArchivedSources(db, 1)).rejects.toThrow("Gagal menghitung aplikasi terarsip");
  });
});

describe("loadArchivedReleases", () => {
  it("memetakan release dengan jumlah komponen", async () => {
    const { db } = fakeDb((q) => {
      if (q.table === "release_components") return { data: [{ release_id: "r1" }, { release_id: "r1" }, { release_id: "r2" }], error: null };
      if (q.ops.some(([o, a]) => o === "select" && (a[1] as { head?: boolean } | undefined)?.head)) return { count: 2, error: null };
      return {
        data: [
          { id: "r1", name: "2.1", released_on: "2026-11-01", target_date: "2026-11-05", archived_at: "2026-11-14T00:00:00Z" },
          { id: "r2", name: "2.2", released_on: null, target_date: "2026-12-05", archived_at: "2026-11-13T00:00:00Z" },
        ],
        error: null,
      };
    });
    const page = await loadArchivedReleases(db, 1);
    expect(page.rows.map((r) => [r.id, r.componentCount, r.releasedOn])).toEqual([["r1", 2, "2026-11-01"], ["r2", 1, null]]);
  });

  it("kosong dan galat database", async () => {
    expect((await loadArchivedReleases(fakeDb(() => ({ count: 0, error: null })).db, 1)).rows).toEqual([]);
    await expect(loadArchivedReleases(fakeDb(() => ({ count: null, error: { message: "boom" } })).db, 1))
      .rejects.toThrow("Gagal menghitung release terarsip");
  });
});
