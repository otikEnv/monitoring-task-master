import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { NoteKind } from "./validate";

/** Jumlah entri Activity per halaman (PRD-Release-Hold-Catatan.md). */
export const NOTES_PAGE_SIZE = 20;

/** Satu entri log release, seperti ditampilkan. Isi versi sebelumnya sengaja tidak dibaca. */
export type ReleaseNoteRow = {
  id: string;
  releaseId: string;
  kind: NoteKind;
  body: string;
  /** Hanya untuk target_change. */
  oldTargetDate: string | null;
  newTargetDate: string | null;
  authorEmail: string;
  createdAt: string;
  editedAt: string | null;
  editedByEmail: string | null;
};

export type NotesPage = {
  rows: ReleaseNoteRow[];
  total: number;
  /** Halaman yang benar-benar dipakai (dipotong ke halaman terakhir bila melewati akhir). */
  page: number;
  pageCount: number;
  pageSize: number;
};

/** Catatan bebas terbaru sebuah release, untuk satu baris di kartu. */
export type LatestNote = { id: string; body: string; createdAt: string };

const NOTE_COLUMNS =
  "id, release_id, kind, body, old_target_date, new_target_date, author_email, created_at, edited_at, edited_by_email";

type NoteDbRow = {
  id: string; release_id: string; kind: NoteKind; body: string; old_target_date: string | null;
  new_target_date: string | null; author_email: string; created_at: string; edited_at: string | null;
  edited_by_email: string | null;
};

export function toNote(r: NoteDbRow): ReleaseNoteRow {
  return {
    id: r.id,
    releaseId: r.release_id,
    kind: r.kind,
    body: r.body,
    oldTargetDate: r.old_target_date,
    newTargetDate: r.new_target_date,
    authorEmail: r.author_email,
    createdAt: r.created_at,
    editedAt: r.edited_at,
    editedByEmail: r.edited_by_email,
  };
}

/** Memotong halaman yang diminta ke rentang yang ada; mengembalikan awal baris (offset). */
export function clampNotesPage(requested: number, total: number): { page: number; pageCount: number; from: number } {
  const pageCount = Math.max(1, Math.ceil(total / NOTES_PAGE_SIZE));
  const page = Math.min(Math.max(1, Number.isFinite(requested) ? Math.trunc(requested) : 1), pageCount);
  return { page, pageCount, from: (page - 1) * NOTES_PAGE_SIZE };
}

/**
 * Log Activity sebuah release, terbaru di atas, berhalaman 20. Klien HARUS membawa sesi pengguna (RLS berlaku).
 */
export async function loadReleaseActivity(db: SupabaseClient, releaseId: string, requestedPage = 1): Promise<NotesPage> {
  const head = await db.from("release_notes").select("id", { count: "exact", head: true }).eq("release_id", releaseId);
  if (head.error) throw new Error(`Gagal menghitung catatan: ${head.error.message}`);
  const total = head.count ?? 0;
  const { page, pageCount, from } = clampNotesPage(requestedPage, total);
  if (total === 0) return { rows: [], total, page, pageCount, pageSize: NOTES_PAGE_SIZE };

  const res = await db
    .from("release_notes")
    .select(NOTE_COLUMNS)
    .eq("release_id", releaseId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + NOTES_PAGE_SIZE - 1);
  if (res.error) throw new Error(`Gagal membaca catatan: ${res.error.message}`);
  return { rows: (res.data as unknown as NoteDbRow[]).map(toNote), total, page, pageCount, pageSize: NOTES_PAGE_SIZE };
}

/** Catatan bebas terbaru per release, dalam satu query (view release_latest_note). Release tanpa catatan tidak ada di hasil. */
export async function loadLatestNotes(db: SupabaseClient, releaseIds: string[]): Promise<Map<string, LatestNote>> {
  const out = new Map<string, LatestNote>();
  if (releaseIds.length === 0) return out;
  const res = await db.from("release_latest_note").select("release_id, id, body, created_at").in("release_id", releaseIds);
  if (res.error) throw new Error(`Gagal membaca catatan terbaru: ${res.error.message}`);
  for (const r of res.data as { release_id: string; id: string; body: string; created_at: string }[]) {
    out.set(r.release_id, { id: r.id, body: r.body, createdAt: r.created_at });
  }
  return out;
}

/** Satu entri log menurut id; null bila tidak ada. Klien HARUS membawa sesi pengguna. */
export async function getReleaseNote(db: SupabaseClient, noteId: string): Promise<ReleaseNoteRow | null> {
  const { data, error } = await db.from("release_notes").select(NOTE_COLUMNS).eq("id", noteId).maybeSingle();
  if (error) throw new Error(`Gagal membaca catatan: ${error.message}`);
  return data ? toNote(data as unknown as NoteDbRow) : null;
}

/** Log Activity untuk pengguna yang sedang login (sesi dari cookie). */
export async function getReleaseActivity(releaseId: string, page = 1): Promise<NotesPage> {
  return loadReleaseActivity(await createClient(), releaseId, page);
}
