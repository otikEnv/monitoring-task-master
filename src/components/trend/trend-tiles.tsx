import { formatFull } from "@/lib/trend/geometry";
import type { TrendSummary } from "@/lib/trend/series";

const nf = new Intl.NumberFormat("en-GB");
const pf = (n: number) => `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(n)}%`;
const signed = (n: number, digits = 0) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(Math.abs(n))}`;

type Delta = { value: number | null; unit: string; digits?: number; upIsGood: boolean };

/**
 * Selisih terhadap awal rentang: tanda, panah, dan kata (tidak mengandalkan warna saja).
 * Warna = arah x apakah naik itu baik (selesai naik = baik; terhambat naik = buruk).
 */
function DeltaText({ delta, period }: { delta: Delta; period: string }) {
  if (delta.value === null) {
    return <p className="text-xs" style={{ color: "var(--viz-text-secondary)" }}>No comparison yet (only one data point)</p>;
  }
  const { value, unit, digits = 0, upIsGood } = delta;
  if (value === 0) {
    return <p className="text-xs" style={{ color: "var(--viz-text-secondary)" }}>— unchanged compared to {period}</p>;
  }
  const good = (value > 0) === upIsGood;
  return (
    <p className="text-xs font-medium" style={{ color: good ? "var(--viz-good-text)" : "var(--viz-bad-text)" }}>
      <span aria-hidden="true">{value > 0 ? "▲" : "▼"}</span>{" "}
      <span className="sr-only">{value > 0 ? "up" : "down"}</span>
      {signed(value, digits)} {unit}{" "}
      <span style={{ color: "var(--viz-text-secondary)" }} className="font-normal">compared to {period}</span>
    </p>
  );
}

/** Baris kartu angka. Hanya satu angka utama (>= 48px) yang memimpin: persentase selesai. */
export function TrendTiles({ summary, period }: { summary: TrendSummary; period: string }) {
  const { latest } = summary;
  if (!latest) return null;
  const tile = "space-y-1 rounded-lg border p-4";
  const style = { background: "var(--viz-surface)", borderColor: "var(--viz-grid)", color: "var(--viz-text-primary)" };

  return (
    <div className="grid gap-4 sm:grid-cols-3" aria-label="Summary">
      <div className={tile} style={style}>
        <p className="text-xs" style={{ color: "var(--viz-text-secondary)" }}>Tasks done</p>
        {/* angka utama: >= 48px, sans yang sama, angka proporsional (bukan tabular) */}
        <p className="text-5xl font-semibold leading-none">{pf(summary.percent)}</p>
        <p className="text-xs" style={{ color: "var(--viz-text-secondary)" }}>{nf.format(latest.done)} of {nf.format(latest.total)} tasks</p>
        <DeltaText delta={{ value: summary.percentDelta, unit: "points", digits: 1, upIsGood: true }} period={period} />
      </div>

      <div className={tile} style={style}>
        <p className="text-xs" style={{ color: "var(--viz-text-secondary)" }}>Blocked tasks</p>
        <p className="text-2xl font-semibold leading-tight">{nf.format(latest.blocked)}</p>
        <p className="text-xs" style={{ color: "var(--viz-text-secondary)" }}>of {nf.format(latest.total)} tasks</p>
        <DeltaText delta={{ value: summary.blockedDelta, unit: "tasks", upIsGood: false }} period={period} />
      </div>

      <div className={tile} style={style}>
        <p className="text-xs" style={{ color: "var(--viz-text-secondary)" }}>Latest data</p>
        <p className="text-2xl font-semibold leading-tight">{formatFull(latest.t)}</p>
        <p className="text-xs" style={{ color: "var(--viz-text-secondary)" }}>{nf.format(summary.count)} data points in this range</p>
      </div>
    </div>
  );
}
