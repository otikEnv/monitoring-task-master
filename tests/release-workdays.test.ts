import { describe, expect, it } from "vitest";
import { formatDaysLeft, formatSnapshotDaysLeft } from "@/lib/releases/format";
import { aggregateRelease, computeRelease, releaseTime } from "@/lib/releases/model";
import { WEEKENDS_ONLY, isWorkingDay, workTimeProgress, workingDaysBetween, yearsInRange } from "@/lib/releases/workdays";

// Data libur 2026 di sekitar Desember (sesuai migrasi): 24 Des cuti bersama, 25 Des libur nasional.
const CAL = { holidays: new Set(["2026-12-24", "2026-12-25", "2026-11-28" /* Sabtu: tidak mengurangi apa pun */]) };

describe("isWorkingDay", () => {
  it("akhir pekan dan libur bukan hari kerja", () => {
    expect(isWorkingDay("2026-11-24", CAL)).toBe(true); // Selasa
    expect(isWorkingDay("2026-11-28", CAL)).toBe(false); // Sabtu
    expect(isWorkingDay("2026-11-29", CAL)).toBe(false); // Minggu
    expect(isWorkingDay("2026-12-24", CAL)).toBe(false); // cuti bersama
    expect(isWorkingDay("2026-12-25", CAL)).toBe(false); // libur nasional
    expect(isWorkingDay("2026-12-24", WEEKENDS_ONLY)).toBe(true);
  });
});

describe("workingDaysBetween (from, to]", () => {
  it("sama dengan hitungan satu per satu untuk banyak rentang", () => {
    const slow = (a: string, b: string) => {
      let n = 0;
      for (let d = new Date(`${a}T00:00:00Z`); ; ) {
        d.setUTCDate(d.getUTCDate() + 1);
        const ymd = d.toISOString().slice(0, 10);
        if (ymd > b) break;
        if (isWorkingDay(ymd, CAL)) n++;
      }
      return n;
    };
    for (const [a, b] of [
      ["2026-11-13", "2026-12-24"], ["2026-11-24", "2026-11-30"], ["2026-11-27", "2026-11-30"],
      ["2026-12-20", "2027-01-10"], ["2026-11-24", "2026-11-24"], ["2026-11-01", "2027-02-01"],
    ]) {
      expect(workingDaysBetween(a, b, CAL)).toBe(slow(a, b));
    }
    expect(workingDaysBetween("2026-12-01", "2026-11-01", CAL)).toBe(0);
  });
});

describe("workTimeProgress", () => {
  it("release 2.3 (13 Nov → 24 Des 2026), dilihat 24 Nov: cocok dengan hitungan manual", () => {
    // Hari kerja (13 Nov, 24 Des] = 28 (24 Des cuti bersama); lewat (13 Nov, 24 Nov] = 7; sisa (24 Nov, 24 Des] = 21.
    const t = workTimeProgress("2026-11-13", "2026-12-24", "2026-11-24", CAL);
    expect(t.workingDaysLeft).toBe(21);
    expect(t.daysLeft).toBe(30);
    expect(t.elapsedPercent).toBeCloseTo(25, 5);
  });

  it("release echo 1.0 (13 Nov → 30 Nov 2026), dilihat 24 Nov", () => {
    const t = workTimeProgress("2026-11-13", "2026-11-30", "2026-11-24", CAL);
    expect(t.workingDaysLeft).toBe(4);
    expect(Math.round(t.elapsedPercent)).toBe(64);
  });

  it("target di hari libur: dihitung sampai tanggal itu (hari libur tidak menambah)", () => {
    const t = workTimeProgress("2026-12-21", "2026-12-25", "2026-12-21", CAL);
    expect(t.workingDaysLeft).toBe(2); // 22 dan 23 Des
    expect(t.daysLeft).toBe(4);
  });

  it("rentang tanpa hari kerja memakai aturan rentang nol hari", () => {
    expect(workTimeProgress("2026-12-24", "2026-12-27", "2026-12-24", CAL).elapsedPercent).toBe(0);
    expect(workTimeProgress("2026-12-24", "2026-12-27", "2026-12-27", CAL).elapsedPercent).toBe(100);
  });

  it("sebelum mulai 0%, setelah target 100%; daysLeft tetap kalender (Overdue)", () => {
    expect(workTimeProgress("2026-12-01", "2026-12-31", "2026-11-20", CAL).elapsedPercent).toBe(0);
    const late = workTimeProgress("2026-11-01", "2026-11-20", "2026-11-24", CAL);
    expect(late.elapsedPercent).toBe(100);
    expect(late.daysLeft).toBe(-4);
    expect(late.workingDaysLeft).toBe(0);
  });

  it("tahun tanpa data libur: hanya akhir pekan yang dilewati", () => {
    const t = workTimeProgress("2028-01-03", "2028-01-14", "2028-01-03", WEEKENDS_ONLY);
    expect(t.workingDaysLeft).toBe(9);
    expect(yearsInRange("2026-11-13", "2028-01-14")).toEqual([2026, 2027, 2028]);
  });
});

describe("model release memakai kalender kerja bila diberikan", () => {
  const now = new Date("2026-11-24T03:00:00Z");
  const def = { name: "v", startDate: "2026-11-13", targetDate: "2026-12-24", releasedOn: null, rangeStart: 1, rangeEnd: 4 };
  const tasks = [1, 2, 3, 4].map((i) => ({
    taskId: String(i), title: `t${i}`, status: i === 1 ? "done" : "pending", priority: null, dependencies: [], subtasksTotal: 0, subtasksDone: 0,
  }));

  it("tanpa kalender: perilaku lama (hari kalender, workingDaysLeft null)", () => {
    const s = computeRelease(def, tasks, now);
    expect(s.workingDaysLeft).toBeNull();
    expect(Math.round(s.elapsedPercent)).toBe(27);
    expect(releaseTime(def.startDate, def.targetDate, now).workingDaysLeft).toBeNull();
  });

  it("dengan kalender: persen waktu dan sisa hari kerja; Overdue tidak berubah", () => {
    const s = computeRelease(def, tasks, now, CAL);
    expect(s.workingDaysLeft).toBe(21);
    expect(s.elapsedPercent).toBeCloseTo(25, 5);
    expect(s.daysLeft).toBe(30);
    const agg = aggregateRelease({ ...def, heldAt: null, holdReason: null }, [s], now, CAL);
    expect(agg.workingDaysLeft).toBe(21);
    expect(agg.gap).toBeCloseTo(0, 5); // 25% waktu, 25% selesai
    const late = computeRelease({ ...def, targetDate: "2026-11-20" }, tasks, now, CAL);
    expect(late.risk).toBe("overdue");
  });
});

describe("format", () => {
  it("working days left; tomorrow, today, dan overdue tetap", () => {
    expect(formatDaysLeft(30, 21)).toBe("21 working days left");
    expect(formatDaysLeft(3, 1)).toBe("1 working day left");
    expect(formatDaysLeft(1, 1)).toBe("tomorrow");
    expect(formatDaysLeft(0, 0)).toBe("today");
    expect(formatDaysLeft(-2, 0)).toBe("2 days overdue");
    expect(formatDaysLeft(10)).toBe("10 days left");
    expect(formatSnapshotDaysLeft(12)).toBe("12 working days left");
    expect(formatSnapshotDaysLeft(-1)).toBe("1 day overdue");
  });
});
