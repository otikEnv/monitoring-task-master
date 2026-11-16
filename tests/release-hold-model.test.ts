import { describe, expect, it } from "vitest";
import { aggregateRelease, computeRelease, holdDays, RISK_LABEL, type ReleaseHeader, type TaskInput } from "@/lib/releases/model";
import { REL_ID, SRC, overviewOf, task } from "./fixtures/release-overview";
import { summarizeReleases } from "@/lib/releases/summary";

const NOW = new Date("2026-11-11T05:00:00Z"); // 11 Nov 2026 WIB
const tasks = (statuses: string[]): TaskInput[] => statuses.map((s, i) => task(100 + i, s));
const header = (over: Partial<ReleaseHeader> = {}): ReleaseHeader => ({
  startDate: "2026-11-01", targetDate: "2026-11-21", releasedOn: null, ...over,
});
const agg = (h: ReleaseHeader, ts: TaskInput[]) =>
  aggregateRelease(h, [computeRelease({ ...h, rangeStart: 100, rangeEnd: 200 }, ts, NOW)], NOW);

describe("aggregateRelease dengan hold", () => {
  it("tanpa hold: risk = wouldBeRisk, heldAt dan holdReason null", () => {
    const a = agg(header(), tasks(["done", "pending", "pending", "pending"]));
    expect(a.heldAt).toBeNull();
    expect(a.holdReason).toBeNull();
    expect(a.risk).toBe(a.wouldBeRisk);
  });

  it("ditahan: risk on_hold menggantikan peringatan; wouldBeRisk tetap hasil hitungan otomatis", () => {
    const late = header({ targetDate: "2026-11-05" }); // sudah lewat dan belum selesai -> Overdue
    const free = agg(late, tasks(["done", "pending"]));
    expect(free.risk).toBe("overdue");

    const held = agg({ ...late, heldAt: "2026-11-03T01:00:00Z", holdReason: "Menunggu API" }, tasks(["done", "pending"]));
    expect(held.risk).toBe("on_hold");
    expect(held.wouldBeRisk).toBe("overdue");
    expect(held.heldAt).toBe("2026-11-03T01:00:00Z");
    expect(held.holdReason).toBe("Menunggu API");
  });

  it("hold tidak mengubah angka: total, selesai, persen, selisih, dan sisa hari sama", () => {
    const ts = tasks(["done", "done", "pending", "in-progress", "blocked"]);
    const a = agg(header(), ts);
    const b = agg(header({ heldAt: "2026-11-05T00:00:00Z", holdReason: "x" }), ts);
    const pick = (s: ReturnType<typeof agg>) => [s.total, s.done, s.percentDone, s.gap, s.daysLeft, s.elapsedPercent, s.attentionCount, s.riskComponents];
    expect(pick(b)).toEqual(pick(a));
  });

  it("ditahan tanpa task tetap on_hold (menggantikan 'No tasks')", () => {
    const a = agg(header({ heldAt: "2026-11-05T00:00:00Z", holdReason: "x" }), []);
    expect([a.risk, a.wouldBeRisk]).toEqual(["on_hold", "empty"]);
  });

  it("sudah rilis tidak pernah dianggap ditahan, walau datanya masih membawa heldAt", () => {
    const a = agg(header({ releasedOn: "2026-11-10", heldAt: "2026-11-05T00:00:00Z", holdReason: "x" }), tasks(["done"]));
    expect(a.risk).toBe("released");
    expect([a.heldAt, a.holdReason]).toEqual([null, null]);
  });

  it("heldAt tanpa holdReason: holdReason null", () => {
    const a = agg(header({ heldAt: "2026-11-05T00:00:00Z" }), tasks(["pending"]));
    expect([a.risk, a.holdReason]).toEqual(["on_hold", null]);
  });

  it("label tampilan 'On hold'", () => {
    expect(RISK_LABEL.on_hold).toBe("On hold");
  });
});

describe("holdDays", () => {
  it("hari kalender WIB sejak ditahan; 0 pada hari yang sama", () => {
    expect(holdDays("2026-11-11T01:00:00Z", NOW)).toBe(0);
    expect(holdDays("2026-11-08T01:00:00Z", NOW)).toBe(3);
  });

  it("memakai tanggal WIB, bukan UTC (17:30 UTC sudah hari berikutnya di WIB)", () => {
    expect(holdDays("2026-11-10T17:30:00Z", NOW)).toBe(0); // 11 Nov 00:30 WIB
    expect(holdDays("2026-11-10T16:30:00Z", NOW)).toBe(1); // 10 Nov 23:30 WIB
  });

  it("waktu di masa depan tidak pernah negatif", () => {
    expect(holdDays("2026-12-01T00:00:00Z", NOW)).toBe(0);
  });
});

describe("ringkasan Dashboard dengan release ditahan", () => {
  it("risiko pada baris release adalah on_hold, bukan peringatan otomatis", () => {
    const o = overviewOf([{ tasks: tasks(["done", "pending"]), sourceId: SRC }], {
      now: "2026-11-30", heldAt: "2026-11-25T00:00:00Z", holdReason: "Menunggu keputusan",
    });
    const s = summarizeReleases([o]).get(SRC)!;
    expect(s.releaseId).toBe(REL_ID);
    expect(s.risk).toBe("on_hold");
    expect(o.stats.wouldBeRisk).toBe("overdue");
  });
});
