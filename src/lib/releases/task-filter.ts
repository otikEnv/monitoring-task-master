// Filter tabel "Tasks in range" di detail release (status dan prioritas). Murni: aman dipakai di klien.
import { STATUS_ORDER, type DisplayStatus } from "@/lib/status";
import type { ReleaseTask } from "./model";

/** "" = semua prioritas; "none" = task tanpa prioritas; selain itu nilai prioritas apa adanya (mis. "high"). */
export type PriorityFilter = string;

export type TaskFilter = {
  /** Status yang ditampilkan; kosong = semua status. */
  statuses: DisplayStatus[];
  priority: PriorityFilter;
};

export const NO_FILTER: TaskFilter = { statuses: [], priority: "" };

export const isFiltered = (f: TaskFilter) => f.statuses.length > 0 || f.priority !== "";

export function matchesTask(t: ReleaseTask, f: TaskFilter): boolean {
  if (f.statuses.length > 0 && !f.statuses.includes(t.status)) return false;
  if (f.priority === "none") return !t.priority;
  if (f.priority !== "") return t.priority === f.priority;
  return true;
}

/** Status yang benar-benar ada di task, dengan jumlahnya, urut STATUS_ORDER. */
export function statusCounts(tasks: ReleaseTask[]): { status: DisplayStatus; count: number }[] {
  const counts = new Map<DisplayStatus, number>();
  for (const t of tasks) counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
  return STATUS_ORDER.filter((s) => counts.has(s)).map((s) => ({ status: s, count: counts.get(s)! }));
}

const PRIORITY_ORDER = ["high", "medium", "low"];

/** Prioritas yang ada di task (urut high, medium, low, lalu nilai lain), plus "none" bila ada task tanpa prioritas. */
export function priorityOptions(tasks: ReleaseTask[]): string[] {
  const set = new Set(tasks.map((t) => t.priority ?? "none"));
  const known = PRIORITY_ORDER.filter((p) => set.has(p));
  const other = [...set].filter((p) => p !== "none" && !PRIORITY_ORDER.includes(p)).sort();
  return [...known, ...other, ...(set.has("none") ? ["none"] : [])];
}
