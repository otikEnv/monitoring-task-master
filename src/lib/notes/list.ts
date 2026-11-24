import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NOTE_COLUMNS, toNote, type NoteRow } from "./load";
import { NOTES_PAGE_SIZE, likePattern, type NoteListParams } from "./list-params";

export type NoteListRow = NoteRow & { commentCount: number; newComments: number };

export type NoteListPage = {
  rows: NoteListRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

type Db = SupabaseClient;

/**
 * Id catatan yang terkait sebuah aplikasi: tautan aplikasi, tautan task di aplikasi itu, atau tautan release
 * yang punya komponen aplikasi itu.
 */
export async function noteIdsForApp(db: Db, sourceId: string): Promise<string[]> {
  const comps = await db.from("release_components").select("release_id").eq("source_id", sourceId);
  if (comps.error) throw new Error(`Gagal membaca komponen release: ${comps.error.message}`);
  const releaseIds = [...new Set((comps.data as { release_id: string }[]).map((r) => r.release_id))];
  const [bySource, byRelease] = await Promise.all([
    db.from("note_links").select("note_id").eq("source_id", sourceId),
    releaseIds.length > 0
      ? db.from("note_links").select("note_id").in("release_id", releaseIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [bySource, byRelease]) if (r.error) throw new Error(`Gagal membaca tautan catatan: ${r.error.message}`);
  return [...new Set([...(bySource.data ?? []), ...(byRelease.data ?? [])].map((r) => (r as { note_id: string }).note_id))];
}

/** Id catatan yang judul atau isinya memuat kata kunci (teks apa adanya, tanpa wildcard). */
async function noteIdsForQuery(db: Db, q: string): Promise<string[]> {
  const pattern = likePattern(q);
  const [byTitle, byBody] = await Promise.all([
    db.from("notes").select("id").ilike("title", pattern),
    db.from("notes").select("id").ilike("body", pattern),
  ]);
  for (const r of [byTitle, byBody]) if (r.error) throw new Error(`Gagal mencari catatan: ${r.error.message}`);
  return [...new Set([...(byTitle.data ?? []), ...(byBody.data ?? [])].map((r) => (r as { id: string }).id))];
}

/** Irisan daftar id (null = tidak dibatasi). */
function intersect(a: string[] | null, b: string[] | null): string[] | null {
  if (a === null) return b;
  if (b === null) return a;
  const set = new Set(b);
  return a.filter((x) => set.has(x));
}

/** Jumlah komentar dan komentar baru (dari orang lain, setelah pengguna terakhir membuka catatan). */
export async function commentCounts(
  db: Db,
  noteIds: string[],
  userId: string,
): Promise<Map<string, { total: number; fresh: number }>> {
  const out = new Map(noteIds.map((id) => [id, { total: 0, fresh: 0 }]));
  if (noteIds.length === 0) return out;
  const [comments, reads] = await Promise.all([
    db.from("note_comments").select("note_id, author_id, created_at").in("note_id", noteIds),
    db.from("note_reads").select("note_id, last_read_at").eq("user_id", userId).in("note_id", noteIds),
  ]);
  for (const r of [comments, reads]) if (r.error) throw new Error(`Gagal membaca komentar: ${r.error.message}`);
  const lastRead = new Map((reads.data as { note_id: string; last_read_at: string }[]).map((r) => [r.note_id, Date.parse(r.last_read_at)]));
  for (const c of comments.data as { note_id: string; author_id: string | null; created_at: string }[]) {
    const e = out.get(c.note_id);
    if (!e) continue;
    e.total++;
    const seen = lastRead.get(c.note_id) ?? -Infinity;
    if (c.author_id !== userId && Date.parse(c.created_at) > seen) e.fresh++;
  }
  return out;
}

/** Daftar catatan berfilter, terbaru di atas, 10 per halaman. Klien HARUS membawa sesi pengguna (RLS berlaku). */
export async function loadNoteList(db: Db, p: NoteListParams, userId: string): Promise<NoteListPage> {
  let ids: string[] | null = null;
  if (p.app) ids = intersect(ids, await noteIdsForApp(db, p.app));
  if (p.q) ids = intersect(ids, await noteIdsForQuery(db, p.q));
  const empty = { rows: [], total: 0, page: 1, pageCount: 1, pageSize: NOTES_PAGE_SIZE };
  if (ids !== null && ids.length === 0) return empty;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pembangun kueri supabase berganti tipe di tiap langkah
  const filtered = (q: any) => {
    if (p.type) q = q.eq("kind", p.type);
    if (p.from) q = q.gte("note_date", p.from);
    if (p.to) q = q.lte("note_date", p.to);
    if (ids !== null) q = q.in("id", ids);
    return q;
  };

  const head = await filtered(db.from("notes").select("id", { count: "exact", head: true }));
  if (head.error) throw new Error(`Gagal menghitung catatan: ${head.error.message}`);
  const total: number = head.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / NOTES_PAGE_SIZE));
  const page = Math.min(p.page, pageCount);
  if (total === 0) return empty;

  const from = (page - 1) * NOTES_PAGE_SIZE;
  const res = await filtered(db.from("notes").select(NOTE_COLUMNS))
    .order("note_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + NOTES_PAGE_SIZE - 1);
  if (res.error) throw new Error(`Gagal membaca daftar catatan: ${res.error.message}`);
  const notes = (res.data as Parameters<typeof toNote>[0][]).map(toNote);
  const counts = await commentCounts(db, notes.map((n) => n.id), userId);
  return {
    rows: notes.map((n) => ({ ...n, commentCount: counts.get(n.id)?.total ?? 0, newComments: counts.get(n.id)?.fresh ?? 0 })),
    total,
    page,
    pageCount,
    pageSize: NOTES_PAGE_SIZE,
  };
}

/** Aplikasi aktif (tidak terarsip) untuk pilihan filter. */
export async function loadAppOptions(db: Db): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db.from("sources").select("id, name").is("archived_at", null).order("name", { ascending: true });
  if (error) throw new Error(`Gagal membaca aplikasi: ${error.message}`);
  return data as { id: string; name: string }[];
}

export type { NoteRow };
