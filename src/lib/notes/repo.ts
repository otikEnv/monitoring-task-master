import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { HolidayInput, LinkInput, NoteInput } from "./validate";

// Semua penulisan Notes lewat service role (fungsi database di migrasi 20261124000000_notes_calendar.sql).
// Fungsi database memeriksa penulis/penanggung jawab sekali lagi; server action tetap wajib memeriksa peran.

/** Pelaku perubahan, selalu dari sesi di server (tidak pernah dari masukan klien). */
export type Actor = { id: string; email: string };

/** Kondisi release saat tautan release pertama kali ditambahkan (PRD-Note.md, Rekaman kondisi release). */
export type ReleaseSnapshotInput = {
  progressPercent: number;
  done: number;
  total: number;
  risk: string;
  daysLeft: number;
  targetDate: string;
};

export class NoteNotFoundError extends Error {
  constructor(what = "Note") {
    super(`${what} not found.`);
    this.name = "NoteNotFoundError";
  }
}
/** Bukan penulisnya (catatan/komentar) atau bukan penulis/penanggung jawab (action item). */
export class NotAllowedError extends Error {
  constructor(message = "Only the author can change this.") {
    super(message);
    this.name = "NotAllowedError";
  }
}
/** Nilai ditolak database (mis. item Follow up yang sudah dibawa). */
export class InvalidNoteError extends Error {
  constructor(message = "The note could not be saved because some values are not valid. Reload and try again.") {
    super(message);
    this.name = "InvalidNoteError";
  }
}
export class DuplicateHolidayError extends Error {
  constructor() {
    super("There is already a holiday on this date.");
    this.name = "DuplicateHolidayError";
  }
}

type RpcError = { code?: string; message?: string };

function noteError(what: string, e: RpcError, notFound = "Note"): Error {
  if (e.code === "P0002") return new NoteNotFoundError(notFound);
  if (e.code === "42501") {
    return new NotAllowedError(
      e.message === "not_allowed"
        ? "Only the note's author or the person assigned can check this item."
        : "Only the author can change this.",
    );
  }
  if (e.code === "23514") return new InvalidNoteError();
  return new Error(`Gagal ${what}: ${e.message}`);
}

const linkPayload = (l: LinkInput, snapshot?: ReleaseSnapshotInput) => {
  if (l.kind === "source") return { kind: l.kind, source_id: l.sourceId };
  if (l.kind === "task") return { kind: l.kind, source_id: l.sourceId, tag: l.tag, task_id: l.taskId };
  return {
    kind: l.kind,
    release_id: l.releaseId,
    ...(snapshot
      ? {
          snapshot: {
            progress_percent: Math.round(Math.min(100, Math.max(0, snapshot.progressPercent)) * 100) / 100,
            done: snapshot.done,
            total: snapshot.total,
            risk: snapshot.risk,
            days_left: snapshot.daysLeft,
            target_date: snapshot.targetDate,
          },
        }
      : {}),
  };
};

/**
 * Menyimpan catatan baru (id null) atau perubahan (hanya penulis) beserta tautan dan action item, atomik.
 * snapshots: kondisi release per releaseId; database hanya menyimpannya untuk tautan release yang BARU.
 * assigneeEmails: email penanggung jawab per id pengguna (dibaca server dari daftar pengguna).
 */
export async function saveNote(
  id: string | null,
  input: NoteInput,
  actor: Actor,
  extra: { snapshots?: Map<string, ReleaseSnapshotInput>; assigneeEmails?: Map<string, string> } = {},
  db: SupabaseClient = createAdminClient(),
): Promise<{ id: string }> {
  const { data, error } = await db.rpc("save_note", {
    p_id: id,
    p_actor: actor.id,
    p_actor_email: actor.email,
    p_note: {
      title: input.title,
      note_date: input.noteDate,
      kind: input.kind,
      body: input.body,
      ...(id === null && input.followsUpId ? { follows_up_id: input.followsUpId } : {}),
    },
    p_links: input.links.map((l) => linkPayload(l, l.kind === "release" ? extra.snapshots?.get(l.releaseId) : undefined)),
    p_items: input.items.map((it) => ({
      ...(it.id ? { id: it.id } : {}),
      body: it.body,
      assignee_id: it.assigneeId,
      assignee_email: it.assigneeId ? extra.assigneeEmails?.get(it.assigneeId) ?? null : null,
      due_date: it.dueDate,
      done: it.done,
      ...(id === null && it.carriedFromId ? { carried_from_id: it.carriedFromId } : {}),
    })),
  });
  if (error) throw noteError("menyimpan catatan", error);
  return { id: data as string };
}

/** Menghapus catatan (hanya penulis); tautan, item, riwayat, komentar ikut terhapus. */
export async function deleteNote(id: string, actor: Actor, db: SupabaseClient = createAdminClient()): Promise<void> {
  const { error } = await db.rpc("delete_note", { p_id: id, p_actor: actor.id });
  if (error) throw noteError("menghapus catatan", error);
}

/** Centang/batal centang action item (penulis catatan atau penanggung jawab). Mengembalikan id catatannya. */
export async function setActionItemDone(
  itemId: string,
  done: boolean,
  actor: Actor,
  db: SupabaseClient = createAdminClient(),
): Promise<{ noteId: string }> {
  const { data, error } = await db.rpc("set_action_item_done", { p_item: itemId, p_actor: actor.id, p_done: done });
  if (error) throw noteError("mengubah action item", error, "Action item");
  return { noteId: data as string };
}

/** Komentar baru, atau balasan bila `parentId` diisi (balasan dari balasan menempel ke komentar utamanya). */
export async function addComment(
  noteId: string,
  body: string,
  actor: Actor,
  db: SupabaseClient = createAdminClient(),
  parentId: string | null = null,
): Promise<{ id: string }> {
  const { data, error } = await db.rpc("add_note_comment", {
    p_note: noteId, p_actor: actor.id, p_actor_email: actor.email, p_body: body, p_parent: parentId,
  });
  if (error) throw noteError("menambah komentar", error, parentId ? "Comment" : "Note");
  return { id: data as string };
}

/** Mengubah komentar sendiri. Mengembalikan id catatannya. */
export async function editComment(
  commentId: string,
  body: string,
  actor: Actor,
  db: SupabaseClient = createAdminClient(),
): Promise<{ noteId: string }> {
  const { data, error } = await db.rpc("edit_note_comment", { p_comment: commentId, p_actor: actor.id, p_body: body });
  if (error) throw noteError("mengubah komentar", error, "Comment");
  return { noteId: data as string };
}

/**
 * Menghapus komentar sendiri. Komentar utama yang sudah dibalas ditandai terhapus (balasan orang lain tetap ada).
 * Mengembalikan id catatannya.
 */
export async function deleteComment(
  commentId: string,
  actor: Actor,
  db: SupabaseClient = createAdminClient(),
): Promise<{ noteId: string }> {
  const { data, error } = await db.rpc("delete_note_comment", { p_comment: commentId, p_actor: actor.id });
  if (error) throw noteError("menghapus komentar", error, "Comment");
  return { noteId: data as string };
}

/** Menandai catatan sudah dibuka oleh pengguna (penanda komentar baru). Catatan yang tidak ada diabaikan. */
export async function markNoteRead(noteId: string, actor: Actor, db: SupabaseClient = createAdminClient()): Promise<void> {
  const { error } = await db.rpc("mark_note_read", { p_note: noteId, p_actor: actor.id });
  if (error) throw noteError("menandai catatan dibaca", error);
}

// ---------------------------------------------------------------------------
// Libur (admin)
// ---------------------------------------------------------------------------

const isDuplicateDate = (e: RpcError) => e.code === "23505";

/** Menambah (id null) atau mengubah libur. */
export async function saveHoliday(
  id: string | null,
  input: HolidayInput,
  db: SupabaseClient = createAdminClient(),
): Promise<{ id: string }> {
  const row = { holiday_date: input.date, name: input.name, kind: input.kind };
  const res = id
    ? await db.from("holidays").update(row).eq("id", id).select("id").maybeSingle()
    : await db.from("holidays").insert(row).select("id").single();
  if (res.error) {
    if (isDuplicateDate(res.error)) throw new DuplicateHolidayError();
    throw new Error(`Gagal menyimpan libur: ${res.error.message}`);
  }
  if (!res.data) throw new NoteNotFoundError("Holiday");
  return { id: (res.data as { id: string }).id };
}

export async function deleteHoliday(id: string, db: SupabaseClient = createAdminClient()): Promise<void> {
  const res = await db.from("holidays").delete().eq("id", id).select("id");
  if (res.error) throw new Error(`Gagal menghapus libur: ${res.error.message}`);
  if (!res.data?.length) throw new NoteNotFoundError("Holiday");
}
