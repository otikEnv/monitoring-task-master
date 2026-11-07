import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, LoadError, Notice } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { TrendCharts } from "@/components/trend/trend-charts";
import { TrendControls } from "@/components/trend/trend-controls";
import { TrendTiles } from "@/components/trend/trend-tiles";
import { requireUser } from "@/lib/auth";
import { getTrend, type TrendData } from "@/lib/trend/data";
import { RANGE_LABEL, parseTrendParams, summarizeTrend } from "@/lib/trend/series";

export const metadata: Metadata = { title: "Trend" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Cache Components aktif: bagian yang membaca sesi dan searchParams harus di dalam Suspense.
export default function TrendPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TrendContent searchParams={searchParams} />
    </Suspense>
  );
}

async function TrendContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const requested = parseTrendParams(await searchParams);

  let data: TrendData | null = null;
  try {
    data = await getTrend(requested);
  } catch (e) {
    console.error("[tren] gagal memuat data", { error: (e as Error)?.name });
  }

  const summary = data ? summarizeTrend(data.points) : null;
  const rangeLabel = data ? (data.params.range === "all" ? "start of data" : `start of range (${RANGE_LABEL[data.params.range]})`) : "";

  return (
    <AppShell user={user} width="normal">
      <PageHeader
        title="Progress trend"
        description="How the number of tasks and the completion percentage change over time, from the snapshot of each sync."
      />

      {!data ? (
        <LoadError title="The trend data could not be loaded." />
      ) : (
        <>
          <TrendControls params={data.params} sources={data.sources} />

          {data.ignoredSource && (
            <Notice>The selected application was not found, so the combined view of all applications is shown.</Notice>
          )}
          {data.truncated && (
            <Notice>There is a lot of data in this range, so only part of it was read. Choose a shorter range.</Notice>
          )}

          {data.sources.length === 0 ? (
            <EmptyState>
              No applications are monitored yet.{" "}
              {user.role === "admin" ? (
                <Link href="/pengaturan/sumber/baru" className="underline">Add a source</Link>
              ) : (
                "Ask an admin to register an application."
              )}
            </EmptyState>
          ) : data.points.length === 0 ? (
            <EmptyState title="No trend data in this range yet.">
              A snapshot is created whenever Refresh finds a change in tasks.json. Try a longer
              range, or press Refresh on the <Link href="/" className="underline">Dashboard</Link>.
            </EmptyState>
          ) : (
            <>
              {summary && <TrendTiles summary={summary} period={rangeLabel} />}
              {data.points.length === 1 && (
                <p role="status" className="text-sm text-muted-foreground">
                  There is only one data point so far. The trend line appears after the next sync that changes the data.
                </p>
              )}
              <TrendCharts points={data.points} start={data.start} end={data.end} downsampled={data.downsampled} />
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
