import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SourceRecord, SuccessPayload, SyncStore } from "./types";

const SOURCE_COLUMNS =
  "id, name, provider, repo_url, branch, file_path, token_encrypted, is_active, etag, last_synced_at";

/** Penyimpanan sinkronisasi di Supabase. Memakai service role: HANYA untuk kode server. */
export function createSupabaseStore(db: SupabaseClient = createAdminClient()): SyncStore {
  const fail = (action: string, error: { message: string }) =>
    new Error(`${action}: ${error.message}`);

  return {
    async getSource(id) {
      const { data, error } = await db
        .from("sources")
        .select(SOURCE_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw fail("Gagal membaca sumber", error);
      return (data as SourceRecord | null) ?? null;
    },

    async applySuccess(sourceId, p: SuccessPayload) {
      const { error } = await db.rpc("sync_apply_success", {
        p_source_id: sourceId,
        p_tasks: p.tasks,
        p_snapshots: p.snapshots,
        p_etag: p.etag,
        p_last_commit_at: p.lastCommitAt,
        p_token_expires_at: p.tokenExpiresAt,
      });
      if (error) throw fail("sync_apply_success", error);
    },

    async markNotModified(sourceId) {
      const now = new Date().toISOString();
      const { error } = await db
        .from("sources")
        .update({
          last_sync_status: "success",
          last_attempt_at: now,
          last_synced_at: now,
          last_error: null,
        })
        .eq("id", sourceId);
      if (error) throw fail("Gagal memperbarui sumber", error);
    },

    async markFailed(sourceId, message) {
      const { error } = await db
        .from("sources")
        .update({
          last_sync_status: "failed",
          last_attempt_at: new Date().toISOString(),
          last_error: message,
        })
        .eq("id", sourceId);
      if (error) throw fail("Gagal menandai sumber gagal", error);
    },
  };
}
