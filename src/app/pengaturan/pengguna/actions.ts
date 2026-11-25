"use server";

import { revalidatePath } from "next/cache";
import { MATRIX_ROLES, MENU_KEYS, isRole, type MatrixRole, type MenuKey } from "@/lib/access";
import { requireSuperadmin } from "@/lib/auth";
import { UUID } from "@/lib/releases/validate";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserAdminError, createUser, resetPassword, saveMenuAccess, setUserActive, setUserRole } from "@/lib/users/repo";
import { parseNewUser, validatePassword, type NewUserErrors } from "@/lib/users/validate";

// Semua action di sini dipanggil dari klien lewat HTTP: requireSuperadmin() WAJIB di baris pertama. Pelaku selalu
// dari sesi di server; email target dibaca ulang di server, bukan dari klien. Database memeriksa lagi semuanya.

export type SimpleResult = { ok: true } | { ok: false; error: string };
export type CreateUserResult = { ok: true; email: string } | { ok: false; error?: string; fieldErrors?: NewUserErrors };

const PATH = "/pengaturan/pengguna";

function failure(what: string, e: unknown, fallback: string): { ok: false; error: string } {
  if (e instanceof UserAdminError) return { ok: false, error: e.message };
  console.error(`[users] gagal ${what}`, { error: (e as Error)?.name });
  return { ok: false, error: fallback };
}

const cleanId = (v: unknown): string | null => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null);

/** Email target dari Supabase Auth (bukan dari klien), untuk log. */
async function targetOf(id: string) {
  const { data, error } = await createAdminClient().auth.admin.getUserById(id);
  if (error || !data.user) throw new UserAdminError("User not found.");
  return { id, email: data.user.email ?? "unknown" };
}

export async function createUserAction(input: { email: string; password: string; role: string }): Promise<CreateUserResult> {
  const me = await requireSuperadmin();
  const parsed = parseNewUser(input ?? {});
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.errors };
  try {
    await createUser({ id: me.id, email: me.email }, parsed.value);
  } catch (e) {
    const r = failure("membuat user", e, "Could not create the user.");
    // Galat yang menyangkut email ditampilkan di kolom email.
    if (/email/i.test(r.error)) return { ok: false, fieldErrors: { email: r.error } };
    revalidatePath(PATH);
    return r;
  }
  revalidatePath(PATH);
  return { ok: true, email: parsed.value.email };
}

export async function setRoleAction(userId: string, role: string): Promise<SimpleResult> {
  const me = await requireSuperadmin();
  const id = cleanId(userId);
  if (!id) return { ok: false, error: "Invalid user ID." };
  if (!isRole(role)) return { ok: false, error: "Choose a role." };
  if (id === me.id) return { ok: false, error: "You can't change your own account here." };
  try {
    await setUserRole({ id: me.id, email: me.email }, await targetOf(id), role);
  } catch (e) {
    return failure("mengganti role", e, "Could not change the role.");
  }
  revalidatePath(PATH);
  return { ok: true };
}

export async function setActiveAction(userId: string, active: boolean): Promise<SimpleResult> {
  const me = await requireSuperadmin();
  const id = cleanId(userId);
  if (!id) return { ok: false, error: "Invalid user ID." };
  if (id === me.id) return { ok: false, error: "You can't change your own account here." };
  try {
    await setUserActive({ id: me.id, email: me.email }, await targetOf(id), active === true);
  } catch (e) {
    return failure("mengubah status", e, active ? "Could not enable the user." : "Could not disable the user.");
  }
  revalidatePath(PATH);
  return { ok: true };
}

export async function resetPasswordAction(userId: string, password: string): Promise<SimpleResult> {
  const me = await requireSuperadmin();
  const id = cleanId(userId);
  if (!id) return { ok: false, error: "Invalid user ID." };
  const pw = validatePassword(password);
  if (!pw.ok) return { ok: false, error: pw.error };
  try {
    await resetPassword({ id: me.id, email: me.email }, await targetOf(id), pw.value);
  } catch (e) {
    return failure("mereset password", e, "Could not reset the password.");
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Menyimpan matriks: satu panggilan per role yang berubah. `access` = menu yang dicentang per role. */
export async function saveMenuAccessAction(access: Partial<Record<string, string[]>>): Promise<SimpleResult> {
  const me = await requireSuperadmin();
  const roles = Object.keys(access ?? {});
  if (roles.length === 0 || !roles.every((r) => (MATRIX_ROLES as readonly string[]).includes(r))) {
    return { ok: false, error: "Invalid menu access." };
  }
  const valid = new Set<string>(MENU_KEYS);
  for (const r of roles) {
    const list = access[r];
    if (!Array.isArray(list) || !list.every((m) => typeof m === "string" && valid.has(m))) {
      return { ok: false, error: "Invalid menu access." };
    }
  }
  try {
    for (const r of roles) await saveMenuAccess({ id: me.id, email: me.email }, r as MatrixRole, access[r] as MenuKey[]);
  } catch (e) {
    return failure("mengubah akses menu", e, "Could not save menu access.");
  }
  // Sidebar dan semua halaman membaca akses menu.
  revalidatePath("/", "layout");
  return { ok: true };
}
