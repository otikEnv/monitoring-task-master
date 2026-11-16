import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  aggregateRelease, computeRelease, tasksInRange,
  type ReleaseAggregate, type ReleaseStats, type TaskInput,
} from "./model";
import { loadLatestNotes, type LatestNote } from "./notes";
import { COMPONENT_COLUMNS, RELEASE_COLUMNS, toComponent, toRelease, type ComponentRow, type ReleaseRow } from "./repo";

/** Satu komponen release beserta sumbernya dan statistiknya sendiri (tanggal dari header release). */
export type ComponentOverview = {
  component: ComponentRow;
  sourceName: string;
  sourceActive: boolean;
  syncStatus: "never" | "success" | "failed";
  lastSyncedAt: string | null;
  /** false bila tag tidak punya task sama sekali pada data terakhir (tag berubah atau hilang). */
  tagFound: boolean;
  stats: ReleaseStats;
};

export type ReleaseOverview = {
  release: ReleaseRow;
  /** Urut menurut nama aplikasi lalu tag. Kosong bila semua aplikasinya sudah dihapus. */
  components: ComponentOverview[];
  /** Gabungan seluruh komponen. */
  stats: ReleaseAggregate;
  /** Catatan bebas terbaru (bukan entri sistem); null bila belum ada. */
  latestNote: LatestNote | null;
};

export type OverviewFilter = {
  id?: string;
  sourceId?: string;
  includeReleased?: boolean;
  /** Release yang diarsipkan disembunyikan, kecuali bila dibaca lewat id (detail) atau diminta di sini. */
  includeArchived?: boolean;
};

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

/** Urutan kelompok: berjalan (0), ditahan (1), sudah rilis (2). */
const group = (o: ReleaseOverview) => (o.release.releasedOn ? 2 : o.release.heldAt ? 1 : 0);

/**
 * Yang berjalan dulu (target terdekat lebih awal), lalu yang ditahan (urutan sama), lalu yang sudah rilis
 * (terbaru dulu). Release yang ditahan tidak diprioritaskan di atas yang sedang berjalan.
 */
export function sortOverviews(list: ReleaseOverview[]): ReleaseOverview[] {
  return [...list].sort((a, b) => {
    const ga = group(a), gb = group(b);
    if (ga !== gb) return ga - gb;
    const ar = a.release.releasedOn, br = b.release.releasedOn;
    if (ar && br) return br.localeCompare(ar) || a.release.name.localeCompare(b.release.name, "en");
    return (
      a.release.targetDate.localeCompare(b.release.targetDate) ||
      a.release.name.localeCompare(b.release.name, "en")
    );
  });
}

/**
 * Release beserta statistiknya. Klien HARUS membawa sesi pengguna (RLS berlaku). Task dibaca satu kali
 * per pasangan (aplikasi, tag) yang dipakai, lalu dipakai bersama oleh semua komponen pada pasangan itu.
 */
export async function loadReleaseOverviews(
  db: SupabaseClient,
  filter: OverviewFilter = {},
  now: Date = new Date(),
): Promise<ReleaseOverview[]> {
  let q = db.from("releases").select(RELEASE_COLUMNS);
  if (filter.id) q = q.eq("id", filter.id);
  if (filter.sourceId) {
    // Release yang punya komponen dari aplikasi ini.
    const mine = await db.from("release_components").select("release_id").eq("source_id", filter.sourceId);
    if (mine.error) throw new Error(`Gagal membaca komponen release: ${mine.error.message}`);
    const ids = [...new Set((mine.data as { release_id: string }[]).map((r) => r.release_id))];
    if (ids.length === 0) return [];
    q = q.in("id", ids);
  }
  if (!filter.includeReleased && !filter.id) q = q.is("released_on", null);
  if (!filter.includeArchived && !filter.id) q = q.is("archived_at", null);
  const rel = await q;
  if (rel.error) throw new Error(`Gagal membaca release: ${rel.error.message}`);
  const headers = rel.data as unknown as Parameters<typeof toRelease>[0][];
  if (headers.length === 0) return [];

  const comps = await db
    .from("release_components").select(COMPONENT_COLUMNS).in("release_id", headers.map((h) => h.id));
  if (comps.error) throw new Error(`Gagal membaca komponen release: ${comps.error.message}`);
  const components = (comps.data as unknown as Parameters<typeof toComponent>[0][]).map(toComponent);

  const sourceIds = [...new Set(components.map((c) => c.sourceId))];
  const sources = new Map<string, {
    id: string; name: string; is_active: boolean; last_sync_status: ComponentOverview["syncStatus"]; last_synced_at: string | null;
  }>();
  if (sourceIds.length > 0) {
    const src = await db
      .from("sources").select("id, name, is_active, last_sync_status, last_synced_at").in("id", sourceIds);
    if (src.error) throw new Error(`Gagal membaca sumber: ${src.error.message}`);
    for (const s of src.data as { id: string; name: string; is_active: boolean; last_sync_status: ComponentOverview["syncStatus"]; last_synced_at: string | null }[]) {
      sources.set(s.id, s);
    }
  }

  const latestNotes = await loadLatestNotes(db, headers.map((h) => h.id));

  const pairs = new Map<string, { sourceId: string; tag: string }>();
  for (const c of components) pairs.set(`${c.sourceId}\u0000${c.tag}`, { sourceId: c.sourceId, tag: c.tag });
  const taskSets = new Map(
    await Promise.all(
      [...pairs].map(async ([key, p]) => [key, await fetchTagTasks(db, p.sourceId, p.tag)] as const),
    ),
  );

  return sortOverviews(
    headers.map((h): ReleaseOverview => {
      const mine = components.filter((c) => c.releaseId === h.id);
      const release = toRelease(h, mine);
      const overviews = mine
        .map((component): ComponentOverview => {
          const s = sources.get(component.sourceId);
          const tasks = taskSets.get(`${component.sourceId}\u0000${component.tag}`) ?? [];
          return {
            component,
            sourceName: s?.name ?? "(application not found)",
            sourceActive: s?.is_active ?? false,
            syncStatus: s?.last_sync_status ?? "never",
            lastSyncedAt: s?.last_synced_at ?? null,
            tagFound: tasks.length > 0,
            stats: computeRelease({ ...release, ...component }, tasks, now),
          };
        })
        .sort((a, b) => a.sourceName.localeCompare(b.sourceName, "en") || a.component.tag.localeCompare(b.component.tag, "en"));
      release.components = overviews.map((o) => o.component);
      return {
        release,
        components: overviews,
        stats: aggregateRelease(release, overviews.map((o) => o.stats), now),
        latestNote: latestNotes.get(h.id) ?? null,
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

/**
 * Aplikasi beserta tag-nya, untuk pilihan pada form release. Aplikasi yang diarsipkan tidak ditawarkan,
 * kecuali yang id-nya ada di `keepIds` (komponen release yang sedang diubah tetap harus bisa dipilih).
 * Klien HARUS membawa sesi pengguna.
 */
export async function loadSourceOptions(db: SupabaseClient, keepIds: string[] = []): Promise<SourceOption[]> {
  const safe = keepIds.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  let sourceQuery = db.from("sources").select("id, name");
  sourceQuery = safe.length > 0
    ? sourceQuery.or(`archived_at.is.null,id.in.(${safe.join(",")})`)
    : sourceQuery.is("archived_at", null);
  const [src, tags] = await Promise.all([
    sourceQuery.order("name", { ascending: true }),
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
    tags: (bySource.get(s.id) ?? []).sort((a, b) => a.localeCompare(b, "en")),
  }));
}

export async function getSourceOptions(keepIds: string[] = []): Promise<SourceOption[]> {
  return loadSourceOptions(await createClient(), keepIds);
}
