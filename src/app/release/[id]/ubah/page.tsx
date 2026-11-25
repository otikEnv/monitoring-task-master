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

export const metadata: Metadata = { title: "Edit release" };

export default function EditReleasePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditReleaseContent params={params} />
    </Suspense>
  );
}

async function EditReleaseContent({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin("release");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  let release: ReleaseRow | null;
  let sources: SourceOption[];
  try {
    release = await getRelease(await createClient(), id.toLowerCase());
    // Komponen yang memakai aplikasi terarsip tetap harus bisa dipilih saat mengubah.
    sources = await getSourceOptions(release?.components.map((c) => c.sourceId) ?? []);
  } catch (e) {
    console.error("[release] gagal memuat form ubah", { error: (e as Error)?.name });
    return (
      <AppShell user={user} width="narrow">
        <LoadError title="The release data could not be loaded." />
      </AppShell>
    );
  }
  if (!release) notFound();

  // Urut menurut nama aplikasi lalu tag, sama dengan halaman detail.
  const nameOf = (sourceId: string) => sources.find((s) => s.id === sourceId)?.name ?? "";
  const components = [...release.components]
    .sort((a, b) => nameOf(a.sourceId).localeCompare(nameOf(b.sourceId), "en") || a.tag.localeCompare(b.tag, "en"))
    .map((c) => ({ sourceId: c.sourceId, tag: c.tag, rangeStart: String(c.rangeStart), rangeEnd: String(c.rangeEnd) }));

  return (
    <AppShell user={user} width="narrow">
      <PageHeader title={`Edit release: ${release.name}`} />
      {/* key: form dibangun ulang bila data release berubah */}
      <ReleaseForm
        key={`${release.id}-${release.name}-${release.targetDate}-${release.startDate}-${JSON.stringify(components)}`}
        sources={sources}
        initial={{
          id: release.id,
          name: release.name,
          startDate: release.startDate,
          targetDate: release.targetDate,
          components,
        }}
      />
    </AppShell>
  );
}
