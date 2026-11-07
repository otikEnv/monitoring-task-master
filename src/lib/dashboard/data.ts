import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadReleaseOverviews } from "@/lib/releases/load";
import { summarizeReleases, type ReleaseSummary } from "@/lib/releases/summary";
import { createClient } from "@/lib/supabase/server";
import { buildCards, summarize, type CountsRow, type DashboardCard, type DashboardSummary, type SourceRow } from "./cards";

const SOURCE_COLUMNS =
  "id, name, provider, branch, is_active, last_sync_status, last_attempt_at, last_synced_at, last_error, last_commit_at, token_expires_at";

export type DashboardData = { cards: DashboardCard[]; summary: DashboardSummary };

/**
 * Membaca data dashboard dengan klien yang diberikan. Klien HARUS membawa sesi pengguna (bukan
 * service role), sehingga RLS berlaku: hanya kolom sumber non-token yang bisa dibaca.
 */
export async function loadDashboardData(
  db: SupabaseClient,
  now: number = Date.now(),
): Promise<DashboardData> {
  const [sources, counts, releases] = await Promise.all([
    db.from("sources").select(SOURCE_COLUMNS).order("name", { ascending: true }),
    db.from("source_status_counts").select("*"),
    // Kegagalan memuat release tidak boleh menggagalkan seluruh dashboard.
    loadReleaseOverviews(db, {}, new Date(now))
      .then(summarizeReleases)
      .catch((e) => {
        console.error("[dashboard] gagal memuat release", { error: (e as Error)?.name });
        return new Map<string, ReleaseSummary>();
      }),
  ]);
  if (sources.error) throw new Error(`Gagal membaca sumber: ${sources.error.message}`);
  if (counts.error) throw new Error(`Gagal membaca hitungan status: ${counts.error.message}`);

  const cards = buildCards(sources.data as SourceRow[], counts.data as CountsRow[], now).map((c) => ({
    ...c,
    release: releases.get(c.id) ?? null,
  }));
  return { cards, summary: summarize(cards) };
}

/** Data dashboard untuk pengguna yang sedang login (sesi dari cookie). */
export async function getDashboardData(): Promise<DashboardData> {
  return loadDashboardData(await createClient());
}
