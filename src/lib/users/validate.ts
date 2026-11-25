// Validasi form Settings > Users (PRD-RBAC.md). Murni: aman dipakai di klien dan server.
import { isRole, type Role } from "@/lib/access";
import { isAllowedEmail } from "@/lib/auth-domain";

export const PASSWORD_MIN = 8;
/** Batas bcrypt di Supabase Auth: 72 byte. */
export const PASSWORD_MAX = 72;

export type NewUserInput = { email: string; password: string; role: Role };
export type NewUserErrors = Partial<Record<"email" | "password" | "role", string>>;

export function validatePassword(v: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const s = typeof v === "string" ? v : "";
  if (s.length < PASSWORD_MIN) return { ok: false, error: `Password must be at least ${PASSWORD_MIN} characters.` };
  if (new TextEncoder().encode(s).length > PASSWORD_MAX) return { ok: false, error: `Password must be at most ${PASSWORD_MAX} characters.` };
  if (s.trim() === "") return { ok: false, error: "Password cannot be only spaces." };
  return { ok: true, value: s };
}

export function parseNewUser(v: { email: unknown; password: unknown; role: unknown }):
  { ok: true; value: NewUserInput } | { ok: false; errors: NewUserErrors } {
  const errors: NewUserErrors = {};
  const email = typeof v.email === "string" ? v.email.trim().toLowerCase() : "";
  if (!email) errors.email = "Email is required.";
  else if (!isAllowedEmail(email)) errors.email = "Use an @envisions.app email address.";
  const pw = validatePassword(v.password);
  if (!pw.ok) errors.password = pw.error;
  if (!isRole(v.role)) errors.role = "Choose a role.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { email, password: (pw as { value: string }).value, role: v.role as Role } };
}
