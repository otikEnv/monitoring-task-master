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

export const metadata: Metadata = { title: "Pengaturan sumber" };

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
        title="Pengaturan sumber"
        description="Repo yang dipantau. Token disimpan terenkripsi dan tidak pernah ditampilkan."
        actions={
          <Link href="/pengaturan/sumber/baru" className={buttonVariants()}>
            <Plus aria-hidden="true" /> Tambah sumber
          </Link>
        }
      />

      {sources.length === 0 ? (
        <EmptyState>
          Belum ada sumber. Klik <strong>Tambah sumber</strong> untuk mendaftarkan repo pertama.
        </EmptyState>
      ) : (
        <SourcesTable sources={sources} />
      )}
    </AppShell>
  );
}
