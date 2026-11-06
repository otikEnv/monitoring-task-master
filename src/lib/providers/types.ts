/**
 * Kontrak adapter penyedia repo. Setiap penyedia (GitHub, GitLab, Bitbucket, dst) mengimplementasikan
 * kontrak yang sama: ambil file mentah dari URL repo, branch, dan path. Halaman dan kode sinkronisasi
 * tidak perlu tahu penyedianya; penyedia baru cukup ditambah ke registry (index.ts).
 */

export const PROVIDERS = ["github", "gitlab", "bitbucket"] as const;
export type Provider = (typeof PROVIDERS)[number];

export type FetchFileParams = {
  repoUrl: string;
  branch: string;
  /** Path file di dalam repo, mis. ".taskmaster/tasks/tasks.json". */
  path: string;
  /** Token baca-saja (sudah didekripsi). Jangan pernah dicatat atau dikirim ke browser. */
  token: string;
  /** ETag dari sinkronisasi sebelumnya, untuk permintaan bersyarat. */
  etag?: string | null;
};

/** Dependensi yang bisa diganti saat pengujian. */
export type FetchDeps = {
  fetch?: typeof fetch;
  /** Batas waktu tiap permintaan HTTP (ms). Bawaan 25 dtk, di bawah batas fungsi Vercel. */
  timeoutMs?: number;
};

export type FetchFileResult =
  | {
      /** File tidak berubah sejak ETag yang dikirim; tidak ada isi yang diunduh. */
      status: "not_modified";
      etag: string;
    }
  | {
      status: "ok";
      content: string;
      etag: string | null;
      /** Waktu commit terakhir yang mengubah file ini (ISO 8601), bila bisa diketahui. */
      lastCommitAt: string | null;
      /** Tanggal kedaluwarsa token (ISO 8601) bila penyedia melaporkannya. */
      tokenExpiresAt: string | null;
    };

export type ProviderErrorKind =
  | "invalid_url" // URL repo tidak dikenali untuk penyedia ini
  | "unauthorized" // 401: token salah, dicabut, atau kedaluwarsa
  | "forbidden" // 403: token valid tapi tidak punya izin baca
  | "not_found" // 404: repo, branch, atau path salah (atau repo privat tanpa akses)
  | "rate_limited" // 429 atau kuota habis
  | "too_large" // file melebihi batas ukuran
  | "server_error" // 5xx dari penyedia
  | "timeout" // melewati batas waktu
  | "network" // gagal menjangkau penyedia
  | "unexpected"; // status HTTP lain

/** Galat dengan pesan yang aman ditampilkan ke pengguna (tidak memuat token). */
export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly status?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface ProviderAdapter {
  readonly provider: Provider;
  /** Mengembalikan pesan galat bila URL tidak valid untuk penyedia ini, atau null bila valid. */
  validateRepoUrl(repoUrl: string): string | null;
  fetchFile(params: FetchFileParams, deps?: FetchDeps): Promise<FetchFileResult>;
}
