import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { logout } from "@/app/login/actions";

export function AppHeader({ user }: { user: SessionUser }) {
  return (
    <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <Link href="/" className="font-semibold">
        Monitoring Task Master
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-neutral-500">
          {user.email} · {user.role}
        </span>
        {user.role === "admin" && (
          <Link href="/pengaturan/sumber" className="hover:underline">
            Pengaturan sumber
          </Link>
        )}
        <Link href="/akun/password" className="hover:underline">
          Ganti password
        </Link>
        <form action={logout}>
          <button type="submit" className="hover:underline">
            Keluar
          </button>
        </form>
      </div>
    </header>
  );
}
