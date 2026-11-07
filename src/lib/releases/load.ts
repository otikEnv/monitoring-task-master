import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { computeRelease, tasksInRange, type ReleaseStats, type TaskInput } from "./model";
import { RELEASE_COLUMNS, toRelease, type ReleaseRow } from "./repo";

export type ReleaseOverview = {
  release: ReleaseRow;
  sourceName: string;
  sourceActive: boolean;
  syncStatus: "never" | "success" | "failed";
  lastSyncedAt: string | null;
  /** false bila tag tidak punya task sama sekali pada data terakhir (tag berubah atau hilang). */
  tagFound: boolean;
  stats: ReleaseStats;
};

export type OverviewFilter = { id?: string; sourceId?: string; includeReleased?: boolean };

const PAGE = 1000; // batas baris per permintaan PostgREST
const TASK_COLUMNS = "task_id, title, status, priority, dependencies, subtasks_total, subtasks_done";

type TaskRow = {
  task_id: string; title: string; status: string; priority: string | null; dependencies: unknown;
  subtasks_total: number; subtasks_done: number;
};

const toInput = (r: TaskRow): TaskInput => ({
  taskId: r.task_id, title: r.title, status: r.status, priority: r.priority,
  dependencies: r.dependencies, subtasksTotal: r.subtasks_total, subtasksDone: r.subtasks_done,
});

/** Semua task satu aplikasi dan tag, dibaca berhalaman agar tidak terpotong batas baris. */
export async function fetchTagTasks(db: SupabaseClient, sourceId: string, tag: string): Promise<TaskInput[]> {
  const out: TaskInput[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("tasks").select(TASK_COLUMNS).eq("source_id", sourceId).eq("tag", tag)
      .order("task_id", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`Gagal membaca task: ${error.message}`);
    const rows = data as unknown as TaskRow[];
    out.push(...rows.map(toInput));
    if (rows.length < PAGE) return out;
  }
}

/** Yang belum rilis dulu (target terdekat lebih awal), lalu yang sudah rilis (terbaru dulu). */
export function sortOverviews(list: ReleaseOverview[]): ReleaseOverview[] {
  return [...list].sort((a, b) => {
    const ar = a.release.releasedOn, br = b.release.releasedOn;
    if (!ar !== !br) return ar ? 1 : -1;
    if (ar && br) return br.localeCompare(ar) || a.release.name.localeCompare(b.release.name, "id");
    return (
      a.release.targetDate.localeCompare(b.release.targetDate) ||
      a.sourceName.localeCompare(b.sourceName, "id") ||
      a.release.name.localeCompare(b.release.name, "id")
    );
  });
}

/**
 * Release beserta statistiknya. Klien HARUS membawa sesi pengguna (RLS berlaku). Task dibaca satu kali
 * per pasangan (aplikasi, tag) yang dipakai, lalu dipakai bersama oleh semua release pada pasangan itu.
 */
export async function loadReleaseOverviews(
  db: SupabaseClient,
  filter: OverviewFilter = {},
  now: Date = new Date(),
): Promise<ReleaseOverview[]> {
  let q = db.from("releases").select(RELEASE_COLUMNS);
  if (filter.id) q = q.eq("id", filter.id);
  if (filter.sourceId) q = q.eq("source_id", filter.sourceId);
  if (!filter.includeReleased && !filter.id) q = q.is("released_on", null);
  const rel = await q;
  if (rel.error) throw new Error(`Gagal membaca release: ${rel.error.message}`);
  const releases = (rel.data as unknown as Parameters<typeof toRelease>[0][]).map(toRelease);
  if (releases.length === 0) return [];

  const sourceIds = [...new Set(releases.map((r) => r.sourceId))];
  const src = await db
    .from("sources").select("id, name, is_active, last_sync_status, last_synced_at").in("id", sourceIds);
  if (src.error) throw new Error(`Gagal membaca sumber: ${src.error.message}`);
  const sources = new Map(
    (src.data as { id: string; name: string; is_active: boolean; last_sync_status: ReleaseOverview["syncStatus"]; last_synced_at: string | null }[])
      .map((s) => [s.id, s]),
  );

  const pairs = new Map<string, { sourceId: string; tag: string }>();
  for (const r of releases) pairs.set(`${r.sourceId}\u0000${r.tag}`, { sourceId: r.sourceId, tag: r.tag });
  const taskSets = new Map(
    await Promise.all(
      [...pairs].map(async ([key, p]) => [key, await fetchTagTasks(db, p.sourceId, p.tag)] as const),
    ),
  );

  return sortOverviews(
    releases.map((release): ReleaseOverview => {
      const s = sources.get(release.sourceId);
      const tasks = taskSets.get(`${release.sourceId}\u0000${release.tag}`) ?? [];
      return {
        release,
        sourceName: s?.name ?? "(aplikasi tidak ditemukan)",
        sourceActive: s?.is_active ?? false,
        syncStatus: s?.last_sync_status ?? "never",
        lastSyncedAt: s?.last_synced_at ?? null,
        tagFound: tasks.length > 0,
        stats: computeRelease(release, tasks, now),
      };
    }),
  );
}

/** Daftar release untuk pengguna yang sedang login (sesi dari cookie). */
export async function getReleaseOverviews(filter: OverviewFilter = {}): Promise<ReleaseOverview[]> {
  return loadReleaseOverviews(await createClient(), filter);
}

/** Satu release (termasuk yang sudah rilis); null bila tidak ada. */
export async function getReleaseOverview(id: string): Promise<ReleaseOverview | null> {
  return (await loadReleaseOverviews(await createClient(), { id }))[0] ?? null;
}

/** Pratinjau form: berapa task yang masuk rentang. */
export async function previewRange(
  db: SupabaseClient, sourceId: string, tag: string, rangeStart: number, rangeEnd: number,
): Promise<{ count: number; firstId: string | null; lastId: string | null }> {
  const inRange = tasksInRange(await fetchTagTasks(db, sourceId, tag), rangeStart, rangeEnd);
  return {
    count: inRange.length,
    firstId: inRange[0]?.taskId ?? null,
    lastId: inRange.at(-1)?.taskId ?? null,
  };
}

export type SourceOption = { id: string; name: string; tags: string[] };

/** Aplikasi beserta tag-nya, untuk pilihan pada form release. Klien HARUS membawa sesi pengguna. */
export async function loadSourceOptions(db: SupabaseClient): Promise<SourceOption[]> {
  const [src, tags] = await Promise.all([
    db.from("sources").select("id, name").order("name", { ascending: true }),
    db.from("source_tags").select("source_id, tag"),
  ]);
  if (src.error) throw new Error(`Gagal membaca sumber: ${src.error.message}`);
  if (tags.error) throw new Error(`Gagal membaca tag: ${tags.error.message}`);
  const bySource = new Map<string, string[]>();
  for (const t of tags.data as { source_id: string; tag: string }[]) {
    bySource.set(t.source_id, [...(bySource.get(t.source_id) ?? []), t.tag]);
  }
  return (src.data as { id: string; name: string }[]).map((s) => ({
    id: s.id,
    name: s.name,
    tags: (bySource.get(s.id) ?? []).sort((a, b) => a.localeCompare(b, "id")),
  }));
}

export async function getSourceOptions(): Promise<SourceOption[]> {
  return loadSourceOptions(await createClient());
}
