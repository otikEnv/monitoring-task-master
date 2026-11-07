import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadError } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { requireAdmin } from "@/lib/auth";
import { getSourceOptions, type SourceOption } from "@/lib/releases/load";
import { getRelease, type ReleaseRow } from "@/lib/releases/repo";
import { UUID } from "@/lib/releases/validate";
import { createClient } from "@/lib/supabase/server";
import { ReleaseForm } from "../../release-form";

export const metadata: Metadata = { title: "Ubah release" };

export default function EditReleasePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditReleaseContent params={params} />
    </Suspense>
  );
}

async function EditReleaseContent({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  let release: ReleaseRow | null;
  let sources: SourceOption[];
  try {
    [release, sources] = await Promise.all([getRelease(await createClient(), id.toLowerCase()), getSourceOptions()]);
  } catch (e) {
    console.error("[release] gagal memuat form ubah", { error: (e as Error)?.name });
    return (
      <AppShell user={user} width="narrow">
        <LoadError title="Data release belum bisa dimuat." />
      </AppShell>
    );
  }
  if (!release) notFound();

  return (
    <AppShell user={user} width="narrow">
      <PageHeader title={`Ubah release: ${release.name}`} />
      {/* key: form dibangun ulang bila data release berubah */}
      <ReleaseForm
        key={`${release.id}-${release.tag}-${release.rangeStart}-${release.rangeEnd}-${release.targetDate}-${release.startDate}`}
        sources={sources}
        initial={{
          id: release.id,
          sourceId: release.sourceId,
          tag: release.tag,
          name: release.name,
          rangeStart: String(release.rangeStart),
          rangeEnd: String(release.rangeEnd),
          startDate: release.startDate,
          targetDate: release.targetDate,
        }}
      />
    </AppShell>
  );
}
