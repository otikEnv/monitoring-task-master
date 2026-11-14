import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReleaseDetailView } from "@/components/releases/release-detail";
import type { ReleaseOverview } from "@/lib/releases/load";
import { overviewOf, SRC, SRC2, task, type Part } from "./fixtures/release-overview";

const html = (o: ReleaseOverview, actions?: React.ReactNode) =>
  renderToStaticMarkup(<ReleaseDetailView overview={o} actions={actions} />);
const one = (tasks: Part["tasks"], extra: Partial<Part> = {}, opts: Parameters<typeof overviewOf>[1] = {}) =>
  overviewOf([{ tasks, rangeStart: 100, rangeEnd: 109, ...extra }], opts);

const base = [
  ...[100, 101, 102, 103, 104].map((i) => task(i, "done")),
  task(105, "in-progress"), task(106, "review"), task(107, "pending"),
];

describe("header dan ringkasan (satu komponen)", () => {
  it("memuat judul, breadcrumb, jumlah komponen, tanggal, dan sisa hari", () => {
    const out = html(one(base));
    expect(out).toContain(">v2.1<");
    expect(out).toContain('href="/release"');
    expect(out).toContain("Components: </dt>");
    expect(out).toContain("21 Nov 2026 (10 days left)");
    expect(out).toContain("01 Nov 2026");
  });

  it("blok komponen memuat aplikasi, tag, rentang beserta ID yang ada, dan waktu data", () => {
    const out = html(one(base));
    expect(out).toContain("Echo App · master");
    expect(out).toContain("Task range #100–#109 (existing: #100–#107) · 8 tasks");
    expect(out).toContain("Task data updated");
  });

  it("empat angka ringkas", () => {
    const out = html(one([...base, task(108, "blocked"), task(109, "deferred")]));
    expect(out).toContain("Total tasks");
    expect(out).toContain("In progress");
    expect(out).toContain("Needs attention");
    expect(out).toMatch(/Total tasks<\/p><p[^>]*>10</);
    expect(out).toMatch(/Done<\/p><p[^>]*>5</);
    expect(out).toMatch(/In progress<\/p><p[^>]*>2</);
    expect(out).toMatch(/Needs attention<\/p><p[^>]*>2</);
  });

  it("bar progres, persen, time elapsed, dan rumus risiko", () => {
    const out = html(one(base));
    expect(out).toContain('role="progressbar"');
    expect(out).toContain("5 of 8 done");
    expect(out).toContain("time elapsed 50%");
    expect(out).toContain("more than 10 points behind = At risk");
    expect(out).toContain("not an exact prediction");
    expect(out).not.toContain("Progress is the total of done tasks");
  });

  it("slot tombol admin hanya tampil bila diberikan", () => {
    expect(html(one(base))).not.toContain("TOMBOL-ADMIN");
    expect(html(one(base), <button>TOMBOL-ADMIN</button>)).toContain("TOMBOL-ADMIN");
  });
});

describe("perlu perhatian (satu komponen)", () => {
  it("blocked, ditunda, dan dibatalkan tampil dengan tautan ke detail task", () => {
    const out = html(one([...base, task(108, "blocked"), task(109, "deferred"), task(99, "cancelled")]));
    expect(out).toContain("Blocked (1)");
    expect(out).toContain("To evaluate: 1 deferred, 0 cancelled");
    expect(out).toContain(`href="/tasks/${SRC}/master/108"`);
    expect(out).toContain("Still counted in the total");
    expect(out).not.toContain("No blockers");
  });

  it("dependensi di luar rentang yang belum selesai disebut beserta statusnya", () => {
    const ext = task(50, "in-progress", { title: "Di luar rentang" });
    const out = html(one([ext, task(100, "pending", { dependencies: [50] })]));
    expect(out).toContain("Waiting on tasks outside the range (1)");
    expect(out).toContain("#50 Di luar rentang");
    expect(out).toContain("In progress");
    expect(out).toContain("At risk");
  });

  it("dependensi tidak ditemukan dilaporkan terpisah", () => {
    const out = html(one([task(100, "pending", { dependencies: [777] })]));
    expect(out).toContain("Dependencies not found (1)");
    expect(out).toContain("depends on #777");
  });

  it("tanpa hambatan: tampil 'No blockers' dan kelompok kosong tidak muncul", () => {
    const out = html(one(base));
    expect(out).toContain("No blockers");
    expect(out).not.toContain("Blocked (");
  });

  it("satu komponen: tidak ada judul per komponen di bagian perhatian dan tabel", () => {
    const out = html(one([...base, task(108, "blocked")]));
    expect(out).not.toMatch(/<h3[^>]*>Echo App · master \(/);
  });
});

describe("tabel task", () => {
  it("blocked lebih dulu, memuat status, prioritas, subtask, dan tautan", () => {
    const out = html(one([...base, task(108, "blocked")]));
    const rows = out.slice(out.indexOf("<tbody"));
    expect(rows.indexOf("Judul 108")).toBeLessThan(rows.indexOf("Judul 100"));
    expect(out).toContain("3/4");
    expect(out).toContain("High");
    expect(out).toContain(`href="/tasks/${SRC}/master/100"`);
    expect(out).toContain("Tasks in range (9)");
  });

  it("status 'in progress' tampil dengan label yang benar (bukan Other)", () => {
    const out = html(one([task(100, "in-progress")]));
    expect(out).toContain("In progress");
    expect(out).not.toContain("Other");
  });
});

describe("kasus khusus (satu komponen)", () => {
  it("rentang tanpa task: pesan kosong, tanpa tabel dan bar", () => {
    const out = html(one([task(5, "done")], { tagFound: true }));
    expect(out).toContain("No tasks in this range yet.");
    expect(out).not.toContain("<table");
    expect(out).not.toContain("progressbar");
  });

  it("tag hilang: pesan khusus dengan nama aplikasi", () => {
    const out = html(one([], { tagFound: false }));
    expect(out).toContain("was not found in the latest data of Echo App");
  });

  it("sudah rilis: tanggal rilis dan progres saat ini, tanpa sisa hari", () => {
    const out = html(one(base, {}, { releasedOn: "2026-11-19" }));
    expect(out).toContain("Released on <strong>19 Nov 2026</strong>");
    expect(out).toContain("current task progress 63%");
    expect(out).not.toContain("days left");
    expect(out).not.toContain("time elapsed");
  });

  it("aplikasi nonaktif dan sinkron gagal: catatan data usang dengan waktu sinkron", () => {
    const out = html(one(base, { sourceActive: false, syncStatus: "failed" }));
    expect(out).toContain("Echo App is inactive.");
    expect(out).toContain("The last sync of Echo App failed; the data comes from the last successful sync on");
  });
});

describe("release lintas aplikasi", () => {
  // Web: #100–#109 (8 selesai, 1 blocked, 1 pending). Backend: #20–#23 (1 selesai, 1 ditunda, 2 pending).
  const web = [
    ...Array.from({ length: 8 }, (_, i) => task(100 + i, "done")), task(108, "blocked"), task(109, "pending"),
  ];
  const api = [
    task(20, "done", { title: "Backend 20" }), task(21, "deferred", { title: "Backend 21" }),
    task(22, "pending", { title: "Backend 22" }), task(23, "pending", { title: "Backend 23" }),
  ];
  const parts: Part[] = [
    { tasks: web, sourceId: SRC, sourceName: "Web", tag: "master", rangeStart: 100, rangeEnd: 150 },
    { tasks: api, sourceId: SRC2, sourceName: "Backend", tag: "main", rangeStart: 20, rangeEnd: 45 },
  ];
  const out = () => html(overviewOf(parts, { name: "2.1" }));

  it("ringkasan gabungan memakai jumlah task seluruh komponen", () => {
    const o = out();
    expect(o).toContain("Components: </dt>");
    expect(o).toMatch(/Total tasks<\/p><p[^>]*>14</);
    expect(o).toMatch(/Done<\/p><p[^>]*>9</);
    expect(o).toContain(">64%<");
    expect(o).toContain("9 of 14 done");
    expect(o).toContain("Progress is the total of done tasks divided by all tasks across the components");
  });

  it("bagian Components: satu blok per komponen dengan progres masing-masing", () => {
    const o = out();
    expect(o).toContain("Components (2)");
    expect(o).toContain('aria-label="Component Web · master"');
    expect(o).toContain('aria-label="Component Backend · main"');
    expect(o).toContain("Task range #100–#150 (existing: #100–#109) · 10 tasks");
    expect(o).toContain("Task range #20–#45 (existing: #20–#23) · 4 tasks");
    expect(o).toContain(">80%<");
    expect(o).toContain(">25%<");
    expect(o).toContain('aria-label="Progress Web · master"');
    expect(o).toContain('aria-label="Progress Backend · main"');
  });

  it("perlu perhatian dikelompokkan per aplikasi dan tautan memakai aplikasi serta tag masing-masing", () => {
    const o = out();
    expect(o).toMatch(/<h3[^>]*>Web · master<\/h3>/);
    expect(o).toMatch(/<h3[^>]*>Backend · main<\/h3>/);
    expect(o).toContain("Blocked (1)");
    expect(o).toContain("To evaluate: 1 deferred, 0 cancelled");
    expect(o).toContain(`href="/tasks/${SRC}/master/108"`);
    expect(o).toContain(`href="/tasks/${SRC2}/main/21"`);
  });

  it("daftar task per komponen dengan judul dan jumlahnya", () => {
    const o = out();
    expect(o).toContain("Tasks in range (14)");
    expect(o).toMatch(/<h3[^>]*>Web · master \(10\)<\/h3>/);
    expect(o).toMatch(/<h3[^>]*>Backend · main \(4\)<\/h3>/);
    expect(o.match(/<table/g)).toHaveLength(2);
    expect(o).toContain("Backend 22");
  });

  it("komponen yang perlu dilihat disebut bila release belum rilis", () => {
    const late = html(overviewOf(parts, { name: "2.1", now: "2026-11-17" })); // 80% waktu
    expect(late).toContain("Needs a look:");
    expect(late).toContain("Backend · main");
  });

  it("sudah rilis: tidak ada 'Needs a look'", () => {
    const o = html(overviewOf(parts, { name: "2.1", now: "2026-11-23", releasedOn: "2026-11-20" }));
    expect(o).not.toContain("Needs a look");
  });

  it("peringatan data hanya untuk komponen yang bermasalah, dengan nama aplikasinya", () => {
    const o = html(overviewOf([parts[0], { ...parts[1], syncStatus: "failed", tagFound: false }]));
    expect(o).toContain("The last sync of Backend failed");
    expect(o).toContain("was not found in the latest data of Backend");
    expect(o).not.toContain("of Web failed");
  });

  it("komponen tanpa task tidak punya tabel; komponen lain tetap", () => {
    const o = html(overviewOf([parts[0], { ...parts[1], tasks: [] }]));
    expect(o.match(/<table/g)).toHaveLength(1);
    expect(o).toContain("No tasks in this range yet.");
  });

  it("release tanpa komponen: pesan khusus tanpa bagian lain", () => {
    const base2 = overviewOf(parts);
    const o = html({ ...base2, components: [], release: { ...base2.release, components: [] } });
    expect(o).toContain("This release has no components");
    expect(o).not.toContain("Total tasks");
    expect(o).not.toContain("<table");
  });
});

describe("release terarsip", () => {
  it("penanda Archived hanya tampil bila diarsipkan; isi dan angka tidak berubah", () => {
    const active = overviewOf([{ tasks: [task(100, "done")] }]);
    expect(html(active)).not.toContain(">Archived<");

    const archived = { ...active, release: { ...active.release, archivedAt: "2026-11-14T00:00:00Z" } };
    const out = html(archived);
    expect(out).toContain(">Archived<");
    expect(out).toContain("Total tasks");
    expect(out).toContain(">100%<");
  });
});
