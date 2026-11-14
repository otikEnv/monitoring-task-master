import { describe, expect, it } from "vitest";
import {
  AMBANG_BERISIKO, AMBANG_TERTINGGAL, aggregateRelease, computeRelease, riskLevel, needsAttentionCount, numericId, tasksInRange,
  timeProgress, wibDay, type ReleaseDef, type TaskInput,
} from "@/lib/releases/model";

const task = (taskId: string, status = "pending", extra: Partial<TaskInput> = {}): TaskInput => ({
  taskId, title: `Task ${taskId}`, status, priority: null, dependencies: [], subtasksTotal: 0, subtasksDone: 0, ...extra,
});

// Range 10..19, jendela 1..21 Nov 2026 (20 hari). "Hari ini" diatur per tes.
const def: ReleaseDef = { rangeStart: 10, rangeEnd: 19, startDate: "2026-11-01", targetDate: "2026-11-21", releasedOn: null };
const at = (ymd: string) => new Date(`${ymd}T12:00:00+07:00`);

/** 10 task di rentang: `done` selesai, sisanya pending. */
const tenTasks = (done: number, over: (i: number) => Partial<TaskInput> = () => ({})): TaskInput[] =>
  Array.from({ length: 10 }, (_, i) => task(String(10 + i), i < done ? "done" : "pending", over(i)));

describe("isi rentang", () => {
  it("batas awal dan akhir ikut dihitung (inklusif)", () => {
    const r = tasksInRange([task("9"), task("10"), task("15"), task("19"), task("20")], 10, 19);
    expect(r.map((t) => t.taskId)).toEqual(["10", "15", "19"]);
  });

  it("ID bolong tidak dihitung, ID non-angka diabaikan, urut menurut angka", () => {
    const r = tasksInRange([task("100"), task("abc"), task("12"), task("1.2"), task("011"), task("")], 10, 200);
    expect(r.map((t) => t.taskId)).toEqual(["011", "12", "100"]);
    expect(numericId("12")).toBe(12);
    expect(numericId("12a")).toBeNull();
    expect(numericId("1234567890123456")).toBeNull(); // 16 digit
  });

  it("firstId dan lastId adalah ID yang benar-benar ada", () => {
    const s = computeRelease(def, [task("12"), task("17"), task("30")], at("2026-11-05"));
    expect([s.total, s.firstId, s.lastId]).toEqual([2, "12", "17"]);
  });
});

describe("total, progres, dan rincian status", () => {
  it("total mencakup semua status, termasuk ditunda dan dibatalkan", () => {
    const s = computeRelease(def, [
      task("10", "done"), task("11", "deferred"), task("12", "cancelled"), task("13", "in-progress"),
      task("14", "review"), task("15", "blocked"), task("16", "pending"), task("17", "aneh"),
    ], at("2026-11-05"));
    expect(s.total).toBe(8);
    expect(s.counts).toEqual({
      pending: 1, in_progress: 1, review: 1, blocked: 1, done: 1, deferred: 1, cancelled: 1, other: 1,
    });
    expect(s.inProgress).toBe(2);
    expect(s.percentDone).toBe(13); // 1/8 = 12,5% dibulatkan
    expect(s.attention.deferred.map((t) => t.taskId)).toEqual(["11"]);
    expect(s.attention.cancelled.map((t) => t.taskId)).toEqual(["12"]);
    expect(needsAttentionCount(s)).toBe(3);
  });

  it("status tak dikenal dihitung 'other' dan bukan selesai", () => {
    const s = computeRelease(def, [task("10", "Done "), task("11", "finished")], at("2026-11-05"));
    expect(s.counts.other).toBe(2);
    expect(s.done).toBe(0);
  });

  it("tanpa task: percentDone null dan penanda 'empty' (bukan 0%)", () => {
    const s = computeRelease(def, [task("1"), task("50")], at("2026-11-05"));
    expect([s.total, s.percentDone, s.gap, s.risk, s.firstId]).toEqual([0, null, null, "empty", null]);
  });

  it("urutan tabel: paling perlu perhatian dulu, lalu ID angka", () => {
    const s = computeRelease(def, [
      task("10", "done"), task("11", "pending"), task("12", "blocked"), task("13", "in-progress"),
      task("14", "cancelled"), task("15", "blocked"),
    ], at("2026-11-05"));
    expect(s.tasks.map((t) => t.taskId)).toEqual(["12", "15", "13", "11", "10", "14"]);
  });
});

describe("waktu", () => {
  it("persen waktu dan sisa hari menurut kalender WIB", () => {
    const t = timeProgress("2026-11-01", "2026-11-21", at("2026-11-11"));
    expect(t.elapsedPercent).toBe(50);
    expect(t.daysLeft).toBe(10);
  });

  it("dibatasi 0..100 dan sisa hari bisa negatif", () => {
    expect(timeProgress("2026-11-10", "2026-11-20", at("2026-11-01")).elapsedPercent).toBe(0);
    const late = timeProgress("2026-11-01", "2026-11-10", at("2026-11-15"));
    expect([late.elapsedPercent, late.daysLeft]).toEqual([100, -5]);
  });

  it("mulai = target: 0 sebelum hari target, 100 sesudahnya", () => {
    expect(timeProgress("2026-11-10", "2026-11-10", at("2026-11-09")).elapsedPercent).toBe(0);
    expect(timeProgress("2026-11-10", "2026-11-10", at("2026-11-10")).elapsedPercent).toBe(100);
  });

  it("hari mengikuti WIB, bukan UTC", () => {
    // 23:30 WIB tanggal 10 = 16:30 UTC tanggal 10; 01:00 WIB tanggal 11 = 18:00 UTC tanggal 10.
    expect(wibDay(new Date("2026-11-10T16:30:00Z"))).toBe("2026-11-10");
    expect(wibDay(new Date("2026-11-10T18:00:00Z"))).toBe("2026-11-11");
  });
});

describe("penanda risiko", () => {
  // Jendela 20 hari: 1 Nov = 0%, 11 Nov = 50%.
  const now = at("2026-11-11");

  it("sesuai jadwal: selisih di bawah dan tepat pada ambang berisiko", () => {
    expect(computeRelease(def, tenTasks(5), now).risk).toBe("on_track"); // selisih 0
    expect(AMBANG_BERISIKO).toBe(10);
    expect(computeRelease(def, tenTasks(4), now).risk).toBe("on_track"); // selisih 10 tepat
  });

  it("berisiko: selisih di atas 10", () => {
    expect(computeRelease(def, tenTasks(3), now).risk).toBe("at_risk"); // 20
    expect(AMBANG_TERTINGGAL).toBe(25);
  });

  it("tertinggal: selisih lebih dari 25", () => {
    const s = computeRelease(def, tenTasks(2), now); // selisih 30
    expect(s.gap).toBeCloseTo(30);
    expect(s.risk).toBe("behind");
  });

  it("selisih tepat 25 masih berisiko, bukan tertinggal", () => {
    // 4 task, 1 selesai = 25%; waktu 50% -> selisih 25
    const s = computeRelease(def, [task("10", "done"), task("11"), task("12"), task("13")], now);
    expect(s.gap).toBeCloseTo(25);
    expect(s.risk).toBe("at_risk");
  });

  it("task blocked memicu berisiko walau progres sesuai waktu", () => {
    const s = computeRelease(def, tenTasks(5, (i) => (i === 9 ? { status: "blocked" } : {})), now);
    expect(s.gap).toBeCloseTo(0);
    expect(s.risk).toBe("at_risk");
    expect(s.attention.blocked.map((t) => t.taskId)).toEqual(["19"]);
  });

  it("lewat target: target lewat dan belum 100%", () => {
    expect(computeRelease(def, tenTasks(9), at("2026-11-22")).risk).toBe("overdue");
  });

  it("target lewat tetapi progres 100% bukan 'lewat target'", () => {
    expect(computeRelease(def, tenTasks(10), at("2026-11-22")).risk).toBe("on_track");
  });

  it("hari target belum selesai: dinilai dari selisih, bukan 'lewat target'", () => {
    const s = computeRelease(def, tenTasks(9), at("2026-11-21"));
    expect(s.daysLeft).toBe(0);
    expect(s.risk).toBe("on_track"); // selisih 100 - 90 = 10, tepat pada ambang
  });

  it("sudah rilis mengalahkan semua penanda", () => {
    const s = computeRelease({ ...def, releasedOn: "2026-11-20" }, tenTasks(1), at("2026-12-30"));
    expect(s.risk).toBe("released");
  });

  it("rentang tanpa task tidak diberi penanda risiko walau target lewat", () => {
    expect(computeRelease(def, [], at("2026-12-30")).risk).toBe("empty");
  });
});

describe("hambatan dari dependensi", () => {
  const now = at("2026-11-02");
  const ext = (status: string) => [task("5", status, { title: "Di luar" })];

  it("dependensi di luar rentang yang belum selesai: pending dan memicu berisiko", () => {
    const s = computeRelease(
      def,
      [...ext("pending"), task("10", "pending", { dependencies: [5] }), task("11", "pending")],
      now,
    );
    expect(s.attention.waiting).toHaveLength(1);
    expect(s.attention.waiting[0].task.taskId).toBe("10");
    expect(s.attention.waiting[0].deps).toEqual([{ id: "5", title: "Di luar", status: "pending" }]);
    expect(s.risk).toBe("at_risk");
  });

  it("dependensi di luar rentang yang sudah selesai bukan hambatan", () => {
    const s = computeRelease(def, [...ext("done"), task("10", "pending", { dependencies: ["5"] })], now);
    expect(s.attention.waiting).toEqual([]);
    expect(s.risk).toBe("on_track");
  });

  it("dependensi di dalam rentang yang belum selesai bukan hambatan luar", () => {
    const s = computeRelease(def, [task("10", "pending", { dependencies: [11] }), task("11", "pending")], now);
    expect(s.attention.waiting).toEqual([]);
  });

  it("dependensi yang tidak ditemukan dilaporkan terpisah dan tidak memicu berisiko", () => {
    const s = computeRelease(def, [task("10", "pending", { dependencies: [999, "x"] })], now);
    expect(s.attention.missingDeps).toEqual([{ task: expect.objectContaining({ taskId: "10" }), ids: ["999", "x"] }]);
    expect(s.attention.waiting).toEqual([]);
    expect(s.risk).toBe("on_track");
  });

  it("tasks done atau dibatalkan tidak dianggap pending", () => {
    const s = computeRelease(
      def,
      [...ext("pending"), task("10", "done", { dependencies: [5] }), task("11", "cancelled", { dependencies: [5] })],
      now,
    );
    expect(s.attention.waiting).toEqual([]);
  });

  it("bentuk dependensi aneh dibaca dengan aman", () => {
    const s = computeRelease(def, [task("10", "pending", { dependencies: null }), task("11", "pending", { dependencies: "5" })], now);
    expect(s.attention.waiting).toEqual([]);
    expect(s.total).toBe(2);
  });
});

describe("riskLevel (dipakai komponen dan gabungan)", () => {
  const base = { releasedOn: null, total: 10, done: 5, daysLeft: 5, gap: 0, blocked: 0, waiting: 0 };
  it("urutan prioritas", () => {
    expect(riskLevel({ ...base, releasedOn: "2026-11-01", total: 0, gap: null })).toBe("released");
    expect(riskLevel({ ...base, total: 0, gap: null })).toBe("empty");
    expect(riskLevel({ ...base, daysLeft: -1, gap: 90 })).toBe("overdue");
    expect(riskLevel({ ...base, gap: AMBANG_TERTINGGAL + 0.1 })).toBe("behind");
    expect(riskLevel({ ...base, gap: AMBANG_BERISIKO + 0.1 })).toBe("at_risk");
    expect(riskLevel({ ...base, blocked: 1 })).toBe("at_risk");
    expect(riskLevel({ ...base, waiting: 1 })).toBe("at_risk");
    expect(riskLevel(base)).toBe("on_track");
  });
});

describe("aggregateRelease (release lintas aplikasi)", () => {
  // Header: 1..21 Nov 2026. Web #10..19 dan backend #1..4 (tag berbeda, jadi task terpisah).
  const web: ReleaseDef = { rangeStart: 10, rangeEnd: 19, startDate: "2026-11-01", targetDate: "2026-11-21", releasedOn: null };
  const api: ReleaseDef = { rangeStart: 1, rangeEnd: 4, startDate: "2026-11-01", targetDate: "2026-11-21", releasedOn: null };
  const apiTasks = (done: number) => Array.from({ length: 4 }, (_, i) => task(String(1 + i), i < done ? "done" : "pending"));
  const now = at("2026-11-05"); // 20% waktu terpakai

  it("progres = total selesai / total task, bukan rata-rata persen", () => {
    // web 8/10 (80%) dan backend 1/4 (25%): rata-rata 52,5% tetapi gabungan 9/14 = 64,3%.
    const a = computeRelease(web, tenTasks(8), now);
    const b = computeRelease(api, apiTasks(1), now);
    const g = aggregateRelease(web, [a, b], now);
    expect([g.total, g.done, g.percentDone]).toEqual([14, 9, 64]);
    expect(g.counts.done).toBe(9);
    expect(g.counts.pending).toBe(5);
  });

  it("contoh PRD: 60 dari 80 dan 10 dari 20 = 70 dari 100 = 70%", () => {
    const mk = (total: number, done: number, base: number) =>
      Array.from({ length: total }, (_, i) => task(String(base + i), i < done ? "done" : "pending"));
    const d: ReleaseDef = { ...web, rangeStart: 1, rangeEnd: 1000 };
    const g = aggregateRelease(d, [computeRelease(d, mk(80, 60, 1), now), computeRelease(d, mk(20, 10, 101), now)], now);
    expect([g.total, g.done, g.percentDone]).toEqual([100, 70, 70]);
  });

  it("satu komponen sama persis dengan hasil computeRelease", () => {
    const tasks = tenTasks(3, (i) => (i === 9 ? { status: "blocked" } : {}));
    const s = computeRelease(web, tasks, now);
    const g = aggregateRelease(web, [s], now);
    expect([g.total, g.done, g.percentDone, g.gap, g.risk, g.elapsedPercent, g.daysLeft])
      .toEqual([s.total, s.done, s.percentDone, s.gap, s.risk, s.elapsedPercent, s.daysLeft]);
    expect(g.counts).toEqual(s.counts);
  });

  it("selisih dihitung dari progres gabungan, bukan dari komponen terburuk", () => {
    // 20% waktu; web 10/10 selesai, backend 0/4: gabungan 10/14 = 71,4% -> sesuai jadwal.
    const g = aggregateRelease(web, [computeRelease(web, tenTasks(10), now), computeRelease(api, apiTasks(0), now)], now);
    expect(g.gap).toBeCloseTo(20 - (10 * 100) / 14, 5);
    expect(g.risk).toBe("on_track");
  });

  it("task terhambat atau menunggu di salah satu komponen menandai gabungan At risk dan komponennya disebut", () => {
    const later = at("2026-11-11"); // 50% waktu
    const ok = computeRelease(web, tenTasks(5), later); // 50% progres
    const withBlocked = computeRelease(api, [task("1", "done"), task("2", "done"), task("3", "blocked"), task("4", "pending")], later);
    const g = aggregateRelease(web, [ok, withBlocked], later);
    expect(g.risk).toBe("at_risk");
    expect(g.riskComponents).toEqual([1]);
    expect(g.attentionCount).toBe(1);

    const waiting = computeRelease(api, [task("1", "pending", { dependencies: ["50"] }), task("50", "pending")], later);
    expect(aggregateRelease(web, [ok, waiting], later).risk).toBe("at_risk");
  });

  it("tertinggal dan lewat target mengikuti progres gabungan", () => {
    const late = at("2026-11-17"); // 80% waktu
    const g = aggregateRelease(web, [computeRelease(web, tenTasks(2), late), computeRelease(api, apiTasks(0), late)], late);
    expect(g.risk).toBe("behind"); // 2/14 = 14,3% vs 80% waktu
    const over = at("2026-11-23");
    expect(aggregateRelease(web, [computeRelease(web, tenTasks(9), over)], over).risk).toBe("overdue");
    expect(aggregateRelease(web, [computeRelease(web, tenTasks(10), over)], over).risk).toBe("on_track");
  });

  it("komponen kosong tidak menyembunyikan komponen lain; semua kosong = No tasks", () => {
    const empty = computeRelease(api, [], now);
    const g = aggregateRelease(web, [computeRelease(web, tenTasks(5), now), empty], now);
    expect([g.total, g.percentDone]).toEqual([10, 50]);
    expect(aggregateRelease(web, [empty, empty], now)).toMatchObject({ total: 0, percentDone: null, gap: null, risk: "empty" });
    expect(aggregateRelease(web, [], now).risk).toBe("empty");
  });

  it("sudah rilis mengalahkan semua penanda; komponen penyebab tidak ditandai", () => {
    const released: ReleaseDef = { ...web, releasedOn: "2026-11-20" };
    const late = at("2026-11-23");
    const g = aggregateRelease(released, [computeRelease(released, tenTasks(1), late)], late);
    expect(g.risk).toBe("released");
    expect(g.riskComponents).toEqual([]);
  });

  it("ditunda dan dibatalkan dari semua komponen dihitung dan disorot", () => {
    const a = computeRelease(web, [task("10", "deferred"), task("11", "done")], now);
    const b = computeRelease(api, [task("1", "cancelled"), task("2", "blocked")], now);
    const g = aggregateRelease(web, [a, b], now);
    expect(g.total).toBe(4);
    expect(g.attentionCount).toBe(3);
    expect(g.counts).toMatchObject({ deferred: 1, cancelled: 1, blocked: 1, done: 1 });
  });

  it("indeks komponen berisiko mengikuti urutan masukan", () => {
    const later = at("2026-11-17"); // 80% waktu
    const bad1 = computeRelease(web, tenTasks(0), later); // behind
    const good = computeRelease(api, apiTasks(4), later); // on_track
    const bad2 = computeRelease(web, tenTasks(0), later); // behind
    expect(aggregateRelease(web, [bad1, good, bad2], later).riskComponents).toEqual([0, 2]);
  });
});
