import "server-only";
import { decryptToken } from "@/lib/crypto";
import { getAdapter } from "@/lib/providers";
import { ProviderError, type ProviderAdapter } from "@/lib/providers/types";
import {
  TasksFileError,
  countByStatus,
  parseTasksFile,
  toSnapshotRow,
  toTaskRow,
} from "@/lib/tasks/normalize";
import { createSupabaseStore } from "./supabase-store";
import type { SyncErrorKind, SyncResult, SyncStore } from "./types";

export type SyncDeps = {
  store: SyncStore;
  decrypt: (stored: string) => string;
  getAdapter: (provider: ProviderAdapter["provider"]) => ProviderAdapter;
  now: () => number;
};

export const defaultDeps = (): SyncDeps => ({
  store: createSupabaseStore(),
  decrypt: decryptToken,
  getAdapter,
  now: Date.now,
});

/**
 * Menyinkronkan SATU sumber: ambil file, normalisasi, simpan, catat snapshot.
 *
 * Jaminan:
 *  - Kegagalan apa pun (token, jaringan, file rusak, penyimpanan) tidak menyentuh data terakhir yang
 *    berhasil; sumber hanya ditandai gagal beserta pesannya.
 *  - Token tidak pernah masuk ke hasil, pesan galat, maupun log.
 *  - Satu sumber tidak mempengaruhi sumber lain (tiap panggilan berdiri sendiri).
 *
 * Fungsi ini hanya melempar galat bila penyimpanan sendiri tidak bisa dihubungi
 * (mis. gagal menandai sumber sebagai gagal).
 */
export async function syncSource(
  sourceId: string,
  deps: SyncDeps = defaultDeps(),
): Promise<SyncResult> {
  const started = deps.now();
  const elapsed = () => deps.now() - started;
  const { store } = deps;

  const source = await store.getSource(sourceId);
  if (!source) return { sourceId, status: "not_found" };
  if (!source.is_active) {
    return { sourceId, name: source.name, status: "skipped", reason: "inactive" };
  }
  const base = { sourceId, name: source.name };

  const fail = async (kind: SyncErrorKind, message: string): Promise<SyncResult> => {
    await store.markFailed(sourceId, message);
    return {
      ...base,
      status: "failed",
      error: { kind, message },
      lastSyncedAt: source.last_synced_at,
      durationMs: elapsed(),
    };
  };

  try {
    if (!source.token_encrypted) {
      return await fail("no_token", "Token belum diisi untuk sumber ini.");
    }

    let token: string;
    try {
      token = deps.decrypt(source.token_encrypted);
    } catch (e) {
      // Pesan dari decryptToken sudah generik dan tidak memuat rahasia.
      return await fail("token_decrypt", (e as Error).message);
    }

    // 1. Ambil file
    let file;
    try {
      file = await deps.getAdapter(source.provider).fetchFile({
        repoUrl: source.repo_url,
        branch: source.branch,
        path: source.file_path,
        token,
        etag: source.etag,
      });
    } catch (e) {
      if (e instanceof ProviderError) return await fail(e.kind, e.message);
      throw e;
    }

    if (file.status === "not_modified") {
      await store.markNotModified(sourceId);
      return { ...base, status: "not_modified", durationMs: elapsed() };
    }

    // 2. Normalisasi
    let parsed;
    try {
      parsed = parseTasksFile(file.content);
    } catch (e) {
      if (e instanceof TasksFileError) return await fail("invalid_file", e.message);
      throw e;
    }

    const tasks = parsed.tags.flatMap(({ tag, tasks }) =>
      tasks.map((t) => toTaskRow(sourceId, tag, t)),
    );
    const snapshots = parsed.tags.map(({ tag, tasks }) => toSnapshotRow(sourceId, tag, tasks));

    // 3. Simpan (atomik)
    try {
      await store.applySuccess(sourceId, {
        tasks,
        snapshots,
        etag: file.etag,
        lastCommitAt: file.lastCommitAt,
        tokenExpiresAt: file.tokenExpiresAt,
      });
    } catch (e) {
      console.error("[sync] gagal menyimpan hasil", { sourceId, error: (e as Error)?.name });
      return await fail("storage", "Gagal menyimpan hasil sinkronisasi. Data sebelumnya tetap dipakai.");
    }

    return {
      ...base,
      status: "success",
      taskCount: tasks.length,
      tags: parsed.tags.map(({ tag, tasks }) => ({ tag, total: countByStatus(tasks).total })),
      warnings: parsed.warnings,
      lastCommitAt: file.lastCommitAt,
      tokenExpiresAt: file.tokenExpiresAt,
      durationMs: elapsed(),
    };
  } catch (e) {
    // Galat tak terduga. Hanya nama galat yang dicatat; pesan aslinya bisa memuat data sensitif.
    console.error("[sync] galat tak terduga", { sourceId, error: (e as Error)?.name });
    return await fail("internal", "Terjadi kesalahan internal saat sinkronisasi.");
  }
}
