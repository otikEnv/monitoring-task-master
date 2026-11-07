import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SourceCard, type RefreshUi } from "@/components/dashboard/source-card";
import type { DashboardCard } from "@/lib/dashboard/cards";

const card = (over: Partial<DashboardCard> = {}): DashboardCard => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Echo App",
  provider: "github",
  branch: "stg",
  isActive: true,
  counts: { pending: 19, in_progress: 11, review: 0, blocked: 1, done: 142, deferred: 0, cancelled: 0, other: 0 },
  total: 173,
  tagCount: 1,
  percentDone: 82.1,
  hasData: true,
  lastSyncStatus: "success",
  lastSyncedAt: "2026-11-06T10:00:00Z",
  lastAttemptAt: "2026-11-06T10:00:00Z",
  lastError: null,
  lastCommitAt: "2026-11-06T03:52:39Z",
  tokenExpiresAt: null,
  tokenExpiry: "none",
  ...over,
});
const render = (c: DashboardCard, refresh: RefreshUi = { phase: "idle" }) =>
  renderToStaticMarkup(<SourceCard card={c} refresh={refresh} onRefresh={vi.fn()} />);

describe("kartu aplikasi", () => {
  it("menampilkan nama, penyedia, branch, persentase, dan jumlah selesai dari total", () => {
    const html = render(card());
    expect(html).toContain("Echo App");
    expect(html).toContain("GitHub");
    expect(html).toContain("<strong>stg</strong>");
    expect(html).toContain("82.1%");
    expect(html).toContain("142 dari 173 task selesai");
  });

  it("persentase bulat tanpa desimal", () => {
    expect(render(card({ percentDone: 100 }))).toContain("100%");
  });

  it("menampilkan tiap status dengan label bahasa sehari-hari dan jumlahnya", () => {
    const html = render(card());
    for (const label of ["Menunggu", "Dikerjakan", "Ditinjau", "Terhambat", "Selesai", "Ditunda", "Dibatalkan"]) {
      expect(html).toContain(label);
    }
    expect(html).toMatch(/Terhambat<\/span><span[^>]*>1</);
    expect(html).toMatch(/Selesai<\/span><span[^>]*>142</);
  });

  it("kategori 'Lainnya' hanya tampil bila ada status tak dikenal", () => {
    expect(render(card())).not.toContain("Lainnya");
    expect(render(card({ counts: { ...card().counts, other: 2 } }))).toContain("Lainnya");
  });

  it("task terhambat diberi penanda visual", () => {
    expect(render(card())).toContain("ring-red-500");
    expect(render(card({ counts: { ...card().counts, blocked: 0 } }))).not.toContain("ring-red-500");
  });

  it("tautan ke daftar task yang difilter menurut aplikasi", () => {
    expect(render(card())).toContain('href="/tasks?source=11111111-1111-4111-8111-111111111111"');
  });

  it("memiliki progressbar yang aksesibel", () => {
    const html = render(card());
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="82.1"');
    expect(html).toContain("width:82.1%");
  });

  it("menampilkan waktu sinkron terakhir dan waktu file diubah", () => {
    const html = render(card());
    expect(html).toContain("Sinkron terakhir:");
    expect(html).toContain("File diubah:");
    expect(html).not.toContain("Sinkronisasi gagal");
  });
});

describe("sinkron gagal", () => {
  const failed = card({ lastSyncStatus: "failed", lastError: "Token ditolak (401): salah, dicabut, atau kedaluwarsa." });

  it("menampilkan penanda gagal, pesan galat, dan waktu data terakhir yang berhasil", () => {
    const html = render(failed);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Sinkronisasi gagal");
    expect(html).toContain("Token ditolak (401)");
    expect(html).toContain("sinkronisasi terakhir yang berhasil");
  });

  it("data terakhir yang berhasil tetap ditampilkan (bukan dikosongkan)", () => {
    const html = render(failed);
    expect(html).toContain("82.1%");
    expect(html).toContain("142 dari 173");
  });

  it("gagal sebelum pernah berhasil: tidak ada data, dan dikatakan belum pernah berhasil", () => {
    const html = render(card({ lastSyncStatus: "failed", lastError: "x", lastSyncedAt: null, hasData: false, total: 0, percentDone: 0 }));
    expect(html).toContain("Belum pernah berhasil disinkronkan");
    expect(html).not.toContain("0%");
  });

  it("pesan galat di-escape (tidak bisa menyisipkan HTML)", () => {
    const html = render(card({ lastSyncStatus: "failed", lastError: '<script>alert("x")</script><img src=x onerror=y>' }));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("keadaan khusus", () => {
  it("belum pernah disinkronkan: ajakan menekan Segarkan, tanpa persentase", () => {
    const html = render(card({ lastSyncStatus: "never", hasData: false, total: 0, percentDone: 0, lastSyncedAt: null, lastCommitAt: null }));
    expect(html).toContain("Belum pernah disinkronkan");
    expect(html).toContain("Segarkan");
    expect(html).not.toContain('role="progressbar"');
  });

  it("sukses tetapi 0 task: pesan file kosong, bukan 0%", () => {
    const html = render(card({ hasData: false, total: 0, percentDone: 0 }));
    expect(html).toContain("Belum ada task pada file ini");
  });

  it("sumber nonaktif: diberi label dan tidak punya tombol Segarkan", () => {
    const html = render(card({ isActive: false }));
    expect(html).toContain("Nonaktif");
    expect(html).not.toContain(">Segarkan<");
    expect(html).toContain("opacity-60");
  });

  it("peringatan token kedaluwarsa dan segera kedaluwarsa", () => {
    expect(render(card({ tokenExpiry: "expired", tokenExpiresAt: "2026-11-01T00:00:00Z" }))).toContain("Token akses kedaluwarsa sejak");
    expect(render(card({ tokenExpiry: "soon", tokenExpiresAt: "2026-11-10T00:00:00Z" }))).toContain("segera kedaluwarsa");
    expect(render(card({ tokenExpiry: "ok", tokenExpiresAt: "2027-06-01T00:00:00Z" }))).not.toContain("kedaluwarsa");
  });

  it("jumlah tag ditampilkan hanya bila lebih dari satu", () => {
    expect(render(card({ tagCount: 1 }))).not.toContain("tag");
    expect(render(card({ tagCount: 3 }))).toContain("3 tag");
  });

  it("nama aplikasi di-escape", () => {
    expect(render(card({ name: "<b>x</b>" }))).not.toContain("<b>x</b>");
  });
});

describe("tombol Segarkan dan hasilnya", () => {
  it("idle: tombol aktif dengan label Segarkan", () => {
    const html = render(card());
    expect(html).toContain(">Segarkan<");
    expect(html).not.toContain('disabled=""'); // atribut, bukan kelas "disabled:opacity-60"
  });

  it("running: tombol nonaktif dan berlabel Menyegarkan", () => {
    const html = render(card(), { phase: "running" });
    expect(html).toContain("Menyegarkan…");
    expect(html).toContain('disabled=""');
  });

  it.each([
    ["success", "text-green-700"],
    ["info", "text-muted-foreground"],
    ["error", "text-red-700"],
  ] as const)("hasil %s ditampilkan sebagai status dengan warna sesuai", (tone, cls) => {
    const html = render(card(), { phase: "done", tone, message: "Pesan hasil" });
    expect(html).toContain('role="status"');
    expect(html).toContain("Pesan hasil");
    expect(html).toContain(cls);
  });

  it("pesan hasil di-escape", () => {
    const html = render(card(), { phase: "done", tone: "error", message: "<script>x</script>" });
    expect(html).not.toContain("<script>");
  });

  it("tombol berada di atas tautan membentang (z-10) agar tetap bisa diklik", () => {
    expect(render(card())).toMatch(/relative z-10[^"]*"><button/);
  });
});
