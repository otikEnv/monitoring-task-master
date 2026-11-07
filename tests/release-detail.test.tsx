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
    expect(out).toContain("Rentang task: </dt>");
    expect(out).toContain("#100–#109 (yang ada: #100–#107)");
    expect(out).toContain("21 Nov 2026 (10 hari lagi)");
    expect(out).toContain("01 Nov 2026");
  });

  it("empat angka ringkas", () => {
    const out = html(overview([...base, task(108, "blocked"), task(109, "deferred")]));
    expect(out).toContain("Total task");
    expect(out).toContain("Dalam pengerjaan");
    expect(out).toContain("Perlu perhatian");
    expect(out).toMatch(/Total task<\/p><p[^>]*>10</);
    expect(out).toMatch(/Selesai<\/p><p[^>]*>5</);
    expect(out).toMatch(/Dalam pengerjaan<\/p><p[^>]*>2</);
    expect(out).toMatch(/Perlu perhatian<\/p><p[^>]*>2</);
  });

  it("bar progres, persen, waktu berjalan, dan rumus risiko", () => {
    const out = html(overview(base));
    expect(out).toContain('role="progressbar"');
    expect(out).toContain("5 dari 8 selesai");
    expect(out).toContain("waktu berjalan 50%");
    expect(out).toContain("tertinggal lebih dari 10 poin = Berisiko");
    expect(out).toContain("bukan prediksi pasti");
  });

  it("slot tombol admin hanya tampil bila diberikan", () => {
    expect(html(overview(base))).not.toContain("TOMBOL-ADMIN");
    expect(html(overview(base), <button>TOMBOL-ADMIN</button>)).toContain("TOMBOL-ADMIN");
  });
});

describe("perlu perhatian", () => {
  it("terhambat, ditunda, dan dibatalkan tampil dengan tautan ke detail task", () => {
    const out = html(overview([...base, task(108, "blocked"), task(109, "deferred"), task(99, "cancelled")]));
    expect(out).toContain("Terhambat (1)");
    expect(out).toContain("Perlu dievaluasi: ditunda 1, dibatalkan 0");
    expect(out).toContain(`href="/tasks/${SRC}/master/108"`);
    expect(out).toContain("Tetap dihitung di total");
    expect(out).not.toContain("Tidak ada hambatan");
  });

  it("dependensi di luar rentang yang belum selesai disebut beserta statusnya", () => {
    const ext = task(50, "in-progress", { title: "Di luar rentang" });
    const out = html(overview([ext, task(100, "pending", { dependencies: [50] })]));
    expect(out).toContain("Menunggu task di luar rentang (1)");
    expect(out).toContain("#50 Di luar rentang");
    expect(out).toContain("Dikerjakan");
    expect(out).toContain("Berisiko");
  });

  it("dependensi tidak ditemukan dilaporkan terpisah", () => {
    const out = html(overview([task(100, "pending", { dependencies: [777] })]));
    expect(out).toContain("Dependensi tidak ditemukan (1)");
    expect(out).toContain("bergantung pada #777");
  });

  it("tanpa hambatan: tampil 'Tidak ada hambatan' dan kelompok kosong tidak muncul", () => {
    const out = html(overview(base));
    expect(out).toContain("Tidak ada hambatan");
    expect(out).not.toContain("Terhambat (");
    expect(out).not.toContain("Perlu dievaluasi");
  });
});

describe("tabel task", () => {
  it("terhambat lebih dulu, memuat status, prioritas, subtask, dan tautan", () => {
    const out = html(overview([...base, task(108, "blocked")]));
    const rows = out.slice(out.indexOf("<tbody"));
    expect(rows.indexOf("Judul 108")).toBeLessThan(rows.indexOf("Judul 100"));
    expect(out).toContain("3/4");
    expect(out).toContain("Tinggi");
    expect(out).toContain(`href="/tasks/${SRC}/master/100"`);
    expect(out).toContain("Task di rentang (9)");
  });

  it("status 'dikerjakan' tampil dengan label yang benar (bukan Lainnya)", () => {
    const out = html(overview([task(100, "in-progress")]));
    expect(out).toContain("Dikerjakan");
    expect(out).not.toContain("Lainnya");
  });
});

describe("kasus khusus", () => {
  it("rentang tanpa task: pesan kosong, tanpa tabel dan bar", () => {
    const out = html(overview([task(5, "done")], { tagFound: true }));
    expect(out).toContain("Belum ada task di rentang ini.");
    expect(out).not.toContain("<table");
    expect(out).not.toContain("progressbar");
  });

  it("tag hilang: pesan khusus", () => {
    const out = html(overview([], { tagFound: false }));
    expect(out).toContain("tidak ditemukan pada data terakhir");
  });

  it("sudah rilis: tanggal rilis dan progres saat ini, tanpa sisa hari", () => {
    const out = html(overview(base, {}, "2026-11-19"));
    expect(out).toContain("Dirilis pada <strong>19 Nov 2026</strong>");
    expect(out).toContain("progres task saat ini 63%");
    expect(out).not.toContain("hari lagi");
    expect(out).not.toContain("waktu berjalan");
  });

  it("aplikasi nonaktif dan sinkron gagal: catatan data usang dengan waktu sinkron", () => {
    const out = html(overview(base, { sourceActive: false, syncStatus: "failed" }));
    expect(out).toContain("Aplikasi ini nonaktif.");
    expect(out).toContain("Sinkronisasi terakhir gagal; data berasal dari sinkronisasi yang berhasil pada");
  });
});
