"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string } | undefined;

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email dan password wajib diisi." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  // Pesan sama untuk email salah dan password salah agar akun tidak bisa ditebak.
  if (error) {
    return { error: "Email atau password salah." };
  }

  // Tujuan tetap "/" (tanpa parameter next) untuk menghindari open redirect.
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
