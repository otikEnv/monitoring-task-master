import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LinkKind, NoteKind } from "./model";

// Pembacaan Notes memakai klien bersesi pengguna (RLS berlaku: semua pengguna login boleh membaca).

export type NoteRow = {
  id: string;
  title: string;
  noteDate: string;
  kind: NoteKind;
  body: string;
  authorId: string | null;
  authorEmail: string;
  followsUpId: string | null;
  createdAt: string;
  editedAt: string | null;
};

export type ReleaseSnapshot = {
  progressPercent: number;
  done: number;
  total: number;
  risk: string;
  daysLeft: number;
  targetDate: string;
  capturedAt: string;
};

export type NoteLinkRow = {
  id: string;
  kind: LinkKind;
  sourceId: string | null;
  releaseId: string | null;
  tag: string | null;
  taskId: string | null;
  snapshot: ReleaseSnapshot | null;
};

export type ActionItemRow = {
  id: string;
  noteId: string;
  position: number;
  body: string;
  assigneeId: string | null;
  assigneeEmail: string | null;
  dueDate: string | null;
  done: boolean;
  doneAt: string | null;
  carriedToId: string | null;
};

export type CommentRow = {
  id: string;
  noteId: string;
  /** Komentar utama yang dibalas; null = komentar utama. */
  parentId: string | null;
  /** Komentar utama yang dihapus penulisnya tetapi masih punya balasan; isinya kosong. */
  deletedAt: string | null;
  body: string;
  authorId: string | null;
  authorEmail: string;
  createdAt: string;
  editedAt: string | null;
};

export type RevisionRow = {
  id: number;
  title: string;
  noteDate: string;
  kind: NoteKind;
  body: string;
  editedByEmail: string;
  createdAt: string;
};

/** Rujukan ringkas ke catatan lain (Follows up / Followed up in). */
export type NoteRef = { id: string; title: string; noteDate: string };

export type NoteDetail = {
  note: NoteRow;
  links: NoteLinkRow[];
  items: ActionItemRow[];
  comments: CommentRow[];
  revisionCount: number;
  followsUp: NoteRef | null;
  followedUpIn: NoteRef[];
};

export const NOTE_COLUMNS = "id, title, note_date, kind, body, author_id, author_email, follows_up_id, created_at, edited_at";
const ITEM_COLUMNS = "id, note_id, position, body, assignee_id, assignee_email, due_date, done, done_at, carried_to_id";
const COMMENT_COLUMNS = "id, note_id, parent_id, deleted_at, body, author_id, author_email, created_at, edited_at";

type NoteDb = {
  id: string; title: string; note_date: string; kind: NoteKind; body: string; author_id: string | null;
  author_email: string; follows_up_id: string | null; created_at: string; edited_at: string | null;
};
type ItemDb = {
  id: string; note_id: string; position: number; body: string; assignee_id: string | null; assignee_email: string | null;
  due_date: string | null; done: boolean; done_at: string | null; carried_to_id: string | null;
};
type CommentDb = {
  id: string; note_id: string; parent_id: string | null; deleted_at: string | null; body: string; author_id: string | null; author_email: string; created_at: string;
  edited_at: string | null;
};
type SnapshotDb = {
  progress_percent: number | string; done: number; total: number; risk: string; days_left: number; target_date: string;
  captured_at: string;
};
type LinkDb = {
  id: string; kind: LinkKind; source_id: string | null; release_id: string | null; tag: string | null; task_id: string | null;
  note_release_snapshots: SnapshotDb | SnapshotDb[] | null;
};

export function toNote(r: NoteDb): NoteRow {
  return {
    id: r.id, title: r.title, noteDate: r.note_date, kind: r.kind, body: r.body, authorId: r.author_id,
    authorEmail: r.author_email, followsUpId: r.follows_up_id, createdAt: r.created_at, editedAt: r.edited_at,
  };
}

export function toItem(r: ItemDb): ActionItemRow {
  return {
    id: r.id, noteId: r.note_id, position: r.position, body: r.body, assigneeId: r.assignee_id,
    assigneeEmail: r.assignee_email, dueDate: r.due_date, done: r.done, doneAt: r.done_at, carriedToId: r.carried_to_id,
  };
}

const toComment = (r: CommentDb): CommentRow => ({
  id: r.id, noteId: r.note_id, parentId: r.parent_id, deletedAt: r.deleted_at, body: r.body, authorId: r.author_id, authorEmail: r.author_email,
  createdAt: r.created_at, editedAt: r.edited_at,
});

function toLink(r: LinkDb): NoteLinkRow {
  const s = Array.isArray(r.note_release_snapshots) ? r.note_release_snapshots[0] ?? null : r.note_release_snapshots;
  return {
    id: r.id, kind: r.kind, sourceId: r.source_id, releaseId: r.release_id, tag: r.tag, taskId: r.task_id,
    snapshot: s
      ? {
          progressPercent: Number(s.progress_percent), done: s.done, total: s.total, risk: s.risk,
          daysLeft: s.days_left, targetDate: s.target_date, capturedAt: s.captured_at,
        }
      : null,
  };
}

export async function getNote(db: SupabaseClient, id: string): Promise<NoteRow | null> {
  const { data, error } = await db.from("notes").select(NOTE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Gagal membaca catatan: ${error.message}`);
  return data ? toNote(data as NoteDb) : null;
}

export async function loadNoteLinks(db: SupabaseClient, noteId: string): Promise<NoteLinkRow[]> {
  const { data, error } = await db
    .from("note_links")
    .select("id, kind, source_id, release_id, tag, task_id, note_release_snapshots (progress_percent, done, total, risk, days_left, target_date, captured_at)")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Gagal membaca tautan catatan: ${error.message}`);
  return (data as unknown as LinkDb[]).map(toLink);
}

export async function loadActionItems(db: SupabaseClient, noteId: string): Promise<ActionItemRow[]> {
  const { data, error } = await db
    .from("note_action_items").select(ITEM_COLUMNS).eq("note_id", noteId).order("position", { ascending: true });
  if (error) throw new Error(`Gagal membaca action item: ${error.message}`);
  return (data as ItemDb[]).map(toItem);
}

/** Catatan lengkap untuk halaman detail; null bila tidak ada. */
export async function getNoteDetail(db: SupabaseClient, id: string): Promise<NoteDetail | null> {
  const note = await getNote(db, id);
  if (!note) return null;

  const [links, items, comments, revisions, followsUp, followed] = await Promise.all([
    loadNoteLinks(db, id),
    loadActionItems(db, id),
    db.from("note_comments").select(COMMENT_COLUMNS).eq("note_id", id)
      .order("created_at", { ascending: true }).order("id", { ascending: true }),
    db.from("note_revisions").select("id", { count: "exact", head: true }).eq("note_id", id),
    note.followsUpId
      ? db.from("notes").select("id, title, note_date").eq("id", note.followsUpId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from("notes").select("id, title, note_date").eq("follows_up_id", id).order("note_date", { ascending: true }),
  ]);
  for (const r of [comments, revisions, followsUp, followed]) {
    if (r.error) throw new Error(`Gagal membaca catatan: ${r.error.message}`);
  }
  const ref = (r: { id: string; title: string; note_date: string }): NoteRef => ({ id: r.id, title: r.title, noteDate: r.note_date });
  return {
    note,
    links,
    items,
    comments: (comments.data as CommentDb[]).map(toComment),
    revisionCount: revisions.count ?? 0,
    followsUp: followsUp.data ? ref(followsUp.data as { id: string; title: string; note_date: string }) : null,
    followedUpIn: ((followed.data ?? []) as { id: string; title: string; note_date: string }[]).map(ref),
  };
}

/** Versi lama catatan, terbaru di atas. */
export async function loadRevisions(db: SupabaseClient, noteId: string): Promise<RevisionRow[]> {
  const { data, error } = await db
    .from("note_revisions")
    .select("id, title, note_date, kind, body, edited_by_email, created_at")
    .eq("note_id", noteId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(`Gagal membaca riwayat catatan: ${error.message}`);
  return (data as { id: number; title: string; note_date: string; kind: NoteKind; body: string; edited_by_email: string; created_at: string }[])
    .map((r) => ({
      id: Number(r.id), title: r.title, noteDate: r.note_date, kind: r.kind, body: r.body,
      editedByEmail: r.edited_by_email, createdAt: r.created_at,
    }));
}
