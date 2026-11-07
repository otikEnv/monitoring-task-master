import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadError } from "@/components/layout/notices";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { ReleaseDetailView } from "@/components/releases/release-detail";
import { requireUser } from "@/lib/auth";
import { getReleaseOverview, type ReleaseOverview } from "@/lib/releases/load";
import { UUID } from "@/lib/releases/validate";
import { ReleaseActions } from "../release-actions";

export const metadata: Metadata = { title: "Release detail" };

type Params = Promise<{ id: string }>;

// Cache Components aktif: bagian yang membaca sesi dan params harus di dalam Suspense.
export default function ReleaseDetailPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReleaseDetailContent params={params} />
    </Suspense>
  );
}

async function ReleaseDetailContent({ params }: { params: Params }) {
  const user = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  let overview: ReleaseOverview | null;
  try {
    overview = await getReleaseOverview(id.toLowerCase());
  } catch (e) {
    console.error("[release] gagal memuat detail", { error: (e as Error)?.name });
    return (
      <AppShell user={user} width="normal">
        <LoadError title="The release detail could not be loaded." />
      </AppShell>
    );
  }
  if (!overview) notFound();

  return (
    <AppShell user={user} width="normal">
      <ReleaseDetailView
        overview={overview}
        actions={
          user.role === "admin" ? (
            <ReleaseActions id={overview.release.id} name={overview.release.name} released={Boolean(overview.release.releasedOn)} />
          ) : undefined
        }
      />
    </AppShell>
  );
}
