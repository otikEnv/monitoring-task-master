import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_POINTS, buildSeries, downsampleDaily, rangeStart,
  type SeriesPoint, type SnapshotRow, type TrendParams,
} from "./series";

const PAGE = 1000;
/** Batas baris snapshot yang dibaca untuk satu halaman; lebih dari ini dipotong dan diberi tahu. */
export const MAX_ROWS = 20_000;
const MAX_SOURCES_FOR_INITIAL = 200;

export type TrendData = {
  /** Parameter yang benar-benar dipakai (aplikasi yang tidak dikenal sudah dibuang). */
  params: TrendParams;
  ignoredSource: string | null;
  sources: { id: string; name: string; isActive: boolean }[];
  points: SeriesPoint[];
  /** Batas sumbu waktu (ms). Akhir = sekarang, supaya jeda sejak snapshot terakhir terlihat. */
  start: number;
  end: number;
  /** Jumlah baris snapshot yang dibaca sebelum diringkas. */
  rowCount: number;
  downsampled: boolean;
  truncated: boolean;
};

/**
 * Membaca data tren dengan klien yang diberikan. Klien HARUS membawa sesi pengguna (RLS berlaku).
 * Tidak ada titik buatan: hanya waktu snapshot sungguhan yang menjadi titik.
 */
export async function loadTrend(
  db: SupabaseClient,
  requested: TrendParams,
  now: number = Date.now(),
): Promise<TrendData> {
  const sourcesRes = await db.from("sources").select("id, name, is_active").order("name", { ascending: true });
  if (sourcesRes.error) throw new Error(`Gagal membaca sumber: ${sourcesRes.error.message}`);
  const sources = (sourcesRes.data as { id: string; name: string; is_active: boolean }[]).map((s) => ({
    id: s.id, name: s.name, isActive: s.is_active,
  }));

  const known = requested.source ? sources.some((s) => s.id === requested.source) : true;
  const source = known ? requested.source : null;
  const ignoredSource = known ? null : requested.source;
  const params: TrendParams = { range: requested.range, source };

  const from = rangeStart(params.range, now);
  const fromIso = from === null ? null : new Date(from).toISOString();

  // Baca baris snapshot per halaman (PostgREST membatasi 1000 baris per permintaan).
  const rows: SnapshotRow[] = [];
  let truncated = false;
  for (let offset = 0; ; offset += PAGE) {
    if (offset >= MAX_ROWS) { truncated = true; break; }
    let q = db
      .from("source_snapshot_totals")
      .select("*")
      .order("taken_at", { ascending: true })
      .order("source_id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (fromIso) q = q.gte("taken_at", fromIso);
    if (source) q = q.eq("source_id", source);
    const { data, error } = await q;
    // Tepat kelipatan halaman: halaman berikutnya kosong dan PostgREST menjawab PGRST103; itu akhir data.
    if (error) {
      if (error.code === "PGRST103") break;
      throw new Error(`Gagal membaca snapshot: ${error.message}`);
    }
    rows.push(...(data as SnapshotRow[]));
    if ((data as unknown[]).length < PAGE) break;
  }

  // Gabungan: keadaan terakhir tiap aplikasi SEBELUM awal rentang, agar nilai di awal rentang benar.
  let initial: SnapshotRow[] = [];
  if (!source && fromIso) {
    const ids = sources.map((s) => s.id).slice(0, MAX_SOURCES_FOR_INITIAL);
    const found = await Promise.all(
      ids.map(async (id) => {
        const r = await db
          .from("source_snapshot_totals")
          .select("*")
          .eq("source_id", id)
          .lt("taken_at", fromIso)
          .order("taken_at", { ascending: false })
          .limit(1);
        if (r.error) throw new Error(`Gagal membaca keadaan awal: ${r.error.message}`);
        return (r.data as SnapshotRow[])[0] ?? null;
      }),
    );
    initial = found.filter((r): r is SnapshotRow => r !== null);
  }

  let points = buildSeries(rows, initial, source);
  const downsampled = points.length > MAX_POINTS;
  if (downsampled) points = downsampleDaily(points);

  const last = points.at(-1)?.t ?? now;
  const start = from ?? points[0]?.t ?? now;
  return {
    params, ignoredSource, sources, points,
    start, end: Math.max(now, last),
    rowCount: rows.length, downsampled, truncated,
  };
}

/** Data tren untuk pengguna yang sedang login (sesi dari cookie). */
export async function getTrend(params: TrendParams): Promise<TrendData> {
  return loadTrend(await createClient(), params);
}
