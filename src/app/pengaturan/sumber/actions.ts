"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { runConnectionTest, type ConnectionTestResult } from "@/lib/sources/test-connection";
import {
  DuplicateSourceError,
  SourceNotFoundError,
  createSource,
  deleteSource,
  getStoredToken,
  setSourceActive,
  updateSource,
} from "@/lib/sources/repo";
import { parseSourceForm, type FieldErrors } from "@/lib/sources/validate";

// Semua action di sini dipanggil dari klien lewat HTTP: requireAdmin() WAJIB di baris pertama
// (server action adalah endpoint publik; pengecekan di UI saja tidak cukup).

export type SaveResult = { ok: false; error?: string; fieldErrors?: FieldErrors };
export type TestResult =
  | ConnectionTestResult
  | { ok: false; kind: "validation"; message: string; fieldErrors: FieldErrors };
export type SimpleResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idFrom = (fd: FormData): string | null => {
  const v = fd.get("id");
  return typeof v === "string" && UUID.test(v) ? v : null;
};

/** Menyimpan sumber baru (tanpa id) atau perubahan (dengan id). Sukses = redirect ke daftar. */
export async function saveSource(formData: FormData): Promise<SaveResult> {
  await requireAdmin();

  const id = idFrom(formData);
  const editing = formData.get("id") !== null && formData.get("id") !== "";
  if (editing && !id) return { ok: false, error: "ID sumber tidak valid." };

  const parsed = parseSourceForm(formData, { requireToken: !id });
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };

  try {
    if (id) await updateSource(id, parsed.value);
    else await createSource(parsed.value);
  } catch (e) {
    if (e instanceof DuplicateSourceError) return { ok: false, error: e.message };
    if (e instanceof SourceNotFoundError) return { ok: false, error: e.message };
    // Jangan teruskan pesan asli ke klien; catat hanya nama galatnya.
    console.error("[sumber] gagal menyimpan", { error: (e as Error)?.name });
    return { ok: false, error: "Gagal menyimpan sumber. Coba lagi." };
  }

  revalidatePath("/pengaturan/sumber");
  redirect("/pengaturan/sumber"); // di luar try/catch: redirect bekerja dengan melempar
}

/**
 * Uji koneksi dengan isian form saat ini, tanpa menyimpan apa pun.
 * Saat mengedit, token yang dikosongkan berarti "pakai token tersimpan".
 */
export async function testConnection(formData: FormData): Promise<TestResult> {
  await requireAdmin();

  const id = idFrom(formData);
  const parsed = parseSourceForm(formData, { requireToken: false });
  if (!parsed.ok) {
    return { ok: false, kind: "validation", message: "Periksa isian yang bertanda galat.", fieldErrors: parsed.fieldErrors };
  }
  const { provider, repoUrl, branch, filePath } = parsed.value;

  let token = parsed.value.token;
  if (!token && id) {
    try {
      token = await getStoredToken(id);
    } catch {
      return { ok: false, kind: "token_decrypt", message: "Token tersimpan tidak bisa dibuka. Isi token baru." };
    }
  }
  if (!token) {
    return { ok: false, kind: "validation", message: "Isi token untuk menguji koneksi.", fieldErrors: { token: "Token wajib diisi untuk uji koneksi." } };
  }

  return runConnectionTest({ provider, repoUrl, branch, filePath, token });
}

export async function setActive(id: string, isActive: boolean): Promise<SimpleResult> {
  await requireAdmin();
  if (!UUID.test(id)) return { ok: false, error: "ID sumber tidak valid." };
  try {
    await setSourceActive(id, isActive);
  } catch (e) {
    if (e instanceof SourceNotFoundError) return { ok: false, error: e.message };
    console.error("[sumber] gagal mengubah status", { error: (e as Error)?.name });
    return { ok: false, error: "Gagal mengubah status sumber." };
  }
  revalidatePath("/pengaturan/sumber");
  return { ok: true };
}

export async function removeSource(id: string): Promise<SimpleResult> {
  await requireAdmin();
  if (!UUID.test(id)) return { ok: false, error: "ID sumber tidak valid." };
  try {
    await deleteSource(id);
  } catch (e) {
    if (e instanceof SourceNotFoundError) return { ok: false, error: e.message };
    console.error("[sumber] gagal menghapus", { error: (e as Error)?.name });
    return { ok: false, error: "Gagal menghapus sumber." };
  }
  revalidatePath("/pengaturan/sumber");
  return { ok: true };
}
