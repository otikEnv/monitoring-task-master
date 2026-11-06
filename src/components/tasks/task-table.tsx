import Link from "next/link";
import {
  hrefFor, nextSort, taskHref,
  type SortKey, type TaskListParams,
} from "@/lib/tasks/list-params";
import type { TaskListRow } from "@/lib/tasks/list";
import { PRIORITY_LABEL, PRIORITY_TONE, STATUS_LABEL, STATUS_TONE, displayStatus } from "@/lib/status";

const COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: "app", label: "Aplikasi" },
  { key: "tag", label: "Tag" },
  { key: "id", label: "ID", className: "w-16" },
  { key: "title", label: "Judul" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Prioritas" },
  { key: "subtasks", label: "Subtask", className: "text-right" },
];

export function StatusBadge({ status }: { status: string }) {
  const key = displayStatus(status);
  return (
    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs ${STATUS_TONE[key]}`}>
      {key === "other" ? `Lainnya (${status})` : STATUS_LABEL[key]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return <span className="text-neutral-400">-</span>;
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs ${PRIORITY_TONE[priority] ?? PRIORITY_TONE.low}`}>
      {PRIORITY_LABEL[priority] ?? priority}
    </span>
  );
}

/** Tabel task. Presentasional: judul kolom adalah tautan yang mengganti urutan lewat URL. */
export function TaskTable({ rows, params }: { rows: TaskListRow[]; params: TaskListParams }) {
  return (
    <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
      <table className="w-full min-w-[56rem] text-left text-sm">
        <caption className="sr-only">Daftar task semua aplikasi</caption>
        <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
          <tr>
            {COLUMNS.map((c) => {
              const active = params.sort === c.key;
              const { sort, dir } = nextSort(params, c.key);
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (params.dir === "asc" ? "ascending" : "descending") : "none"}
                  className={`px-3 py-2 ${c.className ?? ""}`}
                >
                  <Link
                    href={hrefFor(params, { sort, dir })}
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    {c.label}
                    <span aria-hidden="true" className={active ? "" : "opacity-30"}>
                      {active ? (params.dir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </Link>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {rows.map((r) => (
            <tr key={`${r.sourceId}:${r.tag}:${r.taskId}`} className="align-top hover:bg-neutral-50 dark:hover:bg-neutral-900/60">
              <td className="px-3 py-2">
                <Link href={hrefFor(params, { source: r.sourceId })} className="hover:underline">
                  {r.sourceName}
                </Link>
              </td>
              <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">{r.tag}</td>
              <td className="px-3 py-2 tabular-nums">{r.taskId}</td>
              <td className="px-3 py-2">
                <Link href={taskHref(r.sourceId, r.tag, r.taskId)} className="hover:underline">
                  {r.title}
                </Link>
              </td>
              <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
              <td className="px-3 py-2"><PriorityBadge priority={r.priority} /></td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.subtasksTotal > 0 ? `${r.subtasksDone}/${r.subtasksTotal}` : <span className="text-neutral-400">-</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
