import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadReleaseOverviews, loadSourceOptions, type SourceOption } from "@/lib/releases/load";
import type { RiskLevel } from "@/lib/releases/model";
import { NOTE_COLUMNS, toNote, type NoteLinkRow, type NoteRow, type ReleaseSnapshot } from "./load";
import type { ReleaseSnapshotInput } from "./repo";
import { linkKey, type LinkInput } from "./validate";

type Db = SupabaseClient;

// ---------------------------------------------------------------------------
// Pilihan pada form
// ---------------------------------------------------------------------------

export type ReleaseOption = { id: string; name: string; released: boolean };
export type LinkOptions = { sources: SourceOption[]; releases: ReleaseOption[] };

/**
 * Aplikasi (dengan tag) dan release yang bisa ditautkan. Yang terarsip tidak ditawarkan untuk tautan baru,
 * kecuali id-nya ada di `keep` (tautan lama pada catatan yang sedang diubah).
 */
export async function loadLinkOptions(db: Db, keep: { sourceIds?: string[]; releaseIds?: string[] } = {}): Promise<LinkOptions> {
  const keepReleases = (keep.releaseIds ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  let q = db.from("releases").select("id, name, released_on");
  q = keepReleases.length > 0 ? q.or(`archived_at.is.null,id.in.(${keepReleases.join(",")})`) : q.is("archived_at", null);
  const [sources, rel] = await Promise.all([loadSourceOptions(db, keep.sourceIds ?? []), q.order("name", { ascending: true })]);
  if (rel.error) throw new Error(`Gagal membaca release: ${rel.error.message}`);
  return {
    sources,
    releases: (rel.data as { id: string; name: string; released_on: string | null }[])
      .map((r) => ({ id: r.id, name: r.name, released: r.released_on !== null })),
  };
}

// ---------------------------------------------------------------------------
// Validasi tautan baru dan rekaman kondisi release
// ---------------------------------------------------------------------------

/** Tautan yang belum ada di `existing` (tautan lama tidak diperiksa ulang: task-nya boleh sudah hilang). */
export function newLinks(links: LinkInput[], existing: NoteLinkRow[]): number[] {
  const old = new Set(existing.map((l) => linkKey(rowToInput(l))));
  return links.flatMap((l, i) => (old.has(linkKey(l)) ? [] : [i]));
}

export function rowToInput(l: NoteLinkRow): LinkInput {
  if (l.kind === "release") return { kind: "release", releaseId: l.releaseId! };
  if (l.kind === "task") return { kind: "task", sourceId: l.sourceId!, tag: l.tag!, taskId: l.taskId! };
  return { kind: "source", sourceId: l.sourceId! };
}

/**
 * Memeriksa bahwa sasaran tautan baru ada dan tidak terarsip. Mengembalikan pesan galat per posisi tautan
 * (posisi pada `links`). Aplikasi, release, dan task dibaca dalam beberapa kueri saja.
 */
export async function checkLinks(db: Db, links: LinkInput[], indexes: number[]): Promise<Map<number, string>> {
  const errors = new Map<number, string>();
  if (indexes.length === 0) return errors;
  const picked = indexes.map((i) => ({ i, l: links[i] }));
  const sourceIds = [...new Set(picked.flatMap(({ l }) => (l.kind === "release" ? [] : [l.sourceId])))];
  const releaseIds = [...new Set(picked.flatMap(({ l }) => (l.kind === "release" ? [l.releaseId] : [])))];

  const [src, rel] = await Promise.all([
    sourceIds.length > 0 ? db.from("sources").select("id, archived_at").in("id", sourceIds) : Promise.resolve({ data: [], error: null }),
    releaseIds.length > 0 ? db.from("releases").select("id, archived_at").in("id", releaseIds) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [src, rel]) if (r.error) throw new Error(`Gagal memeriksa tautan: ${r.error.message}`);
  const sources = new Map((src.data as { id: string; archived_at: string | null }[]).map((r) => [r.id, r.archived_at]));
  const releases = new Map((rel.data as { id: string; archived_at: string | null }[]).map((r) => [r.id, r.archived_at]));

  for (const { i, l } of picked) {
    if (l.kind === "release") {
      if (!releases.has(l.releaseId)) errors.set(i, "This release does not exist.");
      else if (releases.get(l.releaseId)) errors.set(i, "This release is archived. Restore it first.");
      continue;
    }
    if (!sources.has(l.sourceId)) errors.set(i, "This application does not exist.");
    else if (sources.get(l.sourceId)) errors.set(i, "This application is archived. Restore it first.");
  }

  // Task: satu kueri per (aplikasi, tag).
  const groups = new Map<string, { sourceId: string; tag: string; items: { i: number; taskId: string }[] }>();
  for (const { i, l } of picked) {
    if (l.kind !== "task" || errors.has(i)) continue;
    const k = `${l.sourceId}\u0000${l.tag}`;
    const g = groups.get(k) ?? { sourceId: l.sourceId, tag: l.tag, items: [] };
    g.items.push({ i, taskId: l.taskId });
    groups.set(k, g);
  }
  for (const g of groups.values()) {
    const res = await db.from("tasks").select("task_id").eq("source_id", g.sourceId).eq("tag", g.tag)
      .in("task_id", g.items.map((x) => x.taskId));
    if (res.error) throw new Error(`Gagal memeriksa task: ${res.error.message}`);
    const found = new Set((res.data as { task_id: string }[]).map((r) => r.task_id));
    for (const x of g.items) if (!found.has(x.taskId)) errors.set(x.i, `Task #${x.taskId} does not exist in tag ${g.tag}.`);
  }
  return errors;
}

/** Kondisi release saat ini, dalam bentuk yang disimpan sebagai rekaman. */
export async function releaseSnapshots(db: Db, releaseIds: string[], now: Date = new Date()): Promise<Map<string, ReleaseSnapshotInput>> {
  const out = new Map<string, ReleaseSnapshotInput>();
  for (const id of new Set(releaseIds)) {
    const [o] = await loadReleaseOverviews(db, { id }, now);
    if (!o) continue;
    out.set(id, {
      progressPercent: o.stats.total > 0 ? (o.stats.done * 100) / o.stats.total : 0,
      done: o.stats.done,
      total: o.stats.total,
      risk: o.stats.risk,
      // Sisa hari kerja; bila target sudah lewat, hari kalender negatif (seperti Overdue).
      daysLeft: o.stats.daysLeft < 0 ? o.stats.daysLeft : (o.stats.workingDaysLeft ?? o.stats.daysLeft),
      targetDate: o.release.targetDate,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tampilan tautan pada detail catatan
// ---------------------------------------------------------------------------

export type ReleaseNow = {
  percent: number | null; done: number; total: number; risk: RiskLevel; daysLeft: number; workingDaysLeft: number | null; targetDate: string;
};

export type LinkView =
  | { id: string; kind: "source"; sourceId: string; name: string | null; archived: boolean }
  | {
      id: string; kind: "release"; releaseId: string; name: string | null; archived: boolean;
      snapshot: ReleaseSnapshot | null; now: ReleaseNow | null;
    }
  | {
      id: string; kind: "task"; sourceId: string; sourceName: string | null; tag: string; taskId: string;
      title: string | null; archived: boolean;
    };

/** Nama dan keadaan sasaran setiap tautan. Sasaran yang sudah hilang tetap tampil (name/title null). */
export async function resolveLinkViews(db: Db, links: NoteLinkRow[], now: Date = new Date()): Promise<LinkView[]> {
  if (links.length === 0) return [];
  const sourceIds = [...new Set(links.flatMap((l) => (l.sourceId ? [l.sourceId] : [])))];
  const releaseIds = [...new Set(links.flatMap((l) => (l.releaseId ? [l.releaseId] : [])))];
  const [src, overviews] = await Promise.all([
    sourceIds.length > 0 ? db.from("sources").select("id, name, archived_at").in("id", sourceIds) : Promise.resolve({ data: [], error: null }),
    Promise.all(releaseIds.map((id) => loadReleaseOverviews(db, { id }, now).then((r) => r[0] ?? null))),
  ]);
  if (src.error) throw new Error(`Gagal membaca aplikasi: ${src.error.message}`);
  const sources = new Map((src.data as { id: string; name: string; archived_at: string | null }[]).map((r) => [r.id, r]));
  const releases = new Map(overviews.filter((o) => o !== null).map((o) => [o!.release.id, o!]));

  const tasks = new Map<string, string>();
  for (const l of links.filter((x) => x.kind === "task")) {
    const res = await db.from("tasks").select("title").eq("source_id", l.sourceId!).eq("tag", l.tag!).eq("task_id", l.taskId!).maybeSingle();
    if (res.error) throw new Error(`Gagal membaca task: ${res.error.message}`);
    if (res.data) tasks.set(l.id, (res.data as { title: string }).title);
  }

  return links.map((l): LinkView => {
    if (l.kind === "release") {
      const o = releases.get(l.releaseId!);
      return {
        id: l.id, kind: "release", releaseId: l.releaseId!, name: o?.release.name ?? null, archived: Boolean(o?.release.archivedAt),
        snapshot: l.snapshot,
        now: o ? { percent: o.stats.percentDone, done: o.stats.done, total: o.stats.total, risk: o.stats.risk, daysLeft: o.stats.daysLeft, workingDaysLeft: o.stats.workingDaysLeft, targetDate: o.release.targetDate } : null,
      };
    }
    const s = sources.get(l.sourceId!);
    if (l.kind === "task") {
      return {
        id: l.id, kind: "task", sourceId: l.sourceId!, sourceName: s?.name ?? null, tag: l.tag!, taskId: l.taskId!,
        title: tasks.get(l.id) ?? null, archived: Boolean(s?.archived_at),
      };
    }
    return { id: l.id, kind: "source", sourceId: l.sourceId!, name: s?.name ?? null, archived: Boolean(s?.archived_at) };
  });
}

// ---------------------------------------------------------------------------
// Related notes
// ---------------------------------------------------------------------------

export type RelatedTarget = { releaseId: string } | { sourceId: string; tag: string; taskId: string };

/** Catatan yang menautkan sebuah release atau task, terbaru di atas. */
export async function loadRelatedNotes(db: Db, target: RelatedTarget, limit = 50): Promise<NoteRow[]> {
  let q = db.from("note_links").select("note_id");
  q = "releaseId" in target
    ? q.eq("kind", "release").eq("release_id", target.releaseId)
    : q.eq("kind", "task").eq("source_id", target.sourceId).eq("tag", target.tag).eq("task_id", target.taskId);
  const links = await q;
  if (links.error) throw new Error(`Gagal membaca tautan catatan: ${links.error.message}`);
  const ids = [...new Set((links.data as { note_id: string }[]).map((r) => r.note_id))];
  if (ids.length === 0) return [];
  const res = await db.from("notes").select(NOTE_COLUMNS).in("id", ids)
    .order("note_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  if (res.error) throw new Error(`Gagal membaca catatan: ${res.error.message}`);
  return (res.data as Parameters<typeof toNote>[0][]).map(toNote);
}
