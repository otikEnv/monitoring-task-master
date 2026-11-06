"use server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type PasswordState = { error?: string; success?: string } | undefined;

const MIN_LENGTH = 8;

export async function changePassword(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  await requireUser();

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < MIN_LENGTH) {
    return { error: `Password minimal ${MIN_LENGTH} karakter.` };
  }
  if (password !== confirm) {
    return { error: "Konfirmasi password tidak sama." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: "Gagal mengganti password. Coba masuk ulang lalu ulangi." };
  }
  return { success: "Password berhasil diganti." };
}
