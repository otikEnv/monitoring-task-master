"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth";
import {
  InvalidNoteError, NotAllowedError, NoteNotFoundError, addComment, deleteComment, deleteNote, editComment, saveNote,
  setActionItemDone, type Actor,
} from "@/lib/notes/repo";
import { checkLinks, newLinks, releaseSnapshots } from "@/lib/notes/links";
import { loadNoteLinks } from "@/lib/notes/load";
import { resolveAssignees } from "@/lib/notes/users";
import { itemIndexes, linkIndexes, parseNoteForm, validateComment, type NoteFieldErrors } from "@/lib/notes/validate";
import { UUID } from "@/lib/releases/validate";
import { createClient } from "@/lib/supabase/server";

// Semua action di sini dipanggil dari klien lewat HTTP: requireAdmin()/requireUser() WAJIB di baris pertama
// (server action adalah endpoint publik; pengecekan di UI saja tidak cukup). Pemeriksaan penulis dan penanggung
// jawab dilakukan lagi oleh fungsi database.

export type SaveNoteResult = { ok: false; error?: string; fieldErrors?: NoteFieldErrors };
export type SimpleResult = { ok: true } | { ok: false; error: string };

const fail = (what: string, e: unknown) => console.error(`[notes] gagal ${what}`, { error: (e as Error)?.name });

/** Pelaku selalu dari sesi di server, tidak pernah dari masukan klien. */
const actorOf = (u: { id: string; email: string }): Actor => ({ id: u.id, email: u.email });

/** Menyegarkan semua tampilan yang memuat catatan (daftar, Calendar, Dashboard, Related notes). */
function refreshNotes(noteId?: string) {
  revalidatePath("/notes");
  revalidatePath("/calendar");
  revalidatePath("/");
  if (noteId) revalidatePath(`/notes/${noteId}`);
  revalidatePath("/release/[id]", "page");
  revalidatePath("/tasks/[sourceId]/[tag]/[taskId]", "page");
}

/** Galat yang pesannya aman ditampilkan; selain itu pesan umum tanpa detail internal. */
function failure(what: string, e: unknown, fallback: string): { ok: false; error: string } {
  if (e instanceof NoteNotFoundError || e instanceof NotAllowedError || e instanceof InvalidNoteError) {
    return { ok: false, error: e.message };
  }
  fail(what, e);
  return { ok: false, error: fallback };
}

const cleanId = (v: unknown): string | null => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null);

/**
 * Menyimpan catatan baru (tanpa id) atau perubahan (dengan id, hanya penulisnya) beserta tautan dan action item.
 * Sukses = redirect ke detail catatan.
 */
export async function saveNoteAction(formData: FormData): Promise<SaveNoteResult> {
  const user = await requireAdmin();

  const rawId = formData.get("id");
  const editing = typeof rawId === "string" && rawId !== "";
  const id = editing ? cleanId(rawId) : null;
  if (editing && !id) return { ok: false, error: "Invalid note ID." };

  const parsed = parseNoteForm(formData);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };
  const input = parsed.value;

  let savedId = id;
  try {
    // Penanggung jawab harus pengguna terdaftar; emailnya dibaca server, bukan dari form.
    const assigneeIds = input.items.map((i) => i.assigneeId).filter((v): v is string => v !== null);
    const assigneeEmails = await resolveAssignees(assigneeIds);
    const rows = itemIndexes(formData);
    const unknown: NoteFieldErrors["itemRows"] = {};
    input.items.forEach((it, k) => {
      if (it.assigneeId && !assigneeEmails.has(it.assigneeId)) unknown[rows[k] ?? k] = { assigneeId: "Choose a person from the list." };
    });
    if (Object.keys(unknown).length > 0) return { ok: false, fieldErrors: { itemRows: unknown } };

    // Tautan baru diperiksa (aplikasi, release, task ada dan tidak terarsip); tautan lama dibiarkan walau
    // sasarannya sudah hilang. Release yang baru ditautkan direkam kondisinya saat ini.
    const db = await createClient();
    const existing = id ? await loadNoteLinks(db, id) : [];
    const fresh = newLinks(input.links, existing);
    const linkErrors = await checkLinks(db, input.links, fresh);
    if (linkErrors.size > 0) {
      const formRows = linkIndexes(formData);
      const rows: Record<number, string> = {};
      for (const [k, msg] of linkErrors) rows[formRows[k] ?? k] = msg;
      return { ok: false, fieldErrors: { linkItems: rows } };
    }
    const snapshots = await releaseSnapshots(
      db,
      fresh.flatMap((k) => { const l = input.links[k]; return l.kind === "release" ? [l.releaseId] : []; }),
    );

    savedId = (await saveNote(id, input, actorOf(user), { assigneeEmails, snapshots })).id;
  } catch (e) {
    return failure("menyimpan catatan", e, "Could not save the note. Try again.");
  }

  refreshNotes(savedId ?? undefined);
  redirect(`/notes/${savedId}`); // di luar try/catch: redirect bekerja dengan melempar
}

/** Menghapus catatan (hanya penulisnya). Klien berpindah ke daftar setelah sukses. */
export async function removeNoteAction(noteId: string): Promise<SimpleResult> {
  const user = await requireAdmin();
  const id = cleanId(noteId);
  if (!id) return { ok: false, error: "Invalid note ID." };
  try {
    await deleteNote(id, actorOf(user));
  } catch (e) {
    return failure("menghapus catatan", e, "Could not delete the note.");
  }
  refreshNotes(id);
  return { ok: true };
}

/** Centang/batal centang action item: penulis catatan atau penanggung jawabnya (termasuk viewer). */
export async function toggleActionItemAction(itemId: string, done: boolean): Promise<SimpleResult> {
  const user = await requireUser();
  const id = cleanId(itemId);
  if (!id) return { ok: false, error: "Invalid action item ID." };
  try {
    const { noteId } = await setActionItemDone(id, done === true, actorOf(user));
    refreshNotes(noteId);
  } catch (e) {
    return failure("mengubah action item", e, "Could not update the action item.");
  }
  return { ok: true };
}

/** Komentar oleh semua pengguna login. */
export async function addCommentAction(noteId: string, body: string): Promise<SimpleResult> {
  const user = await requireUser();
  const id = cleanId(noteId);
  if (!id) return { ok: false, error: "Invalid note ID." };
  const text = validateComment(body);
  if (!text.ok) return { ok: false, error: text.error };
  try {
    await addComment(id, text.value, actorOf(user));
  } catch (e) {
    return failure("menambah komentar", e, "Could not add the comment.");
  }
  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
  return { ok: true };
}

/** Mengubah komentar sendiri. */
export async function editCommentAction(commentId: string, body: string): Promise<SimpleResult> {
  const user = await requireUser();
  const id = cleanId(commentId);
  if (!id) return { ok: false, error: "Invalid comment ID." };
  const text = validateComment(body);
  if (!text.ok) return { ok: false, error: text.error };
  try {
    const { noteId } = await editComment(id, text.value, actorOf(user));
    revalidatePath(`/notes/${noteId}`);
  } catch (e) {
    return failure("mengubah komentar", e, "Could not save the comment.");
  }
  return { ok: true };
}

/** Menghapus komentar sendiri. */
export async function removeCommentAction(commentId: string): Promise<SimpleResult> {
  const user = await requireUser();
  const id = cleanId(commentId);
  if (!id) return { ok: false, error: "Invalid comment ID." };
  try {
    const { noteId } = await deleteComment(id, actorOf(user));
    revalidatePath("/notes");
    revalidatePath(`/notes/${noteId}`);
  } catch (e) {
    return failure("menghapus komentar", e, "Could not delete the comment.");
  }
  return { ok: true };
}
