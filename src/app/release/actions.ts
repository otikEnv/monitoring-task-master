"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { previewRange as loadPreview } from "@/lib/releases/load";
import { wibDay } from "@/lib/releases/model";
import {
  DuplicateReleaseError, ReleaseNotFoundError, SourceTagError, assertSourceTag, createRelease,
  deleteRelease, setReleasedOn, updateRelease,
} from "@/lib/releases/repo";
import { UUID, parseRangeNumber, parseReleaseForm, type ReleaseFieldErrors } from "@/lib/releases/validate";
import { createClient } from "@/lib/supabase/server";

// Semua action di sini dipanggil dari klien lewat HTTP: requireAdmin() WAJIB di baris pertama
// (server action adalah endpoint publik; pengecekan di UI saja tidak cukup).

export type SaveReleaseResult = { ok: false; error?: string; fieldErrors?: ReleaseFieldErrors };
export type SimpleResult = { ok: true } | { ok: false; error: string };
export type PreviewResult =
  | { ok: true; count: number; firstId: string | null; lastId: string | null }
  | { ok: false; error: string };

const fail = (what: string, e: unknown) => console.error(`[release] gagal ${what}`, { error: (e as Error)?.name });

const idFrom = (fd: FormData): string | null => {
  const v = fd.get("id");
  return typeof v === "string" && UUID.test(v) ? v : null;
};

/** Menyimpan release baru (tanpa id) atau perubahan (dengan id). Sukses = redirect ke detail release. */
export async function saveRelease(formData: FormData): Promise<SaveReleaseResult> {
  await requireAdmin();

  const id = idFrom(formData);
  const editing = formData.get("id") !== null && formData.get("id") !== "";
  if (editing && !id) return { ok: false, error: "Invalid release ID." };

  const parsed = parseReleaseForm(formData);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };

  let savedId = id;
  try {
    await assertSourceTag(parsed.value.sourceId, parsed.value.tag);
    if (id) await updateRelease(id, parsed.value);
    else savedId = (await createRelease(parsed.value)).id;
  } catch (e) {
    if (e instanceof SourceTagError) return { ok: false, fieldErrors: { [e.field]: e.message } };
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
  await requireAdmin();
  if (!UUID.test(id)) return { ok: false, error: "Invalid release ID." };
  try {
    await setReleasedOn(id, released ? wibDay(new Date()) : null);
  } catch (e) {
    if (e instanceof ReleaseNotFoundError) return { ok: false, error: e.message };
    fail("mengubah status rilis", e);
    return { ok: false, error: "Could not change the release status." };
  }
  revalidatePath("/release");
  revalidatePath(`/release/${id}`);
  return { ok: true };
}

export async function removeRelease(id: string): Promise<SimpleResult> {
  await requireAdmin();
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
  await requireAdmin();
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
