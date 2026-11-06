/**
 * Logika murni halaman Tren: parameter URL, deret waktu dari snapshot, dan ringkasan.
 * Tanpa server maupun React, sehingga mudah diuji.
 *
 * Prinsip kejujuran data: snapshot hanya terbentuk saat sinkronisasi mengubah data, jadi deret waktu
 * punya celah. Titik yang ada ditampilkan apa adanya; tidak ada titik buatan dan tidak ada interpolasi.
 */

export const RANGES = ["7d", "30d", "90d", "all"] as const;
export type Range = (typeof RANGES)[number];
export const DEFAULT_RANGE: Range = "30d";
export const RANGE_LABEL: Record<Range, string> = {
  "7d": "7 hari", "30d": "30 hari", "90d": "90 hari", all: "Semua",
};
const RANGE_DAYS: Record<Exclude<Range, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 };
const DAY_MS = 24 * 60 * 60 * 1000;

export type TrendParams = { range: Range; source: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Membaca searchParams dengan aman; nilai tidak valid kembali ke bawaan. */
export function parseTrendParams(sp: Record<string, string | string[] | undefined>): TrendParams {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  const range = first(sp.range);
  const source = first(sp.source);
  return {
    range: (RANGES as readonly string[]).includes(range) ? (range as Range) : DEFAULT_RANGE,
    source: UUID.test(source) ? source.toLowerCase() : null,
  };
}

/** URL halaman tren; nilai bawaan tidak ditulis. */
export function trendHref(p: TrendParams, override: Partial<TrendParams> = {}): string {
  const next = { ...p, ...override };
  const q = new URLSearchParams();
  if (next.range !== DEFAULT_RANGE) q.set("range", next.range);
  if (next.source) q.set("source", next.source);
  const qs = q.toString();
  return qs ? `/tren?${qs}` : "/tren";
}

/** Awal rentang (ms) atau null untuk "Semua". */
export function rangeStart(range: Range, now: number): number | null {
  return range === "all" ? null : now - RANGE_DAYS[range] * DAY_MS;
}

// ---------------------------------------------------------------- data

export type Counts = {
  total: number; pending: number; in_progress: number; review: number; blocked: number;
  done: number; deferred: number; cancelled: number; other: number;
};
/** Baris dari view source_snapshot_totals. */
export type SnapshotRow = Counts & { source_id: string; taken_at: string };
export type SeriesPoint = Counts & { t: number };

const KEYS: Array<keyof Counts> = [
  "total", "pending", "in_progress", "review", "blocked", "done", "deferred", "cancelled", "other",
];
const zero = (): Counts => ({
  total: 0, pending: 0, in_progress: 0, review: 0, blocked: 0, done: 0, deferred: 0, cancelled: 0, other: 0,
});
const pick = (r: Counts): Counts => {
  const c = zero();
  for (const k of KEYS) c[k] = Number(r[k]) || 0;
  return c;
};

/** Persentase selesai (0-100, satu desimal); 0 bila belum ada task. */
export const percentDone = (c: Pick<Counts, "done" | "total">) =>
  c.total > 0 ? Math.round((c.done * 1000) / c.total) / 10 : 0;

/**
 * Deret waktu dari baris snapshot.
 *  - sourceId diisi : titik-titik milik aplikasi itu saja.
 *  - sourceId null  : gabungan semua aplikasi. Pada tiap waktu sinkronisasi (dari aplikasi mana pun) nilainya
 *    adalah jumlah keadaan TERAKHIR YANG DIKETAHUI dari tiap aplikasi (dibawa maju sampai ada snapshot baru).
 *    `initial` memberi keadaan tiap aplikasi tepat sebelum awal rentang; aplikasi yang belum pernah
 *    disinkronkan pada waktu itu belum menyumbang apa pun.
 * Titik hanya ada di waktu snapshot sungguhan.
 */
export function buildSeries(
  rows: readonly SnapshotRow[],
  initial: readonly SnapshotRow[],
  sourceId: string | null,
): SeriesPoint[] {
  const time = (r: SnapshotRow) => new Date(r.taken_at).getTime();

  if (sourceId) {
    return rows
      .filter((r) => r.source_id === sourceId)
      .map((r) => ({ t: time(r), ...pick(r) }))
      .filter((p) => Number.isFinite(p.t))
      .sort((a, b) => a.t - b.t);
  }

  // Keadaan awal: baris terbaru per aplikasi sebelum rentang.
  const state = new Map<string, { t: number; c: Counts }>();
  for (const r of initial) {
    const t = time(r);
    const cur = state.get(r.source_id);
    if (Number.isFinite(t) && (!cur || t > cur.t)) state.set(r.source_id, { t, c: pick(r) });
  }

  const byTime = new Map<number, SnapshotRow[]>();
  for (const r of rows) {
    const t = time(r);
    if (!Number.isFinite(t)) continue;
    (byTime.get(t) ?? byTime.set(t, []).get(t)!).push(r);
  }

  const points: SeriesPoint[] = [];
  for (const t of [...byTime.keys()].sort((a, b) => a - b)) {
    for (const r of byTime.get(t)!) state.set(r.source_id, { t, c: pick(r) });
    const sum = zero();
    for (const { c } of state.values()) for (const k of KEYS) sum[k] += c[k];
    points.push({ t, ...sum });
  }
  return points;
}

/** Batas titik pada grafik; lebih dari ini diringkas satu titik per hari. */
export const MAX_POINTS = 300;

const dayKey = (t: number) =>
  new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }); // YYYY-MM-DD

/** Satu titik per hari (yang terakhir pada hari itu, zona WIB). Urutan waktu dipertahankan. */
export function downsampleDaily(points: readonly SeriesPoint[]): SeriesPoint[] {
  const lastOfDay = new Map<string, SeriesPoint>();
  for (const p of points) lastOfDay.set(dayKey(p.t), p); // titik berikutnya pada hari yang sama menimpa
  return [...lastOfDay.values()].sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------- ringkasan

export type TrendSummary = {
  count: number;
  latest: SeriesPoint | null;
  first: SeriesPoint | null;
  percent: number;
  /** Selisih persentase selesai (poin persentase); null bila kurang dari dua titik. */
  percentDelta: number | null;
  doneDelta: number | null;
  blockedDelta: number | null;
};

export function summarizeTrend(points: readonly SeriesPoint[]): TrendSummary {
  const first = points[0] ?? null;
  const latest = points[points.length - 1] ?? null;
  const two = points.length >= 2 && first && latest;
  return {
    count: points.length,
    latest,
    first,
    percent: latest ? percentDone(latest) : 0,
    percentDelta: two ? Math.round((percentDone(latest) - percentDone(first)) * 10) / 10 : null,
    doneDelta: two ? latest.done - first.done : null,
    blockedDelta: two ? latest.blocked - first.blocked : null,
  };
}

// ---------------------------------------------------------------- seri pada grafik tumpuk

/**
 * Seri grafik tumpuk, urut dari dasar ke puncak. Warna mengikuti ENTITAS (bukan peringkat) dan susunannya
 * sudah divalidasi untuk penderita buta warna di mode terang dan gelap (lihat globals.css, blok .viz-root).
 * Status yang jarang dipakai digabung menjadi satu seri agar jumlah seri tetap nyaman dibaca; rinciannya
 * ada di tooltip dan tabel.
 */
export const STACK = [
  { key: "done", label: "Selesai", parts: ["done"], cssVar: "--viz-done" },
  { key: "in_progress", label: "Dikerjakan", parts: ["in_progress"], cssVar: "--viz-in-progress" },
  { key: "blocked", label: "Terhambat", parts: ["blocked"], cssVar: "--viz-blocked" },
  { key: "review", label: "Ditinjau", parts: ["review"], cssVar: "--viz-review" },
  { key: "pending", label: "Menunggu", parts: ["pending"], cssVar: "--viz-pending" },
  { key: "other", label: "Ditunda, dibatalkan, lainnya", parts: ["deferred", "cancelled", "other"], cssVar: "--viz-other" },
] as const satisfies ReadonlyArray<{ key: string; label: string; parts: ReadonlyArray<keyof Counts>; cssVar: string }>;

export type StackKey = (typeof STACK)[number]["key"];

/** Nilai tiap seri tumpuk untuk satu titik, urut seperti STACK. */
export function stackValues(c: Counts): number[] {
  return STACK.map((s) => (s.parts as ReadonlyArray<keyof Counts>).reduce((n, k) => n + c[k], 0));
}
