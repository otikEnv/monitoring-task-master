import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ARCHIVE_PAGE_SIZE, type ArchiveParams } from "./params";

export type ArchivedSourceRow = {
  id: string;
  name: string;
  isActive: boolean;
  lastSyncStatus: "never" | "success" | "failed";
  lastSyncedAt: string | null;
  archivedAt: string;
  taskCount: number;
};

export type ArchivedReleaseRow = {
  id: string;
  name: string;
  releasedOn: string | null;
  targetDate: string;
  componentCount: number;
  archivedAt: string;
};

export type ArchivePage<T> = {
  rows: T[];
  total: number;
  /** Halaman yang benar-benar dipakai (dipotong ke halaman terakhir bila melewati akhir). */
  page: number;
  pageCount: number;
  pageSize: number;
};

/** Memotong halaman yang diminta ke rentang yang ada; mengembalikan awal baris (offset). */
export function clampPage(requested: number, total: number): { page: number; pageCount: number; from: number } {
  const pageCount = Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE));
  const page = Math.min(Math.max(1, requested), pageCount);
  return { page, pageCount, from: (page - 1) * ARCHIVE_PAGE_SIZE };
}

/**
 * Aplikasi yang diarsipkan, terbaru dulu, berhalaman. Klien HARUS membawa sesi pengguna (RLS berlaku).
 * Hanya kolom yang boleh dibaca klien (token tidak ikut).
 */
export async function loadArchivedSources(db: SupabaseClient, requestedPage: number): Promise<ArchivePage<ArchivedSourceRow>> {
  const head = await db.from("sources").select("id", { count: "exact", head: true }).not("archived_at", "is", null);
  if (head.error) throw new Error(`Gagal menghitung aplikasi terarsip: ${head.error.message}`);
  const total = head.count ?? 0;
  const { page, pageCount, from } = clampPage(requestedPage, total);
  if (total === 0) return { rows: [], total, page, pageCount, pageSize: ARCHIVE_PAGE_SIZE };

  const res = await db
    .from("sources")
    .select("id, name, is_active, last_sync_status, last_synced_at, archived_at")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .order("name", { ascending: true })
    .range(from, from + ARCHIVE_PAGE_SIZE - 1);
  if (res.error) throw new Error(`Gagal membaca aplikasi terarsip: ${res.error.message}`);
  const sources = res.data as {
    id: string; name: string; is_active: boolean; last_sync_status: ArchivedSourceRow["lastSyncStatus"];
    last_synced_at: string | null; archived_at: string;
  }[];

  const counts = await db.from("source_status_counts").select("source_id, total").in("source_id", sources.map((s) => s.id));
  if (counts.error) throw new Error(`Gagal membaca jumlah task: ${counts.error.message}`);
  const totals = new Map((counts.data as { source_id: string; total: number }[]).map((c) => [c.source_id, c.total]));

  return {
    rows: sources.map((s) => ({
      id: s.id, name: s.name, isActive: s.is_active, lastSyncStatus: s.last_sync_status,
      lastSyncedAt: s.last_synced_at, archivedAt: s.archived_at, taskCount: totals.get(s.id) ?? 0,
    })),
    total, page, pageCount, pageSize: ARCHIVE_PAGE_SIZE,
  };
}

/** Release yang diarsipkan, terbaru dulu, berhalaman, beserta jumlah komponennya. */
export async function loadArchivedReleases(db: SupabaseClient, requestedPage: number): Promise<ArchivePage<ArchivedReleaseRow>> {
  const head = await db.from("releases").select("id", { count: "exact", head: true }).not("archived_at", "is", null);
  if (head.error) throw new Error(`Gagal menghitung release terarsip: ${head.error.message}`);
  const total = head.count ?? 0;
  const { page, pageCount, from } = clampPage(requestedPage, total);
  if (total === 0) return { rows: [], total, page, pageCount, pageSize: ARCHIVE_PAGE_SIZE };

  const res = await db
    .from("releases")
    .select("id, name, released_on, target_date, archived_at")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .order("name", { ascending: true })
    .range(from, from + ARCHIVE_PAGE_SIZE - 1);
  if (res.error) throw new Error(`Gagal membaca release terarsip: ${res.error.message}`);
  const releases = res.data as { id: string; name: string; released_on: string | null; target_date: string; archived_at: string }[];

  const comps = await db.from("release_components").select("release_id").in("release_id", releases.map((r) => r.id));
  if (comps.error) throw new Error(`Gagal membaca komponen release: ${comps.error.message}`);
  const counts = new Map<string, number>();
  for (const c of comps.data as { release_id: string }[]) counts.set(c.release_id, (counts.get(c.release_id) ?? 0) + 1);

  return {
    rows: releases.map((r) => ({
      id: r.id, name: r.name, releasedOn: r.released_on, targetDate: r.target_date,
      componentCount: counts.get(r.id) ?? 0, archivedAt: r.archived_at,
    })),
    total, page, pageCount, pageSize: ARCHIVE_PAGE_SIZE,
  };
}

/** Data halaman Archive untuk tab yang dipilih, dengan sesi pengguna dari cookie. */
export async function getArchive(params: ArchiveParams) {
  const db = await createClient();
  const [applications, releases] = await Promise.all([
    params.tab === "applications" ? loadArchivedSources(db, params.page) : null,
    params.tab === "releases" ? loadArchivedReleases(db, params.page) : null,
  ]);
  // Jumlah pada kedua tab ditampilkan di label tab; hitung yang tidak dimuat dengan kueri hitung saja.
  const count = async (table: "sources" | "releases") => {
    const r = await db.from(table).select("id", { count: "exact", head: true }).not("archived_at", "is", null);
    if (r.error) throw new Error(`Gagal menghitung arsip: ${r.error.message}`);
    return r.count ?? 0;
  };
  const [sourceCount, releaseCount] = [applications?.total ?? (await count("sources")), releases?.total ?? (await count("releases"))];
  return { applications, releases, counts: { applications: sourceCount, releases: releaseCount } };
}
