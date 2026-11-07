import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReleaseDetailView } from "@/components/releases/release-detail";
import type { ReleaseOverview } from "@/lib/releases/load";
import { computeRelease, type TaskInput } from "@/lib/releases/model";

const SRC = "11111111-1111-4111-8111-111111111111";
const task = (id: number, status: string, extra: Partial<TaskInput> = {}): TaskInput => ({
  taskId: String(id), title: `Judul ${id}`, status, priority: id % 2 ? "high" : null, dependencies: [],
  subtasksTotal: id === 100 ? 4 : 0, subtasksDone: id === 100 ? 3 : 0, ...extra,
});

function overview(tasks: TaskInput[], over: Partial<ReleaseOverview> = {}, releasedOn: string | null = null, now = "2026-11-11"): ReleaseOverview {
  const release = {
    id: "22222222-2222-4222-8222-222222222222", sourceId: SRC, tag: "master", name: "v2.1",
    rangeStart: 100, rangeEnd: 109, startDate: "2026-11-01", targetDate: "2026-11-21", releasedOn, createdAt: "2026-11-01T00:00:00Z",
  };
  return {
    release, sourceName: "Echo App", sourceActive: true, syncStatus: "success", lastSyncedAt: "2026-11-10T03:00:00Z",
    tagFound: tasks.length > 0, stats: computeRelease(release, tasks, new Date(`${now}T12:00:00+07:00`)), ...over,
  };
}
const html = (o: ReleaseOverview, actions?: React.ReactNode) =>
  renderToStaticMarkup(<ReleaseDetailView overview={o} actions={actions} />);

const base = [
  ...[100, 101, 102, 103, 104].map((i) => task(i, "done")),
  task(105, "in-progress"), task(106, "review"), task(107, "pending"),
];

describe("header dan ringkasan", () => {
  it("memuat judul, breadcrumb, tag, rentang beserta ID yang ada, tanggal, dan sisa hari", () => {
    const out = html(overview(base));
    expect(out).toContain("Echo App · v2.1");
    expect(out).toContain('href="/release"');
    expect(out).toContain("Task range: </dt>");
    expect(out).toContain("#100–#109 (existing: #100–#107)");
    expect(out).toContain("21 Nov 2026 (10 days left)");
    expect(out).toContain("01 Nov 2026");
  });

  it("empat angka ringkas", () => {
    const out = html(overview([...base, task(108, "blocked"), task(109, "deferred")]));
    expect(out).toContain("Total tasks");
    expect(out).toContain("In progress");
    expect(out).toContain("Needs attention");
    expect(out).toMatch(/Total tasks<\/p><p[^>]*>10</);
    expect(out).toMatch(/Done<\/p><p[^>]*>5</);
    expect(out).toMatch(/In progress<\/p><p[^>]*>2</);
    expect(out).toMatch(/Needs attention<\/p><p[^>]*>2</);
  });

  it("bar progres, persen, time elapsed, dan rumus risiko", () => {
    const out = html(overview(base));
    expect(out).toContain('role="progressbar"');
    expect(out).toContain("5 of 8 done");
    expect(out).toContain("time elapsed 50%");
    expect(out).toContain("more than 10 points behind = At risk");
    expect(out).toContain("not an exact prediction");
  });

  it("slot tombol admin hanya tampil bila diberikan", () => {
    expect(html(overview(base))).not.toContain("TOMBOL-ADMIN");
    expect(html(overview(base), <button>TOMBOL-ADMIN</button>)).toContain("TOMBOL-ADMIN");
  });
});

describe("perlu perhatian", () => {
  it("blocked, ditunda, dan dibatalkan tampil dengan tautan ke detail task", () => {
    const out = html(overview([...base, task(108, "blocked"), task(109, "deferred"), task(99, "cancelled")]));
    expect(out).toContain("Blocked (1)");
    expect(out).toContain("To evaluate: 1 deferred, 0 cancelled");
    expect(out).toContain(`href="/tasks/${SRC}/master/108"`);
    expect(out).toContain("Still counted in the total");
    expect(out).not.toContain("No blockers");
  });

  it("dependensi di luar rentang yang belum selesai disebut beserta statusnya", () => {
    const ext = task(50, "in-progress", { title: "Di luar rentang" });
    const out = html(overview([ext, task(100, "pending", { dependencies: [50] })]));
    expect(out).toContain("Waiting on tasks outside the range (1)");
    expect(out).toContain("#50 Di luar rentang");
    expect(out).toContain("In progress");
    expect(out).toContain("At risk");
  });

  it("dependensi tidak ditemukan dilaporkan terpisah", () => {
    const out = html(overview([task(100, "pending", { dependencies: [777] })]));
    expect(out).toContain("Dependencies not found (1)");
    expect(out).toContain("depends on #777");
  });

  it("tanpa hambatan: tampil 'No blockers' dan kelompok kosong tidak muncul", () => {
    const out = html(overview(base));
    expect(out).toContain("No blockers");
    expect(out).not.toContain("Blocked (");
    expect(out).not.toContain("Perlu dievaluasi");
  });
});

describe("tabel task", () => {
  it("blocked lebih dulu, memuat status, prioritas, subtask, dan tautan", () => {
    const out = html(overview([...base, task(108, "blocked")]));
    const rows = out.slice(out.indexOf("<tbody"));
    expect(rows.indexOf("Judul 108")).toBeLessThan(rows.indexOf("Judul 100"));
    expect(out).toContain("3/4");
    expect(out).toContain("High");
    expect(out).toContain(`href="/tasks/${SRC}/master/100"`);
    expect(out).toContain("Tasks in range (9)");
  });

  it("status 'in progress' tampil dengan label yang benar (bukan Other)", () => {
    const out = html(overview([task(100, "in-progress")]));
    expect(out).toContain("In progress");
    expect(out).not.toContain("Other");
  });
});

describe("kasus khusus", () => {
  it("rentang tanpa task: pesan kosong, tanpa tabel dan bar", () => {
    const out = html(overview([task(5, "done")], { tagFound: true }));
    expect(out).toContain("No tasks in this range yet.");
    expect(out).not.toContain("<table");
    expect(out).not.toContain("progressbar");
  });

  it("tag hilang: pesan khusus", () => {
    const out = html(overview([], { tagFound: false }));
    expect(out).toContain("was not found in the latest data");
  });

  it("sudah rilis: tanggal rilis dan progres saat ini, tanpa sisa hari", () => {
    const out = html(overview(base, {}, "2026-11-19"));
    expect(out).toContain("Released on <strong>19 Nov 2026</strong>");
    expect(out).toContain("current task progress 63%");
    expect(out).not.toContain("days left");
    expect(out).not.toContain("time elapsed");
  });

  it("aplikasi nonaktif dan sinkron gagal: catatan data usang dengan waktu sinkron", () => {
    const out = html(overview(base, { sourceActive: false, syncStatus: "failed" }));
    expect(out).toContain("This application is inactive.");
    expect(out).toContain("The last sync failed; the data comes from the last successful sync on");
  });
});
