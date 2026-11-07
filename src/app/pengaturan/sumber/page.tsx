import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { SourcesTable } from "@/components/sources/sources-table";
import { buttonVariants } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { listSources } from "@/lib/sources/repo";

export const metadata: Metadata = { title: "Source settings" };

// Cache Components aktif: bagian yang membaca sesi (cookies) harus di dalam Suspense.
export default function SourcesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SourcesContent />
    </Suspense>
  );
}

async function SourcesContent() {
  const user = await requireAdmin();
  const sources = await listSources();

  return (
    <AppShell user={user} width="normal">
      <PageHeader
        title="Source settings"
        description="Monitored repos. Tokens are stored encrypted and never shown."
        actions={
          <Link href="/pengaturan/sumber/baru" className={buttonVariants()}>
            <Plus aria-hidden="true" /> Add source
          </Link>
        }
      />

      {sources.length === 0 ? (
        <EmptyState>
          No sources yet. Click <strong>Add source</strong> to register the first repo.
        </EmptyState>
      ) : (
        <SourcesTable sources={sources} />
      )}
    </AppShell>
  );
}
