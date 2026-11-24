import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/calendar/model";
import { loadHolidays, type Holiday } from "@/lib/notes/holidays";
import { todayWib, type NoteKind } from "@/lib/notes/model";

/** Cookie status lipat kartu Notes di Dashboard ("false" = dilipat). */
export const NOTES_CARD_COOKIE = "notes_card_open";
export const MAX_OVERDUE = 5;
export const HOLIDAY_DAYS = 14;

export type OverdueItem = { id: string; noteId: string; noteTitle: string; body: string; dueDate: string; assigneeEmail: string | null; mine: boolean };

export type NotesSummary = {
  today: { id: string; title: string; kind: NoteKind }[];
  overdue: OverdueItem[];
  overdueTotal: number;
  /** Tenggat terlama di antara action item yang lewat tenggat (untuk tautan View all ke Calendar). */
  oldestDue: string | null;
  holidays: Holiday[];
};

/**
 * Ringkasan kartu Notes: catatan bertanggal hari ini, action item yang lewat tenggat (belum selesai, bukan Carried
 * over; milik pengguna lebih dulu, maksimal 5), dan libur dalam 14 hari ke depan. Klien HARUS membawa sesi pengguna.
 */
export async function loadNotesSummary(db: SupabaseClient, userId: string, now: Date = new Date()): Promise<NotesSummary> {
  const today = todayWib(now);
  const [notes, items, holidays] = await Promise.all([
    db.from("notes").select("id, title, kind").eq("note_date", today).order("created_at", { ascending: true }),
    db.from("note_action_items")
      .select("id, note_id, body, due_date, assignee_id, assignee_email, notes (title)")
      .eq("done", false)
      .is("carried_to_id", null)
      .lt("due_date", today)
      .order("due_date", { ascending: true }),
    loadHolidays(db, today, addDays(today, HOLIDAY_DAYS)),
  ]);
  for (const r of [notes, items]) if (r.error) throw new Error(`Gagal membaca ringkasan catatan: ${r.error.message}`);

  type ItemDb = {
    id: string; note_id: string; body: string; due_date: string; assignee_id: string | null; assignee_email: string | null;
    notes: { title: string } | { title: string }[] | null;
  };
  const all = (items.data as unknown as ItemDb[]).map((r): OverdueItem => {
    const n = Array.isArray(r.notes) ? r.notes[0] : r.notes;
    return {
      id: r.id, noteId: r.note_id, noteTitle: n?.title ?? "", body: r.body, dueDate: r.due_date,
      assigneeEmail: r.assignee_email, mine: r.assignee_id === userId,
    };
  });
  // Milik pengguna dulu; di dalamnya tenggat terlama dulu (urutan dari database dipertahankan: sort stabil).
  const sorted = [...all].sort((a, b) => Number(b.mine) - Number(a.mine));
  return {
    today: notes.data as { id: string; title: string; kind: NoteKind }[],
    overdue: sorted.slice(0, MAX_OVERDUE),
    overdueTotal: all.length,
    oldestDue: all[0]?.dueDate ?? null,
    holidays,
  };
}
