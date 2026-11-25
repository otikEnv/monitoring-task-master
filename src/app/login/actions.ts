"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/auth-domain";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string } | undefined;

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Akun yang dinonaktifkan superadmin di-ban di Supabase Auth: password benar, tapi login ditolak.
    if ((error as { code?: string }).code === "user_banned" || /banned/i.test(error.message)) {
      return { error: "Your account has been disabled. Contact a superadmin." };
    }
    // Pesan sama untuk email salah dan password salah agar akun tidak bisa ditebak.
    return { error: "Incorrect email or password." };
  }

  // Tujuan tetap "/" (tanpa parameter next) untuk menghindari open redirect.
  redirect("/");
}

export async function loginWithGoogle() {
  // Alamat aplikasi dari header permintaan (Vercel mengisi x-forwarded-*). Supabase hanya
  // menerima redirectTo yang cocok dengan daftar Redirect URLs, jadi nilai palsu ditolak.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const isLocal = !host || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${proto}://${host ?? "localhost:3000"}/auth/callback`,
      // Hanya petunjuk tampilan pemilih akun Google; batas domain ditegakkan di database dan callback.
      queryParams: { hd: ALLOWED_EMAIL_DOMAIN },
    },
  });

  if (error || !data.url) {
    redirect("/login?error=oauth");
  }
  redirect(data.url);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
