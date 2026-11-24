import { describe, expect, it } from "vitest";
import {
  addDays, buildDays, calendarHref, cellSlice, countByKind, mondayOf, navHrefs, parseCalendarParams, periodLabel, visibleDays,
  type CalendarItem,
} from "@/lib/calendar/model";

// 24 Nov 2026 (Selasa) 10:00 WIB
const NOW = new Date("2026-11-24T03:00:00Z");
const APP = "11111111-1111-4111-8111-111111111111";

const note = (id: string, date: string, createdAt = "2026-11-01T00:00:00Z"): CalendarItem =>
  ({ kind: "note", id, date, title: id, noteKind: "meeting", createdAt });
const release = (id: string, date: string, event: "start" | "target" | "released" = "target"): CalendarItem =>
  ({ kind: "release", id, date, name: id, event, risk: "on_track", onHold: false, createdAt: "2026-10-01T00:00:00Z" });
const item = (id: string, date: string): CalendarItem =>
  ({ kind: "item", id, date, noteId: "n", body: id, overdue: false, createdAt: "2026-10-01T00:00:00Z" });

describe("tanggal", () => {
  it("addDays melewati batas bulan dan tahun; Senin dari minggu", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(mondayOf("2026-11-24")).toBe("2026-11-23");
    expect(mondayOf("2026-11-29")).toBe("2026-11-23"); // Minggu
    expect(mondayOf("2026-11-23")).toBe("2026-11-23");
  });

  it("Month: minggu penuh Senin..Minggu yang mencakup seluruh bulan", () => {
    const nov = visibleDays({ view: "month", month: "2026-11", week: "" });
    expect(nov[0]).toBe("2026-10-26");
    expect(nov.at(-1)).toBe("2026-12-06");
    expect(nov.length % 7).toBe(0);
    const feb = visibleDays({ view: "month", month: "2027-02", week: "" });
    expect(feb[0]).toBe("2027-02-01");
    expect(feb).toHaveLength(28);
  });

  it("Week: tujuh hari dari Senin", () => {
    expect(visibleDays({ view: "week", month: "", week: "2026-11-23" })).toEqual([
      "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29",
    ]);
  });
});

describe("parseCalendarParams", () => {
  it("bawaan: Month bulan ini (WIB), semua jenis", () => {
    expect(parseCalendarParams({}, new Date("2026-11-30T18:00:00Z"))).toEqual({
      view: "month", month: "2026-12", week: "2026-11-30", date: null,
      show: ["notes", "releases", "items", "holidays"], app: null, type: null,
    });
  });

  it("nilai valid dibaca; week dibulatkan ke Senin; tidak valid diabaikan", () => {
    expect(parseCalendarParams({ view: "week", week: "2026-11-26", date: "2026-11-27", show: "notes,holidays,x", app: APP, type: "decision" }, NOW))
      .toMatchObject({ view: "week", week: "2026-11-23", date: "2026-11-27", show: ["notes", "holidays"], app: APP, type: "decision" });
    expect(parseCalendarParams({ month: "2026-13", date: "2026-02-30", app: "x", type: "rapat" }, NOW))
      .toMatchObject({ month: "2026-11", date: null, app: null, type: null });
    expect(parseCalendarParams({ show: "" }, NOW).show).toEqual([]);
  });

  it("tanpa month tapi dengan date: bulan dari tanggal itu", () => {
    expect(parseCalendarParams({ date: "2027-03-10" }, NOW).month).toBe("2027-03");
  });
});

describe("tautan", () => {
  const p = parseCalendarParams({}, NOW);
  it("nilai bawaan tidak ditulis", () => {
    expect(calendarHref(p, {}, NOW)).toBe("/calendar");
    expect(calendarHref(p, { month: "2026-12" }, NOW)).toBe("/calendar?month=2026-12");
    expect(calendarHref(p, { view: "week" }, NOW)).toBe("/calendar?view=week");
    expect(calendarHref(p, { show: ["notes"], app: APP, type: "general", date: "2026-11-24" }, NOW))
      .toBe(`/calendar?date=2026-11-24&show=notes&app=${APP}&type=general`);
  });

  it("sebelumnya/berikutnya/Today menutup panel hari dan mempertahankan filter", () => {
    const n = navHrefs({ ...p, date: "2026-11-24", type: "meeting" }, NOW);
    expect(n.prev).toBe("/calendar?month=2026-10&type=meeting");
    expect(n.next).toBe("/calendar?month=2026-12&type=meeting");
    expect(n.today).toBe("/calendar?type=meeting");
    const w = navHrefs({ ...p, view: "week", week: "2026-11-23" }, NOW);
    expect(w.prev).toBe("/calendar?view=week&week=2026-11-16");
    expect(w.today).toBe("/calendar?view=week");
  });

  it("judul periode", () => {
    expect(periodLabel({ ...p, month: "2026-11" })).toBe("November 2026");
    expect(periodLabel({ ...p, view: "week", week: "2026-11-23" })).toBe("23 – 29 Nov 2026");
    expect(periodLabel({ ...p, view: "week", week: "2026-11-30" })).toBe("30 Nov – 6 Dec 2026");
  });
});

describe("buildDays dan sel", () => {
  const p = parseCalendarParams({}, NOW);
  const days = visibleDays(p);
  const data = {
    items: [
      note("n2", "2026-11-24", "2026-11-24T02:00:00Z"),
      note("n1", "2026-11-24", "2026-11-24T01:00:00Z"),
      item("i1", "2026-11-24"),
      release("r1", "2026-11-24"),
      note("n3", "2026-11-24"),
      release("r2", "2026-12-25", "start"),
    ],
    holidays: [{ date: "2026-12-25", name: "Christmas Day", kind: "national" as const }],
  };

  it("urutan release, action item, catatan; catatan menurut waktu dibuat", () => {
    const cell = buildDays(days, data, p, NOW).find((c) => c.date === "2026-11-24")!;
    expect(cell.items.map((i) => i.id)).toEqual(["r1", "i1", "n3", "n1", "n2"]);
    expect(cell.today).toBe(true);
    expect(cell.weekend).toBe(false);
  });

  it("batas 3 item dengan +N more; libur tidak dihitung", () => {
    const cell = buildDays(days, data, p, NOW).find((c) => c.date === "2026-11-24")!;
    expect(cellSlice(cell.items)).toMatchObject({ more: 2 });
    expect(cellSlice(cell.items).shown).toHaveLength(3);
    expect(cellSlice(cell.items.slice(0, 3)).more).toBe(0);
    expect(countByKind(cell.items)).toEqual({ release: 1, item: 1, note: 3 });
  });

  it("filter jenis item menyembunyikan item dan mengurangi hitungan", () => {
    const cells = buildDays(days, data, { ...p, show: ["releases", "holidays"] }, NOW);
    expect(cells.find((c) => c.date === "2026-11-24")!.items.map((i) => i.id)).toEqual(["r1"]);
    const noHolidays = buildDays(days, data, { ...p, show: ["notes"] }, NOW);
    expect(noHolidays.some((c) => c.holiday)).toBe(false);
  });

  it("tanggal di luar bulan ditandai; akhir pekan ditandai", () => {
    const cells = buildDays(days, data, p, NOW);
    expect(cells.find((c) => c.date === "2026-10-26")!.outside).toBe(true);
    expect(cells.find((c) => c.date === "2026-11-28")!.weekend).toBe(true);
    const dec = buildDays(visibleDays({ ...p, month: "2026-12" }), data, { ...p, month: "2026-12" }, NOW);
    expect(dec.find((c) => c.date === "2026-12-25")!.holiday?.name).toBe("Christmas Day");
  });
});
