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
    expect(html).toContain("142 of 173 tasks done");
  });

  it("persentase bulat tanpa desimal", () => {
    expect(render(card({ percentDone: 100 }))).toContain("100%");
  });

  it("menampilkan tiap status dengan label bahasa sehari-hari dan jumlahnya", () => {
    const html = render(card());
    for (const label of ["Pending", "In progress", "In review", "Blocked", "Done", "Deferred", "Cancelled"]) {
      expect(html).toContain(label);
    }
    expect(html).toMatch(/Blocked<\/span><span[^>]*>1</);
    expect(html).toMatch(/Done<\/span><span[^>]*>142</);
  });

  it("kategori 'Other' hanya tampil bila ada status tak dikenal", () => {
    expect(render(card())).not.toContain("Other");
    expect(render(card({ counts: { ...card().counts, other: 2 } }))).toContain("Other");
  });

  it("task blocked diberi penanda visual", () => {
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
    expect(html).toContain("Last sync:");
    expect(html).toContain("File changed:");
    expect(html).not.toContain("Sync failed");
  });
});

describe("sinkron gagal", () => {
  const failed = card({ lastSyncStatus: "failed", lastError: "Token ditolak (401): salah, dicabut, atau kedaluwarsa." });

  it("menampilkan penanda gagal, pesan galat, dan waktu data terakhir yang berhasil", () => {
    const html = render(failed);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Sync failed");
    expect(html).toContain("Token ditolak (401)");
    expect(html).toContain("last successful sync");
  });

  it("data terakhir yang berhasil tetap ditampilkan (bukan dikosongkan)", () => {
    const html = render(failed);
    expect(html).toContain("82.1%");
    expect(html).toContain("142 of 173");
  });

  it("gagal sebelum pernah berhasil: tidak ada data, dan dikatakan belum pernah berhasil", () => {
    const html = render(card({ lastSyncStatus: "failed", lastError: "x", lastSyncedAt: null, hasData: false, total: 0, percentDone: 0 }));
    expect(html).toContain("never synced successfully");
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
  it("belum pernah disinkronkan: ajakan menekan Refresh, tanpa persentase", () => {
    const html = render(card({ lastSyncStatus: "never", hasData: false, total: 0, percentDone: 0, lastSyncedAt: null, lastCommitAt: null }));
    expect(html).toContain("Never synced");
    expect(html).toContain("Refresh");
    expect(html).not.toContain('role="progressbar"');
  });

  it("sukses tetapi 0 task: pesan file kosong, bukan 0%", () => {
    const html = render(card({ hasData: false, total: 0, percentDone: 0 }));
    expect(html).toContain("No tasks in this file");
  });

  it("sumber nonaktif: diberi label dan tidak punya tombol Refresh", () => {
    const html = render(card({ isActive: false }));
    expect(html).toContain("Inactive");
    expect(html).not.toContain(">Refresh<");
    expect(html).toContain("opacity-60");
  });

  it("peringatan token kedaluwarsa dan segera kedaluwarsa", () => {
    expect(render(card({ tokenExpiry: "expired", tokenExpiresAt: "2026-11-01T00:00:00Z" }))).toContain("The access token expired on");
    expect(render(card({ tokenExpiry: "soon", tokenExpiresAt: "2026-11-10T00:00:00Z" }))).toContain("expires soon");
    expect(render(card({ tokenExpiry: "ok", tokenExpiresAt: "2027-06-01T00:00:00Z" }))).not.toContain("expire");
  });

  it("jumlah tag ditampilkan hanya bila lebih dari satu", () => {
    expect(render(card({ tagCount: 1 }))).not.toContain("tag");
    expect(render(card({ tagCount: 3 }))).toContain("3 tag");
  });

  it("nama aplikasi di-escape", () => {
    expect(render(card({ name: "<b>x</b>" }))).not.toContain("<b>x</b>");
  });
});

describe("tombol Refresh dan hasilnya", () => {
  it("idle: tombol aktif dengan label Refresh", () => {
    const html = render(card());
    expect(html).toContain(">Refresh<");
    expect(html).not.toContain('disabled=""'); // atribut, bukan kelas "disabled:opacity-60"
  });

  it("running: tombol nonaktif dan berlabel Menyegarkan", () => {
    const html = render(card(), { phase: "running" });
    expect(html).toContain("Refreshing…");
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

describe("baris release pada kartu", () => {
  const release = { releaseId: "22222222-2222-4222-8222-222222222222", name: "v2.1", percent: 62, total: 87, daysLeft: 13, risk: "at_risk" as const, extra: 0 };

  it("tanpa release aktif: tidak ada baris tambahan", () => {
    for (const r of [undefined, null]) {
      const html = render(card({ release: r }));
      expect(html).not.toContain("Release v2.1");
      expect(html).not.toContain("more releases");
    }
  });

  it("menampilkan nama, persen, sisa hari, dan penanda risiko, menaut ke detail release", () => {
    const html = render(card({ release }));
    expect(html).toContain("Release v2.1");
    expect(html).toContain("62%");
    expect(html).toContain("13 days left");
    expect(html).toContain("At risk");
    expect(html).toContain(`href="/release/${release.releaseId}"`);
    expect(html).not.toContain("more releases");
  });

  it("baris release berada di atas tautan membentang (z-10) agar tetap bisa diklik", () => {
    expect(render(card({ release }))).toMatch(/relative z-10[^"]*"><a [^>]*href="\/release\//);
  });

  it("lebih dari satu release: +N more releases menaut ke daftar terfilter aplikasi", () => {
    const html = render(card({ release: { ...release, extra: 2 } }));
    expect(html).toContain("+2 more releases");
    expect(html).toContain(`href="/release?source=${card().id}"`);
  });

  it("rentang tanpa task dan release lewat target", () => {
    expect(render(card({ release: { ...release, percent: null, total: 0, risk: "empty" } }))).toContain("no tasks");
    const late = render(card({ release: { ...release, daysLeft: -4, risk: "overdue" } }));
    expect(late).toContain("4 days overdue");
    expect(late).toContain("Overdue");
  });
});
