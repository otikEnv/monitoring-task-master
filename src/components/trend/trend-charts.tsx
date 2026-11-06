"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import {
  columnWidth, formatFull, formatTick, gapThresholdMs, linePaths, linearScale, nearestIndex,
  niceMax, roundedTopRect, timeTicks, yTicks,
} from "@/lib/trend/geometry";
import { STACK, percentDone, stackValues, type SeriesPoint } from "@/lib/trend/series";

/**
 * Dua grafik dengan sumbu waktu yang sama:
 *   1. Persentase task selesai: satu seri, garis 2px, tanpa kotak legenda (judul menyebut apa yang digambar).
 *   2. Jumlah task per status: kolom bertumpuk di waktu snapshot, dengan legenda.
 *
 * Kejujuran data: titik hanya ada di waktu snapshot sungguhan. Antar titik yang berjauhan garis digambar
 * putus-putus (tidak ada sinkronisasi di selang itu); kolom tidak diisi di antaranya. Sumbu waktu berakhir
 * "sekarang", jadi jeda sejak snapshot terakhir terlihat.
 */

const GAP = 2; // jeda permukaan antar segmen (px)
const MAX_MARKERS = 60; // di atas ini penanda tiap titik disembunyikan (hanya yang aktif dan terakhir)
const MARGIN = { top: 14, right: 64, bottom: 28, left: 44 };
const nf = new Intl.NumberFormat("id-ID");
const pf = (n: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n)}%`;

type Active = { chart: "percent" | "stack"; i: number } | null;

function useWidth(ref: React.RefObject<HTMLDivElement | null>, initial = 720) {
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // ResizeObserver mengirim ukuran awal segera setelah observe(), jadi tidak perlu pengukuran terpisah.
    const ro = new ResizeObserver(([entry]) => setW(Math.max(320, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export function TrendCharts({
  points, start, end, downsampled,
}: { points: SeriesPoint[]; start: number; end: number; downsampled: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const width = useWidth(wrap);
  const [active, setActive] = useState<Active>(null);

  const plotW = width - MARGIN.left - MARGIN.right;
  const x = useMemo(() => linearScale([start, end], [MARGIN.left, MARGIN.left + plotW]), [start, end, plotW]);
  const xs = useMemo(() => points.map((p) => x(p.t)), [points, x]);
  const gapMs = gapThresholdMs(start, end);
  const span = end - start;
  const ticks = useMemo(
    () => timeTicks(start, end, width < 520 ? 3 : width < 760 ? 4 : 6),
    [start, end, width],
  );

  const activePoint = active ? points[active.i] : null;

  return (
    <div ref={wrap} className="viz-root space-y-6">
      <PercentChart
        points={points} x={x} xs={xs} width={width} plotW={plotW} ticks={ticks} span={span} gapMs={gapMs}
        active={active} setActive={setActive}
      />
      <StackChart
        points={points} x={x} xs={xs} width={width} plotW={plotW} ticks={ticks} span={span}
        active={active} setActive={setActive}
      />

      {/* Pengumuman untuk pembaca layar: nilai pada titik yang sedang dipilih dengan keyboard atau penunjuk. */}
      <p className="sr-only" aria-live="polite">
        {activePoint
          ? `${formatFull(activePoint.t)}: ${pf(percentDone(activePoint))} selesai, ${nf.format(activePoint.done)} dari ${nf.format(activePoint.total)} task`
          : ""}
      </p>

      {downsampled && (
        <p className="text-xs" style={{ color: "var(--viz-text-secondary)" }}>
          Data sangat banyak, jadi ditampilkan satu titik per hari (titik terakhir pada hari itu).
        </p>
      )}

      <DataTable points={points} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- bingkai

type Shared = {
  points: SeriesPoint[];
  x: (v: number) => number;
  xs: number[];
  width: number;
  plotW: number;
  ticks: number[];
  span: number;
  active: Active;
  setActive: (a: Active) => void;
};

function Card({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section
      className="space-y-3 rounded-lg border p-4"
      style={{ background: "var(--viz-surface)", borderColor: "var(--viz-grid)", color: "var(--viz-text-primary)" }}
    >
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-xs" style={{ color: "var(--viz-text-secondary)" }}>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/** Lapisan interaksi: crosshair menempel ke titik terdekat; bisa dijangkau keyboard (panah, Home, End, Esc). */
function Overlay({
  chart, xs, plotLeft, plotW, height, active, setActive, label,
}: {
  chart: "percent" | "stack"; xs: number[]; plotLeft: number; plotW: number; height: number;
  active: Active; setActive: (a: Active) => void; label: string;
}) {
  const n = xs.length;
  const current = active && active.chart === chart ? active.i : null;

  function pick(clientX: number, rect: DOMRect) {
    const i = nearestIndex(xs, clientX - rect.left + plotLeft);
    if (i >= 0) setActive({ chart, i });
  }
  function onKey(e: React.KeyboardEvent) {
    if (n === 0) return;
    const i = current ?? (e.key === "ArrowLeft" || e.key === "End" ? n : -1);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(n - 1, i + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, i - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") { setActive(null); return; }
    if (next !== null) { e.preventDefault(); setActive({ chart, i: next }); }
  }

  return (
    <div
      role="application"
      aria-label={label}
      tabIndex={0}
      className="absolute outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
      style={{ left: plotLeft, top: 0, width: plotW, height }}
      onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
      onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
      onPointerLeave={() => setActive(null)}
      onFocus={() => { if (!current && n > 0) setActive({ chart, i: n - 1 }); }}
      onBlur={() => setActive(null)}
      onKeyDown={onKey}
    />
  );
}

function Tooltip({
  left, width, containerW, children,
}: { left: number; width: number; containerW: number; children: React.ReactNode }) {
  const right = left > containerW * 0.6;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 rounded-md border px-3 py-2 text-xs shadow-md"
      style={{
        top: 8,
        ...(right ? { right: Math.max(0, width - left + 12) } : { left: left + 12 }),
        background: "var(--viz-surface)",
        borderColor: "var(--viz-axis)",
        color: "var(--viz-text-primary)",
        minWidth: 160,
      }}
    >
      {children}
    </div>
  );
}

function XAxis({ ticks, x, span, y }: { ticks: number[]; x: (v: number) => number; span: number; y: number }) {
  return (
    <g>
      {ticks.map((t, i) => (
        <text
          key={t} x={x(t)} y={y + 18} fontSize={11}
          textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}
          style={{ fill: "var(--viz-text-muted)" }}
        >
          {formatTick(t, span)}
        </text>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------------------------- persentase

function PercentChart({ points, x, xs, width, plotW, ticks, span, gapMs, active, setActive }: Shared & { gapMs: number }) {
  const H = 220;
  const plotTop = MARGIN.top;
  const plotBottom = H - MARGIN.bottom;
  const y = linearScale([0, 100], [plotBottom, plotTop]);
  const pts = points.map((p, i) => ({ x: xs[i], y: y(percentDone(p)), t: p.t }));
  const { solid, dashed } = linePaths(pts, gapMs);
  const showMarkers = points.length <= MAX_MARKERS;
  const last = pts.at(-1);
  const lastPct = points.length ? percentDone(points[points.length - 1]) : 0;
  const cur = active ? active.i : null; // crosshair dibagi antar kedua grafik (sumbu waktu sama)
  const hovered = active?.chart === "percent" && active.i < points.length ? points[active.i] : null;

  return (
    <Card
      title="Persentase task selesai"
      subtitle={
        <>
          Tiap titik adalah satu sinkronisasi yang mengubah data.
          {dashed && (
            <>
              {" "}
              <svg width="22" height="8" aria-hidden="true" className="inline align-middle">
                <line x1="0" y1="4" x2="22" y2="4" strokeWidth="2" strokeDasharray="4 3" style={{ stroke: "var(--viz-done)" }} />
              </svg>{" "}
              Garis putus-putus: tidak ada sinkronisasi pada selang itu.
            </>
          )}
        </>
      }
    >
      <div className="relative" style={{ height: H }}>
        <svg width={width} height={H} role="img" aria-label={`Grafik garis persentase task selesai, ${points.length} titik data. Nilai lengkap ada pada tabel di bawah.`}>
          {/* gridline dan sumbu: hairline solid, redam */}
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(v)} y2={y(v)} strokeWidth={1} style={{ stroke: v === 0 ? "var(--viz-axis)" : "var(--viz-grid)" }} />
              <text x={MARGIN.left - 8} y={y(v) + 4} fontSize={11} textAnchor="end" style={{ fill: "var(--viz-text-muted)" }}>{v}%</text>
            </g>
          ))}
          <XAxis ticks={ticks} x={x} span={span} y={plotBottom} />

          {/* crosshair: menempel ke titik terdekat */}
          {cur !== null && cur < xs.length && (
            <line x1={xs[cur]} x2={xs[cur]} y1={plotTop} y2={plotBottom} strokeWidth={1} style={{ stroke: "var(--viz-text-muted)" }} />
          )}

          {/* garis 2px, ujung membulat */}
          {solid && <path d={solid} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--viz-done)" }} />}
          {dashed && <path d={dashed} fill="none" strokeWidth={2} strokeLinecap="round" strokeDasharray="4 4" style={{ stroke: "var(--viz-done)" }} />}

          {/* penanda r=4 (diameter 8) dengan cincin permukaan 2px */}
          {pts.map((p, i) => {
            const isActive = cur === i;
            const isLast = i === pts.length - 1;
            if (!showMarkers && !isActive && !isLast) return null;
            return (
              <circle key={p.t} cx={p.x} cy={p.y} r={isActive ? 5 : 4} strokeWidth={2} style={{ fill: "var(--viz-done)", stroke: "var(--viz-surface)" }} />
            );
          })}

          {/* label langsung hanya pada titik terakhir (tidak ada angka di setiap titik) */}
          {last && (
            <text x={Math.min(last.x + 10, width - 4)} y={last.y + 4} fontSize={12} fontWeight={600} textAnchor={last.x + 10 > width - 40 ? "end" : "start"} style={{ fill: "var(--viz-text-primary)" }}>
              {pf(lastPct)}
            </text>
          )}
        </svg>

        <Overlay
          chart="percent" xs={xs} plotLeft={MARGIN.left} plotW={plotW} height={H} active={active} setActive={setActive}
          label="Grafik persentase selesai. Gunakan panah kiri dan kanan untuk berpindah antar titik data."
        />

        {hovered && active && (
          <Tooltip left={xs[active.i]} width={width} containerW={width}>
            <p style={{ color: "var(--viz-text-secondary)" }}>{formatFull(hovered.t)}</p>
            <p className="mt-1 flex items-center gap-2">
              <svg width="14" height="8" aria-hidden="true"><line x1="0" y1="4" x2="14" y2="4" strokeWidth="2" strokeLinecap="round" style={{ stroke: "var(--viz-done)" }} /></svg>
              <span className="text-sm font-semibold">{pf(percentDone(hovered))}</span>
              <span style={{ color: "var(--viz-text-secondary)" }}>selesai</span>
            </p>
            <p style={{ color: "var(--viz-text-secondary)" }}>{nf.format(hovered.done)} dari {nf.format(hovered.total)} task</p>
          </Tooltip>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------- tumpuk

function StackChart({ points, x, xs, width, plotW, ticks, span, active, setActive }: Shared) {
  const H = 260;
  const plotTop = MARGIN.top;
  const plotBottom = H - MARGIN.bottom;
  const maxTotal = points.reduce((m, p) => Math.max(m, p.total), 0);
  const top = niceMax(maxTotal);
  const y = linearScale([0, top], [plotBottom, plotTop]);
  const w = columnWidth(points.length, plotW);
  const cur = active ? active.i : null;
  const hovered = active?.chart === "stack" && active.i < points.length ? points[active.i] : null;

  return (
    <Card title="Jumlah task per status" subtitle="Tiap kolom adalah keadaan pada satu sinkronisasi; ruang kosong di antaranya berarti tidak ada sinkronisasi.">
      <div className="relative" style={{ height: H }}>
        <svg width={width} height={H} role="img" aria-label={`Grafik kolom bertumpuk jumlah task per status, ${points.length} titik data. Nilai lengkap ada pada tabel di bawah.`}>
          {yTicks(top).map((v) => (
            <g key={v}>
              <line x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(v)} y2={y(v)} strokeWidth={1} style={{ stroke: v === 0 ? "var(--viz-axis)" : "var(--viz-grid)" }} />
              <text x={MARGIN.left - 8} y={y(v) + 4} fontSize={11} textAnchor="end" style={{ fill: "var(--viz-text-muted)" }}>{nf.format(v)}</text>
            </g>
          ))}
          <XAxis ticks={ticks} x={x} span={span} y={plotBottom} />

          {points.map((p, i) => {
            const values = stackValues(p);
            const topIndex = values.reduce((acc, v, k) => (v > 0 ? k : acc), -1); // segmen teratas yang terisi
            let cum = 0;
            const x0 = xs[i] - w / 2;
            return (
              <g key={p.t} opacity={cur !== null && cur !== i ? 0.55 : 1}>
                {values.map((v, k) => {
                  if (v <= 0) return null;
                  const yTop = y(cum + v);
                  const yBottom = y(cum);
                  cum += v;
                  // Jeda permukaan 2px di antara segmen (bukan garis tepi); segmen terbawah tumbuh dari dasar.
                  const h = Math.max(1, yBottom - yTop - (k > 0 && cum - v > 0 ? GAP : 0));
                  const fillStyle = { fill: `var(${STACK[k].cssVar})` };
                  return k === topIndex ? (
                    <path key={STACK[k].key} d={roundedTopRect(x0, yTop, w, h, 4)} style={fillStyle} />
                  ) : (
                    <rect key={STACK[k].key} x={x0} y={yTop} width={w} height={h} style={fillStyle} />
                  );
                })}
              </g>
            );
          })}

          {/* kolom aktif diberi garis tepi tipis sebagai tanda "terangkat" */}
          {cur !== null && cur < points.length && (
            <rect
              x={xs[cur] - w / 2 - 2} y={y(points[cur].total) - 2} width={w + 4}
              height={Math.max(2, y(0) - y(points[cur].total) + 4)} rx={4} fill="none" strokeWidth={1.5}
              style={{ stroke: "var(--viz-text-secondary)" }}
            />
          )}
        </svg>

        <Overlay
          chart="stack" xs={xs} plotLeft={MARGIN.left} plotW={plotW} height={H} active={active} setActive={setActive}
          label="Grafik jumlah task per status. Gunakan panah kiri dan kanan untuk berpindah antar titik data."
        />

        {hovered && active && (
          <Tooltip left={xs[active.i]} width={width} containerW={width}>
            <p style={{ color: "var(--viz-text-secondary)" }}>{formatFull(hovered.t)}</p>
            <ul className="mt-1 space-y-0.5">
              {[...STACK].reverse().map((s, ri) => {
                const k = STACK.length - 1 - ri;
                const v = stackValues(hovered)[k];
                return (
                  <li key={s.key} className="flex items-center gap-2">
                    <svg width="14" height="8" aria-hidden="true"><line x1="0" y1="4" x2="14" y2="4" strokeWidth="4" strokeLinecap="round" style={{ stroke: `var(${s.cssVar})` }} /></svg>
                    <span className="min-w-8 text-right text-sm font-semibold tabular-nums">{nf.format(v)}</span>
                    <span style={{ color: "var(--viz-text-secondary)" }}>{s.label}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 border-t pt-1" style={{ borderColor: "var(--viz-grid)", color: "var(--viz-text-secondary)" }}>
              Total <strong style={{ color: "var(--viz-text-primary)" }}>{nf.format(hovered.total)}</strong> task
            </p>
          </Tooltip>
        )}
      </div>

      {/* Legenda selalu ada untuk >= 2 seri; kunci persegi mencerminkan kolom. Nama memakai warna teks, bukan warna seri. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legenda">
        {STACK.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-sm" style={{ background: `var(${s.cssVar})` }} />
            <span style={{ color: "var(--viz-text-secondary)" }}>{s.label}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------- tabel

/** Padanan tabel: setiap nilai pada grafik juga bisa dibaca di sini, termasuk rincian ditunda, dibatalkan, dan lainnya. */
export function DataTable({ points }: { points: SeriesPoint[] }) {
  const rows = [...points].reverse(); // terbaru di atas
  return (
    <details className="rounded-lg border p-4 text-sm" style={{ background: "var(--viz-surface)", borderColor: "var(--viz-grid)", color: "var(--viz-text-primary)" }}>
      <summary className="cursor-pointer font-medium">Lihat sebagai tabel ({nf.format(points.length)} titik data)</summary>
      <div className="mt-3 max-h-96 overflow-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
          <caption className="sr-only">Jumlah task per status pada setiap sinkronisasi yang mengubah data</caption>
          <thead style={{ color: "var(--viz-text-secondary)" }}>
            <tr>
              {["Waktu", "Total", "Selesai", "% selesai", "Dikerjakan", "Terhambat", "Ditinjau", "Menunggu", "Ditunda", "Dibatalkan", "Lainnya"].map((h, i) => (
                <th key={h} scope="col" className={`sticky top-0 border-b px-2 py-1.5 font-medium ${i === 0 ? "text-left" : "text-right"}`} style={{ background: "var(--viz-surface)", borderColor: "var(--viz-axis)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.t}>
                <th scope="row" className="whitespace-nowrap border-b px-2 py-1 text-left font-normal" style={{ borderColor: "var(--viz-grid)" }}>{formatFull(p.t)}</th>
                {[p.total, p.done, null, p.in_progress, p.blocked, p.review, p.pending, p.deferred, p.cancelled, p.other].map((v, i) => (
                  <td key={i} className="border-b px-2 py-1 text-right tabular-nums" style={{ borderColor: "var(--viz-grid)" }}>
                    {v === null ? pf(percentDone(p)) : nf.format(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
