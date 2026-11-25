import type { Metadata } from "next";
import { Suspense } from "react";
import { ArchiveView } from "@/components/archive/archive-view";
import { AppShell } from "@/components/layout/app-shell";
import { LoadError } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { can } from "@/lib/access";
import { getArchive } from "@/lib/archive/load";
import { parseArchiveParams } from "@/lib/archive/params";
import { requireMenu } from "@/lib/auth";

export const metadata: Metadata = { title: "Archive" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Cache Components aktif: bagian yang membaca sesi dan searchParams harus di dalam Suspense.
export default function ArchivePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ArchiveContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ArchiveContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireMenu("archive");
  const params = parseArchiveParams(await searchParams);

  let data: Awaited<ReturnType<typeof getArchive>> | null = null;
  try {
    data = await getArchive(params);
  } catch (e) {
    console.error("[archive] gagal memuat data", { error: (e as Error)?.name });
  }

  return (
    <AppShell user={user}>
      <PageHeader
        title="Archive"
        description="Applications and releases hidden from the Dashboard and the Release list. Nothing is deleted."
      />
      {!data ? (
        <LoadError title="The archive could not be loaded." />
      ) : (
        <ArchiveView
          params={{ ...params, page: (params.tab === "applications" ? data.applications?.page : data.releases?.page) ?? 1 }}
          applications={data.applications}
          releases={data.releases}
          counts={data.counts}
          isAdmin={can(user.role, "release.manage")}
        />
      )}
    </AppShell>
  );
}
