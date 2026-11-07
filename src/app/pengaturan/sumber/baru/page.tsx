import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { requireAdmin } from "@/lib/auth";
import { SourceForm } from "../source-form";

export const metadata: Metadata = { title: "Add source" };
// Uji koneksi berjalan sebagai server action di rute ini.
export const maxDuration = 60;

export default function NewSourcePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewSourceContent />
    </Suspense>
  );
}

async function NewSourceContent() {
  const user = await requireAdmin();
  return (
    <AppShell user={user} width="narrow">
      <PageHeader title="Add source" description="Register a repo whose task master file will be monitored." />
      <SourceForm
        initial={{
          name: "",
          provider: "github",
          repoUrl: "",
          branch: "main",
          filePath: ".taskmaster/tasks/tasks.json",
          hasToken: false,
          tokenExpiresOn: "",
        }}
      />
    </AppShell>
  );
}
