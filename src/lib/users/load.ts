import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MATRIX_ROLES, MENU_KEYS, isRole, type MatrixRole, type MenuKey, type Role } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";

/** Satu baris di Settings > Users. */
export type UserRow = {
  id: string;
  email: string;
  role: Role;
  disabled: boolean;
  /** Cara login yang pernah dipakai, mis. ["email", "google"]. */
  providers: string[];
  createdAt: string;
  lastSignInAt: string | null;
};

/**
 * Semua user terdaftar beserta role dan statusnya, terbaru di atas. Service role: auth.users tidak bisa dibaca klien.
 * Hanya dipakai halaman Settings (superadmin).
 */
export async function loadUsers(db: SupabaseClient = createAdminClient()): Promise<UserRow[]> {
  const users: { id: string; email?: string; app_metadata?: { providers?: unknown }; created_at: string; last_sign_in_at?: string | null }[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Gagal membaca pengguna: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  const { data: profiles, error } = await db.from("profiles").select("user_id, role, disabled_at");
  if (error) throw new Error(`Gagal membaca profil: ${error.message}`);
  const byId = new Map((profiles ?? []).map((p) => [p.user_id as string, p]));

  return users
    .filter((u) => u.email)
    .map((u) => {
      const p = byId.get(u.id);
      const providers = Array.isArray(u.app_metadata?.providers)
        ? (u.app_metadata.providers as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      return {
        id: u.id,
        email: u.email!,
        role: isRole(p?.role) ? p.role : "viewer",
        disabled: Boolean(p?.disabled_at),
        providers,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.email.localeCompare(b.email, "en"));
}

export type MenuAccess = Record<MatrixRole, MenuKey[]>;

/** Isi matriks akses menu, per role, urut MENU_KEYS. */
export async function loadMenuAccess(db: SupabaseClient): Promise<MenuAccess> {
  const { data, error } = await db.from("role_menu_access").select("role, menu");
  if (error) throw new Error(`Gagal membaca akses menu: ${error.message}`);
  const out = Object.fromEntries(MATRIX_ROLES.map((r) => [r, [] as MenuKey[]])) as MenuAccess;
  for (const r of MATRIX_ROLES) {
    const set = new Set((data ?? []).filter((x) => x.role === r).map((x) => x.menu as string));
    out[r] = MENU_KEYS.filter((m) => set.has(m));
  }
  return out;
}

export type UserEvent = {
  id: string;
  actorEmail: string;
  targetEmail: string | null;
  action: "user_created" | "role_changed" | "user_disabled" | "user_enabled" | "password_reset" | "menu_access_changed";
  detail: Record<string, unknown>;
  createdAt: string;
};

/** Perubahan terbaru (RLS: hanya superadmin yang bisa membaca). `limit` + 1 dibaca untuk tahu masih ada lagi. */
export async function loadUserEvents(db: SupabaseClient, limit: number): Promise<{ rows: UserEvent[]; more: boolean }> {
  const { data, error } = await db
    .from("user_admin_events")
    .select("id, actor_email, target_email, action, detail, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (error) throw new Error(`Gagal membaca activity: ${error.message}`);
  const rows = (data ?? []).map((r) => ({
    id: r.id as string,
    actorEmail: r.actor_email as string,
    targetEmail: (r.target_email as string | null) ?? null,
    action: r.action as UserEvent["action"],
    detail: (r.detail as Record<string, unknown>) ?? {},
    createdAt: r.created_at as string,
  }));
  return { rows: rows.slice(0, limit), more: rows.length > limit };
}
