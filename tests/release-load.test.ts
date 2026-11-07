import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { fetchTagTasks, loadReleaseOverviews, sortOverviews, type ReleaseOverview } from "@/lib/releases/load";

const SRC = "11111111-1111-4111-8111-111111111111";

/** Klien palsu: rantai query yang dapat di-await dan mengembalikan hasil per tabel. */
function fakeDb(handlers: Record<string, (q: { range?: [number, number]; filters: Record<string, unknown> }) => unknown>) {
  const calls: string[] = [];
  const db = {
    from(table: string) {
      const q: { range?: [number, number]; filters: Record<string, unknown> } = { filters: {} };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "order"]) chain[m] = () => chain;
      for (const m of ["eq", "in", "is"]) chain[m] = (col: string, v: unknown) => { q.filters[`${m}:${col}`] = v; return chain; };
      chain.range = (a: number, b: number) => { q.range = [a, b]; return chain; };
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        calls.push(table);
        return Promise.resolve(handlers[table](q)).then(res, rej);
      };
      return chain;
    },
  };
  return { db: db as never, calls };
}

const taskRow = (id: number) => ({
  task_id: String(id), title: `T${id}`, status: "pending", priority: null, dependencies: [], subtasks_total: 0, subtasks_done: 0,
});

describe("fetchTagTasks", () => {
  it("membaca berhalaman sampai habis (batas 1000 baris per permintaan)", async () => {
    const { db, calls } = fakeDb({
      tasks: (q) => {
        const [a, b] = q.range!;
        const all = Array.from({ length: 2200 }, (_, i) => taskRow(i + 1));
        return { data: all.slice(a, b + 1), error: null };
      },
    });
    const tasks = await fetchTagTasks(db, SRC, "master");
    expect(tasks).toHaveLength(2200);
    expect(calls).toEqual(["tasks", "tasks", "tasks"]);
  });

  it("galat database dilaporkan", async () => {
    const { db } = fakeDb({ tasks: () => ({ data: null, error: { message: "boom" } }) });
    await expect(fetchTagTasks(db, SRC, "master")).rejects.toThrow("Gagal membaca task");
  });
});

const rel = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, source_id: SRC, tag: "master", name, range_start: 10, range_end: 19,
  start_date: "2026-11-01", target_date: "2026-11-21", released_on: null, created_at: "2026-11-01T00:00:00Z", ...over,
});

describe("loadReleaseOverviews", () => {
  it("membaca task sekali per pasangan aplikasi+tag untuk banyak release", async () => {
    const { db, calls } = fakeDb({
      releases: () => ({ data: [rel("a", "v2.1"), rel("b", "v2.2", { range_start: 20, range_end: 29 })], error: null }),
      sources: () => ({ data: [{ id: SRC, name: "Echo", is_active: true, last_sync_status: "success", last_synced_at: "2026-11-05T00:00:00Z" }], error: null }),
      tasks: () => ({ data: [taskRow(10), taskRow(11), taskRow(25)], error: null }),
    });
    const out = await loadReleaseOverviews(db, {}, new Date("2026-11-05T05:00:00Z"));
    expect(calls.filter((c) => c === "tasks")).toHaveLength(1);
    expect(out.map((o) => [o.release.name, o.stats.total, o.sourceName, o.tagFound])).toEqual([
      ["v2.1", 2, "Echo", true],
      ["v2.2", 1, "Echo", true],
    ]);
  });

  it("tidak ada release: tidak membaca sumber maupun task", async () => {
    const { db, calls } = fakeDb({ releases: () => ({ data: [], error: null }) });
    expect(await loadReleaseOverviews(db)).toEqual([]);
    expect(calls).toEqual(["releases"]);
  });

  it("tag tanpa task: tagFound false dan statistik nol, bukan galat", async () => {
    const { db } = fakeDb({
      releases: () => ({ data: [rel("a", "v2.1")], error: null }),
      sources: () => ({ data: [{ id: SRC, name: "Echo", is_active: false, last_sync_status: "failed", last_synced_at: null }], error: null }),
      tasks: () => ({ data: [], error: null }),
    });
    const [o] = await loadReleaseOverviews(db);
    expect([o.tagFound, o.stats.total, o.stats.risk, o.sourceActive, o.syncStatus]).toEqual([false, 0, "empty", false, "failed"]);
  });

  it("hanya yang belum rilis secara bawaan; filter aplikasi dan includeReleased diteruskan", async () => {
    let seen: Record<string, unknown> = {};
    const { db } = fakeDb({ releases: (q) => { seen = q.filters; return { data: [], error: null }; } });
    await loadReleaseOverviews(db, { sourceId: SRC });
    expect(seen).toMatchObject({ "eq:source_id": SRC, "is:released_on": null });
    await loadReleaseOverviews(db, { sourceId: SRC, includeReleased: true });
    expect(seen).not.toHaveProperty("is:released_on");
  });

  it("galat database dilaporkan", async () => {
    const { db } = fakeDb({ releases: () => ({ data: null, error: { message: "boom" } }) });
    await expect(loadReleaseOverviews(db)).rejects.toThrow("Gagal membaca release");
  });
});

describe("sortOverviews", () => {
  const ov = (name: string, source: string, target: string, releasedOn: string | null) =>
    ({ release: { name, targetDate: target, releasedOn }, sourceName: source }) as unknown as ReleaseOverview;

  it("belum rilis dulu menurut target terdekat; yang sudah rilis terakhir, terbaru dulu", () => {
    const sorted = sortOverviews([
      ov("lama", "A", "2026-01-01", "2026-01-02"),
      ov("des", "A", "2026-12-15", null),
      ov("baru", "A", "2026-05-01", "2026-05-03"),
      ov("nov", "B", "2026-11-20", null),
      ov("nov-a", "A", "2026-11-20", null),
    ]);
    expect(sorted.map((o) => o.release.name)).toEqual(["nov-a", "nov", "des", "baru", "lama"]);
  });
});
