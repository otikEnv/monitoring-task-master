import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { can, isRole } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";

/** Pengguna terdaftar yang bisa dipilih sebagai penanggung jawab action item. */
export type UserOption = { id: string; email: string };

/**
 * Semua pengguna terdaftar (id + email), urut email. Dibaca lewat service role karena auth.users tidak bisa
 * dibaca klien. Hanya id dan email yang dikembalikan.
 */
export async function listUserOptions(db: SupabaseClient = createAdminClient()): Promise<UserOption[]> {
  const out: UserOption[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Gagal membaca pengguna: ${error.message}`);
    for (const u of data.users) if (u.email) out.push({ id: u.id, email: u.email });
    if (data.users.length < 200) break;
  }
  return out.sort((a, b) => a.email.localeCompare(b.email, "en"));
}

/**
 * Pilihan penanggung jawab action item: hanya akun aktif yang bisa mencentang (superadmin, admin, developer).
 * `keep`: id yang sudah menjadi penanggung jawab tetap ada di pilihan (mis. saat mengubah catatan lama), agar
 * nilainya tidak hilang dari form.
 */
export async function listAssigneeOptions(
  keep: string[] = [], db: SupabaseClient = createAdminClient(),
): Promise<UserOption[]> {
  const [users, profiles] = await Promise.all([
    listUserOptions(db),
    db.from("profiles").select("user_id, role, disabled_at"),
  ]);
  if (profiles.error) throw new Error(`Gagal membaca profil: ${profiles.error.message}`);
  const allowed = new Set(
    (profiles.data ?? [])
      .filter((p) => p.disabled_at === null && can(isRole(p.role) ? p.role : null, "action.check"))
      .map((p) => p.user_id as string),
  );
  const kept = new Set(keep);
  return users.filter((u) => allowed.has(u.id) || kept.has(u.id));
}

/** Email per id untuk id yang diminta; id yang bukan pengguna terdaftar tidak ada di hasil. */
export async function resolveAssignees(ids: string[], db?: SupabaseClient): Promise<Map<string, string>> {
  const wanted = new Set(ids);
  if (wanted.size === 0) return new Map();
  const users = await listUserOptions(db);
  return new Map(users.filter((u) => wanted.has(u.id)).map((u) => [u.id, u.email]));
}
