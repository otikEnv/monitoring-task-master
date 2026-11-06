import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Ganti password" };

// Cache Components aktif: bagian yang membaca sesi (cookies) harus di dalam <Suspense>.
export default function PasswordPage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-sm text-neutral-500">Memuat…</p>}>
      <PasswordContent />
    </Suspense>
  );
}

async function PasswordContent() {
  const user = await requireUser();

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-4 py-8">
        <h1 className="text-xl font-semibold">Ganti password</h1>
        <p className="text-sm text-neutral-500">
          Password awal dari seeder sebaiknya segera diganti.
        </p>
        <PasswordForm />
      </main>
    </>
  );
}
