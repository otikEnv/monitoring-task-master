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

/** Header release: satu untuk seluruh komponen. */
export type ReleaseHeader = {
  /** yyyy-mm-dd */
  startDate: string;
  /** yyyy-mm-dd */
  targetDate: string;
  /** yyyy-mm-dd; null = belum rilis */
  releasedOn: string | null;
};

/** Satu komponen: rentang task (inklusif) pada satu aplikasi dan tag. */
export type ComponentRange = {
  rangeStart: number;
  rangeEnd: number;
};

/** Header + rentang satu komponen; masukan computeRelease. */
export type ReleaseDef = ReleaseHeader & ComponentRange;

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

export type RiskInput = {
  releasedOn: string | null;
  total: number;
  done: number;
  daysLeft: number;
  /** elapsedPercent - persen progres (tanpa pembulatan); null bila total 0. */
  gap: number | null;
  /** Jumlah task terhambat. */
  blocked: number;
  /** Jumlah task yang menunggu dependensi di luar rentang. */
  waiting: number;
};

/** Penanda risiko; dipakai satu komponen maupun gabungan seluruh komponen. */
export function riskLevel(i: RiskInput): RiskLevel {
  if (i.releasedOn) return "released";
  if (i.total === 0 || i.gap === null) return "empty";
  if (i.daysLeft < 0 && i.done < i.total) return "overdue";
  if (i.gap > AMBANG_TERTINGGAL) return "behind";
  if (i.gap > AMBANG_BERISIKO || i.blocked > 0 || i.waiting > 0) return "at_risk";
  return "on_track";
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

  const risk = riskLevel({
    releasedOn: def.releasedOn, total, done, daysLeft: time.daysLeft, gap, blocked: blocked.length, waiting: waiting.length,
  });

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

/** Statistik gabungan seluruh komponen satu release (PRD-Release-Multi-Aplikasi.md). */
export type ReleaseAggregate = {
  total: number;
  counts: Record<DisplayStatus, number>;
  done: number;
  /** Dikerjakan + ditinjau. */
  inProgress: number;
  /** Bulat 0..100 dari jumlah task seluruh komponen; null bila total 0. */
  percentDone: number | null;
  elapsedPercent: number;
  daysLeft: number;
  /** elapsedPercent - persen progres gabungan (tanpa pembulatan); null bila total 0. */
  gap: number | null;
  risk: RiskLevel;
  /** Indeks komponen yang sendiri berisiko (At risk, Behind, atau Overdue), urut sesuai masukan. */
  riskComponents: number[];
  /** Jumlah task ditunda, dibatalkan, dan terhambat di seluruh komponen. */
  attentionCount: number;
};

const RISKY: RiskLevel[] = ["at_risk", "behind", "overdue"];

/**
 * Menggabungkan statistik komponen. Progres = total selesai / total task (bukan rata-rata persen);
 * risiko memakai aturan yang sama dengan satu komponen, dengan selisih dari progres gabungan.
 * `components` adalah hasil computeRelease tiap komponen (tanggal dari header yang sama).
 */
export function aggregateRelease(header: ReleaseHeader, components: ReleaseStats[], now: Date): ReleaseAggregate {
  const counts = zeroCounts();
  let blocked = 0;
  let waiting = 0;
  for (const c of components) {
    for (const s of STATUS_ORDER) counts[s] += c.counts[s];
    blocked += c.counts.blocked;
    waiting += c.attention.waiting.length;
  }
  const total = STATUS_ORDER.reduce((n, s) => n + counts[s], 0);
  const done = counts.done;
  const exactPercent = total > 0 ? (done * 100) / total : null;
  const time = timeProgress(header.startDate, header.targetDate, now);
  const gap = exactPercent === null ? null : time.elapsedPercent - exactPercent;

  return {
    total,
    counts,
    done,
    inProgress: counts.in_progress + counts.review,
    percentDone: exactPercent === null ? null : Math.round(exactPercent),
    elapsedPercent: time.elapsedPercent,
    daysLeft: time.daysLeft,
    gap,
    risk: riskLevel({ releasedOn: header.releasedOn, total, done, daysLeft: time.daysLeft, gap, blocked, waiting }),
    riskComponents: components.flatMap((c, i) => (RISKY.includes(c.risk) ? [i] : [])),
    attentionCount: counts.blocked + counts.deferred + counts.cancelled,
  };
}
