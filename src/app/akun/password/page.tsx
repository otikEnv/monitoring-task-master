import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Ganti password" };

export default async function PasswordPage() {
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
