import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadError } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { requireAdmin } from "@/lib/auth";
import { getSourceOptions, type SourceOption } from "@/lib/releases/load";
import { parseReleaseListParams } from "@/lib/releases/params";
import { ReleaseForm } from "../release-form";

export const metadata: Metadata = { title: "Add release" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function NewReleasePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewReleaseContent searchParams={searchParams} />
    </Suspense>
  );
}

async function NewReleaseContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireAdmin();
  const { source } = parseReleaseListParams(await searchParams);

  let sources: SourceOption[] | null = null;
  try {
    sources = await getSourceOptions();
  } catch (e) {
    console.error("[release] gagal memuat pilihan aplikasi", { error: (e as Error)?.name });
  }

  // Aplikasi terisi otomatis bila hanya ada satu, atau dari ?source= (mis. dari filter daftar release).
  const preset = sources?.find((s) => s.id === source) ?? (sources?.length === 1 ? sources[0] : undefined);

  return (
    <AppShell user={user} width="narrow">
      <PageHeader title="Add release" description="A release target with a task number range on one application and tag." />
      {!sources ? (
        <LoadError title="The application options could not be loaded." />
      ) : (
        <ReleaseForm
          sources={sources}
          initial={{
            sourceId: preset?.id ?? "",
            tag: preset && preset.tags.length === 1 ? preset.tags[0] : "",
            name: "",
            rangeStart: "",
            rangeEnd: "",
            startDate: "",
            targetDate: "",
          }}
        />
      )}
    </AppShell>
  );
}
