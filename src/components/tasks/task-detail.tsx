import Link from "next/link";
import { Markdown } from "@/components/markdown";
import { PriorityBadge, StatusBadge } from "@/components/tasks/task-table";
import { formatDateTime } from "@/lib/format";
import { hrefFor, DEFAULT_PARAMS, taskHref } from "@/lib/tasks/list-params";
import { subtaskProgress, type TaskDetail } from "@/lib/tasks/detail-model";

const section = "space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800";
const heading = "text-sm font-semibold uppercase tracking-wide text-neutral-500";

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-neutral-500">{children}</p>;
}

/** Tampilan detail satu task. Presentasional dan hanya-baca: tidak ada aksi yang mengubah task. */
export function TaskDetailView({ detail }: { detail: TaskDetail }) {
  const { done, total } = subtaskProgress(detail.subtasks);
  const backToList = hrefFor(DEFAULT_PARAMS, { source: detail.sourceId, tag: detail.tag });

  return (
    <div className="space-y-5">
      <nav aria-label="Navigasi" className="flex flex-wrap items-center gap-1.5 text-sm text-neutral-500">
        <Link href="/tasks" className="hover:underline">Daftar task</Link>
        <span aria-hidden="true">›</span>
        <Link href={hrefFor(DEFAULT_PARAMS, { source: detail.sourceId })} className="hover:underline">{detail.sourceName}</Link>
        <span aria-hidden="true">›</span>
        <Link href={backToList} className="hover:underline">{detail.tag}</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">Task {detail.taskId}</span>
      </nav>

      <header className="space-y-2">
        <h1 className="text-xl font-semibold leading-snug break-words">
          <span className="text-neutral-500">#{detail.taskId}</span> {detail.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={detail.status} />
          <PriorityBadge priority={detail.priority} />
          {total > 0 && (
            <span className="text-xs text-neutral-500">{done} dari {total} subtask selesai</span>
          )}
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-xs text-neutral-500 sm:grid-cols-3">
          <div><dt className="inline">Aplikasi: </dt><dd className="inline text-neutral-800 dark:text-neutral-200">{detail.sourceName}</dd></div>
          <div><dt className="inline">Tag: </dt><dd className="inline text-neutral-800 dark:text-neutral-200">{detail.tag}</dd></div>
          <div><dt className="inline">Data diperbarui: </dt><dd className="inline text-neutral-800 dark:text-neutral-200">{formatDateTime(detail.updatedAt)}</dd></div>
        </dl>
      </header>

      {detail.description && (
        <section aria-labelledby="sec-deskripsi" className={section}>
          <h2 id="sec-deskripsi" className={heading}>Deskripsi</h2>
          <Markdown>{detail.description}</Markdown>
        </section>
      )}

      <section aria-labelledby="sec-dependensi" className={section}>
        <h2 id="sec-dependensi" className={heading}>Dependensi</h2>
        {detail.dependencies.length === 0 ? (
          <Empty>Tidak bergantung pada task lain.</Empty>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {detail.dependencies.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                {d.found ? (
                  <>
                    <Link href={taskHref(detail.sourceId, detail.tag, d.id)} className="underline break-words">
                      #{d.id} {d.title}
                    </Link>
                    <StatusBadge status={d.status ?? "pending"} />
                  </>
                ) : (
                  <>
                    <span>#{d.id}</span>
                    <span className="text-xs text-neutral-500">(tidak ditemukan pada tag ini)</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="sec-detail" className={section}>
        <h2 id="sec-detail" className={heading}>Detail implementasi</h2>
        {detail.details ? <Markdown>{detail.details}</Markdown> : <Empty>Belum ada detail implementasi.</Empty>}
      </section>

      <section aria-labelledby="sec-uji" className={section}>
        <h2 id="sec-uji" className={heading}>Strategi pengujian</h2>
        {detail.testStrategy ? <Markdown>{detail.testStrategy}</Markdown> : <Empty>Belum ada strategi pengujian.</Empty>}
      </section>

      <section aria-labelledby="sec-subtask" className={section}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="sec-subtask" className={heading}>Subtask</h2>
          {total > 0 && <span className="text-xs text-neutral-500">{done} dari {total} selesai</span>}
        </div>
        {total === 0 ? (
          <Empty>Tidak ada subtask.</Empty>
        ) : (
          <ol className="space-y-3">
            {detail.subtasks.map((s) => (
              <li key={s.id} className="space-y-1.5 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs tabular-nums text-neutral-500">{detail.taskId}.{s.id}</span>
                  <span className="text-sm font-medium break-words">{s.title}</span>
                  <StatusBadge status={s.status} />
                </div>
                {s.dependencies.length > 0 && (
                  <p className="text-xs text-neutral-500">Bergantung pada: {s.dependencies.join(", ")}</p>
                )}
                {s.description && <Markdown>{s.description}</Markdown>}
                {s.details && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-xs text-neutral-600 hover:underline dark:text-neutral-400">
                      Lihat detail
                    </summary>
                    <div className="mt-2"><Markdown>{s.details}</Markdown></div>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <p>
        <Link href={backToList} className="text-sm text-neutral-600 hover:underline dark:text-neutral-400">
          ← Kembali ke daftar task
        </Link>
      </p>
    </div>
  );
}
