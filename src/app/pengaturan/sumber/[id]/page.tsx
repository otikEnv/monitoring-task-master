import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { requireAdmin } from "@/lib/auth";
import { formatDateInput } from "@/lib/format";
import { getSourceView } from "@/lib/sources/repo";
import { SourceForm } from "../source-form";

export const metadata: Metadata = { title: "Edit source" };
// Uji koneksi berjalan sebagai server action di rute ini.
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function EditSourcePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditSourceContent params={params} />
    </Suspense>
  );
}

async function EditSourceContent({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const source = await getSourceView(id);
  if (!source) notFound();

  return (
    <AppShell user={user} width="narrow">
      <PageHeader title={`Edit source: ${source.name}`} />
      {/* key: form dibangun ulang bila data sumber berubah. Token TIDAK ikut dikirim ke klien. */}
      <SourceForm
        key={`${source.id}-${source.branch}-${source.filePath}`}
        initial={{
          id: source.id,
          name: source.name,
          provider: source.provider,
          repoUrl: source.repoUrl,
          branch: source.branch,
          filePath: source.filePath,
          hasToken: source.hasToken,
          tokenExpiresOn: formatDateInput(source.tokenExpiresAt),
        }}
      />
    </AppShell>
  );
}
