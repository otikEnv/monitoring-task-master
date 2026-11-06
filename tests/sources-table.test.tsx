import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourcesTable } from "@/components/sources/sources-table";
import type { SourceView } from "@/lib/sources/repo";

const view = (over: Partial<SourceView> = {}): SourceView => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Echo App",
  provider: "github",
  repoUrl: "https://github.com/echoenvisions/echoapp",
  branch: "stg",
  filePath: ".taskmaster/tasks/tasks.json",
  isActive: true,
  hasToken: true,
  tokenExpiresAt: null,
  tokenExpiry: "none",
  lastSyncStatus: "success",
  lastAttemptAt: "2026-11-06T10:00:00Z",
  lastSyncedAt: "2026-11-06T10:00:00Z",
  lastError: null,
  lastCommitAt: "2026-11-06T03:52:39Z",
  createdAt: "2026-11-01T00:00:00Z",
  ...over,
});
const render = (...sources: SourceView[]) => renderToStaticMarkup(<SourcesTable sources={sources} />);

describe("kolom repo", () => {
  it("menampilkan URL, branch, path, dan WAKTU COMMIT TERAKHIR file (mengungkap repo yang belum di-commit)", () => {
    const html = render(view());
    expect(html).toContain("https://github.com/echoenvisions/echoapp");
    expect(html).toContain("<strong>stg</strong>");
    expect(html).toContain(".taskmaster/tasks/tasks.json");
    expect(html).toContain("File diubah: ");
    expect(html).toMatch(/File diubah: 06 Nov 2026,? 10[.:]52/); // 03:52 UTC = 10:52 WIB
  });

  it("tanpa waktu commit (belum pernah berhasil sinkron): baris itu tidak ditampilkan", () => {
    expect(render(view({ lastCommitAt: null }))).not.toContain("File diubah");
  });

  it("nama, penyedia, dan URL di-escape", () => {
    const html = render(view({ name: "<script>x</script>", repoUrl: "https://github.com/<b>x</b>/y" }));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>x</b>");
  });

  it("label penyedia", () => {
    expect(render(view({ provider: "gitlab" }))).toContain("GitLab");
    expect(render(view({ provider: "bitbucket" }))).toContain("Bitbucket");
  });
});

describe("kolom token", () => {
  it("belum diisi: peringatan merah", () => {
    const html = render(view({ hasToken: false }));
    expect(html).toContain("Belum diisi");
    expect(html).not.toContain("Tersimpan");
  });

  it("tersimpan tanpa tanggal kedaluwarsa", () => {
    const html = render(view());
    expect(html).toContain("Tersimpan");
    expect(html).not.toMatch(/kedaluwarsa|Berlaku sampai/i);
  });

  it("berlaku sampai tanggal tertentu (jauh di depan)", () => {
    const html = render(view({ tokenExpiry: "ok", tokenExpiresAt: "2027-02-04T09:30:29Z" }));
    expect(html).toContain("Berlaku sampai 04 Feb 2027");
    expect(html).not.toContain("Segera");
  });

  it("segera kedaluwarsa: peringatan kuning dengan tanggalnya", () => {
    const html = render(view({ tokenExpiry: "soon", tokenExpiresAt: "2026-11-10T09:00:00Z" }));
    expect(html).toContain("Segera kedaluwarsa: 10 Nov 2026");
    expect(html).toContain("text-amber");
  });

  it("sudah kedaluwarsa: peringatan merah dengan tanggalnya", () => {
    const html = render(view({ tokenExpiry: "expired", tokenExpiresAt: "2026-11-01T09:00:00Z" }));
    expect(html).toContain("Kedaluwarsa 01 Nov 2026");
    expect(html).toMatch(/text-red[^"]*"[^>]*>Kedaluwarsa/);
  });

  it("tanggal yang diketik admin tampil sama persis (tidak bergeser sehari karena zona waktu)", () => {
    // Form menyimpan akhir hari WIB: 4 Feb 2027 23:59:59 WIB = 16:59:59 UTC
    const html = render(view({ tokenExpiry: "ok", tokenExpiresAt: "2027-02-04T16:59:59.000Z" }));
    expect(html).toContain("Berlaku sampai 04 Feb 2027");
    expect(html).not.toContain("05 Feb 2027");
  });

  it("tidak pernah memuat token (hanya penanda tersimpan)", () => {
    const html = render(view());
    expect(html).not.toMatch(/token_encrypted|v1\.[A-Za-z0-9_-]{10,}/);
  });
});

describe("kolom sinkronisasi", () => {
  it("belum pernah", () => {
    expect(render(view({ lastSyncStatus: "never", lastSyncedAt: null, lastCommitAt: null }))).toContain("Belum pernah");
  });

  it("berhasil dengan waktunya", () => {
    const html = render(view());
    expect(html).toContain("Berhasil");
    expect(html).toMatch(/06 Nov 2026,? 17[.:]00/); // 10:00 UTC = 17:00 WIB
  });

  it("gagal: pesan galat dan waktu data terakhir yang berhasil", () => {
    const html = render(view({ lastSyncStatus: "failed", lastError: "Token kedaluwarsa pada 01 Nov 2026. Buat token baru lalu isi lewat Pengaturan sumber." }));
    expect(html).toContain("Gagal");
    expect(html).toContain("Token kedaluwarsa pada 01 Nov 2026");
    expect(html).toContain("Data terakhir berhasil: ");
  });

  it("pesan galat di-escape", () => {
    const html = render(view({ lastSyncStatus: "failed", lastError: "<img src=x onerror=alert(1)>" }));
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("status dan aksi", () => {
  it("aktif dan nonaktif", () => {
    expect(render(view())).toContain(">Aktif<");
    const off = render(view({ isActive: false }));
    expect(off).toContain("Nonaktif");
    expect(off).not.toContain(">Aktif<");
  });

  it("setiap baris punya aksi Ubah, Nonaktifkan atau Aktifkan, dan Hapus", () => {
    const html = render(view());
    expect(html).toContain("Ubah");
    expect(html).toContain("Nonaktifkan");
    expect(html).toContain("Hapus");
    expect(render(view({ isActive: false }))).toContain("Aktifkan");
    expect(html).toContain("/pengaturan/sumber/11111111-1111-4111-8111-111111111111");
  });

  it("satu baris per sumber dengan judul kolom lengkap", () => {
    const html = render(view(), view({ id: "22222222-2222-4222-8222-222222222222", name: "Beta" }));
    expect((html.match(/<tbody[\s\S]*<\/tbody>/)![0].match(/<tr/g) ?? []).length).toBe(2);
    for (const h of ["Aplikasi", "Repo", "Token", "Sinkronisasi", "Status", "Aksi"]) expect(html).toContain(`>${h}</th>`);
  });
});
