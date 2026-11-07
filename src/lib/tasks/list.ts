import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { STATUS_RAW } from "@/lib/status";
import { PAGE_SIZE, type SortKey, type TaskListParams } from "./list-params";

export type TaskListRow = {
  sourceId: string;
  sourceName: string;
  tag: string;
  taskId: string;
  title: string;
  status: string;
  priority: string | null;
  subtasksTotal: number;
  subtasksDone: number;
};

export type TaskListResult = {
  /** Parameter yang benar-benar dipakai (tag yang tidak ada pada aplikasi terpilih sudah dibuang). */
  params: TaskListParams;
  /** Tag dari URL yang diabaikan karena tidak ada pada aplikasi terpilih; null bila tidak ada. */
  ignoredTag: string | null;
  rows: TaskListRow[];
  total: number;
  /** Halaman yang benar-benar ditampilkan (bisa lebih kecil dari yang diminta bila melewati akhir). */
  page: number;
  pageCount: number;
  pageSize: number;
  sources: { id: string; name: string }[];
  tags: string[];
};

type ViewRow = {
  source_id: string; source_name: string; tag: string; task_id: string; title: string;
  status: string; priority: string | null; subtasks_total: number; subtasks_done: number;
};

const KNOWN_STATUSES = Object.values(STATUS_RAW);

// Kolom urutan utama di view task_list. Pengurutan tambahan (tie-break) selalu ditambahkan
// agar urutan stabil dan halaman tidak saling tumpang tindih.
const SORT_COLUMNS: Record<SortKey, Array<{ column: string; nullsLast?: boolean }>> = {
  app: [{ column: "source_name" }],
  tag: [{ column: "tag" }],
  id: [{ column: "task_seq", nullsLast: true }, { column: "task_id" }],
  title: [{ column: "title" }],
  status: [{ column: "status_rank" }],
  priority: [{ column: "priority_rank" }],
  subtasks: [{ column: "subtask_ratio", nullsLast: true }, { column: "subtasks_total" }],
};
const TIE_BREAKERS: Array<{ column: string; nullsLast?: boolean }> = [
  { column: "source_name" }, { column: "tag" }, { column: "task_seq", nullsLast: true }, { column: "task_id" },
];

/**
 * Membaca satu halaman daftar task dengan filter, urutan, dan paginasi di database.
 * Klien HARUS membawa sesi pengguna (RLS berlaku).
 */
export async function loadTaskList(db: SupabaseClient, requested: TaskListParams): Promise<TaskListResult> {
  // 1. Opsi filter dulu: tag dari URL yang tidak ada pada aplikasi terpilih (mis. URL lama, atau aplikasi
  //    diganti) diabaikan dan dilaporkan, bukan menghasilkan daftar kosong yang membingungkan.
  const tagQuery = db.from("source_tags").select("tag");
  const [sources, tagRows] = await Promise.all([
    db.from("sources").select("id, name").order("name", { ascending: true }),
    requested.source ? tagQuery.eq("source_id", requested.source) : tagQuery,
  ]);
  if (sources.error) throw new Error(`Gagal membaca sumber: ${sources.error.message}`);
  if (tagRows.error) throw new Error(`Gagal membaca tag: ${tagRows.error.message}`);

  const tags = [...new Set((tagRows.data as { tag: string }[]).map((t) => t.tag))].sort((a, b) =>
    a.localeCompare(b, "en"),
  );
  const ignoredTag = requested.tag && !tags.includes(requested.tag) ? requested.tag : null;
  const params: TaskListParams = ignoredTag ? { ...requested, tag: null } : requested;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = <Q extends { eq: any; not: any }>(q: Q): Q => {
    if (params.source) q = q.eq("source_id", params.source);
    if (params.tag) q = q.eq("tag", params.tag);
    if (params.priority) q = q.eq("priority", params.priority);
    if (params.status === "other") {
      q = q.not("status", "in", `(${KNOWN_STATUSES.map((s) => `"${s}"`).join(",")})`);
    } else if (params.status) {
      q = q.eq("status", params.status);
    }
    return q;
  };

  const fetchPage = async (page: number) => {
    let q = filtered(db.from("task_list").select("*", { count: "exact" }));
    const used = new Set<string>();
    for (const o of [...SORT_COLUMNS[params.sort], ...TIE_BREAKERS]) {
      if (used.has(o.column)) continue;
      used.add(o.column);
      q = q.order(o.column, { ascending: params.dir === "asc", nullsFirst: false });
    }
    const from = (page - 1) * PAGE_SIZE;
    return q.range(from, from + PAGE_SIZE - 1);
  };

  let page = params.page;
  let res = await fetchPage(page);

  // Halaman melewati akhir data: PostgREST menjawab "range not satisfiable" (PGRST103).
  // Hitung total, lalu pakai halaman terakhir.
  if (res.error?.code === "PGRST103") {
    const head = await filtered(db.from("task_list").select("*", { count: "exact", head: true }));
    if (head.error) throw new Error(`Gagal menghitung task: ${head.error.message}`);
    page = Math.max(1, Math.ceil((head.count ?? 0) / PAGE_SIZE));
    res = await fetchPage(page);
  }
  if (res.error) throw new Error(`Gagal membaca daftar task: ${res.error.message}`);

  const total = res.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return {
    params,
    ignoredTag,
    rows: (res.data as ViewRow[]).map((r) => ({
      sourceId: r.source_id,
      sourceName: r.source_name,
      tag: r.tag,
      taskId: r.task_id,
      title: r.title,
      status: r.status,
      priority: r.priority,
      subtasksTotal: r.subtasks_total,
      subtasksDone: r.subtasks_done,
    })),
    total,
    page,
    pageCount,
    pageSize: PAGE_SIZE,
    sources: sources.data as { id: string; name: string }[],
    tags,
  };
}

/** Daftar task untuk pengguna yang sedang login (sesi dari cookie). */
export async function getTaskList(params: TaskListParams): Promise<TaskListResult> {
  return loadTaskList(await createClient(), params);
}
