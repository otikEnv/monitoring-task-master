import type { ReleaseOverview } from "./load";
import type { RiskLevel } from "./model";

/** Ringkasan satu baris release untuk kartu aplikasi di Dashboard. */
export type ReleaseSummary = {
  releaseId: string;
  name: string;
  /** Progres komponen milik aplikasi ini (bulat 0..100); null = belum ada task di rentangnya. */
  percent: number | null;
  /** Jumlah task komponen aplikasi ini. */
  total: number;
  daysLeft: number;
  /** Risiko release secara keseluruhan (bukan hanya komponen aplikasi ini). */
  risk: RiskLevel;
  /** Jumlah komponen (aplikasi) pada release ini; > 1 berarti release lintas aplikasi. */
  componentCount: number;
  /** Jumlah release belum rilis lainnya yang memuat aplikasi ini. */
  extra: number;
};

/**
 * Release belum rilis dengan target terdekat per aplikasi. Masukan sudah terurut (sortOverviews);
 * yang sudah rilis diabaikan. Release lintas aplikasi muncul pada tiap aplikasi yang terlibat, dengan
 * progres komponen aplikasi itu (beberapa tag pada aplikasi yang sama dijumlahkan).
 */
export function summarizeReleases(overviews: ReleaseOverview[]): Map<string, ReleaseSummary> {
  const out = new Map<string, ReleaseSummary>();
  for (const o of overviews) {
    if (o.release.releasedOn) continue;

    const perSource = new Map<string, { total: number; done: number }>();
    for (const c of o.components) {
      const acc = perSource.get(c.component.sourceId) ?? { total: 0, done: 0 };
      acc.total += c.stats.total;
      acc.done += c.stats.done;
      perSource.set(c.component.sourceId, acc);
    }

    for (const [sourceId, { total, done }] of perSource) {
      const current = out.get(sourceId);
      if (current) {
        current.extra++;
        continue;
      }
      out.set(sourceId, {
        releaseId: o.release.id,
        name: o.release.name,
        percent: total > 0 ? Math.round((done * 100) / total) : null,
        total,
        daysLeft: o.stats.daysLeft,
        risk: o.stats.risk,
        componentCount: o.components.length,
        extra: 0,
      });
    }
  }
  return out;
}
