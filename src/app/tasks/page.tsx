import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { FilterBar } from "@/components/tasks/filter-bar";
import { Pagination } from "@/components/tasks/pagination";
import { TaskTable } from "@/components/tasks/task-table";
import { requireUser } from "@/lib/auth";
import { hasActiveFilters, parseTaskListParams } from "@/lib/tasks/list-params";
import { getTaskList, type TaskListResult } from "@/lib/tasks/list";

export const metadata: Metadata = { title: "Daftar task" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Cache Components aktif: bagian yang membaca sesi dan searchParams harus di dalam <Suspense>.
export default function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-sm text-neutral-500">Memuat…</p>}>
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
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-8">
        <div>
          <h1 className="text-xl font-semibold">Daftar task</h1>
          <p className="text-sm text-neutral-500">Semua task dari seluruh aplikasi yang dipantau.</p>
        </div>

        {!data ? (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950/40">
            <p className="font-medium text-red-800 dark:text-red-300">Daftar task belum bisa dimuat.</p>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">Coba muat ulang halaman ini. Bila terus terjadi, hubungi admin.</p>
          </div>
        ) : (
          <>
            {/* key: formulir dibangun ulang saat URL berubah agar pilihan selalu sama dengan URL */}
            <FilterBar key={JSON.stringify(data.params)} params={data.params} sources={data.sources} tags={data.tags} />

            {data.ignoredTag && (
              <p role="status" className="rounded-md bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Tag &ldquo;{data.ignoredTag}&rdquo; tidak ada pada pilihan aplikasi ini, jadi filter tag diabaikan.
              </p>
            )}

            <p className="text-sm text-neutral-600 dark:text-neutral-400" aria-live="polite">
              {data.total === 0
                ? "Tidak ada task."
                : `Menampilkan ${from}–${to} dari ${data.total} task`}
            </p>

            {data.total === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
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
              </div>
            ) : (
              <>
                <TaskTable rows={data.rows} params={data.params} />
                <Pagination params={data.params} page={data.page} pageCount={data.pageCount} />
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
