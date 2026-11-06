import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrendCharts } from "@/components/trend/trend-charts";
import { TrendControls } from "@/components/trend/trend-controls";
import { TrendTiles } from "@/components/trend/trend-tiles";
import { summarizeTrend, STACK, type Counts, type SeriesPoint, type TrendParams } from "@/lib/trend/series";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 1, 3);
const counts = (over: Partial<Counts> = {}): Counts => ({
  total: 0, pending: 0, in_progress: 0, review: 0, blocked: 0, done: 0, deferred: 0, cancelled: 0, other: 0, ...over,
});
const pt = (dayOffset: number, over: Partial<Counts>): SeriesPoint => ({ t: T0 + dayOffset * DAY, ...counts(over) });

const POINTS: SeriesPoint[] = [
  pt(0, { total: 100, done: 40, in_progress: 20, blocked: 5, review: 5, pending: 20, deferred: 5, cancelled: 3, other: 2 }),
  pt(2, { total: 100, done: 55, in_progress: 15, blocked: 3, review: 5, pending: 15, deferred: 5, cancelled: 2, other: 0 }),
  pt(20, { total: 120, done: 90, in_progress: 10, blocked: 2, review: 3, pending: 10, deferred: 3, cancelled: 2, other: 0 }),
];
const START = T0 - 2 * DAY;
const END = T0 + 30 * DAY;

const render = (points = POINTS, over: Partial<{ start: number; end: number; downsampled: boolean }> = {}) =>
  renderToStaticMarkup(<TrendCharts points={points} start={over.start ?? START} end={over.end ?? END} downsampled={over.downsampled ?? false} />);

describe("kerangka grafik", () => {
  it("memuat dua kartu grafik dengan judul yang menyebut apa yang digambar", () => {
    const html = render();
    expect(html).toContain("Persentase task selesai");
    expect(html).toContain("Jumlah task per status");
    expect((html.match(/<h2/g) ?? []).length).toBe(2);
  });

  it("setiap grafik punya teks alternatif dan keterangan bahwa nilai lengkap ada di tabel", () => {
    const html = render();
    expect(html).toMatch(/role="img"[^>]*aria-label="Grafik garis persentase task selesai, 3 titik data/);
    expect(html).toMatch(/role="img"[^>]*aria-label="Grafik kolom bertumpuk jumlah task per status, 3 titik data/);
  });

  it("lapisan interaksi dapat difokuskan keyboard dan diberi nama", () => {
    const html = render();
    expect((html.match(/role="application"/g) ?? []).length).toBe(2);
    expect((html.match(/tabindex="0"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Gunakan panah kiri dan kanan");
  });

  it("memuat wilayah pengumuman untuk pembaca layar", () => {
    expect(render()).toMatch(/class="sr-only" aria-live="polite"/);
  });

  it("tanpa pointer aktif tidak ada tooltip", () => {
    expect(render()).not.toContain('role="status"');
  });

  it("memakai token warna (CSS variable), bukan hex mentah, pada marka data", () => {
    const html = render();
    expect(html).toContain("var(--viz-done)");
    expect(html).not.toMatch(/(fill|stroke):\s*#[0-9a-f]{3,8}/i);
  });
});

describe("grafik persentase (satu seri)", () => {
  it("tidak punya kotak legenda (judul sudah menyebut seri)", () => {
    const html = render();
    const card = html.slice(html.indexOf("Persentase task selesai"), html.indexOf("Jumlah task per status"));
    expect(card).not.toContain('aria-label="Legenda"');
  });

  it("sumbu-Y 0 sampai 100% dengan gridline hairline", () => {
    const html = render();
    for (const v of ["0%", "25%", "50%", "75%", "100%"]) expect(html).toContain(`>${v}</text>`);
  });

  it("penanda r=4 (diameter 8) dengan cincin permukaan 2px untuk setiap titik", () => {
    const html = render();
    const circles = html.match(/<circle[^>]*>/g) ?? [];
    expect(circles).toHaveLength(3);
    for (const c of circles) {
      expect(c).toContain('r="4"');
      expect(c).toContain('stroke-width="2"');
      expect(c).toContain("var(--viz-surface)");
      expect(c).toContain("var(--viz-done)");
    }
  });

  it("garis 2px dengan ujung membulat", () => {
    const html = render();
    expect(html).toMatch(/<path d="M[^"]*" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/);
  });

  it("label langsung hanya pada titik terakhir, dalam format Indonesia (bukan angka di setiap titik)", () => {
    const html = render();
    expect(html).toContain(">75%</text>"); // 90/120; juga muncul sebagai tick sumbu
    const labels = html.match(/font-weight="600"[^>]*>([^<]+)</g) ?? [];
    expect(labels).toHaveLength(1);
    expect(labels[0]).toContain("75%");
  });

  it("persentase terakhir tidak bulat memakai koma desimal", () => {
    const html = render([pt(0, { total: 3, done: 1 }), pt(1, { total: 173, done: 142 })]);
    expect(html).toContain(">82,1%<");
  });

  it("celah panjang digambar putus-putus dan dijelaskan; tanpa celah tidak ada penjelasan", () => {
    const gappy = render(); // titik 2 -> 20 berjarak 18 hari pada rentang 32 hari (ambang 3 hari)
    expect(gappy).toContain('stroke-dasharray="4 4"');
    expect(gappy).toContain("Garis putus-putus: tidak ada sinkronisasi pada selang itu.");

    // sinkron harian: jarak 1 hari selalu di bawah ambang (minimal 2 hari), jadi tidak putus-putus
    const dense = render([pt(0, { total: 10, done: 1 }), pt(1, { total: 10, done: 2 }), pt(2, { total: 10, done: 3 })], { start: T0, end: T0 + 3 * DAY });
    expect(dense).not.toContain('stroke-dasharray="4 4"');
    expect(dense).not.toContain("Garis putus-putus");
  });

  it("garis menghubungkan HANYA titik yang ada (tanpa titik buatan di sela)", () => {
    const html = render();
    const d = /<path d="(M[^"]*)" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/.exec(html)?.[1] ?? "";
    // satu segmen biasa (titik 1 -> 2); segmen ke titik 3 adalah celah (putus-putus)
    expect((d.match(/M/g) ?? []).length).toBe(1);
  });

  it("banyak titik (> 60): penanda hanya pada titik terakhir", () => {
    const many = Array.from({ length: 100 }, (_, i) => pt(i * 0.2, { total: 10, done: i % 10 }));
    const html = render(many, { start: T0, end: T0 + 21 * DAY });
    expect((html.match(/<circle/g) ?? []).length).toBe(1);
  });

  it("sumbu waktu berakhir 'sekarang': jeda sejak snapshot terakhir terlihat (tidak sampai tepi kanan)", () => {
    const html = render();
    const xs = [...html.matchAll(/<circle cx="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(xs).toHaveLength(3);
    expect(Math.max(...xs)).toBeLessThan(720 - 64 - 5); // di kiri tepi plot karena END jauh setelah titik terakhir
  });
});

describe("grafik kolom bertumpuk", () => {
  const stack = () => {
    const html = render();
    return html.slice(html.indexOf("Jumlah task per status"));
  };

  it("legenda selalu ada untuk >= 2 seri dan memuat keenam nama", () => {
    const s = stack();
    expect(s).toContain('aria-label="Legenda"');
    for (const label of STACK.map((x) => x.label)) expect(s).toContain(label);
    expect((s.match(/<li class="flex items-center gap-1\.5"/g) ?? []).length).toBe(6);
  });

  it("legenda benar-benar terlihat (tidak disembunyikan dengan hidden, sr-only, atau display:none)", () => {
    const s = stack();
    const tag = /<ul[^>]*aria-label="Legenda"[^>]*>/.exec(s)?.[0] ?? "";
    expect(tag).not.toBe("");
    expect(tag).not.toMatch(/\bhidden\b/);
    expect(tag).not.toContain("sr-only");
    expect(tag).not.toMatch(/display:\s*none/);
    // setiap butir legenda juga terlihat
    const items = s.match(/<li class="flex items-center gap-1\.5"[^>]*>/g) ?? [];
    expect(items).toHaveLength(6);
    for (const li of items) expect(li).not.toMatch(/\bhidden\b|sr-only/);
  });

  it("nama di legenda memakai warna teks, kuncinya yang memakai warna seri", () => {
    const s = stack();
    for (const v of STACK.map((x) => x.cssVar)) expect(s).toContain(`background:var(${v})`);
    expect(s).toMatch(/<span style="color:var\(--viz-text-secondary\)">Selesai<\/span>/);
  });

  it("tiap titik menjadi satu kolom; segmen memakai warna entitasnya", () => {
    const s = stack();
    const cols = (s.match(/<g opacity="1">/g) ?? []).length;
    expect(cols).toBe(3);
    for (const v of STACK.map((x) => x.cssVar)) expect(s).toContain(`fill:var(${v})`);
  });

  it("kolom dibatasi 24px", () => {
    const s = stack();
    const widths = [...s.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) expect(w).toBeLessThanOrEqual(24);
  });

  it("segmen teratas tiap kolom membulat (path), segmen di bawahnya persegi (rect)", () => {
    const s = stack();
    expect((s.match(/<path d="M[\d.]+ [\d.]+V/g) ?? []).length).toBe(3); // satu path bulat per kolom
  });

  it("tinggi segmen sebanding dengan jumlahnya (selesai 40 < 55 < 90 pada skala yang sama)", () => {
    const s = stack();
    // segmen terbawah (selesai) adalah rect pertama di tiap kolom
    const hs = [...s.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="([\d.]+)" style="fill:var\(--viz-done\)"/g)].map((m) => Number(m[1]));
    expect(hs).toHaveLength(3);
    expect(hs[0]).toBeLessThan(hs[1]);
    expect(hs[1]).toBeLessThan(hs[2]);
  });

  it("sumbu-Y bilangan bulat bersih sampai maksimum 'bagus' di atas total terbesar (120 -> 200)", () => {
    const s = stack();
    expect(s).toContain(">0</text>");
    expect(s).toMatch(/>200<\/text>/);
    expect(s).not.toMatch(/>120<\/text>/); // tidak berhenti di total terbesar
  });

  it("tidak ada angka pada setiap segmen (nilai ada di tooltip dan tabel)", () => {
    const s = stack();
    const svg = s.slice(0, s.indexOf("</svg>"));
    const texts = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    // hanya label sumbu: angka Y dan tanggal X
    expect(texts.length).toBeLessThan(20);
  });
});

describe("tabel (padanan grafik)", () => {
  it("memuat setiap titik dengan semua status, terbaru di atas", () => {
    const html = render();
    expect(html).toContain("Lihat sebagai tabel (3 titik data)");
    const body = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
    expect((body.match(/<tr/g) ?? []).length).toBe(3);
    for (const h of ["Waktu", "Total", "Selesai", "% selesai", "Dikerjakan", "Terhambat", "Ditinjau", "Menunggu", "Ditunda", "Dibatalkan", "Lainnya"]) {
      expect(html).toContain(`>${h}</th>`);
    }
    // baris pertama = titik terbaru (120 total, 75%)
    const first = body.slice(0, body.indexOf("</tr>"));
    expect(first).toContain(">120<");
    expect(first).toContain(">75%<");
  });

  it("rincian ditunda, dibatalkan, dan lainnya ada di tabel walau digabung pada grafik", () => {
    const html = render();
    const body = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
    const oldest = body.slice(body.lastIndexOf("<tr"));
    // titik pertama: deferred 5, cancelled 3, other 2
    expect(oldest).toMatch(/>5<\/td><td[^>]*>3<\/td><td[^>]*>2<\/td>/);
  });

  it("punya caption dan judul kolom ber-scope", () => {
    const html = render();
    expect(html).toContain("<caption");
    expect(html.match(/scope="col"/g)?.length).toBe(11);
    expect(html.match(/scope="row"/g)?.length).toBe(3);
  });

  it("catatan peringkasan hanya muncul bila data diringkas", () => {
    expect(render(POINTS, { downsampled: false })).not.toContain("satu titik per hari");
    expect(render(POINTS, { downsampled: true })).toContain("satu titik per hari");
  });
});

describe("keadaan khusus", () => {
  it("satu titik: satu penanda, tanpa garis, tanpa penjelasan celah, tanpa NaN", () => {
    const html = render([pt(0, { total: 10, done: 5 })], { start: T0 - DAY, end: T0 + 29 * DAY });
    expect((html.match(/<circle/g) ?? []).length).toBe(1);
    expect(html).not.toContain("Garis putus-putus");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });

  it("tanpa titik: tidak melempar galat dan tidak menghasilkan NaN", () => {
    const html = render([]);
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
    expect(html).toContain("(0 titik data)");
  });

  it("semua task nol: tidak ada pembagian nol", () => {
    const html = render([pt(0, {}), pt(1, {})], { start: T0, end: T0 + 2 * DAY });
    expect(html).not.toContain("NaN");
    expect(html).toContain(">0%<");
  });

  it("rentang waktu runtuh (awal = akhir) tidak menghasilkan NaN", () => {
    const html = render([pt(0, { total: 5, done: 1 })], { start: T0, end: T0 });
    expect(html).not.toContain("NaN");
  });
});

describe("kartu ringkasan", () => {
  const tiles = (points: SeriesPoint[], period = "awal rentang (30 hari)") =>
    renderToStaticMarkup(<TrendTiles summary={summarizeTrend(points)} period={period} />);

  it("tanpa data tidak menampilkan apa pun", () => {
    expect(tiles([])).toBe("");
  });

  it("angka utama (persentase) berukuran >= 48px dan proporsional (bukan tabular)", () => {
    const html = tiles(POINTS);
    expect(html).toMatch(/class="text-5xl[^"]*"[^>]*>75%</);
    expect(html).not.toMatch(/text-5xl[^"]*tabular-nums/);
    expect((html.match(/text-5xl/g) ?? []).length).toBe(1); // hanya satu angka utama
  });

  it("selisih ditandai tanda, panah, dan kata (bukan warna saja); naik selesai = baik", () => {
    const html = tiles(POINTS);
    expect(html).toContain("▲");
    expect(html).toContain("+35 poin");
    expect(html).toContain("naik");
    expect(html).toContain("dibanding awal rentang (30 hari)");
    expect(html).toMatch(/color:var\(--viz-good-text\)[^>]*>[\s\S]*\+35 poin/);
  });

  it("terhambat turun = baik (hijau), terhambat naik = buruk (merah)", () => {
    const down = tiles(POINTS); // 5 -> 2
    expect(down).toContain("−3 task");
    expect(down).toMatch(/var\(--viz-good-text\)[^>]*>[\s\S]*−3 task/);
    const up = tiles([pt(0, { total: 10, blocked: 1 }), pt(1, { total: 10, blocked: 4 })]);
    expect(up).toContain("+3 task");
    expect(up).toMatch(/var\(--viz-bad-text\)[^>]*>[\s\S]*\+3 task/);
  });

  it("persentase turun ditampilkan sebagai buruk dengan tanda minus", () => {
    const html = tiles([pt(0, { total: 10, done: 10 }), pt(1, { total: 20, done: 10 })]);
    expect(html).toContain("▼");
    expect(html).toContain("−50 poin");
    expect(html).toMatch(/var\(--viz-bad-text\)[^>]*>[\s\S]*−50 poin/);
  });

  it("tidak berubah: keterangan netral tanpa panah", () => {
    const html = tiles([pt(0, { total: 10, done: 5 }), pt(1, { total: 10, done: 5 })]);
    expect(html).toContain("tidak berubah");
    expect(html).not.toContain("▲");
    expect(html).not.toContain("▼");
  });

  it("satu titik: tidak ada selisih, dijelaskan", () => {
    const html = tiles([pt(0, { total: 10, done: 5 })]);
    expect(html).toContain("Belum ada pembanding");
    expect(html).not.toContain("▲");
  });

  it("jumlah titik dan waktu data terakhir ditampilkan", () => {
    const html = tiles(POINTS);
    expect(html).toContain("3 titik data dalam rentang ini");
    expect(html).toContain("Data terakhir");
  });
});

describe("kontrol (satu baris filter di atas grafik)", () => {
  const SRC = "11111111-1111-4111-8111-111111111111";
  const sources = [{ id: SRC, name: "Echo App", isActive: true }, { id: "22222222-2222-4222-8222-222222222222", name: "Lama", isActive: false }];
  const controls = (params: TrendParams = { range: "30d", source: null }) =>
    renderToStaticMarkup(<TrendControls params={params} sources={sources} />);

  it("keempat rentang adalah tautan; yang aktif ditandai aria-current", () => {
    const html = controls();
    for (const l of ["7 hari", "30 hari", "90 hari", "Semua"]) expect(html).toContain(`>${l}</a>`);
    expect((html.match(/aria-current="true"/g) ?? []).length).toBe(1);
    expect(html).toMatch(/aria-current="true"[^>]*>30 hari</);
  });

  it("tautan rentang mempertahankan aplikasi terpilih dan tidak menulis nilai bawaan", () => {
    const html = controls({ range: "30d", source: SRC });
    expect(html).toContain(`href="/tren?range=7d&amp;source=${SRC}"`);
    expect(html).toContain(`href="/tren?source=${SRC}"`); // 30 hari = bawaan
  });

  it("pilihan aplikasi: semua (gabungan) + tiap aplikasi, yang nonaktif diberi keterangan", () => {
    const html = controls();
    expect(html).toContain("Semua aplikasi (gabungan)");
    expect(html).toContain("Echo App");
    expect(html).toContain("Lama (nonaktif)");
  });

  it("aplikasi terpilih ditandai selected", () => {
    expect(controls({ range: "30d", source: SRC })).toMatch(new RegExp(`<option value="${SRC}" selected`));
  });

  it("form method=get ke /tren dengan tombol Terapkan (tanpa JavaScript tetap berfungsi)", () => {
    const html = controls();
    expect(html).toContain('method="get"');
    expect(html).toContain('action="/tren"');
    expect(html).toContain(">Terapkan<");
  });

  it("rentang non-bawaan dikirim lewat input tersembunyi agar tidak hilang saat memilih aplikasi", () => {
    expect(controls({ range: "7d", source: null })).toContain('name="range" value="7d"');
    expect(controls()).not.toContain('type="hidden"');
  });

  it("nama aplikasi di-escape", () => {
    const html = renderToStaticMarkup(<TrendControls params={{ range: "30d", source: null }} sources={[{ id: SRC, name: "<script>x</script>", isActive: true }]} />);
    expect(html).not.toContain("<script>");
  });
});
