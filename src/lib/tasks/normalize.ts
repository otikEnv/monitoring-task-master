/**
 * Normalizer tasks.json (Taskmaster). Fungsi murni: tanpa jaringan, tanpa database.
 *
 * Mengenali dua bentuk file:
 *   1. Per-tag:  { "master": { "tasks": [...] }, "fitur-x": { "tasks": [...] } }
 *   2. Lama:     { "tasks": [...] }            (diberi tag "master")
 *
 * Bentuk lain adalah galat (TasksFileError), BUKAN "0 task". File valid dengan
 * array task kosong tetap berarti 0 task.
 *
 * Temuan data asli (echoapp, Fase 0) yang ditangani di sini:
 *   - ID task string, ID subtask angka, dependensi string -> semuanya disamakan jadi string.
 *   - Banyak task tanpa testStrategy -> null.
 *   - Status "blocked" ada pada task dan subtask; "cancelled" pada subtask.
 */

// ---------------------------------------------------------------- status

/** Kunci status yang sama dengan nama kolom di tabel snapshots. */
export const STATUS_KEYS = [
  "pending",
  "in_progress",
  "review",
  "blocked",
  "done",
  "deferred",
  "cancelled",
] as const;
export type StatusKey = (typeof STATUS_KEYS)[number];

/** Nilai status di tasks.json -> kunci kolom. Status lain dihitung sebagai "other". */
const STATUS_TO_KEY: Record<string, StatusKey> = {
  pending: "pending",
  "in-progress": "in_progress",
  review: "review",
  blocked: "blocked",
  done: "done",
  deferred: "deferred",
  cancelled: "cancelled",
};

export type StatusCounts = Record<StatusKey, number> & {
  total: number;
  other: number;
  /** Persentase selesai (0-100, dua desimal), hanya untuk tampilan. */
  percent_done: number;
};

export function countByStatus(tasks: ReadonlyArray<{ status: string }>): StatusCounts {
  const counts = {
    total: tasks.length,
    other: 0,
    percent_done: 0,
    pending: 0,
    in_progress: 0,
    review: 0,
    blocked: 0,
    done: 0,
    deferred: 0,
    cancelled: 0,
  } satisfies StatusCounts;

  for (const t of tasks) {
    const key = STATUS_TO_KEY[t.status];
    if (key) counts[key]++;
    else counts.other++;
  }
  counts.percent_done =
    counts.total > 0 ? Math.round((counts.done * 10000) / counts.total) / 100 : 0;
  return counts;
}

// ---------------------------------------------------------------- tipe hasil

export type NormalizedSubtask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  details: string | null;
  dependencies: string[];
};

export type NormalizedTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  dependencies: string[];
  details: string | null;
  testStrategy: string | null;
  subtasks: NormalizedSubtask[];
};

export type NormalizedTag = { tag: string; tasks: NormalizedTask[] };

export type ParsedTasksFile = {
  shape: "per-tag" | "legacy";
  tags: NormalizedTag[];
  /** Hal yang diperbaiki atau dilewati secara otomatis (task tanpa ID, duplikat, dst). */
  warnings: string[];
};

export type TasksFileErrorCode = "invalid_json" | "invalid_shape";

export class TasksFileError extends Error {
  constructor(
    public readonly code: TasksFileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TasksFileError";
  }
}

// ---------------------------------------------------------------- helper

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Teks opsional: null/undefined/kosong -> null. Angka dan boolean dijadikan string. */
function optText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

/** ID dari string atau angka; selain itu null. */
function toId(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  return null;
}

function toIdList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(toId).filter((x): x is string => x !== null);
}

const normStatus = (v: unknown): string | null => {
  const s = optText(v);
  return s === null ? null : s.trim().toLowerCase();
};

// ---------------------------------------------------------------- normalisasi

function normalizeSubtask(raw: unknown, index: number): NormalizedSubtask | null {
  if (!isRec(raw)) return null;
  return {
    id: toId(raw.id) ?? String(index + 1),
    title: optText(raw.title) ?? "(tanpa judul)",
    description: optText(raw.description),
    status: normStatus(raw.status) ?? "pending",
    details: optText(raw.details),
    dependencies: toIdList(raw.dependencies),
  };
}

function normalizeTasks(rawTasks: unknown[], tag: string, warnings: string[]): NormalizedTask[] {
  const seen = new Set<string>();
  const out: NormalizedTask[] = [];

  rawTasks.forEach((raw, i) => {
    const where = `tag "${tag}", task ke-${i + 1}`;
    if (!isRec(raw)) {
      warnings.push(`${where}: bukan objek, dilewati.`);
      return;
    }
    const id = toId(raw.id);
    if (id === null) {
      warnings.push(`${where}: tidak punya ID, dilewati.`);
      return;
    }
    if (seen.has(id)) {
      warnings.push(`tag "${tag}", task ${id}: ID ganda, yang pertama dipakai.`);
      return;
    }
    seen.add(id);

    const title = optText(raw.title);
    if (title === null) warnings.push(`tag "${tag}", task ${id}: tanpa judul.`);
    const status = normStatus(raw.status);
    if (status === null) warnings.push(`tag "${tag}", task ${id}: tanpa status, dianggap pending.`);

    const subtasks: NormalizedSubtask[] = [];
    if (Array.isArray(raw.subtasks)) {
      raw.subtasks.forEach((s, si) => {
        const sub = normalizeSubtask(s, si);
        if (sub) subtasks.push(sub);
        else warnings.push(`tag "${tag}", task ${id}: subtask ke-${si + 1} bukan objek, dilewati.`);
      });
    }

    // Temuan data asli: pada sebagian task semua subtask memakai ID yang sama (ID task induk).
    // ID subtask harus unik di dalam satu task; bila tidak, pakai nomor urut.
    if (new Set(subtasks.map((s) => s.id)).size !== subtasks.length) {
      subtasks.forEach((s, si) => {
        s.id = String(si + 1);
      });
      warnings.push(
        `tag "${tag}", task ${id}: ID subtask tidak unik, diganti nomor urut.`,
      );
    }

    out.push({
      id,
      title: title ?? "(tanpa judul)",
      description: optText(raw.description),
      status: status ?? "pending",
      priority: optText(raw.priority)?.trim().toLowerCase() ?? null,
      dependencies: toIdList(raw.dependencies),
      details: optText(raw.details),
      testStrategy: optText(raw.testStrategy),
      subtasks,
    });
  });

  return out;
}

/**
 * Mem-parse isi file tasks.json. Melempar TasksFileError bila bukan JSON valid atau bentuknya
 * tidak dikenali.
 */
export function parseTasksFile(text: string): ParsedTasksFile {
  const body = text.replace(/^﻿/, "");
  if (body.trim() === "") {
    throw new TasksFileError("invalid_json", "File kosong, bukan JSON yang valid.");
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch (e) {
    throw new TasksFileError(
      "invalid_json",
      `Isi file bukan JSON yang valid: ${(e as Error).message}`,
    );
  }
  if (!isRec(json)) {
    throw new TasksFileError("invalid_shape", "Bentuk file tidak dikenali: akar file bukan objek.");
  }

  const warnings: string[] = [];

  // Bentuk lama: { tasks: [...] }
  if (Array.isArray(json.tasks)) {
    return {
      shape: "legacy",
      tags: [{ tag: "master", tasks: normalizeTasks(json.tasks, "master", warnings) }],
      warnings,
    };
  }

  // Bentuk per-tag: setiap kunci yang berisi { tasks: [...] } adalah satu tag.
  const tags: NormalizedTag[] = [];
  for (const [tag, value] of Object.entries(json)) {
    if (isRec(value) && Array.isArray(value.tasks)) {
      tags.push({ tag, tasks: normalizeTasks(value.tasks, tag, warnings) });
    }
  }
  if (tags.length === 0) {
    throw new TasksFileError(
      "invalid_shape",
      "Bentuk file tidak dikenali: tidak ada { tasks: [...] } maupun { <tag>: { tasks: [...] } }.",
    );
  }
  return { shape: "per-tag", tags, warnings };
}

// ---------------------------------------------------------------- ke baris database

/** Baris untuk tabel public.tasks (percent dan hitungan subtask diturunkan di sini). */
export function toTaskRow(sourceId: string, tag: string, t: NormalizedTask) {
  return {
    source_id: sourceId,
    tag,
    task_id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    dependencies: t.dependencies,
    details: t.details,
    test_strategy: t.testStrategy,
    subtasks: t.subtasks,
    subtasks_total: t.subtasks.length,
    subtasks_done: t.subtasks.filter((s) => s.status === "done").length,
  };
}

/** Baris untuk tabel public.snapshots (percent_done dihitung oleh database). */
export function toSnapshotRow(sourceId: string, tag: string, tasks: NormalizedTask[]) {
  const c = countByStatus(tasks);
  return {
    source_id: sourceId,
    tag,
    total: c.total,
    pending: c.pending,
    in_progress: c.in_progress,
    review: c.review,
    blocked: c.blocked,
    done: c.done,
    deferred: c.deferred,
    cancelled: c.cancelled,
    other: c.other,
  };
}
