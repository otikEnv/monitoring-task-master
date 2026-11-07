import type { ReleaseOverview } from "./load";
import type { RiskLevel } from "./model";

/** Ringkasan satu baris release untuk kartu aplikasi di Dashboard. */
export type ReleaseSummary = {
  releaseId: string;
  name: string;
  /** Bulat 0..100; null = belum ada task di rentang. */
  percent: number | null;
  total: number;
  daysLeft: number;
  risk: RiskLevel;
  /** Jumlah release belum rilis lainnya pada aplikasi yang sama. */
  extra: number;
};

/**
 * Release belum rilis dengan target terdekat per aplikasi. Masukan sudah terurut (sortOverviews);
 * yang sudah rilis diabaikan.
 */
export function summarizeReleases(overviews: ReleaseOverview[]): Map<string, ReleaseSummary> {
  const out = new Map<string, ReleaseSummary>();
  for (const o of overviews) {
    if (o.release.releasedOn) continue;
    const current = out.get(o.release.sourceId);
    if (current) {
      current.extra++;
      continue;
    }
    out.set(o.release.sourceId, {
      releaseId: o.release.id,
      name: o.release.name,
      percent: o.stats.percentDone,
      total: o.stats.total,
      daysLeft: o.stats.daysLeft,
      risk: o.stats.risk,
      extra: 0,
    });
  }
  return out;
}
