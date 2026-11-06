/** Format tanggal-waktu untuk tampilan (zona WIB, bahasa Indonesia). */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** yyyy-mm-dd menurut WIB, untuk nilai awal <input type="date"> (konsisten dengan tampilan formatDate). */
export function formatDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type TokenExpiry = "none" | "ok" | "soon" | "expired";

/** Status kedaluwarsa token; "soon" = kurang dari 14 hari lagi. */
export function tokenExpiryState(iso: string | null | undefined, now: number): TokenExpiry {
  if (!iso) return "none";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "none";
  if (t <= now) return "expired";
  return t - now < 14 * 24 * 60 * 60 * 1000 ? "soon" : "ok";
}
