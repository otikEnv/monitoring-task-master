import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { can, defaultMenus, isRole, menuAllowed, type Ability, type MenuKey, type Role } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export type { Role } from "@/lib/access";
/** `menus`: menu yang diizinkan untuk role ini (role_menu_access). Superadmin selalu semua (lihat menuAllowed). */
export type SessionUser = { id: string; email: string; role: Role; menus: string[] };

type SessionState = { user: SessionUser } | { user: null; disabled: boolean };

/**
 * Sesi yang sedang login. Memakai getUser() (verifikasi ke server Auth), bukan sekadar membaca cookie. Akun yang
 * dinonaktifkan dianggap tidak login (disabled: true) walaupun token sesinya masih berlaku. Dimemoize per render.
 */
const loadSession = cache(async (): Promise<SessionState> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Akun yang di-ban (dinonaktifkan) ditolak getUser(), tapi token-nya masih sah sampai kedaluwarsa. Cek profilnya
    // lewat klaim token agar pengguna mendapat pesan "akun dinonaktifkan", bukan sekadar diminta login.
    const { data } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    if (!sub) return { user: null, disabled: false };
    const { data: p } = await supabase.from("profiles").select("disabled_at").eq("user_id", sub).maybeSingle();
    return { user: null, disabled: Boolean(p?.disabled_at) };
  }

  // RLS: pengguna hanya bisa membaca profilnya sendiri (superadmin dan admin: semua).
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, disabled_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profile?.disabled_at) return { user: null, disabled: true };
  const role: Role = isRole(profile?.role) ? profile.role : "viewer";

  let menus: string[] = defaultMenus(role);
  if (role !== "superadmin") {
    const { data, error } = await supabase.from("role_menu_access").select("menu").eq("role", role);
    if (!error && data) menus = data.map((r) => r.menu as string);
  }

  return { user: { id: user.id, email: user.email ?? "", role, menus } };
});

/** Pengguna yang sedang login dan aktif, atau null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  return (await loadSession()).user;
}

/**
 * Untuk halaman dan server action: bila tidak ada sesi yang sah, keluarkan sesinya lewat /auth/signout (cookie
 * dihapus di sana) lalu ke /login. Langsung ke /login tidak cukup: proxy mengembalikan pengguna yang token-nya
 * masih berlaku ke beranda.
 */
export async function requireUser(): Promise<SessionUser> {
  const s = await loadSession();
  if (!s.user) redirect(s.disabled ? "/auth/signout?reason=disabled" : "/auth/signout");
  return s.user;
}

/** Halaman dan action yang butuh hak tertentu; tanpa hak dialihkan ke beranda. */
export async function requireAbility(ability: Ability, menu?: MenuKey): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, ability) || (menu && !menuAllowed(user, menu))) redirect("/");
  return user;
}

/** Hak kelola (admin dan superadmin): release, archive, source, sync, libur, membuat catatan. */
export async function requireAdmin(menu?: MenuKey): Promise<SessionUser> {
  return requireAbility("release.manage", menu);
}

export async function requireSuperadmin(): Promise<SessionUser> {
  return requireAbility("settings");
}

/** Halaman di bawah sebuah menu: menu yang tidak diizinkan dialihkan ke Dashboard dengan pesan. */
export async function requireMenu(menu: MenuKey): Promise<SessionUser> {
  const user = await requireUser();
  if (!menuAllowed(user, menu)) redirect("/?notice=no-access");
  return user;
}

/**
 * Untuk route handler: mengembalikan { user } atau { error: Response 401/403 }.
 *   const auth = await authorizeApi("admin");
 *   if ("error" in auth) return auth.error;
 * "admin" = hak kelola (admin dan superadmin).
 */
export async function authorizeApi(minRole: "admin" | "viewer" = "viewer", menu?: MenuKey) {
  const user = await getSessionUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    } as const;
  }
  if ((minRole === "admin" && !can(user.role, "release.manage")) || (menu && !menuAllowed(user, menu))) {
    return {
      error: NextResponse.json({ error: "Not allowed" }, { status: 403 }),
    } as const;
  }
  return { user } as const;
}
