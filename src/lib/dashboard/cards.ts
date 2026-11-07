import { tokenExpiryState, type TokenExpiry } from "@/lib/format";
import type { Provider } from "@/lib/providers/types";
import type { ReleaseSummary } from "@/lib/releases/summary";
import type { DisplayStatus } from "@/lib/status";

/** Baris dari tabel sources (hanya kolom yang boleh dibaca klien; tanpa token). */
export type SourceRow = {
  id: string;
  name: string;
  provider: Provider;
  branch: string;
  is_active: boolean;
  last_sync_status: "never" | "success" | "failed";
  last_attempt_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  last_commit_at: string | null;
  token_expires_at: string | null;
};

/** Baris dari view public.source_status_counts. */
export type CountsRow = {
  source_id: string;
  total: number;
  pending: number;
  in_progress: number;
  review: number;
  blocked: number;
  done: number;
  deferred: number;
  cancelled: number;
  other: number;
  tag_count: number;
};

export type DashboardCard = {
  id: string;
  name: string;
  provider: Provider;
  branch: string;
  isActive: boolean;
  counts: Record<DisplayStatus, number>;
  total: number;
  tagCount: number;
  /** 0-100 dengan satu desimal; 0 bila belum ada task. */
  percentDone: number;
  /** Ada task tersimpan; false = belum pernah berhasil disinkronkan atau file berisi 0 task. */
  hasData: boolean;
  lastSyncStatus: SourceRow["last_sync_status"];
  lastSyncedAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastCommitAt: string | null;
  tokenExpiresAt: string | null;
  tokenExpiry: TokenExpiry;
  /** Release belum rilis dengan target terdekat; kosong bila aplikasi tidak punya release aktif. */
  release?: ReleaseSummary | null;
};

export type DashboardSummary = {
  apps: number;
  failed: number;
  blocked: number;
  tokenIssues: number;
  neverSynced: number;
};

const ZERO: Record<DisplayStatus, number> = {
  pending: 0, in_progress: 0, review: 0, blocked: 0, done: 0, deferred: 0, cancelled: 0, other: 0,
};

const percent = (done: number, total: number) =>
  total > 0 ? Math.round((done * 1000) / total) / 10 : 0;

/** Urutan tampil: yang perlu perhatian lebih dulu; sumber nonaktif paling akhir; lalu menurut nama. */
function attentionRank(c: DashboardCard): number {
  if (!c.isActive) return 9;
  if (c.lastSyncStatus === "failed") return 0;
  if (c.tokenExpiry === "expired") return 1;
  if (c.counts.blocked > 0) return 2;
  if (c.lastSyncStatus === "never") return 3;
  if (c.tokenExpiry === "soon") return 4;
  return 5;
}

/** Menggabungkan sumber dan hitungan menjadi kartu. Sumber tanpa task dianggap nol. */
export function buildCards(sources: SourceRow[], counts: CountsRow[], now: number): DashboardCard[] {
  const byId = new Map(counts.map((c) => [c.source_id, c]));

  const cards = sources.map((s): DashboardCard => {
    const c = byId.get(s.id);
    const total = c?.total ?? 0;
    return {
      id: s.id,
      name: s.name,
      provider: s.provider,
      branch: s.branch,
      isActive: s.is_active,
      counts: c
        ? {
            pending: c.pending, in_progress: c.in_progress, review: c.review, blocked: c.blocked,
            done: c.done, deferred: c.deferred, cancelled: c.cancelled, other: c.other,
          }
        : { ...ZERO },
      total,
      tagCount: c?.tag_count ?? 0,
      percentDone: percent(c?.done ?? 0, total),
      hasData: total > 0,
      lastSyncStatus: s.last_sync_status,
      lastSyncedAt: s.last_synced_at,
      lastAttemptAt: s.last_attempt_at,
      lastError: s.last_error,
      lastCommitAt: s.last_commit_at,
      tokenExpiresAt: s.token_expires_at,
      tokenExpiry: tokenExpiryState(s.token_expires_at, now),
    };
  });

  return cards.sort(
    (a, b) => attentionRank(a) - attentionRank(b) || a.name.localeCompare(b.name, "en"),
  );
}

/** Ringkasan untuk menemukan yang bermasalah (hanya sumber aktif). */
export function summarize(cards: DashboardCard[]): DashboardSummary {
  const active = cards.filter((c) => c.isActive);
  return {
    apps: cards.length,
    failed: active.filter((c) => c.lastSyncStatus === "failed").length,
    blocked: active.filter((c) => c.counts.blocked > 0).length,
    tokenIssues: active.filter((c) => c.tokenExpiry === "expired" || c.tokenExpiry === "soon").length,
    neverSynced: active.filter((c) => c.lastSyncStatus === "never").length,
  };
}
