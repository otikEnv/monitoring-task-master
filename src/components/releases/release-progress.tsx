import type { DisplayStatus } from "@/lib/status";
import { STATUS_LABEL } from "@/lib/status";

/** Urutan segmen dari kiri: yang selesai dulu, lalu yang masih berjalan, lalu yang bermasalah. */
const BAR_ORDER: readonly DisplayStatus[] = [
  "done", "review", "in_progress", "pending", "blocked", "deferred", "cancelled", "other",
];

const SEGMENT: Record<DisplayStatus, string> = {
  done: "bg-green-600",
  review: "bg-violet-500",
  in_progress: "bg-blue-500",
  pending: "bg-slate-300 dark:bg-slate-600",
  blocked: "bg-red-500",
  deferred: "bg-amber-500",
  cancelled: "bg-zinc-400 dark:bg-zinc-500",
  other: "bg-muted-foreground/40",
};

/**
 * Bar progres bertingkat per status. Presentasional. Legenda memuat angka tiap status sehingga arti
 * segmen tidak bergantung pada warna.
 */
export function ReleaseProgress({
  label, counts, total, percent, legend = true,
}: {
  label: string;
  counts: Record<DisplayStatus, number>;
  total: number;
  /** 0..100 (bulat); null = tidak ada task. */
  percent: number | null;
  legend?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? 0}
        aria-valuetext={percent === null ? "Belum ada task" : `${percent}% selesai`}
        className="flex h-2.5 gap-px overflow-hidden rounded-full bg-muted"
      >
        {total > 0 &&
          BAR_ORDER.filter((s) => counts[s] > 0).map((s) => (
            <div
              key={s}
              title={`${STATUS_LABEL[s]}: ${counts[s]}`}
              className={SEGMENT[s]}
              style={{ width: `${(counts[s] * 100) / total}%` }}
            />
          ))}
      </div>
      {legend && total > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {BAR_ORDER.filter((s) => counts[s] > 0).map((s) => (
            <li key={s} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={`size-2 rounded-full ${SEGMENT[s]}`} />
              {STATUS_LABEL[s]} <span className="font-medium tabular-nums text-foreground">{counts[s]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
