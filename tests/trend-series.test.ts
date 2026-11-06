import { describe, expect, it } from "vitest";
import {
  MAX_POINTS, STACK, buildSeries, downsampleDaily, parseTrendParams, percentDone, rangeStart,
  stackValues, summarizeTrend, trendHref, type Counts, type SeriesPoint, type SnapshotRow,
} from "@/lib/trend/series";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const DAY = 24 * 60 * 60 * 1000;

const counts = (over: Partial<Counts> = {}): Counts => ({
  total: 0, pending: 0, in_progress: 0, review: 0, blocked: 0, done: 0, deferred: 0, cancelled: 0, other: 0, ...over,
});
const row = (source: string, iso: string, over: Partial<Counts> = {}): SnapshotRow => ({
  source_id: source, taken_at: iso, ...counts(over),
});

describe("parseTrendParams", () => {
  it("bawaan: 30 hari, semua aplikasi", () => {
    expect(parseTrendParams({})).toEqual({ range: "30d", source: null });
  });
  it("membaca rentang dan aplikasi yang valid", () => {
    expect(parseTrendParams({ range: "7d", source: A })).toEqual({ range: "7d", source: A });
    for (const r of ["7d", "30d", "90d", "all"]) expect(parseTrendParams({ range: r }).range).toBe(r);
  });
  it("nilai tidak valid diabaikan tanpa galat", () => {
    expect(parseTrendParams({ range: "1y", source: "xyz" })).toEqual({ range: "30d", source: null });
    expect(parseTrendParams({ range: "'; drop table--", source: "' or 1=1" })).toEqual({ range: "30d", source: null });
    expect(parseTrendParams({ range: "", source: "" })).toEqual({ range: "30d", source: null });
  });
  it("parameter ganda memakai nilai pertama; UUID huruf besar dinormalkan", () => {
    expect(parseTrendParams({ range: ["90d", "7d"] }).range).toBe("90d");
    const HEX = "abcdef01-2345-4678-89ab-cdef01234567";
    expect(parseTrendParams({ source: HEX.toUpperCase() }).source).toBe(HEX);
  });
});

describe("trendHref", () => {
  it("nilai bawaan tidak ditulis", () => {
    expect(trendHref({ range: "30d", source: null })).toBe("/tren");
  });
  it("menulis rentang dan aplikasi yang bukan bawaan", () => {
    expect(trendHref({ range: "7d", source: A })).toBe(`/tren?range=7d&source=${A}`);
    expect(trendHref({ range: "30d", source: null }, { range: "all" })).toBe("/tren?range=all");
  });
  it("round trip dengan parseTrendParams", () => {
    for (const p of [{ range: "7d", source: A }, { range: "all", source: null }, { range: "90d", source: B }] as const) {
      const qs = Object.fromEntries(new URLSearchParams(trendHref(p).split("?")[1] ?? ""));
      expect(parseTrendParams(qs)).toEqual(p);
    }
  });
});

describe("rangeStart", () => {
  const now = Date.UTC(2026, 10, 7, 12);
  it("menghitung awal rentang dalam hari", () => {
    expect(rangeStart("7d", now)).toBe(now - 7 * DAY);
    expect(rangeStart("30d", now)).toBe(now - 30 * DAY);
    expect(rangeStart("90d", now)).toBe(now - 90 * DAY);
  });
  it("'all' tidak punya batas awal", () => {
    expect(rangeStart("all", now)).toBeNull();
  });
});

describe("percentDone", () => {
  it("satu desimal, nol bila tidak ada task", () => {
    expect(percentDone({ done: 142, total: 173 })).toBe(82.1);
    expect(percentDone({ done: 1, total: 3 })).toBe(33.3);
    expect(percentDone({ done: 0, total: 0 })).toBe(0);
    expect(percentDone({ done: 5, total: 5 })).toBe(100);
  });
});

describe("buildSeries - satu aplikasi", () => {
  it("hanya baris milik aplikasi itu, berurutan waktu, apa adanya (tanpa titik buatan)", () => {
    const rows = [
      row(A, "2026-11-03T10:00:00Z", { total: 10, done: 6 }),
      row(B, "2026-11-02T10:00:00Z", { total: 99, done: 99 }),
      row(A, "2026-11-01T10:00:00Z", { total: 8, done: 3 }),
    ];
    const s = buildSeries(rows, [], A);
    expect(s.map((p) => [new Date(p.t).toISOString(), p.total, p.done])).toEqual([
      ["2026-11-01T10:00:00.000Z", 8, 3],
      ["2026-11-03T10:00:00.000Z", 10, 6],
    ]);
  });
  it("tidak menambah titik di sela dua snapshot yang berjauhan (tanpa interpolasi)", () => {
    const rows = [row(A, "2026-10-01T00:00:00Z", { total: 5 }), row(A, "2026-11-01T00:00:00Z", { total: 9 })];
    expect(buildSeries(rows, [], A)).toHaveLength(2);
  });
  it("tidak ada baris -> kosong; nilai bukan angka dianggap 0", () => {
    expect(buildSeries([], [], A)).toEqual([]);
    const weird = { source_id: A, taken_at: "2026-11-01T00:00:00Z", total: "7", done: null, pending: undefined } as unknown as SnapshotRow;
    expect(buildSeries([weird], [], A)[0]).toMatchObject({ total: 7, done: 0, pending: 0 });
  });
  it("baris dengan waktu tidak valid dibuang", () => {
    expect(buildSeries([row(A, "bukan-waktu", { total: 1 })], [], A)).toEqual([]);
  });
});

describe("buildSeries - gabungan (nilai terakhir dibawa maju)", () => {
  it("menjumlahkan keadaan terakhir tiap aplikasi pada tiap waktu sinkronisasi", () => {
    const rows = [
      row(A, "2026-11-01T10:00:00Z", { total: 10, done: 2 }),
      row(B, "2026-11-02T10:00:00Z", { total: 20, done: 10 }),
      row(A, "2026-11-03T10:00:00Z", { total: 10, done: 8 }),
    ];
    const s = buildSeries(rows, [], null);
    expect(s.map((p) => [p.total, p.done])).toEqual([
      [10, 2],       // hanya A
      [30, 12],      // A (dibawa maju) + B
      [30, 18],      // A baru + B (dibawa maju)
    ]);
  });

  it("aplikasi yang belum pernah disinkronkan belum menyumbang apa pun (tidak diisi nol palsu)", () => {
    const s = buildSeries([row(A, "2026-11-01T10:00:00Z", { total: 4, done: 1 })], [], null);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ total: 4, done: 1 });
  });

  it("keadaan awal (sebelum rentang) dibawa maju, sehingga gabungan tidak salah di awal rentang", () => {
    const initial = [row(B, "2026-09-01T00:00:00Z", { total: 50, done: 40 })];
    const rows = [row(A, "2026-11-01T10:00:00Z", { total: 10, done: 2 })];
    const s = buildSeries(rows, initial, null);
    expect(s[0]).toMatchObject({ total: 60, done: 42 }); // A + B yang disinkronkan sebelum rentang
  });

  it("memakai baris TERBARU per aplikasi bila keadaan awal memuat beberapa baris", () => {
    const initial = [
      row(B, "2026-08-01T00:00:00Z", { total: 1, done: 1 }),
      row(B, "2026-09-01T00:00:00Z", { total: 7, done: 5 }),
    ];
    const s = buildSeries([row(A, "2026-11-01T00:00:00Z", { total: 3 })], initial, null);
    expect(s[0]).toMatchObject({ total: 10, done: 5 });
  });

  it("dua aplikasi pada waktu yang sama persis menjadi SATU titik", () => {
    const rows = [row(A, "2026-11-01T10:00:00Z", { total: 3, done: 1 }), row(B, "2026-11-01T10:00:00Z", { total: 4, done: 2 })];
    const s = buildSeries(rows, [], null);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ total: 7, done: 3 });
  });

  it("tiga aplikasi dengan jadwal berbeda; urutan masukan tidak mempengaruhi hasil", () => {
    const rows = [
      row(C, "2026-11-05T00:00:00Z", { total: 6, done: 6 }),
      row(A, "2026-11-01T00:00:00Z", { total: 10, done: 1 }),
      row(B, "2026-11-03T00:00:00Z", { total: 20, done: 5 }),
      row(A, "2026-11-04T00:00:00Z", { total: 10, done: 9 }),
    ];
    const s = buildSeries(rows, [], null);
    expect(s.map((p) => [p.total, p.done])).toEqual([[10, 1], [30, 6], [30, 14], [36, 20]]);
    expect(buildSeries([...rows].reverse(), [], null)).toEqual(s);
  });

  it("semua kategori dijumlahkan, termasuk blocked dan other", () => {
    const rows = [
      row(A, "2026-11-01T00:00:00Z", { total: 5, blocked: 1, other: 2, deferred: 1, cancelled: 1 }),
      row(B, "2026-11-02T00:00:00Z", { total: 3, blocked: 2, review: 1 }),
    ];
    const last = buildSeries(rows, [], null).at(-1)!;
    expect(last).toMatchObject({ total: 8, blocked: 3, other: 2, deferred: 1, cancelled: 1, review: 1 });
  });

  it("tanpa baris sama sekali -> kosong, walau ada keadaan awal (tidak ada titik buatan)", () => {
    expect(buildSeries([], [row(A, "2026-09-01T00:00:00Z", { total: 5 })], null)).toEqual([]);
  });
});

describe("downsampleDaily", () => {
  const p = (iso: string, total: number): SeriesPoint => ({ t: new Date(iso).getTime(), ...counts({ total }) });

  it("satu titik per hari: yang terakhir pada hari itu", () => {
    const out = downsampleDaily([p("2026-11-01T01:00:00Z", 1), p("2026-11-01T05:00:00Z", 2), p("2026-11-02T01:00:00Z", 3)]);
    expect(out.map((x) => x.total)).toEqual([2, 3]);
  });
  it("hari dihitung menurut WIB, bukan UTC", () => {
    // 2026-11-01 18:00Z = 2026-11-02 01:00 WIB ; 2026-11-01 16:00Z = 2026-11-01 23:00 WIB
    const out = downsampleDaily([p("2026-11-01T16:00:00Z", 1), p("2026-11-01T18:00:00Z", 2)]);
    expect(out.map((x) => x.total)).toEqual([1, 2]);
  });
  it("urutan waktu dipertahankan dan titik yang tidak sehari tidak hilang", () => {
    const pts = Array.from({ length: 10 }, (_, i) => p(`2026-11-0${i + 1 > 9 ? 9 : i + 1}T10:00:00Z`, i));
    const out = downsampleDaily(pts);
    expect(out.map((x) => x.t)).toEqual([...out.map((x) => x.t)].sort((a, b) => a - b));
  });
  it("kosong -> kosong", () => {
    expect(downsampleDaily([])).toEqual([]);
  });
  it("MAX_POINTS wajar", () => {
    expect(MAX_POINTS).toBeGreaterThanOrEqual(100);
  });
});

describe("summarizeTrend", () => {
  const p = (iso: string, over: Partial<Counts>): SeriesPoint => ({ t: new Date(iso).getTime(), ...counts(over) });

  it("kosong", () => {
    expect(summarizeTrend([])).toEqual({ count: 0, latest: null, first: null, percent: 0, percentDelta: null, doneDelta: null, blockedDelta: null });
  });
  it("satu titik: nilai ada, selisih null (tidak ada pembanding)", () => {
    const s = summarizeTrend([p("2026-11-01T00:00:00Z", { total: 10, done: 5 })]);
    expect(s).toMatchObject({ count: 1, percent: 50, percentDelta: null, doneDelta: null, blockedDelta: null });
  });
  it("beberapa titik: selisih terhadap titik pertama dalam rentang", () => {
    const s = summarizeTrend([
      p("2026-11-01T00:00:00Z", { total: 100, done: 40, blocked: 1 }),
      p("2026-11-02T00:00:00Z", { total: 100, done: 60, blocked: 5 }),
      p("2026-11-03T00:00:00Z", { total: 120, done: 90, blocked: 3 }),
    ]);
    expect(s.percent).toBe(75);
    expect(s.percentDelta).toBe(35); // 75 - 40
    expect(s.doneDelta).toBe(50);
    expect(s.blockedDelta).toBe(2);
  });
  it("persentase bisa turun (selisih negatif)", () => {
    const s = summarizeTrend([p("2026-11-01T00:00:00Z", { total: 10, done: 10 }), p("2026-11-02T00:00:00Z", { total: 20, done: 10 })]);
    expect(s.percentDelta).toBe(-50);
  });
});

describe("seri grafik tumpuk", () => {
  it("enam seri dengan warna tetap menurut entitas dan susunan dari dasar ke puncak", () => {
    expect(STACK.map((s) => s.key)).toEqual(["done", "in_progress", "blocked", "review", "pending", "other"]);
    expect(STACK.map((s) => s.cssVar)).toEqual(["--viz-done", "--viz-in-progress", "--viz-blocked", "--viz-review", "--viz-pending", "--viz-other"]);
    expect(new Set(STACK.map((s) => s.cssVar)).size).toBe(6);
  });
  it("menggabungkan ditunda, dibatalkan, dan lainnya menjadi satu seri", () => {
    const v = stackValues(counts({ total: 20, done: 5, in_progress: 4, blocked: 3, review: 2, pending: 1, deferred: 2, cancelled: 2, other: 1 }));
    expect(v).toEqual([5, 4, 3, 2, 1, 5]);
  });
  it("jumlah semua seri sama dengan total bila hitungannya konsisten", () => {
    const c = counts({ total: 36, pending: 1, in_progress: 2, review: 3, blocked: 4, done: 5, deferred: 6, cancelled: 7, other: 8 });
    expect(stackValues(c).reduce((a, b) => a + b, 0)).toBe(c.total);
  });
  it("tidak ada kategori yang hilang atau terhitung dua kali", () => {
    const keys = ["pending", "in_progress", "review", "blocked", "done", "deferred", "cancelled", "other"] as const;
    const used = STACK.flatMap((s) => [...s.parts]);
    expect([...used].sort()).toEqual([...keys].sort());
    expect(new Set(used).size).toBe(used.length);
  });
});
