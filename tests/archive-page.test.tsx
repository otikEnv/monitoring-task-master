import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/app/archive/actions", () => ({
  archiveSource: vi.fn(), restoreSource: vi.fn(), archiveRelease: vi.fn(), restoreRelease: vi.fn(), sourceArchiveImpact: vi.fn(),
}));

import { ArchiveView } from "@/components/archive/archive-view";
import type { ArchivePage, ArchivedReleaseRow, ArchivedSourceRow } from "@/lib/archive/load";
import type { ArchiveParams } from "@/lib/archive/params";

const SRC = "11111111-1111-4111-8111-111111111111";
const REL = "22222222-2222-4222-8222-222222222222";

const sourceRow = (over: Partial<ArchivedSourceRow> = {}): ArchivedSourceRow => ({
  id: SRC, name: "Echo App", isActive: true, lastSyncStatus: "success", lastSyncedAt: "2026-11-10T03:00:00Z",
  archivedAt: "2026-11-14T00:00:00Z", taskCount: 42, ...over,
});
const releaseRow = (over: Partial<ArchivedReleaseRow> = {}): ArchivedReleaseRow => ({
  id: REL, name: "2.1", releasedOn: null, targetDate: "2026-11-24", componentCount: 2, archivedAt: "2026-11-14T00:00:00Z", ...over,
});
const page = <T,>(rows: T[], over: Partial<ArchivePage<T>> = {}): ArchivePage<T> => ({
  rows, total: rows.length, page: 1, pageCount: 1, pageSize: 10, ...over,
});

type Opts = {
  params?: ArchiveParams;
  applications?: ArchivePage<ArchivedSourceRow> | null;
  releases?: ArchivePage<ArchivedReleaseRow> | null;
  counts?: { applications: number; releases: number };
  isAdmin?: boolean;
};
const render = ({ params = { tab: "applications", page: 1 }, applications = null, releases = null, counts = { applications: 0, releases: 0 }, isAdmin = true }: Opts = {}) =>
  renderToStaticMarkup(<ArchiveView params={params} applications={applications} releases={releases} counts={counts} isAdmin={isAdmin} />);

describe("tab", () => {
  it("dua tab sebagai tautan dengan jumlah; tab aktif bertanda aria-current", () => {
    const out = render({ applications: page([sourceRow()]), counts: { applications: 1, releases: 3 } });
    expect(out).toContain('aria-label="Archive sections"');
    expect(out).toMatch(/aria-current="page"[^>]*href="\/archive"[^>]*>Applications <span[^>]*>\(1\)</);
    expect(out).toMatch(/href="\/archive\?tab=releases"[^>]*>Releases <span[^>]*>\(3\)</);
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("tab Releases aktif", () => {
    const out = render({ params: { tab: "releases", page: 1 }, releases: page([releaseRow()]), counts: { applications: 0, releases: 1 } });
    expect(out).toMatch(/aria-current="page"[^>]*href="\/archive\?tab=releases"/);
    expect(out).not.toMatch(/aria-current="page"[^>]*href="\/archive"/);
  });
});

describe("tab Applications", () => {
  it("baris: nama, jumlah task, sinkronisasi terakhir, tanggal arsip, dan menu", () => {
    const out = render({ applications: page([sourceRow(), sourceRow({ id: "x", name: "Beta", isActive: false, lastSyncedAt: null, taskCount: 0 })]), counts: { applications: 2, releases: 0 } });
    expect(out).toContain("Echo App");
    expect(out).toContain(">42<");
    expect(out).toContain("Never synced");
    expect(out).toContain("14 Nov 2026");
    expect(out).toContain("Inactive"); // status nonaktif tetap terlihat, terpisah dari arsip
    expect(out).toContain('aria-label="Actions for Echo App"');
    expect(out).toContain("Showing 1–2 of 2 archived applications");
    for (const h of ["Application", "Tasks", "Last sync", "Archived"]) expect(out).toContain(`>${h}</th>`);
  });

  it("nama di-escape", () => {
    const out = render({ applications: page([sourceRow({ name: "<script>alert(1)</script>" })]), counts: { applications: 1, releases: 0 } });
    expect(out).not.toContain("<script>alert(1)");
    expect(out).toContain("&lt;script&gt;");
  });
});

describe("tab Releases", () => {
  it("baris: nama, status rilis, target, jumlah komponen, tanggal arsip", () => {
    const out = render({
      params: { tab: "releases", page: 1 },
      releases: page([releaseRow(), releaseRow({ id: "y", name: "1.0", releasedOn: "2026-11-01", componentCount: 1 })]),
      counts: { applications: 0, releases: 2 },
    });
    expect(out).toContain(">2.1<");
    expect(out).toContain("Not released");
    expect(out).toContain("Released 01 Nov 2026");
    expect(out).toContain("24 Nov 2026");
    expect(out).toContain('aria-label="Actions for 2.1"');
    expect(out).toContain("Showing 1–2 of 2 archived releases");
    for (const h of ["Release", "Status", "Target", "Components", "Archived"]) expect(out).toContain(`>${h}</th>`);
  });
});

describe("kosong dan paginasi", () => {
  it("tanpa item: pesan 'Nothing is archived.' dan petunjuk sesuai tab", () => {
    const a = render({ applications: page([]) });
    expect(a).toContain("Nothing is archived.");
    expect(a).toContain("menu on its Dashboard card");
    expect(a).toContain('href="/"');
    expect(a).not.toContain("<table");

    const r = render({ params: { tab: "releases", page: 1 }, releases: page([]) });
    expect(r).toContain("Nothing is archived.");
    expect(r).toContain('href="/release"');
  });

  it("data tidak ada (belum dimuat) diperlakukan sebagai kosong", () => {
    expect(render({ applications: null })).toContain("Nothing is archived.");
  });

  it("satu halaman: tanpa pager; banyak halaman: tautan memuat tab dan nomor halaman", () => {
    expect(render({ applications: page([sourceRow()]) })).not.toContain('aria-label="Pagination"');

    const many = render({
      params: { tab: "releases", page: 2 },
      releases: page([releaseRow()], { total: 25, page: 2, pageCount: 3 }),
      counts: { applications: 0, releases: 25 },
    });
    expect(many).toContain('aria-label="Pagination"');
    expect(many).toContain('href="/archive?tab=releases"'); // halaman 1 = tanpa parameter page
    expect(many).toContain('href="/archive?tab=releases&amp;page=3"');
    expect(many).toContain("Showing 11–20 of 25 archived releases"); // halaman 2 dari 3, 10 per halaman
  });

  it("pager tab Applications tidak membawa parameter tab", () => {
    const out = render({
      params: { tab: "applications", page: 1 },
      applications: page([sourceRow()], { total: 12, pageCount: 2 }),
      counts: { applications: 12, releases: 0 },
    });
    expect(out).toContain('href="/archive?page=2"');
  });
});
