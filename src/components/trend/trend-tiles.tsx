import { formatFull } from "@/lib/trend/geometry";
import type { TrendSummary } from "@/lib/trend/series";

const nf = new Intl.NumberFormat("id-ID");
const pf = (n: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n)}%`;
const signed = (n: number, digits = 0) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(Math.abs(n))}`;

type Delta = { value: number | null; unit: string; digits?: number; upIsGood: boolean };

/**
 * Selisih terhadap awal rentang: tanda, panah, dan kata (tidak mengandalkan warna saja).
 * Warna = arah x apakah naik itu baik (selesai naik = baik; terhambat naik = buruk).
 */
function DeltaText({ delta, period }: { delta: Delta; period: string }) {
  if (delta.value === null) {
    return <p className="text-xs" style={{ color: "var(--viz-text-secondary)" }}>Belum ada pembanding (baru satu titik data)</p>;
  }
  const { value, unit, digits = 0, upIsGood } = delta;
  if (value === 0) {
    return <p className="text-xs" style={{ color: "var(--viz-text-secondary)" }}>— tidak berubah dibanding {period}</p>;
  }
  const good = (value > 0) === upIsGood;
  return (
    <p className="text-xs font-medium" style={{ color: good ? "var(--viz-good-text)" : "var(--viz-bad-text)" }}>
      <span aria-hidden="true">{value > 0 ? "▲" : "▼"}</span>{" "}
      <span className="sr-only">{value > 0 ? "naik" : "turun"}</span>
      {signed(value, digits)} {unit}{" "}
      <span style={{ color: "var(--viz-text-secondary)" }} className="font-normal">dibanding {period}</span>
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
    <div className="grid gap-4 sm:grid-cols-3" aria-label="Ringkasan">
      <div className={tile} style={style}>
        <p className="text-xs" style={{ color: "var(--viz-text-secondary)" }}>Task selesai</p>
        {/* angka utama: >= 48px, sans yang sama, angka proporsional (bukan tabular) */}
        <p className="text-5xl font-semibold leading-none">{pf(summary.percent)}</p>
        <p className="text-xs" style={{ color: "var(--viz-text-secondary)" }}>{nf.format(latest.done)} dari {nf.format(latest.total)} task</p>
        <DeltaText delta={{ value: summary.percentDelta, unit: "poin", digits: 1, upIsGood: true }} period={period} />
      </div>

      <div className={tile} style={style}>
        <p className="text-xs" style={{ color: "var(--viz-text-secondary)" }}>Task terhambat</p>
        <p className="text-2xl font-semibold leading-tight">{nf.format(latest.blocked)}</p>
        <p className="text-xs" style={{ color: "var(--viz-text-secondary)" }}>dari {nf.format(latest.total)} task</p>
        <DeltaText delta={{ value: summary.blockedDelta, unit: "task", upIsGood: false }} period={period} />
      </div>

      <div className={tile} style={style}>
        <p className="text-xs" style={{ color: "var(--viz-text-secondary)" }}>Data terakhir</p>
        <p className="text-2xl font-semibold leading-tight">{formatFull(latest.t)}</p>
        <p className="text-xs" style={{ color: "var(--viz-text-secondary)" }}>{nf.format(summary.count)} titik data dalam rentang ini</p>
      </div>
    </div>
  );
}
