/**
 * Geometri grafik: skala, tick, jalur garis, dan bentuk batang. Murni (tanpa React) sehingga bisa diuji.
 */

export type Scale = (v: number) => number;

/** Skala linear dari domain ke rentang. Domain yang runtuh (min = maks) dipusatkan di tengah. */
export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d1 === d0) return () => (r0 + r1) / 2;
  return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

/** Pembulatan ke atas ke angka "bersih" (1, 2, 2.5, 5 x 10^k). Nol -> 1. */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * base + 1e-9) return m * base;
  return 10 * base;
}

/** Tick sumbu-Y dari 0 sampai `max`, sebanyak ~count+1 (semuanya bilangan bulat). */
export function yTicks(max: number, count = 4): number[] {
  const top = Math.max(1, Math.ceil(max));
  const step = Math.max(1, Math.round(top / count));
  const ticks: number[] = [];
  for (let v = 0; v < top; v += step) ticks.push(v);
  ticks.push(top);
  return ticks;
}

const DAY = 24 * 60 * 60 * 1000;

/** Tick waktu yang tersebar rata dari awal sampai akhir (termasuk keduanya). */
export function timeTicks(start: number, end: number, count = 5): number[] {
  if (end <= start) return [start];
  const n = Math.max(2, count);
  return Array.from({ length: n }, (_, i) => start + ((end - start) * i) / (n - 1));
}

/** Label tick waktu (WIB): tanggal, ditambah jam bila rentangnya pendek. */
export function formatTick(t: number, spanMs: number): string {
  const d = new Date(t);
  const date = d.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short" });
  if (spanMs > 3 * DAY) return date;
  const time = d.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

/** Tanggal dan jam lengkap untuk tooltip dan tabel. */
export function formatFull(t: number): string {
  return new Date(t).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Jarak waktu terkecil yang dianggap celah (tidak ada sinkronisasi): sepersepuluh rentang,
 * dibatasi 2 sampai 7 hari. Batas bawah 2 hari menjaga agar sinkron harian (irama normal bila ada sinkron
 * terjadwal) tidak tampak putus-putus seolah ada data yang hilang.
 */
export function gapThresholdMs(start: number, end: number): number {
  return Math.min(7 * DAY, Math.max(2 * DAY, (end - start) / 10));
}

export type XY = { x: number; y: number; t: number };

/**
 * Menyusun garis antar titik berurutan menjadi dua jalur: segmen biasa dan segmen celah
 * (jarak waktu > gapMs). Segmen celah digambar putus-putus agar tidak menyiratkan data di antaranya.
 */
export function linePaths(pts: readonly XY[], gapMs: number): { solid: string; dashed: string } {
  const f = (n: number) => Math.round(n * 100) / 100;
  let solid = "";
  let dashed = "";
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}`;
    if (b.t - a.t > gapMs) dashed += seg;
    else solid += seg;
  }
  return { solid, dashed };
}

/** Indeks titik terdekat dengan x (untuk crosshair); -1 bila tidak ada titik. */
export function nearestIndex(xs: readonly number[], x: number): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const d = Math.abs(xs[i] - x);
    if (d < bestDist) { best = i; bestDist = d; }
  }
  return best;
}

/** Lebar batang: dibatasi 24px, tidak pernah memenuhi seluruh jatah (ada udara di sela), minimal 2px. */
export function columnWidth(count: number, plotWidth: number): number {
  if (count <= 0) return 0;
  return Math.max(2, Math.min(24, (plotWidth / count) * 0.6));
}

/**
 * Persegi dengan sudut atas membulat (jari-jari r), dasar rata. Dipakai untuk segmen teratas tumpukan:
 * dasar rata karena tumbuh dari satu garis dasar, ujung data membulat 4px.
 */
export function roundedTopRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, h, w / 2));
  const f = (n: number) => Math.round(n * 100) / 100;
  if (rr === 0) return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;
  return (
    `M${f(x)} ${f(y + h)}V${f(y + rr)}Q${f(x)} ${f(y)} ${f(x + rr)} ${f(y)}` +
    `H${f(x + w - rr)}Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + rr)}V${f(y + h)}Z`
  );
}
