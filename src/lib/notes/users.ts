import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
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

/** Email per id untuk id yang diminta; id yang bukan pengguna terdaftar tidak ada di hasil. */
export async function resolveAssignees(ids: string[], db?: SupabaseClient): Promise<Map<string, string>> {
  const wanted = new Set(ids);
  if (wanted.size === 0) return new Map();
  const users = await listUserOptions(db);
  return new Map(users.filter((u) => wanted.has(u.id)).map((u) => [u.id, u.email]));
}
