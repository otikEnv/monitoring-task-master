import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { TaskDetailView } from "@/components/tasks/task-detail";
import { requireUser } from "@/lib/auth";
import { getTaskDetail } from "@/lib/tasks/detail";
import { parseDetailKey, type TaskDetail } from "@/lib/tasks/detail-model";

export const metadata: Metadata = { title: "Detail task" };

type Params = Promise<{ sourceId: string; tag: string; taskId: string }>;

// Cache Components aktif: bagian yang membaca sesi dan params harus di dalam <Suspense>.
export default function TaskDetailPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-sm text-neutral-500">Memuat…</p>}>
      <TaskDetailContent params={params} />
    </Suspense>
  );
}

async function TaskDetailContent({ params }: { params: Params }) {
  const user = await requireUser();
  // Segmen URL pada halaman datang masih ter-encode; parseDetailKey men-decode dan memvalidasinya.
  const key = parseDetailKey(await params);
  if (!key) notFound();

  let detail: TaskDetail | null;
  try {
    detail = await getTaskDetail(key);
  } catch (e) {
    console.error("[detail-task] gagal memuat data", { error: (e as Error)?.name });
    return (
      <>
        <AppHeader user={user} />
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950/40">
            <p className="font-medium text-red-800 dark:text-red-300">Detail task belum bisa dimuat.</p>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">Coba muat ulang halaman ini. Bila terus terjadi, hubungi admin.</p>
          </div>
        </main>
      </>
    );
  }

  if (!detail) notFound();

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <TaskDetailView detail={detail} />
      </main>
    </>
  );
}
