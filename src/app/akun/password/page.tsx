import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Ganti password" };

// Cache Components aktif: bagian yang membaca sesi (cookies) harus di dalam Suspense.
export default function PasswordPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PasswordContent />
    </Suspense>
  );
}

async function PasswordContent() {
  const user = await requireUser();

  return (
    <AppShell user={user} width="narrow">
      <PageHeader title="Ganti password" description="Password awal dari seeder sebaiknya segera diganti." />
      <PasswordForm />
    </AppShell>
  );
}
