import type { StatusKey } from "@/lib/tasks/normalize";

/** Status yang ditampilkan: tujuh status baku Taskmaster plus "other" (status tak dikenal). */
export type DisplayStatus = StatusKey | "other";

/** Urutan tampil di kartu dan filter. */
export const STATUS_ORDER: readonly DisplayStatus[] = [
  "pending",
  "in_progress",
  "review",
  "blocked",
  "done",
  "deferred",
  "cancelled",
  "other",
];

/** Label bahasa sehari-hari untuk manajemen (nilai asli di tasks.json tetap bahasa Inggris). */
export const STATUS_LABEL: Record<DisplayStatus, string> = {
  pending: "Menunggu",
  in_progress: "Dikerjakan",
  review: "Ditinjau",
  blocked: "Terhambat",
  done: "Selesai",
  deferred: "Ditunda",
  cancelled: "Dibatalkan",
  other: "Lainnya",
};

/** Nilai status di tasks.json untuk tiap kunci (dipakai untuk filter dan tooltip). */
export const STATUS_RAW: Record<Exclude<DisplayStatus, "other">, string> = {
  pending: "pending",
  in_progress: "in-progress",
  review: "review",
  blocked: "blocked",
  done: "done",
  deferred: "deferred",
  cancelled: "cancelled",
};

/** Warna lencana. Selalu dipasangkan dengan teks label, tidak mengandalkan warna saja. */
export const STATUS_TONE: Record<DisplayStatus, string> = {
  pending: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
  in_progress: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  review: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  blocked: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  done: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  deferred: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  cancelled: "bg-neutral-100 text-neutral-500 line-through dark:bg-neutral-900 dark:text-neutral-500",
  other: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};
