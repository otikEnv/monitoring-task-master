import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "viewer";
export type SessionUser = { id: string; email: string; role: Role };

/**
 * Pengguna yang sedang login, atau null. Memakai getUser() (verifikasi ke server Auth),
 * bukan sekadar membaca cookie. Dimemoize per render.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS: pengguna hanya bisa membaca profilnya sendiri.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? "",
    role: profile?.role === "admin" ? "admin" : "viewer",
  };
});

/** Untuk halaman dan server action: alihkan ke /login bila belum login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Untuk halaman dan server action khusus admin: viewer dialihkan ke beranda. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

/**
 * Untuk route handler: mengembalikan { user } atau { error: Response 401/403 }.
 *   const auth = await authorizeApi("admin");
 *   if ("error" in auth) return auth.error;
 */
export async function authorizeApi(minRole: Role = "viewer") {
  const user = await getSessionUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    } as const;
  }
  if (minRole === "admin" && user.role !== "admin") {
    return {
      error: NextResponse.json({ error: "Not allowed" }, { status: 403 }),
    } as const;
  }
  return { user } as const;
}
