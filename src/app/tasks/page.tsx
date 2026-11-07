import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, LoadError, Notice } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { FilterBar } from "@/components/tasks/filter-bar";
import { Pagination } from "@/components/tasks/pagination";
import { TaskTable } from "@/components/tasks/task-table";
import { requireUser } from "@/lib/auth";
import { hasActiveFilters, parseTaskListParams } from "@/lib/tasks/list-params";
import { getTaskList, type TaskListResult } from "@/lib/tasks/list";

export const metadata: Metadata = { title: "Task list" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Cache Components aktif: bagian yang membaca sesi dan searchParams harus di dalam Suspense.
export default function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TasksContent searchParams={searchParams} />
    </Suspense>
  );
}

async function TasksContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = parseTaskListParams(await searchParams);

  let data: TaskListResult | null = null;
  try {
    data = await getTaskList(params);
  } catch (e) {
    console.error("[daftar-task] gagal memuat data", { error: (e as Error)?.name });
  }

  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <AppShell user={user}>
      <PageHeader title="Task list" description="All tasks from every monitored application." />

      {!data ? (
        <LoadError title="The task list could not be loaded." />
      ) : (
        <>
          {/* key: formulir dibangun ulang saat URL berubah agar pilihan selalu sama dengan URL */}
          <FilterBar key={JSON.stringify(data.params)} params={data.params} sources={data.sources} tags={data.tags} />

          {data.ignoredTag && (
            <Notice>Tag &ldquo;{data.ignoredTag}&rdquo; does not exist for the selected application, so the tag filter was ignored.</Notice>
          )}

          <p className="text-sm text-muted-foreground" aria-live="polite">
            {data.total === 0 ? "No tasks." : `Showing ${from}–${to} of ${data.total} tasks`}
          </p>

          {data.total === 0 ? (
            <EmptyState>
              {hasActiveFilters(data.params) ? (
                <>
                  No tasks match the filters.{" "}
                  <Link href="/tasks" className="underline">Clear all filters</Link>
                </>
              ) : (
                <>
                  No tasks yet. Sync an application with the Refresh button on the{" "}
                  <Link href="/" className="underline">Dashboard</Link>.
                </>
              )}
            </EmptyState>
          ) : (
            <>
              <TaskTable rows={data.rows} params={data.params} />
              <Pagination params={data.params} page={data.page} pageCount={data.pageCount} />
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
