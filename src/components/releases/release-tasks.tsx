"use client";

import Link from "next/link";
import { useState } from "react";
import { PriorityBadge, StatusBadge } from "@/components/tasks/task-table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ReleaseTask } from "@/lib/releases/model";
import {
  NO_FILTER, isFiltered, matchesTask, priorityOptions, statusCounts, type TaskFilter,
} from "@/lib/releases/task-filter";
import { PRIORITY_LABEL, STATUS_LABEL, type DisplayStatus } from "@/lib/status";
import { taskHref } from "@/lib/tasks/list-params";
import { cn } from "@/lib/utils";

/** Task satu komponen release. `label` hanya untuk release lintas aplikasi (judul tabel). */
export type TaskGroup = { id: string; label: string | null; sourceId: string; tag: string; tasks: ReleaseTask[] };

const heading = "text-sm font-semibold uppercase tracking-wide text-muted-foreground";
const priorityText = (p: string) => (p === "none" ? "No priority" : PRIORITY_LABEL[p] ?? p);

function TaskTable({ group, tasks }: { group: TaskGroup; tasks: ReleaseTask[] }) {
  return (
    <div className="rounded-xl border bg-card">
      <Table className="min-w-[40rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="w-16">ID</TableHead>
            <TableHead scope="col">Title</TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col">Priority</TableHead>
            <TableHead scope="col" className="text-right">Subtask</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((t) => (
            <TableRow key={t.taskId} className="align-top">
              <TableCell className="tabular-nums">{t.taskId}</TableCell>
              <TableCell className="whitespace-normal">
                <Link href={taskHref(group.sourceId, group.tag, t.taskId)} className="font-medium hover:underline">
                  {t.title}
                </Link>
              </TableCell>
              <TableCell><StatusBadge status={t.status === "in_progress" ? "in-progress" : t.status} /></TableCell>
              <TableCell><PriorityBadge priority={t.priority} /></TableCell>
              <TableCell className="text-right tabular-nums">
                {t.subtasksTotal > 0 ? `${t.subtasksDone}/${t.subtasksTotal}` : <span className="text-muted-foreground">-</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Bagian "Tasks in range": filter status dan prioritas (baru diterapkan setelah Apply, sama dengan Calendar) dan
 * satu tabel per komponen. Komponen tanpa task yang cocok disembunyikan.
 */
export function ReleaseTasks({ groups, total }: { groups: TaskGroup[]; total: number }) {
  const all = groups.flatMap((g) => g.tasks);
  const statuses = statusCounts(all);
  const priorities = priorityOptions(all);

  const [draft, setDraft] = useState<TaskFilter>(NO_FILTER);
  const [applied, setApplied] = useState<TaskFilter>(NO_FILTER);
  const changed = draft.statuses.join(",") !== applied.statuses.join(",") || draft.priority !== applied.priority;

  const toggle = (s: DisplayStatus) =>
    setDraft((d) => ({
      ...d,
      statuses: d.statuses.includes(s)
        ? d.statuses.filter((x) => x !== s)
        : statuses.map((x) => x.status).filter((x) => x === s || d.statuses.includes(x)),
    }));

  const shown = groups.map((g) => ({ g, tasks: g.tasks.filter((t) => matchesTask(t, applied)) }));
  const shownCount = shown.reduce((n, x) => n + x.tasks.length, 0);
  const filtered = isFiltered(applied);

  return (
    <section aria-labelledby="sec-task" className="space-y-5">
      <h2 id="sec-task" className={heading}>
        Tasks in range ({filtered ? `${shownCount} of ${total}` : total})
      </h2>

      {total === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No tasks in the ranges yet.</p>
      ) : (
        <>
          <form
            onSubmit={(e) => { e.preventDefault(); setApplied(draft); }}
            className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-xl border bg-card p-3"
          >
            <fieldset className="space-y-1.5">
              <legend className="text-xs text-muted-foreground">Status</legend>
              <div className="flex flex-wrap gap-1.5">
                {statuses.map(({ status, count }) => {
                  const on = draft.statuses.includes(status);
                  return (
                    <button
                      key={status} type="button" aria-pressed={on} onClick={() => toggle(status)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium",
                        on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {STATUS_LABEL[status]} <span className="tabular-nums opacity-80">{count}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="t-priority" className="text-xs text-muted-foreground">Priority</Label>
                <NativeSelect id="t-priority" value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}>
                  <option value="">All priorities</option>
                  {priorities.map((p) => <option key={p} value={p}>{priorityText(p)}</option>)}
                </NativeSelect>
              </div>
              <Button type="submit" size="sm" variant={changed ? "default" : "outline"}>Apply</Button>
              {(filtered || changed) && (
                <Button type="button" size="sm" variant="ghost" onClick={() => { setDraft(NO_FILTER); setApplied(NO_FILTER); }}>
                  Reset
                </Button>
              )}
              {changed && <span role="status" className="pb-1 text-xs text-muted-foreground">Not applied yet</span>}
            </div>
          </form>

          {shownCount === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No tasks match the filter.
            </p>
          ) : (
            shown.filter((x) => x.tasks.length > 0).map(({ g, tasks }) => (
              <div key={g.id} className="space-y-2">
                {g.label && (
                  <h3 className="text-sm font-semibold">
                    {g.label} ({filtered ? `${tasks.length} of ${g.tasks.length}` : g.tasks.length})
                  </h3>
                )}
                <TaskTable group={g} tasks={tasks} />
              </div>
            ))
          )}
        </>
      )}
    </section>
  );
}
