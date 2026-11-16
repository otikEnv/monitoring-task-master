import type { ComponentOverview, ReleaseOverview } from "@/lib/releases/load";
import { aggregateRelease, computeRelease, type TaskInput } from "@/lib/releases/model";

export const REL_ID = "22222222-2222-4222-8222-222222222222";
export const SRC = "11111111-1111-4111-8111-111111111111";
export const SRC2 = "33333333-3333-4333-8333-333333333333";

export const task = (id: number, status: string, extra: Partial<TaskInput> = {}): TaskInput => ({
  taskId: String(id), title: `Judul ${id}`, status, priority: id % 2 ? "high" : null, dependencies: [],
  subtasksTotal: id === 100 ? 4 : 0, subtasksDone: id === 100 ? 3 : 0, ...extra,
});

export type Part = {
  tasks: TaskInput[];
  sourceId?: string;
  sourceName?: string;
  tag?: string;
  rangeStart?: number;
  rangeEnd?: number;
  sourceActive?: boolean;
  syncStatus?: "never" | "success" | "failed";
  lastSyncedAt?: string | null;
  tagFound?: boolean;
};

/** ReleaseOverview palsu dengan statistik yang dihitung sungguhan (computeRelease + aggregateRelease). */
export function overviewOf(
  parts: Part[],
  { releasedOn = null, now = "2026-11-11", name = "v2.1", heldAt = null, holdReason = null, latestNote = null }: {
    releasedOn?: string | null; now?: string; name?: string; heldAt?: string | null; holdReason?: string | null;
    latestNote?: ReleaseOverview["latestNote"];
  } = {},
): ReleaseOverview {
  const at = new Date(`${now}T12:00:00+07:00`);
  const header = { startDate: "2026-11-01", targetDate: "2026-11-21", releasedOn, heldAt, holdReason };
  const components: ComponentOverview[] = parts.map((p, i) => {
    const component = {
      id: `c${i}`, releaseId: REL_ID, sourceId: p.sourceId ?? SRC, tag: p.tag ?? "master",
      rangeStart: p.rangeStart ?? 100, rangeEnd: p.rangeEnd ?? 200,
    };
    return {
      component,
      sourceName: p.sourceName ?? "Echo App",
      sourceActive: p.sourceActive ?? true,
      syncStatus: p.syncStatus ?? "success",
      lastSyncedAt: p.lastSyncedAt === undefined ? "2026-11-10T03:00:00Z" : p.lastSyncedAt,
      tagFound: p.tagFound ?? p.tasks.length > 0,
      stats: computeRelease({ ...header, rangeStart: component.rangeStart, rangeEnd: component.rangeEnd }, p.tasks, at),
    };
  });
  return {
    release: { id: REL_ID, name, ...header, createdAt: "2026-11-01T00:00:00Z", archivedAt: null, heldAt, holdReason, components: components.map((c) => c.component) },
    components,
    stats: aggregateRelease(header, components.map((c) => c.stats), at),
    latestNote,
  };
}
