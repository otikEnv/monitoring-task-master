import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadHolidays, yearsWithHolidays } from "@/lib/notes/holidays";
import { noteIdsForApp } from "@/lib/notes/list";
import { todayWib, type NoteKind } from "@/lib/notes/model";
import { loadReleaseOverviews } from "@/lib/releases/load";
import type { CalendarData, CalendarItem, CalendarParams } from "./model";

type Db = SupabaseClient;

/**
 * Semua yang bertanggal dalam rentang [from, to]: catatan, kejadian release (mulai, target, dirilis), tenggat action
 * item yang masih terbuka, dan libur. Hanya rentang yang dilihat yang dimuat. Klien HARUS membawa sesi pengguna.
 */
export async function loadCalendar(
  db: Db,
  p: Pick<CalendarParams, "show" | "app" | "type">,
  from: string,
  to: string,
  now: Date = new Date(),
): Promise<CalendarData> {
  const show = new Set(p.show);
  const today = todayWib(now);
  const appNoteIds = p.app && (show.has("notes") || show.has("items")) ? await noteIdsForApp(db, p.app) : null;

  const [notes, items, releases, holidays, years] = await Promise.all([
    show.has("notes") ? loadNotes(db, from, to, p.type, appNoteIds) : Promise.resolve([]),
    show.has("items") ? loadItems(db, from, to, appNoteIds, today) : Promise.resolve([]),
    show.has("releases") ? loadReleaseEvents(db, from, to, p.app, now) : Promise.resolve([]),
    show.has("holidays") ? loadHolidays(db, from, to) : Promise.resolve([]),
    show.has("holidays") ? yearsWithHolidays(db, yearsBetween(from, to)) : Promise.resolve(null),
  ]);

  return {
    from,
    to,
    items: [...releases, ...items, ...notes],
    holidays: holidays.map((h) => ({ date: h.date, name: h.name, kind: h.kind })),
    missingHolidayYears: years === null ? [] : yearsBetween(from, to).filter((y) => !years.has(y)),
  };
}

function yearsBetween(from: string, to: string): number[] {
  const out: number[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) out.push(y);
  return out;
}

async function loadNotes(db: Db, from: string, to: string, type: NoteKind | null, ids: string[] | null): Promise<CalendarItem[]> {
  if (ids !== null && ids.length === 0) return [];
  let q = db.from("notes").select("id, title, note_date, kind, created_at").gte("note_date", from).lte("note_date", to);
  if (type) q = q.eq("kind", type);
  if (ids !== null) q = q.in("id", ids);
  const { data, error } = await q;
  if (error) throw new Error(`Gagal membaca catatan: ${error.message}`);
  return (data as { id: string; title: string; note_date: string; kind: NoteKind; created_at: string }[]).map((n) => ({
    kind: "note", id: n.id, date: n.note_date, title: n.title, noteKind: n.kind, createdAt: n.created_at,
  }));
}

async function loadItems(db: Db, from: string, to: string, ids: string[] | null, today: string): Promise<CalendarItem[]> {
  if (ids !== null && ids.length === 0) return [];
  let q = db
    .from("note_action_items")
    .select("id, note_id, body, due_date, created_at")
    .gte("due_date", from)
    .lte("due_date", to)
    .eq("done", false)
    .is("carried_to_id", null);
  if (ids !== null) q = q.in("note_id", ids);
  const { data, error } = await q;
  if (error) throw new Error(`Gagal membaca action item: ${error.message}`);
  return (data as { id: string; note_id: string; body: string; due_date: string; created_at: string }[]).map((r) => ({
    kind: "item", id: r.id, date: r.due_date, noteId: r.note_id, body: r.body, overdue: r.due_date < today, createdAt: r.created_at,
  }));
}

async function loadReleaseEvents(db: Db, from: string, to: string, app: string | null, now: Date): Promise<CalendarItem[]> {
  // Release terarsip tidak tampil; yang sudah rilis tetap tampil (tanggal dirilisnya ada di kalender).
  const overviews = await loadReleaseOverviews(db, { includeReleased: true, ...(app ? { sourceId: app } : {}) }, now);
  const out: CalendarItem[] = [];
  const inRange = (d: string | null): d is string => d !== null && d >= from && d <= to;
  for (const o of overviews) {
    const r = o.release;
    const base = { kind: "release" as const, id: r.id, name: r.name, risk: o.stats.risk, onHold: o.stats.risk === "on_hold", createdAt: r.createdAt };
    if (inRange(r.startDate)) out.push({ ...base, date: r.startDate, event: "start" });
    if (inRange(r.targetDate)) out.push({ ...base, date: r.targetDate, event: "target" });
    if (inRange(r.releasedOn)) out.push({ ...base, date: r.releasedOn, event: "released" });
  }
  return out;
}
