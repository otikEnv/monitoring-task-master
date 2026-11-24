// Tipe dan aturan murni fitur Notes dan Calendar (PRD-Note.md). Tanpa jaringan/database: aman dipakai di klien.

export const NOTE_KINDS = ["meeting", "decision", "general"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  meeting: "Meeting",
  decision: "Decision",
  general: "General",
};

export const LINK_KINDS = ["source", "release", "task"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const HOLIDAY_KINDS = ["national", "collective_leave"] as const;
export type HolidayKind = (typeof HOLIDAY_KINDS)[number];

export const HOLIDAY_KIND_LABEL: Record<HolidayKind, string> = {
  national: "National holiday",
  collective_leave: "Collective leave",
};

/** Batas panjang (sama dengan constraint database). */
export const LIMITS = {
  title: 200,
  body: 20_000,
  item: 500,
  comment: 2_000,
  holidayName: 200,
  tag: 100,
  taskId: 50,
  /** Batas wajar jumlah tautan dan action item per catatan. */
  links: 30,
  items: 50,
} as const;

export const isNoteKind = (v: unknown): v is NoteKind => typeof v === "string" && (NOTE_KINDS as readonly string[]).includes(v);
export const isHolidayKind = (v: unknown): v is HolidayKind =>
  typeof v === "string" && (HOLIDAY_KINDS as readonly string[]).includes(v);

/** Tanggal hari ini (yyyy-mm-dd) menurut Asia/Jakarta: tanggal bawaan catatan baru. */
export function todayWib(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

/**
 * Action item yang dianggap "terbuka" untuk penanda Overdue dan Calendar: belum selesai dan belum dibawa ke
 * catatan Follow up (agar tidak dihitung dua kali).
 */
export function isOpenItem(item: { done: boolean; carriedToId: string | null }): boolean {
  return !item.done && item.carriedToId === null;
}

/** Overdue = terbuka dan tenggatnya sudah lewat (sebelum hari ini WIB). */
export function isOverdueItem(
  item: { done: boolean; carriedToId: string | null; dueDate: string | null },
  today: string = todayWib(),
): boolean {
  return isOpenItem(item) && item.dueDate !== null && item.dueDate < today;
}
