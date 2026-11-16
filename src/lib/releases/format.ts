import { formatDate } from "@/lib/format";

/** Teks sisa hari menuju target (daysLeft negatif = sudah lewat). */
export function formatDaysLeft(daysLeft: number): string {
  if (daysLeft > 1) return `${daysLeft} days left`;
  if (daysLeft === 1) return "tomorrow";
  if (daysLeft === 0) return "today";
  return `${-daysLeft} ${-daysLeft === 1 ? "day" : "days"} overdue`;
}

/**
 * Waktu relatif untuk log: "just now", "5 minutes ago", "3 hours ago", "2 days ago"; lebih dari 30 hari
 * atau tidak valid memakai tanggal. Waktu di masa depan (selisih jam) dianggap "just now".
 */
export function formatRelative(iso: string, now: Date): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "-";
  const minutes = Math.round((now.getTime() - t) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return formatDate(iso);
}

/** Rentang task untuk tampilan: "#100–#200". */
export function formatRange(start: number, end: number): string {
  return start === end ? `#${start}` : `#${start}–#${end}`;
}

/** yyyy-mm-dd -> "20 Nov 2026" (tanggal kalender; tidak ada pergeseran zona waktu). */
export function formatYmd(ymd: string | null | undefined): string {
  if (!ymd) return "-";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return "-";
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString("en-GB", {
    timeZone: "UTC", day: "2-digit", month: "short", year: "numeric",
  });
}
