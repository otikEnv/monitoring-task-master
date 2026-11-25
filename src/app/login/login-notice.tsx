const MESSAGES: Record<string, string> = {
  oauth: "Google sign-in failed. Try again.",
  domain: "Only verified @envisions.app Google accounts can sign in.",
  disabled: "Your account has been disabled. Contact a superadmin.",
};

/** Pesan untuk kode ?error=... dari /auth/callback dan /auth/signout; kode lain diabaikan. */
export function loginNoticeMessage(code: string | string[] | undefined): string | null {
  if (typeof code !== "string") return null;
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : null;
}

export function LoginNotice({ code }: { code: string | string[] | undefined }) {
  const message = loginNoticeMessage(code);
  if (!message) return null;
  return (
    <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}
