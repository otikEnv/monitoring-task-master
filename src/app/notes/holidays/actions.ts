"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { DuplicateHolidayError, NoteNotFoundError, deleteHoliday, saveHoliday } from "@/lib/notes/repo";
import { parseHolidayForm, type HolidayFieldErrors } from "@/lib/notes/validate";
import { UUID } from "@/lib/releases/validate";

// requireAdmin() WAJIB di baris pertama: server action adalah endpoint publik.

export type SaveHolidayResult = { ok: true } | { ok: false; error?: string; fieldErrors?: HolidayFieldErrors };
export type SimpleResult = { ok: true } | { ok: false; error: string };

/** Libur memengaruhi Calendar, kartu Dashboard, dan hari kerja release. */
function refreshHolidays() {
  for (const p of ["/notes/holidays", "/calendar", "/", "/release"]) revalidatePath(p);
  revalidatePath("/release/[id]", "page");
}

/** Menambah (tanpa id) atau mengubah (dengan id) satu tanggal libur. */
export async function saveHolidayAction(formData: FormData): Promise<SaveHolidayResult> {
  await requireAdmin("calendar");
  const rawId = formData.get("id");
  const editing = typeof rawId === "string" && rawId !== "";
  if (editing && !UUID.test(rawId)) return { ok: false, error: "Invalid holiday ID." };
  const parsed = parseHolidayForm(formData);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };
  try {
    await saveHoliday(editing ? (rawId as string).toLowerCase() : null, parsed.value);
  } catch (e) {
    if (e instanceof DuplicateHolidayError) return { ok: false, fieldErrors: { date: e.message } };
    if (e instanceof NoteNotFoundError) return { ok: false, error: e.message };
    console.error("[holidays] gagal menyimpan", { error: (e as Error)?.name });
    return { ok: false, error: "Could not save the holiday." };
  }
  refreshHolidays();
  return { ok: true };
}

export async function removeHolidayAction(id: string): Promise<SimpleResult> {
  await requireAdmin("calendar");
  if (!UUID.test(id)) return { ok: false, error: "Invalid holiday ID." };
  try {
    await deleteHoliday(id.toLowerCase());
  } catch (e) {
    if (e instanceof NoteNotFoundError) return { ok: false, error: e.message };
    console.error("[holidays] gagal menghapus", { error: (e as Error)?.name });
    return { ok: false, error: "Could not delete the holiday." };
  }
  refreshHolidays();
  return { ok: true };
}
