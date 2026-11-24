// Model Calendar (PRD-Note.md, Halaman Calendar). Murni: tanpa jaringan/database, aman dipakai di klien.
import { isValidDate, UUID } from "@/lib/releases/validate";
import { isNoteKind, todayWib, type HolidayKind, type NoteKind } from "@/lib/notes/model";
import type { RiskLevel } from "@/lib/releases/model";

export const SHOW_KINDS = ["notes", "releases", "items", "holidays"] as const;
export type ShowKind = (typeof SHOW_KINDS)[number];
export const SHOW_LABEL: Record<ShowKind, string> = {
  notes: "Notes",
  releases: "Releases",
  items: "Action items",
  holidays: "Holidays",
};

/** Batas item per sel pada tampilan Month; sisanya "+N more". */
export const MAX_PER_CELL = 3;

export type CalendarView = "month" | "week";

export type CalendarParams = {
  view: CalendarView;
  /** Bulan yang dilihat (yyyy-mm) pada tampilan Month. */
  month: string;
  /** Senin minggu yang dilihat (yyyy-mm-dd) pada tampilan Week. */
  week: string;
  /** Tanggal terpilih (panel hari), atau null. */
  date: string | null;
  show: ShowKind[];
  app: string | null;
  type: NoteKind | null;
};

export type CalendarItem =
  | { kind: "note"; id: string; date: string; title: string; noteKind: NoteKind; createdAt: string }
  | {
      kind: "release"; id: string; date: string; name: string; event: "start" | "target" | "released";
      risk: RiskLevel; onHold: boolean; createdAt: string;
    }
  | { kind: "item"; id: string; date: string; noteId: string; body: string; overdue: boolean; createdAt: string };

export type CalendarHoliday = { date: string; name: string; kind: HolidayKind };

export type CalendarData = {
  /** Tanggal pertama dan terakhir yang tampil (inklusif). */
  from: string;
  to: string;
  items: CalendarItem[];
  holidays: CalendarHoliday[];
  /** Tahun dalam rentang yang belum punya data libur. */
  missingHolidayYears: number[];
};

// ---------------------------------------------------------------------------
// Tanggal (yyyy-mm-dd sebagai tanggal kalender, tanpa zona waktu)
// ---------------------------------------------------------------------------

const toDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toYmd = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(ymd: string, n: number): string {
  const d = toDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return toYmd(d);
}

/** 0 = Senin … 6 = Minggu. */
export function weekdayIndex(ymd: string): number {
  return (toDate(ymd).getUTCDay() + 6) % 7;
}

export const isWeekend = (ymd: string) => weekdayIndex(ymd) >= 5;

/** Senin dari minggu yang memuat tanggal ini. */
export const mondayOf = (ymd: string) => addDays(ymd, -weekdayIndex(ymd));

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return toYmd(d).slice(0, 7);
}

const lastDayOfMonth = (month: string) => addDays(`${addMonths(month, 1)}-01`, -1);

/** Tanggal-tanggal yang tampil: Month = minggu penuh yang mencakup seluruh bulan; Week = Senin..Minggu. */
export function visibleDays(p: Pick<CalendarParams, "view" | "month" | "week">): string[] {
  const start = p.view === "week" ? p.week : mondayOf(`${p.month}-01`);
  const end = p.view === "week" ? addDays(p.week, 6) : addDays(mondayOf(lastDayOfMonth(p.month)), 6);
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

// ---------------------------------------------------------------------------
// Parameter URL
// ---------------------------------------------------------------------------

type RawSearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Membaca searchParams dengan aman. Bawaan: Month bulan ini (Asia/Jakarta), semua jenis item tampil. */
export function parseCalendarParams(sp: RawSearchParams, now: Date = new Date()): CalendarParams {
  const today = todayWib(now);
  const view: CalendarView = first(sp.view) === "week" ? "week" : "month";
  const rawDate = first(sp.date) ?? "";
  const date = isValidDate(rawDate) ? rawDate : null;
  const rawMonth = first(sp.month) ?? "";
  const month = MONTH_RE.test(rawMonth) ? rawMonth : (date ?? today).slice(0, 7);
  const rawWeek = first(sp.week) ?? "";
  const week = mondayOf(isValidDate(rawWeek) ? rawWeek : date ?? today);
  const rawShow = first(sp.show);
  const show = rawShow === undefined
    ? [...SHOW_KINDS]
    : SHOW_KINDS.filter((k) => rawShow.split(",").includes(k));
  const app = first(sp.app)?.trim() ?? "";
  const type = first(sp.type);
  return {
    view, month, week, date, show,
    app: UUID.test(app) ? app.toLowerCase() : null,
    type: isNoteKind(type) ? type : null,
  };
}

/** URL pendek: nilai bawaan tidak ditulis. */
export function calendarHref(p: CalendarParams, override: Partial<CalendarParams> = {}, now: Date = new Date()): string {
  const n = { ...p, ...override };
  const s = new URLSearchParams();
  if (n.view === "week") {
    s.set("view", "week");
    if (n.week !== mondayOf(todayWib(now))) s.set("week", n.week);
  } else if (n.month !== todayWib(now).slice(0, 7)) {
    s.set("month", n.month);
  }
  if (n.date) s.set("date", n.date);
  if (n.show.length !== SHOW_KINDS.length) s.set("show", n.show.join(","));
  if (n.app) s.set("app", n.app);
  if (n.type) s.set("type", n.type);
  const qs = s.toString();
  return qs ? `/calendar?${qs}` : "/calendar";
}

/** Tautan sebelumnya, berikutnya, dan Today. Mengganti periode menutup panel hari. */
export function navHrefs(p: CalendarParams, now: Date = new Date()) {
  const today = todayWib(now);
  if (p.view === "week") {
    return {
      prev: calendarHref(p, { week: addDays(p.week, -7), date: null }, now),
      next: calendarHref(p, { week: addDays(p.week, 7), date: null }, now),
      today: calendarHref(p, { week: mondayOf(today), date: null }, now),
    };
  }
  return {
    prev: calendarHref(p, { month: addMonths(p.month, -1), date: null }, now),
    next: calendarHref(p, { month: addMonths(p.month, 1), date: null }, now),
    today: calendarHref(p, { month: today.slice(0, 7), date: null }, now),
  };
}

/** Judul periode: "November 2026" atau "23 – 29 Nov 2026". */
export function periodLabel(p: CalendarParams): string {
  if (p.view === "month") {
    return toDate(`${p.month}-01`).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
  }
  const end = addDays(p.week, 6);
  const fmt = (ymd: string, opts: Intl.DateTimeFormatOptions) => toDate(ymd).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
  const sameMonth = p.week.slice(0, 7) === end.slice(0, 7);
  return sameMonth
    ? `${fmt(p.week, { day: "numeric" })} – ${fmt(end, { day: "numeric", month: "short", year: "numeric" })}`
    : `${fmt(p.week, { day: "numeric", month: "short" })} – ${fmt(end, { day: "numeric", month: "short", year: "numeric" })}`;
}

// ---------------------------------------------------------------------------
// Pengelompokan
// ---------------------------------------------------------------------------

const ORDER: Record<CalendarItem["kind"], number> = { release: 0, item: 1, note: 2 };

/** Urutan dalam satu hari: release, action item, lalu catatan; dalam jenis yang sama menurut waktu dibuat. */
export function compareItems(a: CalendarItem, b: CalendarItem): number {
  return ORDER[a.kind] - ORDER[b.kind] || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

export type DayCell = {
  date: string;
  items: CalendarItem[];
  holiday: CalendarHoliday | null;
  weekend: boolean;
  today: boolean;
  /** Di luar bulan yang dilihat (tampilan Month). */
  outside: boolean;
};

/** Sel per tanggal yang tampil, item sudah urut dan disaring menurut `show`. */
export function buildDays(days: string[], data: Pick<CalendarData, "items" | "holidays">, p: CalendarParams, now: Date = new Date()): DayCell[] {
  const today = todayWib(now);
  const show = new Set(p.show);
  const byDay = new Map<string, CalendarItem[]>();
  for (const it of data.items) {
    const key = it.kind === "note" ? "notes" : it.kind === "release" ? "releases" : "items";
    if (!show.has(key)) continue;
    const list = byDay.get(it.date) ?? [];
    list.push(it);
    byDay.set(it.date, list);
  }
  const holidays = new Map(show.has("holidays") ? data.holidays.map((h) => [h.date, h]) : []);
  return days.map((date) => ({
    date,
    items: (byDay.get(date) ?? []).sort(compareItems),
    holiday: holidays.get(date) ?? null,
    weekend: isWeekend(date),
    today: date === today,
    outside: p.view === "month" && date.slice(0, 7) !== p.month,
  }));
}

/** Item yang tampil di sel Month dan jumlah sisanya. */
export function cellSlice(items: CalendarItem[], max = MAX_PER_CELL): { shown: CalendarItem[]; more: number } {
  return items.length <= max ? { shown: items, more: 0 } : { shown: items.slice(0, max), more: items.length - max };
}

/** Jumlah item per jenis, untuk titik di sel ponsel. */
export function countByKind(items: CalendarItem[]): Partial<Record<CalendarItem["kind"], number>> {
  const out: Partial<Record<CalendarItem["kind"], number>> = {};
  for (const it of items) out[it.kind] = (out[it.kind] ?? 0) + 1;
  return out;
}

export const RELEASE_EVENT_LABEL = { start: "Start", target: "Target", released: "Released" } as const;
