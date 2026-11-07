// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrendCharts } from "@/components/trend/trend-charts";
import type { Counts, SeriesPoint } from "@/lib/trend/series";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 1, 3);
const counts = (over: Partial<Counts> = {}): Counts => ({
  total: 0, pending: 0, in_progress: 0, review: 0, blocked: 0, done: 0, deferred: 0, cancelled: 0, other: 0, ...over,
});
const pt = (d: number, over: Partial<Counts>): SeriesPoint => ({ t: T0 + d * DAY, ...counts(over) });

const POINTS: SeriesPoint[] = [
  pt(0, { total: 100, done: 40, in_progress: 20, blocked: 5, review: 5, pending: 20, deferred: 5, cancelled: 3, other: 2 }),
  pt(2, { total: 100, done: 55, in_progress: 15, blocked: 3, review: 5, pending: 15, deferred: 5, cancelled: 2, other: 0 }),
  pt(20, { total: 120, done: 90, in_progress: 10, blocked: 2, review: 3, pending: 10, deferred: 3, cancelled: 2, other: 0 }),
];
const START = T0 - 2 * DAY;
const END = T0 + 30 * DAY;

// Ukuran awal 720: plot dimulai di x=44 dan lebarnya 612 (margin kiri 44, kanan 64).
const PLOT_LEFT = 44;
const PLOT_W = 612;
const xOf = (t: number) => PLOT_LEFT + ((t - START) / (END - START)) * PLOT_W;

let resizeCb: ((entries: unknown[]) => void) | null = null;
class FakeResizeObserver {
  constructor(cb: (entries: unknown[]) => void) { resizeCb = cb; }
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  resizeCb = null;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  // getBoundingClientRect: tepi kiri lapisan = PLOT_LEFT, sehingga clientX = koordinat x pada grafik.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: PLOT_LEFT, top: 0, right: PLOT_LEFT + PLOT_W, bottom: 220, width: PLOT_W, height: 220, x: PLOT_LEFT, y: 0, toJSON: () => ({}),
  } as DOMRect);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mount = () => render(<TrendCharts points={POINTS} start={START} end={END} downsampled={false} />);
const overlays = () => screen.getAllByRole("application");
const percentOverlay = () => overlays()[0];
const stackOverlay = () => overlays()[1];
const tooltips = () => screen.queryAllByRole("status").filter((el) => el.className.includes("pointer-events-none"));
const announce = () => document.querySelector("p.sr-only[aria-live]")?.textContent ?? "";

describe("navigasi keyboard", () => {
  it("fokus pada lapisan memilih titik TERAKHIR dan menampilkan tooltip-nya", () => {
    mount();
    expect(tooltips()).toHaveLength(0);
    fireEvent.focus(percentOverlay());
    expect(tooltips()).toHaveLength(1);
    expect(tooltips()[0].textContent).toContain("75%");
    expect(tooltips()[0].textContent).toContain("90 of 120 tasks");
  });

  it("panah kiri dan kanan berpindah antar titik dan tidak melewati ujung", () => {
    mount();
    const o = percentOverlay();
    fireEvent.focus(o); // titik 3 (75%)
    fireEvent.keyDown(o, { key: "ArrowLeft" });
    expect(tooltips()[0].textContent).toContain("55%");
    fireEvent.keyDown(o, { key: "ArrowLeft" });
    expect(tooltips()[0].textContent).toContain("40%");
    fireEvent.keyDown(o, { key: "ArrowLeft" }); // sudah di awal: tetap
    expect(tooltips()[0].textContent).toContain("40%");
    fireEvent.keyDown(o, { key: "ArrowRight" });
    expect(tooltips()[0].textContent).toContain("55%");
    fireEvent.keyDown(o, { key: "ArrowRight" });
    fireEvent.keyDown(o, { key: "ArrowRight" }); // sudah di akhir: tetap
    expect(tooltips()[0].textContent).toContain("75%");
  });

  it("Home dan End melompat ke titik pertama dan terakhir; Escape menutup tooltip", () => {
    mount();
    const o = percentOverlay();
    fireEvent.focus(o);
    fireEvent.keyDown(o, { key: "Home" });
    expect(tooltips()[0].textContent).toContain("40%");
    fireEvent.keyDown(o, { key: "End" });
    expect(tooltips()[0].textContent).toContain("75%");
    fireEvent.keyDown(o, { key: "Escape" });
    expect(tooltips()).toHaveLength(0);
  });

  it("panah mencegah perilaku bawaan (halaman tidak ikut bergulir); tombol lain dibiarkan", () => {
    mount();
    const o = percentOverlay();
    fireEvent.focus(o);
    expect(fireEvent.keyDown(o, { key: "ArrowLeft" })).toBe(false); // preventDefault dipanggil
    expect(fireEvent.keyDown(o, { key: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(o, { key: "a" })).toBe(true);
  });

  it("panah kiri sebelum ada pilihan langsung ke titik terakhir sebelumnya (bukan melompat keluar)", () => {
    mount();
    const o = stackOverlay();
    fireEvent.keyDown(o, { key: "ArrowLeft" }); // tanpa fokus lebih dulu
    expect(tooltips()).toHaveLength(1);
    expect(tooltips()[0].textContent).toContain("Total");
  });

  it("blur menutup tooltip", () => {
    mount();
    const o = percentOverlay();
    fireEvent.focus(o);
    expect(tooltips()).toHaveLength(1);
    fireEvent.blur(o);
    expect(tooltips()).toHaveLength(0);
  });

  it("kedua lapisan dapat difokuskan (tabindex) dan memiliki nama", () => {
    mount();
    for (const o of overlays()) {
      expect(o.getAttribute("tabindex")).toBe("0");
      expect(o.getAttribute("aria-label")).toMatch(/left and right arrow keys/);
    }
  });
});

describe("penunjuk (crosshair menempel ke titik terdekat)", () => {
  it("memilih titik yang x-nya terdekat dengan penunjuk", () => {
    mount();
    const o = percentOverlay();
    fireEvent.pointerMove(o, { clientX: xOf(POINTS[0].t) + 3 });
    expect(tooltips()[0].textContent).toContain("40%");
    fireEvent.pointerMove(o, { clientX: xOf(POINTS[1].t) - 2 });
    expect(tooltips()[0].textContent).toContain("55%");
    fireEvent.pointerMove(o, { clientX: xOf(POINTS[2].t) + 40 });
    expect(tooltips()[0].textContent).toContain("75%");
  });

  it("penunjuk jauh di sisi mana pun tetap menempel ke titik terdekat (tidak perlu tepat di atas titik)", () => {
    mount();
    const o = percentOverlay();
    fireEvent.pointerMove(o, { clientX: PLOT_LEFT }); // paling kiri
    expect(tooltips()[0].textContent).toContain("40%");
    fireEvent.pointerMove(o, { clientX: PLOT_LEFT + PLOT_W }); // paling kanan
    expect(tooltips()[0].textContent).toContain("75%");
  });

  it("meninggalkan lapisan menutup tooltip", () => {
    mount();
    const o = percentOverlay();
    fireEvent.pointerMove(o, { clientX: xOf(POINTS[1].t) });
    expect(tooltips()).toHaveLength(1);
    fireEvent.pointerLeave(o);
    expect(tooltips()).toHaveLength(0);
  });

  it("menyentuh layar (pointerdown) juga memilih titik", () => {
    mount();
    fireEvent.pointerDown(percentOverlay(), { clientX: xOf(POINTS[1].t) });
    expect(tooltips()[0].textContent).toContain("55%");
  });

  it("hanya grafik yang disentuh yang menampilkan tooltip, tetapi sorotan dibagi di kedua grafik", () => {
    mount();
    fireEvent.pointerMove(percentOverlay(), { clientX: xOf(POINTS[1].t) });
    expect(tooltips()).toHaveLength(1);
    expect(tooltips()[0].textContent).toContain("done"); // tooltip persentase
    // pada grafik kolom, kolom lain diredupkan (dua dari tiga), kolom aktif tetap terang
    const dimmed = document.querySelectorAll('g[opacity="0.55"]');
    expect(dimmed).toHaveLength(2);
  });

  it("menyentuh grafik kolom menampilkan tooltip kolom, bukan tooltip persentase", () => {
    mount();
    fireEvent.pointerMove(stackOverlay(), { clientX: xOf(POINTS[2].t) });
    expect(tooltips()).toHaveLength(1);
    expect(tooltips()[0].textContent).toContain("Total");
  });
});

describe("isi tooltip", () => {
  it("persentase: waktu lengkap (WIB), nilai tebal, dan jumlah selesai dari total", () => {
    mount();
    fireEvent.pointerMove(percentOverlay(), { clientX: xOf(POINTS[0].t) });
    const t = tooltips()[0].textContent ?? "";
    expect(t).toMatch(/01 Nov 2026/);
    expect(t).toMatch(/10[.:]00/); // 03:00 UTC = 10:00 WIB
    expect(t).toContain("40%");
    expect(t).toContain("40 of 100 tasks");
  });

  it("kolom: keenam seri dalam urutan dari puncak ke dasar, dengan nilai dan total", () => {
    mount();
    fireEvent.pointerMove(stackOverlay(), { clientX: xOf(POINTS[0].t) });
    const t = tooltips()[0];
    const items = [...t.querySelectorAll("li")].map((li) => li.textContent ?? "");
    expect(items).toHaveLength(6);
    // titik pertama: lainnya = ditunda 5 + dibatalkan 3 + lainnya 2 = 10 (puncak), lalu pending 20, ditinjau 5, blocked 5, in progress 20, selesai 40
    expect(items[0]).toMatch(/10.*Deferred, cancelled, other/);
    expect(items[1]).toMatch(/20.*Pending/);
    expect(items[2]).toMatch(/5.*In review/);
    expect(items[3]).toMatch(/5.*Blocked/);
    expect(items[4]).toMatch(/20.*In progress/);
    expect(items[5]).toMatch(/40.*Done/);
    expect(t.textContent).toContain("Total");
    expect(t.textContent).toContain("100");
  });

  it("jumlah keenam nilai di tooltip kolom sama dengan total", () => {
    mount();
    fireEvent.pointerMove(stackOverlay(), { clientX: xOf(POINTS[2].t) });
    const nums = [...tooltips()[0].querySelectorAll("li span.tabular-nums")].map((s) => Number(s.textContent?.replace(/\./g, "")));
    expect(nums.reduce((a, b) => a + b, 0)).toBe(120);
  });

  it("tooltip di sisi kanan grafik muncul di sebelah kiri penunjuk (tidak terpotong)", () => {
    mount();
    fireEvent.pointerMove(percentOverlay(), { clientX: xOf(POINTS[2].t) }); // x besar
    const style = tooltips()[0].getAttribute("style") ?? "";
    expect(style).toMatch(/right:/);
    expect(style).not.toMatch(/left:/);
    fireEvent.pointerMove(percentOverlay(), { clientX: xOf(POINTS[0].t) }); // x kecil
    const style2 = tooltips()[0].getAttribute("style") ?? "";
    expect(style2).toMatch(/left:/);
    expect(style2).not.toMatch(/right:/);
  });

  it("tooltip tidak menangkap penunjuk (pointer-events-none) sehingga tidak berkedip", () => {
    mount();
    fireEvent.focus(percentOverlay());
    expect(tooltips()[0].className).toContain("pointer-events-none");
  });
});

describe("pembaca layar", () => {
  it("wilayah aria-live diumumkan sesuai titik aktif dan dikosongkan saat ditutup", () => {
    mount();
    expect(announce()).toBe("");
    const o = percentOverlay();
    fireEvent.keyDown(o, { key: "Home" });
    expect(announce()).toMatch(/01 Nov 2026/);
    expect(announce()).toContain("40% done");
    expect(announce()).toContain("40 of 100 tasks");
    fireEvent.keyDown(o, { key: "End" });
    expect(announce()).toContain("75% done");
    fireEvent.keyDown(o, { key: "Escape" });
    expect(announce()).toBe("");
  });
});

describe("hidrasi (HTML dari server harus cocok dengan render pertama di browser)", () => {
  it("tanpa peringatan atau galat hidrasi, dan kontennya tidak berubah setelah hidrasi", async () => {
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const errors: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => { errors.push(args); });

    const element = <TrendCharts points={POINTS} start={START} end={END} downsampled={false} />;
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(element);
    const before = container.innerHTML;

    // @ts-expect-error penanda lingkungan act milik React untuk pengujian
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    let root: ReturnType<typeof hydrateRoot> | undefined;
    act(() => { root = hydrateRoot(container, element); });

    const hydrationErrors = errors.filter((a) => /hydrat|did not match|mismatch/i.test(a.map(String).join(" ")));
    expect(hydrationErrors).toEqual([]);
    expect(container.innerHTML).toBe(before);

    act(() => root?.unmount());
    container.remove();
  });

  it("setelah hidrasi interaksi tetap berfungsi (lapisan menerima fokus dan menampilkan tooltip)", async () => {
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const element = <TrendCharts points={POINTS} start={START} end={END} downsampled={false} />;
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(element);
    // @ts-expect-error penanda lingkungan act milik React untuk pengujian
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    let root: ReturnType<typeof hydrateRoot> | undefined;
    act(() => { root = hydrateRoot(container, element); });

    const overlay = container.querySelector('[role="application"]') as HTMLElement;
    fireEvent.focus(overlay);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("75%");

    act(() => root?.unmount());
    container.remove();
  });
});

describe("ukuran responsif", () => {
  // Ambil SVG grafik (role="img"), bukan ikon kecil pada keterangan garis putus-putus.
  const svgWidth = () => Number(document.querySelector('svg[role="img"]')?.getAttribute("width"));

  it("lebar awal 720, mengikuti ukuran wadah setelah diamati", () => {
    mount();
    expect(svgWidth()).toBe(720);
    act(() => resizeCb?.([{ contentRect: { width: 500 } }]));
    expect(svgWidth()).toBe(500);
    act(() => resizeCb?.([{ contentRect: { width: 1000 } }]));
    expect(svgWidth()).toBe(1000);
  });

  it("lebar tidak pernah di bawah 320 (tetap terbaca di layar sempit)", () => {
    mount();
    act(() => resizeCb?.([{ contentRect: { width: 100 } }]));
    expect(svgWidth()).toBe(320);
  });

  it("setelah ukuran berubah, titik tetap berada di dalam area plot", () => {
    mount();
    act(() => resizeCb?.([{ contentRect: { width: 360 } }]));
    const xs = [...document.querySelectorAll("circle")].map((c) => Number(c.getAttribute("cx")));
    expect(xs.length).toBe(3);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(44);
      expect(x).toBeLessThanOrEqual(360 - 64);
    }
  });

  it("pengamat dihentikan saat komponen dilepas (tanpa kebocoran)", () => {
    const disconnect = vi.fn();
    class RO { constructor(cb: (e: unknown[]) => void) { resizeCb = cb; } observe() {} unobserve() {} disconnect = disconnect; }
    vi.stubGlobal("ResizeObserver", RO);
    const { unmount } = mount();
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
