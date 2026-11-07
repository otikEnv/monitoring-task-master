import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[key]}`}>
      {key === "other" ? `Lainnya (${status})` : STATUS_LABEL[key]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return <span className="text-muted-foreground">-</span>;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_TONE[priority] ?? PRIORITY_TONE.low}`}>
      {PRIORITY_LABEL[priority] ?? priority}
    </span>
  );
}

/** Tabel task. Presentasional: judul kolom adalah tautan yang mengganti urutan lewat URL. */
export function TaskTable({ rows, params }: { rows: TaskListRow[]; params: TaskListParams }) {
  return (
    <div className="rounded-xl border bg-card">
      <Table className="min-w-[56rem]">
        <TableCaption className="sr-only">Daftar task semua aplikasi</TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {COLUMNS.map((c) => {
              const active = params.sort === c.key;
              const { sort, dir } = nextSort(params, c.key);
              const Icon = active ? (params.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <TableHead
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (params.dir === "asc" ? "ascending" : "descending") : "none"}
                  className={c.className}
                >
                  <Link
                    href={hrefFor(params, { sort, dir })}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    {c.label}
                    <Icon aria-hidden="true" className={`size-3.5 ${active ? "" : "opacity-40"}`} />
                  </Link>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={`${r.sourceId}:${r.tag}:${r.taskId}`} className="align-top">
              <TableCell>
                <Link href={hrefFor(params, { source: r.sourceId })} className="hover:underline">
                  {r.sourceName}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{r.tag}</TableCell>
              <TableCell className="tabular-nums">{r.taskId}</TableCell>
              <TableCell className="whitespace-normal">
                <Link href={taskHref(r.sourceId, r.tag, r.taskId)} className="font-medium hover:underline">
                  {r.title}
                </Link>
              </TableCell>
              <TableCell><StatusBadge status={r.status} /></TableCell>
              <TableCell><PriorityBadge priority={r.priority} /></TableCell>
              <TableCell className="text-right tabular-nums">
                {r.subtasksTotal > 0 ? `${r.subtasksDone}/${r.subtasksTotal}` : <span className="text-muted-foreground">-</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
