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
    return { error: `Password must be at least ${MIN_LENGTH} characters.` };
  }
  if (password !== confirm) {
    return { error: "Password confirmation does not match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: "Could not change the password. Sign in again and retry." };
  }
  return { success: "Password changed." };
}
