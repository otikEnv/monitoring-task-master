import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { loadReleaseOverviews, sortOverviews, type ReleaseOverview } from "@/lib/releases/load";
import { clampNotesPage, loadLatestNotes, loadReleaseActivity, NOTES_PAGE_SIZE, toNote } from "@/lib/releases/notes";

const SRC = "11111111-1111-4111-8111-111111111111";
const REL = "22222222-2222-4222-8222-222222222222";

type Q = { ops: [string, unknown[]][]; filters: Record<string, unknown>; range?: [number, number]; head?: boolean };

/** Klien palsu: rantai query yang dapat di-await; jawaban per tabel. */
function fakeDb(handlers: Record<string, (q: Q) => unknown>) {
  const calls: string[] = [];
  const db = {
    from(table: string) {
      const q: Q = { ops: [], filters: {} };
      const chain: Record<string, unknown> = {};
      chain.select = (_cols: string, opts?: { head?: boolean }) => { q.head = !!opts?.head; return chain; };
      chain.order = (col: string, o: unknown) => { q.ops.push(["order", [col, o]]); return chain; };
      for (const m of ["eq", "in", "is", "gte", "lte"]) chain[m] = (col: string, v: unknown) => { q.filters[`${m}:${col}`] = v; return chain; };
      chain.range = (a: number, b: number) => { q.range = [a, b]; return chain; };
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        calls.push(table);
        // Libur (kalender kerja release) kosong bila tes tidak mengaturnya.
        const handler = handlers[table] ?? (table === "holidays" ? () => ({ data: [], error: null }) : undefined);
        return Promise.resolve(handler!(q)).then(res, rej);
      };
      return chain;
    },
  };
  return { db: db as never, calls };
}

const noteRow = (n: number, over: Record<string, unknown> = {}) => ({
  id: `n${n}`, release_id: REL, kind: "note", body: `Catatan ${n}`, old_target_date: null, new_target_date: null,
  author_email: "admin@envisions.app", created_at: `2026-11-${String(10 + (n % 15)).padStart(2, "0")}T03:00:00Z`,
  edited_at: null, edited_by_email: null, ...over,
});

describe("clampNotesPage", () => {
  it("memotong halaman ke rentang yang ada, 20 per halaman", () => {
    expect(NOTES_PAGE_SIZE).toBe(20);
    expect(clampNotesPage(1, 0)).toEqual({ page: 1, pageCount: 1, from: 0 });
    expect(clampNotesPage(1, 20)).toEqual({ page: 1, pageCount: 1, from: 0 });
    expect(clampNotesPage(1, 21).pageCount).toBe(2);
    expect(clampNotesPage(9, 45)).toEqual({ page: 3, pageCount: 3, from: 40 });
    expect(clampNotesPage(0, 45).page).toBe(1);
    expect(clampNotesPage(-3, 45).page).toBe(1);
    expect(clampNotesPage(NaN, 45).page).toBe(1);
    expect(clampNotesPage(2.9, 45).page).toBe(2);
  });
});

describe("toNote", () => {
  it("menamai ulang kolom dan tidak membawa isi versi sebelumnya", () => {
    const n = toNote(noteRow(1, { previous_body: "rahasia lama" }) as never);
    expect(n).toEqual({
      id: "n1", releaseId: REL, kind: "note", body: "Catatan 1", oldTargetDate: null, newTargetDate: null,
      authorEmail: "admin@envisions.app", createdAt: "2026-11-11T03:00:00Z", editedAt: null, editedByEmail: null,
    });
    expect(JSON.stringify(n)).not.toContain("rahasia lama");
  });
});

describe("loadReleaseActivity", () => {
  const handler = (total: number, rows: unknown[]) => ({
    release_notes: (q: Q) => (q.head ? { count: total, error: null } : { data: rows, error: null }),
  });

  it("kosong: tidak membaca baris", async () => {
    const { db, calls } = fakeDb(handler(0, []));
    expect(await loadReleaseActivity(db, REL, 1)).toEqual({ rows: [], total: 0, page: 1, pageCount: 1, pageSize: 20 });
    expect(calls).toHaveLength(1);
  });

  it("memetakan baris, urut terbaru dulu, dan rentang halaman 20", async () => {
    let seen: Q | undefined;
    const { db } = fakeDb({
      release_notes: (q) => {
        if (q.head) return { count: 45, error: null };
        seen = q;
        return { data: [noteRow(1), noteRow(2, { kind: "target_change", old_target_date: "2026-12-01", new_target_date: "2026-12-15" })], error: null };
      },
    });
    const page = await loadReleaseActivity(db, REL, 2);
    expect([page.total, page.page, page.pageCount]).toEqual([45, 2, 3]);
    expect(page.rows.map((r) => [r.id, r.kind])).toEqual([["n1", "note"], ["n2", "target_change"]]);
    expect(page.rows[1]).toMatchObject({ oldTargetDate: "2026-12-01", newTargetDate: "2026-12-15" });
    expect(seen!.range).toEqual([20, 39]);
    expect(seen!.filters).toMatchObject({ "eq:release_id": REL });
    expect(seen!.ops).toEqual([["order", ["created_at", { ascending: false }]], ["order", ["id", { ascending: false }]]]);
  });

  it("halaman melewati akhir dipotong ke halaman terakhir", async () => {
    let seen: Q | undefined;
    const { db } = fakeDb({
      release_notes: (q) => { if (q.head) return { count: 25, error: null }; seen = q; return { data: [noteRow(1)], error: null }; },
    });
    const page = await loadReleaseActivity(db, REL, 99);
    expect([page.page, page.pageCount]).toEqual([2, 2]);
    expect(seen!.range).toEqual([20, 39]);
  });

  it("galat database dilaporkan", async () => {
    await expect(loadReleaseActivity(fakeDb({ release_notes: () => ({ count: null, error: { message: "boom" } }) }).db, REL))
      .rejects.toThrow("Gagal menghitung catatan");
    await expect(loadReleaseActivity(fakeDb({
      release_notes: (q) => (q.head ? { count: 3, error: null } : { data: null, error: { message: "boom" } }),
    }).db, REL)).rejects.toThrow("Gagal membaca catatan");
  });
});

describe("loadLatestNotes", () => {
  it("memetakan catatan terbaru per release; tanpa release tidak membaca apa pun", async () => {
    const { db, calls } = fakeDb({
      release_latest_note: (q) => {
        expect(q.filters).toMatchObject({ "in:release_id": ["a", "b"] });
        return { data: [{ release_id: "a", id: "n1", body: "Halo", created_at: "2026-11-10T00:00:00Z" }], error: null };
      },
    });
    const m = await loadLatestNotes(db, ["a", "b"]);
    expect(m.get("a")).toEqual({ id: "n1", body: "Halo", createdAt: "2026-11-10T00:00:00Z" });
    expect(m.has("b")).toBe(false);
    expect((await loadLatestNotes(fakeDb({}).db, [])).size).toBe(0);
    expect(calls).toEqual(["release_latest_note"]);
  });

  it("galat database dilaporkan", async () => {
    await expect(loadLatestNotes(fakeDb({ release_latest_note: () => ({ data: null, error: { message: "boom" } }) }).db, ["a"]))
      .rejects.toThrow("Gagal membaca catatan terbaru");
  });
});

const rel = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, start_date: "2026-11-01", target_date: "2026-11-21", released_on: null, created_at: "2026-11-01T00:00:00Z",
  archived_at: null, held_at: null, hold_reason: null, ...over,
});
const comp = (releaseId: string) => ({
  id: `c-${releaseId}`, release_id: releaseId, source_id: SRC, tag: "master", range_start: 10, range_end: 19,
});
const taskRow = (id: number) => ({
  task_id: String(id), title: `T${id}`, status: "pending", priority: null, dependencies: [], subtasks_total: 0, subtasks_done: 0,
});
const NOW = new Date("2026-11-05T05:00:00Z");

describe("loadReleaseOverviews: hold dan catatan terbaru", () => {
  const base = (releases: unknown[], latest: unknown[] = []) => fakeDb({
    releases: () => ({ data: releases, error: null }),
    release_components: () => ({ data: (releases as { id: string }[]).map((r) => comp(r.id)), error: null }),
    sources: () => ({ data: [{ id: SRC, name: "Echo", is_active: true, last_sync_status: "success", last_synced_at: null }], error: null }),
    tasks: () => ({ data: [taskRow(10), taskRow(11)], error: null }),
    release_latest_note: () => ({ data: latest, error: null }),
  });

  it("release ditahan: stats.risk on_hold, wouldBeRisk tetap dihitung, alasan dan waktu terbawa", async () => {
    const { db } = base([rel("a", "2.1", { held_at: "2026-11-03T01:00:00Z", hold_reason: "Waiting for API" })]);
    const [o] = await loadReleaseOverviews(db, {}, NOW);
    expect([o.release.heldAt, o.release.holdReason]).toEqual(["2026-11-03T01:00:00Z", "Waiting for API"]);
    expect(o.stats.risk).toBe("on_hold");
    expect(o.stats.wouldBeRisk).not.toBe("on_hold");
    expect([o.stats.heldAt, o.stats.holdReason]).toEqual(["2026-11-03T01:00:00Z", "Waiting for API"]);
  });

  it("release aktif: risk = wouldBeRisk dan tanpa hold", async () => {
    const { db } = base([rel("a", "2.1")]);
    const [o] = await loadReleaseOverviews(db, {}, NOW);
    expect(o.stats.risk).toBe(o.stats.wouldBeRisk);
    expect([o.stats.heldAt, o.stats.holdReason]).toEqual([null, null]);
  });

  it("catatan terbaru dibaca dalam satu query untuk semua release", async () => {
    const { db, calls } = base(
      [rel("a", "2.1"), rel("b", "2.2")],
      [{ release_id: "b", id: "n9", body: "Menunggu QA", created_at: "2026-11-04T00:00:00Z" }],
    );
    const out = await loadReleaseOverviews(db, {}, NOW);
    expect(calls.filter((c) => c === "release_latest_note")).toHaveLength(1);
    const byName = Object.fromEntries(out.map((o) => [o.release.name, o.latestNote]));
    expect(byName["2.1"]).toBeNull();
    expect(byName["2.2"]).toEqual({ id: "n9", body: "Menunggu QA", createdAt: "2026-11-04T00:00:00Z" });
  });

  it("galat membaca catatan terbaru dilaporkan", async () => {
    const { db } = fakeDb({
      releases: () => ({ data: [rel("a", "2.1")], error: null }),
      release_components: () => ({ data: [comp("a")], error: null }),
      sources: () => ({ data: [], error: null }),
      release_latest_note: () => ({ data: null, error: { message: "boom" } }),
    });
    await expect(loadReleaseOverviews(db, {}, NOW)).rejects.toThrow("Gagal membaca catatan terbaru");
  });
});

describe("sortOverviews dengan hold", () => {
  const ov = (name: string, target: string, releasedOn: string | null, heldAt: string | null = null) =>
    ({ release: { name, targetDate: target, releasedOn, heldAt } }) as unknown as ReleaseOverview;

  it("berjalan dulu, lalu ditahan, lalu sudah rilis; tiap kelompok menurut aturannya sendiri", () => {
    const sorted = sortOverviews([
      ov("rilis-lama", "2026-01-01", "2026-01-02"),
      ov("tahan-awal", "2026-10-01", null, "2026-10-02T00:00:00Z"),
      ov("jalan-akhir", "2026-12-15", null),
      ov("rilis-baru", "2026-05-01", "2026-05-03"),
      ov("jalan-awal", "2026-11-20", null),
      ov("tahan-akhir", "2026-12-31", null, "2026-11-01T00:00:00Z"),
    ]);
    expect(sorted.map((o) => o.release.name)).toEqual([
      "jalan-awal", "jalan-akhir", "tahan-awal", "tahan-akhir", "rilis-baru", "rilis-lama",
    ]);
  });
});
