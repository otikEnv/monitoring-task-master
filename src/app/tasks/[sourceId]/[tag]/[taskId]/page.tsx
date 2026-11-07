import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadError } from "@/components/layout/notices";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { TaskDetailView } from "@/components/tasks/task-detail";
import { requireUser } from "@/lib/auth";
import { getTaskDetail } from "@/lib/tasks/detail";
import { parseDetailKey, type TaskDetail } from "@/lib/tasks/detail-model";

export const metadata: Metadata = { title: "Task detail" };

type Params = Promise<{ sourceId: string; tag: string; taskId: string }>;

// Cache Components aktif: bagian yang membaca sesi dan params harus di dalam Suspense.
export default function TaskDetailPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
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
      <AppShell user={user} width="narrow">
        <LoadError title="The task detail could not be loaded." />
      </AppShell>
    );
  }

  if (!detail) notFound();

  return (
    <AppShell user={user} width="narrow">
      <TaskDetailView detail={detail} />
    </AppShell>
  );
}
