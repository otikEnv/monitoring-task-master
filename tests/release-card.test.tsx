import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReleaseCard } from "@/components/releases/release-card";
import { RiskBadge } from "@/components/releases/risk-badge";
import { ReleaseProgress } from "@/components/releases/release-progress";
import { formatDaysLeft, formatRange, formatYmd } from "@/lib/releases/format";
import type { ReleaseOverview } from "@/lib/releases/load";
import type { RiskLevel } from "@/lib/releases/model";
import { parseReleaseListParams, releaseListHref } from "@/lib/releases/params";
import { overviewOf, REL_ID, SRC, SRC2, task, type Part } from "./fixtures/release-overview";

const html = (o: ReleaseOverview) => renderToStaticMarkup(<ReleaseCard overview={o} />);
const one = (tasks: Part["tasks"], extra: Partial<Part> = {}, opts: Parameters<typeof overviewOf>[1] = {}) =>
  overviewOf([{ tasks, ...extra }], opts);

// 10 task (#100–#109): 5 selesai, 2 in progress, 1 pending, 1 blocked, 1 ditunda
const mixed = [
  ...[100, 101, 102, 103, 104].map((i) => task(i, "done")), task(105, "in-progress"), task(106, "review"),
  task(107, "pending"), task(108, "blocked"), task(109, "deferred"),
];

describe("kartu release (satu komponen)", () => {
  it("menampilkan nama, jumlah, komponen, target, sisa hari, dan persen", () => {
    const out = html(one(mixed));
    expect(out).toContain(">v2.1<");
    expect(out).toContain("10 tasks · 1 component");
    expect(out).toContain("Target 21 Nov 2026");
    expect(out).toContain("10 days left");
    expect(out).toContain(">50%<");
    expect(out).toContain("5 of 10 done");
    expect(out).toContain("time elapsed 50%");
  });

  it("baris komponen memuat aplikasi, tag, rentang, dan progres komponen", () => {
    const out = html(one(mixed));
    expect(out).toContain("Echo App");
    expect(out).toContain("master · #100–#200");
    expect(out).toContain("50% · 5/10");
  });

  it("seluruh kartu menaut ke detail release", () => {
    expect(html(one(mixed))).toContain(`href="/release/${REL_ID}"`);
  });

  it("ringkasan status: in progress (termasuk ditinjau), pending, blocked, deferred/cancelled terpisah", () => {
    const out = html(one(mixed));
    expect(out).toContain("2 in progress");
    expect(out).toContain("1 pending");
    expect(out).toContain("1 blocked");
    expect(out).toContain("1 deferred/cancelled");
  });

  it("tanpa blocked dan ditunda: bagian itu tidak ditampilkan", () => {
    const out = html(one([task(100, "done"), task(101, "pending")]));
    expect(out).not.toContain("blocked");
    expect(out).not.toContain("deferred/cancelled");
  });

  it("bar progres memakai role progressbar dengan nilai dan label", () => {
    const out = html(one(mixed));
    expect(out).toContain('role="progressbar"');
    expect(out).toContain('aria-label="Progress v2.1"');
    expect(out).toContain('aria-valuenow="50"');
    expect(out).toContain('aria-valuetext="50% done"');
  });

  it("total nol: pesan jelas, bukan 0%", () => {
    const out = html(one([task(5, "done")]));
    expect(out).toContain("No tasks in the ranges yet.");
    expect(out).toContain("no tasks");
    expect(out).not.toContain(">0%<");
    expect(out).not.toContain("progressbar");
  });

  it("tag hilang dari data: catatan pada baris komponen", () => {
    const out = html(one([], { tagFound: false }));
    expect(out).toContain("tag not found in the latest data");
  });

  it("sudah rilis: tanggal rilis dan target, tanpa sisa hari", () => {
    const out = html(one(mixed, {}, { releasedOn: "2026-11-19" }));
    expect(out).toContain("Released 19 Nov 2026");
    expect(out).toContain("target 21 Nov 2026");
    expect(out).not.toContain("days left");
    expect(out).not.toContain("time elapsed");
    expect(out).toContain("Released");
  });

  it("lewat target: sisa hari negatif ditandai merah dan penanda Overdue", () => {
    const out = html(one(mixed, {}, { now: "2026-11-25" }));
    expect(out).toContain("4 days overdue");
    expect(out).toContain("text-red-700");
    expect(out).toContain("Overdue");
  });

  it("aplikasi nonaktif dan sinkron gagal diberi catatan pada komponennya", () => {
    const out = html(one(mixed, { sourceActive: false, syncStatus: "failed" }));
    expect(out).toContain("application inactive");
    expect(out).toContain("last sync failed, data from");
  });
});

describe("kartu release (lintas aplikasi)", () => {
  // Web 8 dari 10 selesai, Backend 1 dari 4 selesai.
  const web = Array.from({ length: 10 }, (_, i) => task(100 + i, i < 8 ? "done" : "pending"));
  const api = Array.from({ length: 4 }, (_, i) => task(20 + i, i < 1 ? "done" : "pending"));
  const parts: Part[] = [
    { tasks: web, sourceId: SRC, sourceName: "Web", tag: "master", rangeStart: 100, rangeEnd: 150 },
    { tasks: api, sourceId: SRC2, sourceName: "Backend", tag: "main", rangeStart: 20, rangeEnd: 45 },
  ];

  it("progres gabungan dari jumlah task dan satu baris per komponen", () => {
    const out = html(overviewOf(parts, { name: "2.1" }));
    expect(out).toContain("14 tasks · 2 components");
    expect(out).toContain(">64%<"); // 9 dari 14
    expect(out).toContain("9 of 14 done");
    expect(out).toContain("Web");
    expect(out).toContain("master · #100–#150");
    expect(out).toContain("80% · 8/10");
    expect(out).toContain("Backend");
    expect(out).toContain("main · #20–#45");
    expect(out).toContain("25% · 1/4");
  });

  it("catatan data hanya pada komponen yang bermasalah", () => {
    const out = html(overviewOf([parts[0], { ...parts[1], syncStatus: "failed" }]));
    expect(out.match(/last sync failed/g)).toHaveLength(1);
  });

  it("komponen kosong tampil 'no tasks' tanpa mengganggu komponen lain", () => {
    const out = html(overviewOf([parts[0], { ...parts[1], tasks: [] }]));
    expect(out).toContain("no tasks");
    expect(out).toContain("80% · 8/10");
  });

  it("release tanpa komponen (aplikasinya dihapus)", () => {
    const o = overviewOf(parts);
    const empty: ReleaseOverview = { ...o, components: [], release: { ...o.release, components: [] } };
    const out = html({ ...empty, stats: { ...empty.stats, total: 0, percentDone: null } });
    expect(out).toContain("No components");
    expect(out).not.toContain("progressbar");
  });
});

describe("penanda risiko", () => {
  it.each([
    ["released", "Released"], ["empty", "No tasks"], ["overdue", "Overdue"],
    ["behind", "Behind"], ["at_risk", "At risk"], ["on_track", "On track"],
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
    for (const t of ["Done", "In progress", "Pending", "Blocked", "Deferred"]) expect(out).toContain(t);
    expect(out).not.toContain("Cancelled");
    expect(out).toContain('title="Done: 5"');
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
      .toEqual(["13 days left", "tomorrow", "today", "3 days overdue"]);
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
