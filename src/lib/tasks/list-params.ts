import { STATUS_RAW } from "@/lib/status";

/**
 * Parameter halaman Daftar task. Semua state (filter, urutan, halaman) hidup di URL, jadi halaman
 * bisa dibagikan dan kartu dashboard cukup menautkan ?source=<id>. Murni: tanpa server maupun React.
 */

export const PAGE_SIZE = 50;

export const SORT_KEYS = ["app", "tag", "id", "title", "status", "priority", "subtasks"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

/** Nilai filter status di URL: nilai mentah tasks.json, plus "other" untuk status tak dikenal. */
export const STATUS_FILTER_VALUES: readonly string[] = [...Object.values(STATUS_RAW), "other"];
export const PRIORITY_FILTER_VALUES: readonly string[] = ["high", "medium", "low"];

export type TaskListParams = {
  source: string | null;
  tag: string | null;
  status: string | null;
  priority: string | null;
  sort: SortKey;
  dir: SortDir;
  page: number;
};

export const DEFAULT_PARAMS: TaskListParams = {
  source: null, tag: null, status: null, priority: null, sort: "app", dir: "asc", page: 1,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAGE = 100_000;

type RawSearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Membaca searchParams dengan aman. Nilai tidak valid diabaikan (kembali ke bawaan), tidak melempar galat. */
export function parseTaskListParams(sp: RawSearchParams): TaskListParams {
  const source = first(sp.source)?.trim() ?? "";
  const tag = first(sp.tag)?.trim() ?? "";
  const status = first(sp.status)?.trim() ?? "";
  const priority = first(sp.priority)?.trim() ?? "";
  const sort = first(sp.sort)?.trim() ?? "";
  const dir = first(sp.dir)?.trim() ?? "";
  const page = Number(first(sp.page));

  return {
    source: UUID.test(source) ? source.toLowerCase() : null,
    tag: tag && tag.length <= 100 ? tag : null,
    status: STATUS_FILTER_VALUES.includes(status) ? status : null,
    priority: PRIORITY_FILTER_VALUES.includes(priority) ? priority : null,
    sort: (SORT_KEYS as readonly string[]).includes(sort) ? (sort as SortKey) : DEFAULT_PARAMS.sort,
    dir: dir === "desc" ? "desc" : "asc",
    page: Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1,
  };
}

/** URL pendek: nilai bawaan tidak ditulis. */
export function toQueryString(p: TaskListParams): string {
  const q = new URLSearchParams();
  if (p.source) q.set("source", p.source);
  if (p.tag) q.set("tag", p.tag);
  if (p.status) q.set("status", p.status);
  if (p.priority) q.set("priority", p.priority);
  if (p.sort !== DEFAULT_PARAMS.sort || p.dir !== DEFAULT_PARAMS.dir) {
    q.set("sort", p.sort);
    q.set("dir", p.dir);
  }
  if (p.page > 1) q.set("page", String(p.page));
  return q.toString();
}

/** Tautan ke halaman ini dengan sebagian parameter diganti. Mengubah filter/urutan kembali ke halaman 1. */
export function hrefFor(p: TaskListParams, override: Partial<TaskListParams> = {}): string {
  const changesView = ["source", "tag", "status", "priority", "sort", "dir"].some((k) => k in override);
  const next: TaskListParams = { ...p, ...override, page: "page" in override ? override.page! : changesView ? 1 : p.page };
  const qs = toQueryString(next);
  return qs ? `/tasks?${qs}` : "/tasks";
}

/** Klik judul kolom: kolom yang sama membalik arah; kolom baru mulai dari naik. */
export function nextSort(p: TaskListParams, key: SortKey): { sort: SortKey; dir: SortDir } {
  if (p.sort === key) return { sort: key, dir: p.dir === "asc" ? "desc" : "asc" };
  return { sort: key, dir: "asc" };
}

export const hasActiveFilters = (p: TaskListParams) =>
  Boolean(p.source || p.tag || p.status || p.priority);

/** Tautan ke detail task (halaman detail dibuat di task 12). Semua bagian di-encode. */
export const taskHref = (sourceId: string, tag: string, taskId: string) =>
  `/tasks/${encodeURIComponent(sourceId)}/${encodeURIComponent(tag)}/${encodeURIComponent(taskId)}`;

/** Jendela nomor halaman: selalu memuat halaman pertama, terakhir, dan sekitar halaman aktif. */
export function pageWindow(page: number, pageCount: number, radius = 2): Array<number | "gap"> {
  if (pageCount <= 1) return [1];
  const keep = new Set<number>([1, pageCount]);
  for (let i = page - radius; i <= page + radius; i++) if (i >= 1 && i <= pageCount) keep.add(i);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push("gap");
    out.push(n);
  });
  return out;
}
