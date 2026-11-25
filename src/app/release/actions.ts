"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canChangeAnyActivity } from "@/lib/access";
import { requireAbility, requireAdmin } from "@/lib/auth";
import { previewRange as loadPreview } from "@/lib/releases/load";
import { wibDay } from "@/lib/releases/model";
import { getReleaseNote } from "@/lib/releases/notes";
import {
  DuplicateReleaseError, NoteNotAllowedError, NoteNotDeletableError, NoteNotFoundError, ReleaseNotFoundError, ReleaseStateError,
  SourceTagError, addReleaseNote, assertComponents, createRelease, deleteRelease, deleteReleaseNote, editReleaseNote,
  getRelease, holdRelease, resumeRelease, setReleasedOn, updateRelease, type Author,
} from "@/lib/releases/repo";
import {
  UUID, componentIndexes, parseRangeNumber, parseReleaseForm, validateHoldReason, validateNoteBody,
  validateNoteText, validateResumeReason, validateTargetReason, type ReleaseFieldErrors,
} from "@/lib/releases/validate";
import { createClient } from "@/lib/supabase/server";

// Semua action di sini dipanggil dari klien lewat HTTP: requireAdmin()/requireAbility() WAJIB di baris pertama
// (server action adalah endpoint publik; pengecekan di UI saja tidak cukup).

export type SaveReleaseResult = { ok: false; error?: string; fieldErrors?: ReleaseFieldErrors };
export type SimpleResult = { ok: true } | { ok: false; error: string };
export type PreviewResult =
  | { ok: true; count: number; firstId: string | null; lastId: string | null }
  | { ok: false; error: string };

const fail = (what: string, e: unknown) => console.error(`[release] gagal ${what}`, { error: (e as Error)?.name });

/** Penulis entri log: selalu diambil dari sesi admin di server, tidak pernah dari masukan klien. */
const authorOf = (u: { id: string; email: string }): Author => ({ id: u.id, email: u.email });

/** Admin dan superadmin: semua entri; developer: hanya Note miliknya. Database memeriksanya lagi. */
const mayChange = (user: { id: string; role: Parameters<typeof canChangeAnyActivity>[0] }, note: { kind: string; authorId: string | null }) =>
  canChangeAnyActivity(user.role) || (note.kind === "note" && note.authorId === user.id);

const idFrom = (fd: FormData): string | null => {
  const v = fd.get("id");
  return typeof v === "string" && UUID.test(v) ? v : null;
};

/**
 * Menyimpan release baru (tanpa id) atau perubahan (dengan id) beserta seluruh komponennya, secara atomik.
 * Sukses = redirect ke detail release.
 */
export async function saveRelease(formData: FormData): Promise<SaveReleaseResult> {
  const user = await requireAdmin("release");

  const id = idFrom(formData);
  const editing = formData.get("id") !== null && formData.get("id") !== "";
  if (editing && !id) return { ok: false, error: "Invalid release ID." };

  const parsed = parseReleaseForm(formData);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };

  let savedId = id;
  try {
    await assertComponents(parsed.value.components);
    if (id) {
      // Mengubah tanggal target wajib disertai alasan; alasan dicatat di log release. Tanpa perubahan target,
      // isian alasan diabaikan.
      const current = await getRelease(await createClient(), id);
      if (!current) return { ok: false, error: "Release not found." };
      if (current.targetDate !== parsed.value.targetDate) {
        const reason = validateTargetReason(formData.get("changeReason"));
        if (!reason.ok) return { ok: false, fieldErrors: { changeReason: reason.error } };
        await updateRelease(id, parsed.value, undefined, { reason: reason.value, author: authorOf(user) });
      } else {
        await updateRelease(id, parsed.value);
      }
    } else {
      savedId = (await createRelease(parsed.value)).id;
    }
  } catch (e) {
    if (e instanceof SourceTagError) {
      // e.index = posisi pada daftar tervalidasi; galat dipetakan ke nomor baris pada form.
      const row = componentIndexes(formData)[e.index] ?? e.index;
      return { ok: false, fieldErrors: { items: { [row]: { [e.field]: e.message } } } };
    }
    if (e instanceof DuplicateReleaseError) return { ok: false, fieldErrors: { name: e.message } };
    if (e instanceof ReleaseNotFoundError) return { ok: false, error: e.message };
    fail("menyimpan", e);
    return { ok: false, error: "Could not save the release. Try again." };
  }

  revalidatePath("/release");
  redirect(`/release/${savedId}`); // di luar try/catch: redirect bekerja dengan melempar
}

/** Menandai rilis (tanggal hari ini menurut WIB) atau membatalkan tandanya. */
export async function markReleased(id: string, released: boolean): Promise<SimpleResult> {
  const user = await requireAdmin("release");
  if (!UUID.test(id)) return { ok: false, error: "Invalid release ID." };
  try {
    // Menandai rilis saat release di-hold mengakhiri hold dan mencatatnya (dikerjakan database dalam satu transaksi).
    await setReleasedOn(id, released ? wibDay(new Date()) : null, undefined, authorOf(user));
  } catch (e) {
    if (e instanceof ReleaseNotFoundError) return { ok: false, error: e.message };
    fail("mengubah status rilis", e);
    return { ok: false, error: "Could not change the release status." };
  }
  revalidatePath("/release");
  revalidatePath(`/release/${id}`);
  return { ok: true };
}

/** Galat yang pesannya aman ditampilkan (kelas galat domain); selain itu pesan umum dan tanpa detail internal. */
function failure(what: string, e: unknown, fallback: string): SimpleResult {
  if (
    e instanceof ReleaseNotFoundError || e instanceof ReleaseStateError || e instanceof NoteNotFoundError ||
    e instanceof NoteNotDeletableError || e instanceof NoteNotAllowedError
  ) {
    return { ok: false, error: e.message };
  }
  fail(what, e);
  return { ok: false, error: fallback };
}

/** Menyegarkan daftar, Dashboard, dan detail release setelah hold, resume, atau catatan berubah. */
function refreshRelease(id: string) {
  for (const p of ["/", "/release", `/release/${id}`]) revalidatePath(p);
}

/** Menahan release dengan alasan wajib (1-500 karakter). Tanggal target dan angka progres tidak berubah. */
export async function putOnHold(id: string, reason: string): Promise<SimpleResult> {
  const user = await requireAdmin("release");
  if (!UUID.test(id)) return { ok: false, error: "Invalid release ID." };
  const text = validateHoldReason(reason);
  if (!text.ok) return { ok: false, error: text.error };
  const rid = id.toLowerCase();
  try {
    await holdRelease(rid, text.value, authorOf(user));
  } catch (e) {
    return failure("menahan release", e, "Could not put the release on hold.");
  }
  refreshRelease(rid);
  return { ok: true };
}

/** Melanjutkan release yang ditahan; alasan opsional. */
export async function resumeHold(id: string, reason = ""): Promise<SimpleResult> {
  const user = await requireAdmin("release");
  if (!UUID.test(id)) return { ok: false, error: "Invalid release ID." };
  const text = validateResumeReason(reason);
  if (!text.ok) return { ok: false, error: text.error };
  const rid = id.toLowerCase();
  try {
    await resumeRelease(rid, text.value || null, authorOf(user));
  } catch (e) {
    return failure("melanjutkan release", e, "Could not resume the release.");
  }
  refreshRelease(rid);
  return { ok: true };
}

/** Menambah catatan bebas (1-2000 karakter) pada log release. Superadmin, admin, dan developer. */
export async function addNote(id: string, body: string): Promise<SimpleResult> {
  const user = await requireAbility("release.activity", "release");
  if (!UUID.test(id)) return { ok: false, error: "Invalid release ID." };
  const text = validateNoteBody(body);
  if (!text.ok) return { ok: false, error: text.error };
  const rid = id.toLowerCase();
  try {
    await addReleaseNote(rid, text.value, authorOf(user));
  } catch (e) {
    return failure("menambah catatan", e, "Could not add the note.");
  }
  refreshRelease(rid);
  return { ok: true };
}

/**
 * Mengubah teks sebuah entri log. Hanya teks yang berubah: jenis, tanggal, penulis, dan waktu terkunci di
 * database. Batas panjang mengikuti jenis entri (catatan 2000; hold dan alasan target 500; resume boleh kosong).
 */
export async function editNote(noteId: string, body: string): Promise<SimpleResult> {
  const user = await requireAbility("release.activity", "release");
  if (!UUID.test(noteId)) return { ok: false, error: "Invalid note ID." };
  const nid = noteId.toLowerCase();
  try {
    const note = await getReleaseNote(await createClient(), nid);
    if (!note) return { ok: false, error: "Note not found." };
    if (!mayChange(user, note)) return { ok: false, error: new NoteNotAllowedError().message };
    const text = validateNoteText(body, note.kind);
    if (!text.ok) return { ok: false, error: text.error };
    await editReleaseNote(nid, text.value, authorOf(user));
    refreshRelease(note.releaseId);
  } catch (e) {
    return failure("mengubah catatan", e, "Could not save the note.");
  }
  return { ok: true };
}

/**
 * Menghapus catatan bebas (Note) secara permanen, mis. yang terkirim tanpa sengaja. Entri sistem (Hold, Resume,
 * Target change, Released) tidak bisa dihapus: ditolak di sini sebelum menyentuh data, dan lagi oleh database.
 */
export async function deleteNote(noteId: string): Promise<SimpleResult> {
  const user = await requireAbility("release.activity", "release");
  if (!UUID.test(noteId)) return { ok: false, error: "Invalid note ID." };
  const nid = noteId.toLowerCase();
  try {
    const note = await getReleaseNote(await createClient(), nid);
    if (!note) return { ok: false, error: "Note not found." };
    if (note.kind !== "note") return failure("menghapus catatan", new NoteNotDeletableError(), "Could not delete the note.");
    if (!mayChange(user, note)) return { ok: false, error: new NoteNotAllowedError().message };
    const { releaseId } = await deleteReleaseNote(nid, authorOf(user));
    refreshRelease(releaseId);
  } catch (e) {
    return failure("menghapus catatan", e, "Could not delete the note.");
  }
  return { ok: true };
}

export async function removeRelease(id: string): Promise<SimpleResult> {
  await requireAdmin("release");
  if (!UUID.test(id)) return { ok: false, error: "Invalid release ID." };
  try {
    await deleteRelease(id);
  } catch (e) {
    if (e instanceof ReleaseNotFoundError) return { ok: false, error: e.message };
    fail("menghapus", e);
    return { ok: false, error: "Could not delete the release." };
  }
  revalidatePath("/release");
  return { ok: true };
}

/** Pratinjau form: jumlah task yang masuk rentang. Hanya membaca; tidak menyimpan apa pun. */
export async function previewRange(
  sourceId: string, tag: string, rangeStart: string, rangeEnd: string,
): Promise<PreviewResult> {
  await requireAdmin("release");
  const start = parseRangeNumber(String(rangeStart));
  const end = parseRangeNumber(String(rangeEnd));
  if (!UUID.test(sourceId) || !tag || tag.length > 100 || start === null || end === null || start > end) {
    return { ok: false, error: "The range is not valid yet." };
  }
  try {
    return { ok: true, ...(await loadPreview(await createClient(), sourceId.toLowerCase(), tag, start, end)) };
  } catch (e) {
    fail("membuat pratinjau", e);
    return { ok: false, error: "The preview could not be loaded." };
  }
}
