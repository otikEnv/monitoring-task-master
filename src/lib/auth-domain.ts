// Batas domain login (PRD-Login-SSO-Google.md). Pengaman utama ada di trigger database
// (migrasi google_sso); pengecekan ini lapisan kedua di sisi aplikasi.
export const ALLOWED_EMAIL_DOMAIN = "envisions.app";

const ALLOWED = new RegExp(`^[^@\\s]+@${ALLOWED_EMAIL_DOMAIN.replace(".", "\\.")}$`, "i");

export function isAllowedEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && ALLOWED.test(email);
}
