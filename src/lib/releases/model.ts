import { parseDependencyIds } from "@/lib/tasks/detail-model";
import { displayStatus, STATUS_ORDER, type DisplayStatus } from "@/lib/status";

/**
 * Aturan hitung fitur Release (PRD-Fitur-Release-Tracking.md). Murni: tanpa server, React, atau
 * database. Tanggal memakai kalender WIB (konsisten dengan seluruh tampilan lain).
 */

/** Selisih (poin persen) antara persen waktu dan persen progres yang masih dianggap sesuai jadwal. */
export const AMBANG_BERISIKO = 10;
/** Selisih di atas ini = Tertinggal. */
export const AMBANG_TERTINGGAL = 25;

export type ReleaseDef = {
  rangeStart: number;
  rangeEnd: number;
  /** yyyy-mm-dd */
  startDate: string;
  /** yyyy-mm-dd */
  targetDate: string;
  /** yyyy-mm-dd; null = belum rilis */
  releasedOn: string | null;
};

/** Task pada tag release, seperti dibaca dari tabel tasks (kolom seperlunya). */
export type TaskInput = {
  taskId: string;
  title: string;
  status: string;
  priority: string | null;
  dependencies: unknown;
  subtasksTotal: number;
  subtasksDone: number;
};

export type ReleaseTask = {
  taskId: string;
  seq: number;
  title: string;
  status: DisplayStatus;
  priority: string | null;
  subtasksTotal: number;
  subtasksDone: number;
};

export type RiskLevel = "released" | "empty" | "overdue" | "behind" | "at_risk" | "on_track";

export const RISK_LABEL: Record<RiskLevel, string> = {
  released: "Released",
  empty: "No tasks",
  overdue: "Overdue",
  behind: "Behind",
  at_risk: "At risk",
  on_track: "On track",
};

export type WaitingTask = {
  task: ReleaseTask;
  /** Dependensi di luar rentang yang belum selesai. */
  deps: { id: string; title: string; status: DisplayStatus }[];
};

export type ReleaseStats = {
  total: number;
  counts: Record<DisplayStatus, number>;
  done: number;
  /** Dikerjakan + ditinjau. */
  inProgress: number;
  /** Bulat 0..100; null bila tidak ada task. */
  percentDone: number | null;
  /** ID angka terkecil dan terbesar yang benar-benar ada di rentang. */
  firstId: string | null;
  lastId: string | null;
  /** Semua task di rentang, paling perlu perhatian dulu. */
  tasks: ReleaseTask[];
  attention: {
    blocked: ReleaseTask[];
    /** Task yang menunggu dependensi di luar rentang. */
    waiting: WaitingTask[];
    /** Task dengan dependensi yang tidak ditemukan pada tag ini. */
    missingDeps: { task: ReleaseTask; ids: string[] }[];
    deferred: ReleaseTask[];
    cancelled: ReleaseTask[];
  };
  /** Persen waktu yang sudah lewat (0..100). */
  elapsedPercent: number;
  /** Sisa hari kalender WIB menuju target; negatif bila sudah lewat. */
  daysLeft: number;
  /** elapsedPercent - persen progres (tanpa pembulatan); null bila tidak ada task. */
  gap: number | null;
  risk: RiskLevel;
};

const NUMERIC_ID = /^[0-9]{1,15}$/;

const STATUS_RANK: Record<DisplayStatus, number> = {
  blocked: 1, in_progress: 2, review: 3, pending: 4, deferred: 5, done: 6, cancelled: 7, other: 8,
};

const zeroCounts = (): Record<DisplayStatus, number> =>
  Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<DisplayStatus, number>;

/** ID task yang berupa angka murni (ID non-angka tidak pernah masuk rentang). */
export function numericId(taskId: string): number | null {
  return NUMERIC_ID.test(taskId) ? Number(taskId) : null;
}

/** Tanggal hari ini menurut WIB, yyyy-mm-dd. */
export function wibDay(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

/** yyyy-mm-dd -> jumlah hari sejak epoch (tanpa pengaruh zona waktu). */
function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Task yang masuk release: ID angka dalam rentang (inklusif), urut menurut ID. */
export function tasksInRange(tasks: TaskInput[], rangeStart: number, rangeEnd: number): (TaskInput & { seq: number })[] {
  const out: (TaskInput & { seq: number })[] = [];
  for (const t of tasks) {
    const seq = numericId(t.taskId);
    if (seq !== null && seq >= rangeStart && seq <= rangeEnd) out.push({ ...t, seq });
  }
  return out.sort((a, b) => a.seq - b.seq);
}

function toReleaseTask(t: TaskInput & { seq: number }): ReleaseTask {
  return {
    taskId: t.taskId,
    seq: t.seq,
    title: t.title,
    status: displayStatus(t.status),
    priority: t.priority,
    subtasksTotal: t.subtasksTotal,
    subtasksDone: t.subtasksDone,
  };
}

/** Persen waktu yang sudah lewat dan sisa hari, menurut kalender WIB. */
export function timeProgress(startDate: string, targetDate: string, now: Date): { elapsedPercent: number; daysLeft: number } {
  const today = dayNumber(wibDay(now));
  const start = dayNumber(startDate);
  const target = dayNumber(targetDate);
  const span = target - start;
  const elapsedPercent =
    span <= 0 ? (today >= target ? 100 : 0) : Math.min(100, Math.max(0, ((today - start) / span) * 100));
  return { elapsedPercent, daysLeft: target - today };
}

/**
 * Menghitung statistik satu release dari semua task pada tag-nya.
 * Total mencakup semua status (termasuk ditunda dan dibatalkan) agar penyebab progres tertahan
 * bisa dievaluasi; keduanya dilaporkan terpisah di attention.
 */
export function computeRelease(def: ReleaseDef, tagTasks: TaskInput[], now: Date): ReleaseStats {
  const inRange = tasksInRange(tagTasks, def.rangeStart, def.rangeEnd);
  const tasks = inRange.map(toReleaseTask);

  const counts = zeroCounts();
  for (const t of tasks) counts[t.status]++;
  const total = tasks.length;
  const done = counts.done;
  const exactPercent = total > 0 ? (done * 100) / total : null;

  // Hambatan: dependensi dicari pada semua task tag ini; yang ada di dalam rentang diabaikan.
  const byId = new Map(tagTasks.map((t) => [t.taskId, t]));
  const waiting: WaitingTask[] = [];
  const missingDeps: { task: ReleaseTask; ids: string[] }[] = [];
  inRange.forEach((raw, i) => {
    const task = tasks[i];
    if (task.status === "done" || task.status === "cancelled") return; // tidak lagi menunggu apa pun
    const deps: WaitingTask["deps"] = [];
    const missing: string[] = [];
    for (const id of parseDependencyIds(raw.dependencies)) {
      const seq = numericId(id);
      if (seq !== null && seq >= def.rangeStart && seq <= def.rangeEnd) continue;
      const dep = byId.get(id);
      if (!dep) missing.push(id);
      else if (displayStatus(dep.status) !== "done") {
        deps.push({ id, title: dep.title, status: displayStatus(dep.status) });
      }
    }
    if (deps.length > 0) waiting.push({ task, deps });
    if (missing.length > 0) missingDeps.push({ task, ids: missing });
  });

  const time = timeProgress(def.startDate, def.targetDate, now);
  const gap = exactPercent === null ? null : time.elapsedPercent - exactPercent;
  const blocked = tasks.filter((t) => t.status === "blocked");

  let risk: RiskLevel;
  if (def.releasedOn) risk = "released";
  else if (total === 0) risk = "empty";
  else if (time.daysLeft < 0 && done < total) risk = "overdue";
  else if (gap! > AMBANG_TERTINGGAL) risk = "behind";
  else if (gap! > AMBANG_BERISIKO || blocked.length > 0 || waiting.length > 0) risk = "at_risk";
  else risk = "on_track";

  return {
    total,
    counts,
    done,
    inProgress: counts.in_progress + counts.review,
    percentDone: exactPercent === null ? null : Math.round(exactPercent),
    firstId: total > 0 ? tasks[0].taskId : null,
    lastId: total > 0 ? tasks[total - 1].taskId : null,
    tasks: [...tasks].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.seq - b.seq),
    attention: {
      blocked,
      waiting,
      missingDeps,
      deferred: tasks.filter((t) => t.status === "deferred"),
      cancelled: tasks.filter((t) => t.status === "cancelled"),
    },
    elapsedPercent: time.elapsedPercent,
    daysLeft: time.daysLeft,
    gap,
    risk,
  };
}

/** Ada sesuatu yang perlu dilihat di release ini (untuk ringkasan di kartu). */
export function needsAttentionCount(s: ReleaseStats): number {
  return s.counts.blocked + s.counts.deferred + s.counts.cancelled;
}
