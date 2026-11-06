import type { Provider } from "@/lib/providers/types";
import type { toSnapshotRow, toTaskRow } from "@/lib/tasks/normalize";

/** Kolom sumber yang dibutuhkan sinkronisasi (termasuk token terenkripsi, hanya untuk kode server). */
export type SourceRecord = {
  id: string;
  name: string;
  provider: Provider;
  repo_url: string;
  branch: string;
  file_path: string;
  token_encrypted: string | null;
  is_active: boolean;
  etag: string | null;
  last_synced_at: string | null;
};

export type SuccessPayload = {
  tasks: ReturnType<typeof toTaskRow>[];
  snapshots: ReturnType<typeof toSnapshotRow>[];
  etag: string | null;
  lastCommitAt: string | null;
  tokenExpiresAt: string | null;
};

/**
 * Penyimpanan yang dibutuhkan sinkronisasi. Implementasi nyata memakai Supabase (service role);
 * pengujian memakai versi di memori.
 */
export interface SyncStore {
  getSource(id: string): Promise<SourceRecord | null>;
  /** Atomik: ganti task, catat snapshot, perbarui status sumber. */
  applySuccess(sourceId: string, payload: SuccessPayload): Promise<void>;
  /** File tidak berubah: hanya perbarui waktu sinkron dan bersihkan galat. */
  markNotModified(sourceId: string): Promise<void>;
  /** Gagal: tandai gagal dengan pesan; data task terakhir yang berhasil tidak disentuh. */
  markFailed(sourceId: string, message: string): Promise<void>;
}

export type SyncErrorKind =
  | "no_token"
  | "token_decrypt"
  | "invalid_file"
  | "storage"
  | "internal"
  // jenis galat dari adapter penyedia (lihat ProviderErrorKind)
  | "invalid_url"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "too_large"
  | "server_error"
  | "timeout"
  | "network"
  | "unexpected";

/**
 * Hasil sinkronisasi satu sumber. Aman dikirim ke browser: tidak pernah memuat token
 * (asli maupun terenkripsi).
 */
export type SyncResult =
  | {
      sourceId: string;
      name: string;
      status: "success";
      taskCount: number;
      tags: { tag: string; total: number }[];
      warnings: string[];
      lastCommitAt: string | null;
      tokenExpiresAt: string | null;
      durationMs: number;
    }
  | { sourceId: string; name: string; status: "not_modified"; durationMs: number }
  | {
      sourceId: string;
      name: string;
      status: "failed";
      error: { kind: SyncErrorKind; message: string };
      /** Sinkron berhasil terakhir; data yang tampil di dashboard berasal dari waktu ini. */
      lastSyncedAt: string | null;
      durationMs: number;
    }
  | { sourceId: string; name: string; status: "skipped"; reason: "inactive" }
  | { sourceId: string; status: "not_found" };
