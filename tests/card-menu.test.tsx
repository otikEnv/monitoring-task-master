import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/app/archive/actions", () => ({
  archiveSource: vi.fn(), restoreSource: vi.fn(), archiveRelease: vi.fn(), restoreRelease: vi.fn(), sourceArchiveImpact: vi.fn(),
}));

import { SourceCard } from "@/components/dashboard/source-card";
import { CardMenu } from "@/components/archive/card-menu";
import { ReleaseCard } from "@/components/releases/release-card";
import type { DashboardCard } from "@/lib/dashboard/cards";
import { overviewOf, task } from "./fixtures/release-overview";

const html = (canArchive: boolean, kind: "application" | "release" = "application") =>
  renderToStaticMarkup(<CardMenu kind={kind} id="x" name="Echo App" detailsHref="/tasks?source=x" canArchive={canArchive} />);

describe("tombol menu tiga titik", () => {
  it("berlabel aksesibel dengan nama item dan berada di atas tautan kartu (z-10)", () => {
    const out = html(true);
    expect(out).toContain('aria-label="Actions for Echo App"');
    expect(out).toContain("relative z-10");
    expect(out).toContain('type="button"');
    expect(out).toContain('aria-hidden="true"'); // ikon dekoratif
  });

  it("sama untuk admin dan bukan admin (isi menu baru muncul saat dibuka)", () => {
    expect(html(false)).toContain('aria-label="Actions for Echo App"');
    expect(html(true, "release")).toContain('aria-label="Actions for Echo App"');
  });

  it("dialog konfirmasi tidak dirender sebelum dibuka", () => {
    expect(html(true)).not.toContain("Archive application");
    expect(html(true, "release")).not.toContain("Archive release");
  });
});

const dcard: DashboardCard = {
  id: "11111111-1111-4111-8111-111111111111", name: "Echo App", provider: "github", branch: "stg", isActive: true,
  counts: { pending: 1, in_progress: 0, review: 0, blocked: 0, done: 1, deferred: 0, cancelled: 0, other: 0 },
  total: 2, tagCount: 1, percentDone: 50, hasData: true, lastSyncStatus: "success", lastAttemptAt: null, lastSyncedAt: null,
  lastError: null, lastCommitAt: null, tokenExpiresAt: null, tokenExpiry: "none",
} as unknown as DashboardCard;

describe("menu pada kartu", () => {
  it("kartu aplikasi memuat menu, juga untuk yang nonaktif (berdampingan dengan penanda Inactive)", () => {
    const out = renderToStaticMarkup(<SourceCard card={dcard} refresh={{ phase: "idle" }} onRefresh={() => {}} />);
    expect(out).toContain('aria-label="Actions for Echo App"');
    const inactive = renderToStaticMarkup(<SourceCard card={{ ...dcard, isActive: false }} refresh={{ phase: "idle" }} onRefresh={() => {}} canArchive />);
    expect(inactive).toContain("Inactive");
    expect(inactive).toContain('aria-label="Actions for Echo App"');
  });

  it("kartu release memuat menu di samping penanda risiko; tautan kartu tetap ada", () => {
    const o = overviewOf([{ tasks: [task(100, "done")] }], { name: "2.1" });
    const out = renderToStaticMarkup(<ReleaseCard overview={o} canArchive />);
    expect(out).toContain('aria-label="Actions for 2.1"');
    expect(out).toContain(`href="/release/${o.release.id}"`);
    expect(out).toContain("after:absolute"); // tautan membentang
  });
});
