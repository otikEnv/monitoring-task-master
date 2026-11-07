import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReleaseCard } from "@/components/releases/release-card";
import { RiskBadge } from "@/components/releases/risk-badge";
import { ReleaseProgress } from "@/components/releases/release-progress";
import { formatDaysLeft, formatRange, formatYmd } from "@/lib/releases/format";
import type { ReleaseOverview } from "@/lib/releases/load";
import { computeRelease, type RiskLevel, type TaskInput } from "@/lib/releases/model";
import { parseReleaseListParams, releaseListHref } from "@/lib/releases/params";

const SRC = "11111111-1111-4111-8111-111111111111";
const task = (id: number, status: string): TaskInput => ({
  taskId: String(id), title: `T${id}`, status, priority: null, dependencies: [], subtasksTotal: 0, subtasksDone: 0,
});

function overview(tasks: TaskInput[], over: Partial<ReleaseOverview> = {}, releasedOn: string | null = null, now = "2026-11-11"): ReleaseOverview {
  const release = {
    id: "22222222-2222-4222-8222-222222222222", sourceId: SRC, tag: "master", name: "v2.1",
    rangeStart: 100, rangeEnd: 200, startDate: "2026-11-01", targetDate: "2026-11-21", releasedOn, createdAt: "2026-11-01T00:00:00Z",
  };
  return {
    release, sourceName: "Echo App", sourceActive: true, syncStatus: "success", lastSyncedAt: "2026-11-10T03:00:00Z",
    tagFound: tasks.length > 0, stats: computeRelease(release, tasks, new Date(`${now}T12:00:00+07:00`)), ...over,
  };
}
const html = (o: ReleaseOverview) => renderToStaticMarkup(<ReleaseCard overview={o} />);

// 10 task (#100–#109): 5 selesai, 2 dikerjakan, 1 menunggu, 1 terhambat, 1 ditunda
const mixed = [
  ...[100, 101, 102, 103, 104].map((i) => task(i, "done")), task(105, "in-progress"), task(106, "review"),
  task(107, "pending"), task(108, "blocked"), task(109, "deferred"),
];

describe("kartu release", () => {
  it("menampilkan aplikasi, nama, tag, rentang, jumlah, target, sisa hari, dan persen", () => {
    const out = html(overview(mixed));
    expect(out).toContain("Echo App · v2.1");
    expect(out).toContain("Tag <strong>master</strong>");
    expect(out).toContain("Rentang #100–#200");
    expect(out).toContain("10 task");
    expect(out).toContain("Target 21 Nov 2026");
    expect(out).toContain("10 hari lagi");
    expect(out).toContain(">50%<");
    expect(out).toContain("5 dari 10 selesai");
    expect(out).toContain("waktu berjalan 50%");
  });

  it("seluruh kartu menaut ke detail release", () => {
    expect(html(overview(mixed))).toContain('href="/release/22222222-2222-4222-8222-222222222222"');
  });

  it("ringkasan status: dikerjakan (termasuk ditinjau), menunggu, terhambat, ditunda/dibatalkan terpisah", () => {
    const out = html(overview(mixed));
    expect(out).toContain("2 dikerjakan");
    expect(out).toContain("1 menunggu");
    expect(out).toContain("1 terhambat");
    expect(out).toContain("1 ditunda/dibatalkan");
  });

  it("tanpa terhambat dan ditunda: bagian itu tidak ditampilkan", () => {
    const out = html(overview([task(100, "done"), task(101, "pending")]));
    expect(out).not.toContain("terhambat");
    expect(out).not.toContain("ditunda/dibatalkan");
  });

  it("bar progres memakai role progressbar dengan nilai dan label", () => {
    const out = html(overview(mixed));
    expect(out).toContain('role="progressbar"');
    expect(out).toContain('aria-label="Progres Echo App v2.1"');
    expect(out).toContain('aria-valuenow="50"');
    expect(out).toContain('aria-valuetext="50% selesai"');
  });

  it("total nol: pesan jelas, bukan 0%", () => {
    const out = html(overview([task(5, "done")]));
    expect(out).toContain("Belum ada task di rentang ini.");
    expect(out).not.toContain(">0%<");
    expect(out).not.toContain("progressbar");
  });

  it("tag hilang dari data: pesan khusus", () => {
    const out = html(overview([], { tagFound: false }));
    expect(out).toContain("Tag tidak ditemukan pada data terakhir.");
  });

  it("sudah rilis: tanggal rilis dan target, tanpa sisa hari", () => {
    const out = html(overview(mixed, {}, "2026-11-19"));
    expect(out).toContain("Dirilis 19 Nov 2026");
    expect(out).toContain("target 21 Nov 2026");
    expect(out).not.toContain("hari lagi");
    expect(out).not.toContain("waktu berjalan");
    expect(out).toContain("Sudah rilis");
  });

  it("lewat target: sisa hari negatif ditandai merah dan penanda Lewat target", () => {
    const out = html(overview(mixed, {}, null, "2026-11-25"));
    expect(out).toContain("lewat 4 hari");
    expect(out).toContain("text-red-700");
    expect(out).toContain("Lewat target");
  });

  it("aplikasi nonaktif dan sinkron gagal diberi catatan", () => {
    const out = html(overview(mixed, { sourceActive: false, syncStatus: "failed" }));
    expect(out).toContain("Aplikasi nonaktif.");
    expect(out).toContain("Sinkronisasi terakhir gagal; data dari");
  });
});

describe("penanda risiko", () => {
  it.each([
    ["released", "Sudah rilis"], ["empty", "Belum ada task"], ["overdue", "Lewat target"],
    ["behind", "Tertinggal"], ["at_risk", "Berisiko"], ["on_track", "Sesuai jadwal"],
  ] as [RiskLevel, string][])("%s tampil dengan teks dan ikon", (risk, label) => {
    const out = renderToStaticMarkup(<RiskBadge risk={risk} />);
    expect(out).toContain(label);
    expect(out).toContain("<svg");
    expect(out).toContain('aria-hidden="true"');
  });
});

describe("bar progres", () => {
  const counts = { pending: 2, in_progress: 1, review: 0, blocked: 1, done: 5, deferred: 1, cancelled: 0, other: 0 };

  it("legenda memuat angka tiap status yang ada dan segmen punya judul", () => {
    const out = renderToStaticMarkup(<ReleaseProgress label="x" counts={counts} total={10} percent={50} />);
    for (const t of ["Selesai", "Dikerjakan", "Menunggu", "Terhambat", "Ditunda"]) expect(out).toContain(t);
    expect(out).not.toContain("Dibatalkan");
    expect(out).toContain('title="Selesai: 5"');
    expect(out).toContain("width:50%");
  });

  it("legenda dapat dimatikan", () => {
    const out = renderToStaticMarkup(<ReleaseProgress label="x" counts={counts} total={10} percent={50} legend={false} />);
    expect(out).not.toContain("<ul");
  });
});

describe("format dan parameter", () => {
  it("sisa hari", () => {
    expect([formatDaysLeft(13), formatDaysLeft(1), formatDaysLeft(0), formatDaysLeft(-3)])
      .toEqual(["13 hari lagi", "besok", "hari ini", "lewat 3 hari"]);
  });

  it("rentang dan tanggal", () => {
    expect(formatRange(100, 200)).toBe("#100–#200");
    expect(formatRange(7, 7)).toBe("#7");
    expect(formatYmd("2026-11-20")).toBe("20 Nov 2026");
    expect(formatYmd(null)).toBe("-");
    expect(formatYmd("bukan")).toBe("-");
  });

  it("parameter URL: nilai tidak valid diabaikan, href pendek", () => {
    expect(parseReleaseListParams({ source: "bukan-uuid", rilis: "ya" })).toEqual({ source: null, showReleased: false });
    expect(parseReleaseListParams({ source: SRC.toUpperCase(), rilis: "1" })).toEqual({ source: SRC, showReleased: true });
    expect(parseReleaseListParams({ source: [SRC, "x"] })).toEqual({ source: SRC, showReleased: false });
    expect(releaseListHref()).toBe("/release");
    expect(releaseListHref({ source: SRC })).toBe(`/release?source=${SRC}`);
    expect(releaseListHref({ showReleased: true })).toBe("/release?rilis=1");
  });
});
