import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { fetchTagTasks, loadReleaseOverviews, loadSourceOptions, sortOverviews, type ReleaseOverview } from "@/lib/releases/load";

const SRC = "11111111-1111-4111-8111-111111111111";
const SRC2 = "22222222-2222-4222-8222-222222222222";

type Q = { range?: [number, number]; filters: Record<string, unknown> };

/** Klien palsu: rantai query yang dapat di-await dan mengembalikan hasil per tabel. */
function fakeDb(handlers: Record<string, (q: Q) => unknown>) {
  const calls: string[] = [];
  const db = {
    from(table: string) {
      const q: Q = { filters: {} };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "order"]) chain[m] = () => chain;
      for (const m of ["eq", "in", "is"]) chain[m] = (col: string, v: unknown) => { q.filters[`${m}:${col}`] = v; return chain; };
      chain.range = (a: number, b: number) => { q.range = [a, b]; return chain; };
      chain.or = (expr: string) => { q.filters.or = expr; return chain; };
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
  id, name, start_date: "2026-11-01", target_date: "2026-11-21", released_on: null, created_at: "2026-11-01T00:00:00Z", ...over,
});
const comp = (releaseId: string, sourceId: string, tag: string, a: number, b: number) => ({
  id: `c-${releaseId}-${sourceId}-${tag}`, release_id: releaseId, source_id: sourceId, tag, range_start: a, range_end: b,
});
const src = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, is_active: true, last_sync_status: "success", last_synced_at: "2026-11-05T00:00:00Z", ...over,
});
const NOW = new Date("2026-11-05T05:00:00Z");

describe("loadReleaseOverviews", () => {
  it("membaca task sekali per pasangan aplikasi+tag untuk banyak release dan komponen", async () => {
    const { db, calls } = fakeDb({
      releases: () => ({ data: [rel("a", "v2.1"), rel("b", "v2.2")], error: null }),
      release_components: () => ({ data: [comp("a", SRC, "master", 10, 19), comp("b", SRC, "master", 20, 29)], error: null }),
      sources: () => ({ data: [src(SRC, "Echo")], error: null }),
      tasks: () => ({ data: [taskRow(10), taskRow(11), taskRow(25)], error: null }),
    });
    const out = await loadReleaseOverviews(db, {}, NOW);
    expect(calls.filter((c) => c === "tasks")).toHaveLength(1);
    expect(out.map((o) => [o.release.name, o.stats.total, o.components[0].sourceName, o.components[0].tagFound])).toEqual([
      ["v2.1", 2, "Echo", true],
      ["v2.2", 1, "Echo", true],
    ]);
  });

  it("release lintas aplikasi: komponen urut nama aplikasi lalu tag; total gabungan = jumlah", async () => {
    const { db, calls } = fakeDb({
      releases: () => ({ data: [rel("a", "2.1")], error: null }),
      release_components: () => ({
        data: [comp("a", SRC2, "main", 1, 5), comp("a", SRC, "mobile", 10, 19), comp("a", SRC, "master", 10, 19)], error: null,
      }),
      sources: () => ({ data: [src(SRC, "Web"), src(SRC2, "Backend")], error: null }),
      tasks: (q) => ({
        data: q.filters["eq:source_id"] === SRC2 ? [1, 2, 3, 4].map(taskRow) : [10, 11].map(taskRow),
        error: null,
      }),
    });
    const [o] = await loadReleaseOverviews(db, {}, NOW);
    expect(calls.filter((c) => c === "tasks")).toHaveLength(3); // tiga pasangan (aplikasi, tag)
    expect(o.components.map((c) => [c.sourceName, c.component.tag, c.stats.total])).toEqual([
      ["Backend", "main", 4], ["Web", "master", 2], ["Web", "mobile", 2],
    ]);
    expect(o.stats.total).toBe(8);
    expect(o.release.components.map((c) => c.tag)).toEqual(["main", "master", "mobile"]);
  });

  it("tidak ada release: tidak membaca komponen, sumber, maupun task", async () => {
    const { db, calls } = fakeDb({ releases: () => ({ data: [], error: null }) });
    expect(await loadReleaseOverviews(db)).toEqual([]);
    expect(calls).toEqual(["releases"]);
  });

  it("release tanpa komponen (aplikasinya terhapus): tampil kosong tanpa membaca sumber atau task", async () => {
    const { db, calls } = fakeDb({
      releases: () => ({ data: [rel("a", "yatim")], error: null }),
      release_components: () => ({ data: [], error: null }),
    });
    const [o] = await loadReleaseOverviews(db, {}, NOW);
    expect([o.components.length, o.stats.total, o.stats.risk]).toEqual([0, 0, "empty"]);
    expect(calls).toEqual(["releases", "release_components"]);
  });

  it("tag tanpa task: tagFound false dan statistik nol, komponen lain tetap dihitung", async () => {
    const { db } = fakeDb({
      releases: () => ({ data: [rel("a", "2.1")], error: null }),
      release_components: () => ({ data: [comp("a", SRC, "master", 10, 19), comp("a", SRC2, "main", 1, 5)], error: null }),
      sources: () => ({
        data: [src(SRC, "Web", { is_active: false, last_sync_status: "failed", last_synced_at: null }), src(SRC2, "Backend")],
        error: null,
      }),
      tasks: (q) => ({ data: q.filters["eq:source_id"] === SRC ? [] : [taskRow(1), taskRow(2)], error: null }),
    });
    const [o] = await loadReleaseOverviews(db, {}, NOW);
    const web = o.components.find((c) => c.sourceName === "Web")!;
    expect([web.tagFound, web.stats.total, web.stats.risk, web.sourceActive, web.syncStatus]).toEqual([false, 0, "empty", false, "failed"]);
    expect(o.components.find((c) => c.sourceName === "Backend")!.tagFound).toBe(true);
    expect(o.stats.total).toBe(2);
  });

  it("hanya yang belum rilis secara bawaan; includeReleased dan id diteruskan", async () => {
    let seen: Record<string, unknown> = {};
    const { db } = fakeDb({ releases: (q) => { seen = q.filters; return { data: [], error: null }; } });
    await loadReleaseOverviews(db);
    expect(seen).toMatchObject({ "is:released_on": null });
    await loadReleaseOverviews(db, { includeReleased: true });
    expect(seen).not.toHaveProperty("is:released_on");
    await loadReleaseOverviews(db, { id: "x" });
    expect(seen).toMatchObject({ "eq:id": "x" });
    expect(seen).not.toHaveProperty("is:released_on");
  });

  it("release terarsip disembunyikan secara bawaan; tetap terbaca lewat id atau includeArchived", async () => {
    let seen: Record<string, unknown> = {};
    const { db } = fakeDb({ releases: (q) => { seen = q.filters; return { data: [], error: null }; } });
    await loadReleaseOverviews(db);
    expect(seen).toMatchObject({ "is:archived_at": null });
    await loadReleaseOverviews(db, { includeReleased: true });
    expect(seen).toMatchObject({ "is:archived_at": null });
    await loadReleaseOverviews(db, { includeArchived: true });
    expect(seen).not.toHaveProperty("is:archived_at");
    await loadReleaseOverviews(db, { id: "x" });
    expect(seen).not.toHaveProperty("is:archived_at");
  });

  it("filter aplikasi: release yang punya komponen aplikasi itu", async () => {
    let seen: Record<string, unknown> = {};
    const { db, calls } = fakeDb({
      release_components: () => ({ data: [{ release_id: "a" }, { release_id: "a" }, { release_id: "b" }], error: null }),
      releases: (q) => { seen = q.filters; return { data: [], error: null }; },
    });
    await loadReleaseOverviews(db, { sourceId: SRC });
    expect(seen).toMatchObject({ "in:id": ["a", "b"], "is:released_on": null });
    expect(calls).toEqual(["release_components", "releases"]);
  });

  it("filter aplikasi tanpa komponen: kosong tanpa membaca release", async () => {
    const { db, calls } = fakeDb({ release_components: () => ({ data: [], error: null }) });
    expect(await loadReleaseOverviews(db, { sourceId: SRC })).toEqual([]);
    expect(calls).toEqual(["release_components"]);
  });

  it("galat database dilaporkan", async () => {
    const bad = { data: null, error: { message: "boom" } };
    await expect(loadReleaseOverviews(fakeDb({ releases: () => bad }).db)).rejects.toThrow("Gagal membaca release");
    await expect(loadReleaseOverviews(fakeDb({
      releases: () => ({ data: [rel("a", "x")], error: null }), release_components: () => bad,
    }).db)).rejects.toThrow("Gagal membaca komponen release");
    await expect(loadReleaseOverviews(fakeDb({ release_components: () => bad }).db, { sourceId: SRC }))
      .rejects.toThrow("Gagal membaca komponen release");
  });
});

describe("sortOverviews", () => {
  const ov = (name: string, target: string, releasedOn: string | null) =>
    ({ release: { name, targetDate: target, releasedOn } }) as unknown as ReleaseOverview;

  it("belum rilis dulu menurut target terdekat; yang sudah rilis terakhir, terbaru dulu", () => {
    const sorted = sortOverviews([
      ov("lama", "2026-01-01", "2026-01-02"),
      ov("des", "2026-12-15", null),
      ov("baru", "2026-05-01", "2026-05-03"),
      ov("nov-b", "2026-11-20", null),
      ov("nov-a", "2026-11-20", null),
    ]);
    expect(sorted.map((o) => o.release.name)).toEqual(["nov-a", "nov-b", "des", "baru", "lama"]);
  });
});

describe("loadSourceOptions", () => {
  it("menggabungkan aplikasi dengan tag-nya (urut), aplikasi tanpa tag tetap ada", async () => {
    const { db } = fakeDb({
      sources: () => ({ data: [{ id: "a", name: "Alfa" }, { id: "b", name: "Beta" }], error: null }),
      source_tags: () => ({ data: [{ source_id: "a", tag: "mobile" }, { source_id: "a", tag: "master" }], error: null }),
    });
    expect(await loadSourceOptions(db)).toEqual([
      { id: "a", name: "Alfa", tags: ["master", "mobile"] },
      { id: "b", name: "Beta", tags: [] },
    ]);
  });

  it("aplikasi terarsip tidak ditawarkan, kecuali yang dipertahankan (komponen release yang diubah)", async () => {
    let seen: Record<string, unknown> = {};
    const { db } = fakeDb({
      sources: (q) => { seen = q.filters; return { data: [], error: null }; },
      source_tags: () => ({ data: [], error: null }),
    });
    await loadSourceOptions(db);
    expect(seen).toMatchObject({ "is:archived_at": null });
    expect(seen).not.toHaveProperty("or");

    const id = "11111111-1111-4111-8111-111111111111";
    await loadSourceOptions(db, [id]);
    expect(seen.or).toBe(`archived_at.is.null,id.in.(${id})`);
    // id yang bukan UUID tidak pernah disisipkan ke ekspresi filter
    await loadSourceOptions(db, ["x),id.eq.1"]);
    expect(seen).toMatchObject({ "is:archived_at": null });
    expect(seen).not.toHaveProperty("or");
  });

  it("galat database dilaporkan", async () => {
    const { db } = fakeDb({
      sources: () => ({ data: [], error: null }),
      source_tags: () => ({ data: null, error: { message: "boom" } }),
    });
    await expect(loadSourceOptions(db)).rejects.toThrow("Gagal membaca tag");
  });
});
