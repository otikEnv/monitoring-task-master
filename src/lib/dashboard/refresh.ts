/**
 * Logika tombol Segarkan di sisi klien. Tanpa ketergantungan React atau server, sehingga mudah diuji.
 * Satu permintaan per sumber ke POST /api/sync/[id] (supaya tidak melewati batas waktu fungsi).
 */

export type RefreshOutcome = {
  tone: "success" | "info" | "error";
  message: string;
  /** Data di database mungkin berubah; halaman perlu dimuat ulang. */
  changed: boolean;
};

const error = (message: string, changed = false): RefreshOutcome => ({ tone: "error", message, changed });

/** Menyegarkan satu sumber. TIDAK PERNAH melempar galat: semua kegagalan menjadi hasil bertipe. */
export async function refreshSource(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RefreshOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/sync/${encodeURIComponent(id)}`, { method: "POST" });
  } catch {
    return error("Could not reach the server. Check your connection.");
  }

  if (res.status === 401) return error("Sesi berakhir. Silakan masuk kembali.");
  if (res.status === 404) return error("Application not found.");
  if (res.status === 409) return { tone: "info", message: "Application is inactive; not synced.", changed: false };
  if (res.status === 503) return error("The storage service is unavailable.");

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return error(res.ok ? "Unrecognized server response." : `Refresh failed (HTTP ${res.status}).`);
  }
  if (!res.ok) return error(`Refresh failed (HTTP ${res.status}).`);

  const b = body as {
    status?: string; taskCount?: number; error?: { message?: string };
  };
  switch (b.status) {
    case "success":
      return { tone: "success", message: `Success: ${b.taskCount ?? 0} tasks updated.`, changed: true };
    case "not_modified":
      return { tone: "info", message: "Already up to date; no changes.", changed: true };
    case "failed":
      // Status sumber di database sudah ditandai gagal; halaman perlu dimuat ulang.
      return error(`Failed: ${b.error?.message ?? "unknown reason."}`, true);
    case "skipped":
      return { tone: "info", message: "Application is inactive; not synced.", changed: false };
    default:
      return error("Unrecognized server response.");
  }
}

/**
 * Menjalankan worker untuk semua item dengan paling banyak `limit` berjalan bersamaan.
 * Satu worker yang gagal tidak menghentikan yang lain; hasil dikembalikan menurut urutan item.
 */
export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;

  async function lane() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await worker(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  const lanes = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: lanes }, lane));
  return results;
}

/** Batas permintaan sinkronisasi yang berjalan bersamaan (menghindari rate limit penyedia). */
export const REFRESH_CONCURRENCY = 4;
