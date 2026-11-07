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

export const metadata: Metadata = { title: "Daftar task" };

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
      <PageHeader title="Daftar task" description="Semua task dari seluruh aplikasi yang dipantau." />

      {!data ? (
        <LoadError title="Daftar task belum bisa dimuat." />
      ) : (
        <>
          {/* key: formulir dibangun ulang saat URL berubah agar pilihan selalu sama dengan URL */}
          <FilterBar key={JSON.stringify(data.params)} params={data.params} sources={data.sources} tags={data.tags} />

          {data.ignoredTag && (
            <Notice>Tag &ldquo;{data.ignoredTag}&rdquo; tidak ada pada pilihan aplikasi ini, jadi filter tag diabaikan.</Notice>
          )}

          <p className="text-sm text-muted-foreground" aria-live="polite">
            {data.total === 0 ? "Tidak ada task." : `Menampilkan ${from}–${to} dari ${data.total} task`}
          </p>

          {data.total === 0 ? (
            <EmptyState>
              {hasActiveFilters(data.params) ? (
                <>
                  Tidak ada task yang cocok dengan filter.{" "}
                  <Link href="/tasks" className="underline">Hapus semua filter</Link>
                </>
              ) : (
                <>
                  Belum ada task. Sinkronkan aplikasi lewat tombol Segarkan di{" "}
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
