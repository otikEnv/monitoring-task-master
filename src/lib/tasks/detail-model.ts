import { decodeSegment } from "@/lib/url";

/**
 * Model dan fungsi murni untuk halaman Detail task. Subtask dan dependensi disimpan sebagai JSON
 * di database; bentuknya dibaca dengan hati-hati karena berasal dari file repo.
 */

export type SubtaskView = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  details: string | null;
  dependencies: string[];
};

export type DependencyView = { id: string; found: boolean; title?: string; status?: string };

export type TaskDetail = {
  sourceId: string;
  sourceName: string;
  tag: string;
  taskId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  details: string | null;
  testStrategy: string | null;
  dependencies: DependencyView[];
  subtasks: SubtaskView[];
  /** Waktu data task ini terakhir diperbarui oleh sinkronisasi. */
  updatedAt: string;
};

const isRec = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const text = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
};

const idOf = (v: unknown): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  return null;
};

/** ID dependensi dari JSON; yang bukan string/angka dibuang, duplikat dibuang, urutan dipertahankan. */
export function parseDependencyIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const id = idOf(v);
    if (id !== null && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Subtask dari kolom JSON. Elemen yang bukan objek dilewati; field yang hilang diberi nilai aman. */
export function parseSubtasks(raw: unknown): SubtaskView[] {
  if (!Array.isArray(raw)) return [];
  const out: SubtaskView[] = [];
  raw.forEach((s, i) => {
    if (!isRec(s)) return;
    out.push({
      id: idOf(s.id) ?? String(i + 1),
      title: text(s.title) ?? "(tanpa judul)",
      description: text(s.description),
      status: (text(s.status) ?? "pending").trim().toLowerCase(),
      details: text(s.details),
      dependencies: parseDependencyIds(s.dependencies),
    });
  });
  return out;
}

export type DetailKey = { sourceId: string; tag: string; taskId: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SEGMENT = 200;

/**
 * Mengubah segmen URL halaman detail (MASIH ter-encode, lihat src/lib/url.ts) menjadi kunci task.
 * Mengembalikan null bila tidak valid (UUID salah, kosong, terlalu panjang, atau urutan persen rusak);
 * pemanggil menampilkan "tidak ditemukan".
 */
export function parseDetailKey(raw: { sourceId: string; tag: string; taskId: string }): DetailKey | null {
  const sourceId = decodeSegment(raw.sourceId);
  const tag = decodeSegment(raw.tag);
  const taskId = decodeSegment(raw.taskId);
  if (!sourceId || !tag || !taskId) return null;
  if (!UUID_RE.test(sourceId)) return null;
  if (tag.length > MAX_SEGMENT || taskId.length > MAX_SEGMENT) return null;
  return { sourceId: sourceId.toLowerCase(), tag, taskId };
}

/** ID yang aman dipakai pada pencarian dependensi; selebihnya hanya ditampilkan sebagai teks. */
export const LOOKUP_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Menggabungkan ID dependensi dengan task yang ditemukan (di sumber dan tag yang sama).
 * Urutan sesuai daftar asli; ID yang tidak ditemukan tetap ada dengan found=false.
 */
export function buildDependencyViews(
  ids: string[],
  found: { task_id: string; title: string; status: string }[],
): DependencyView[] {
  const byId = new Map(found.map((t) => [t.task_id, t]));
  return ids.map((id) => {
    const t = byId.get(id);
    return t ? { id, found: true, title: t.title, status: t.status } : { id, found: false };
  });
}

export function subtaskProgress(subtasks: SubtaskView[]): { done: number; total: number } {
  return { done: subtasks.filter((s) => s.status === "done").length, total: subtasks.length };
}
