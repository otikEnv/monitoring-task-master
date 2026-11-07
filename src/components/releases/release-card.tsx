import Link from "next/link";
import { RiskBadge } from "@/components/releases/risk-badge";
import { ReleaseProgress } from "@/components/releases/release-progress";
import { formatDateTime } from "@/lib/format";
import { formatDaysLeft, formatRange, formatYmd } from "@/lib/releases/format";
import type { ReleaseOverview } from "@/lib/releases/load";

/** Kartu satu release. Presentasional; seluruh kartu menaut ke detail release. */
export function ReleaseCard({ overview }: { overview: ReleaseOverview }) {
  const { release, stats, sourceName } = overview;
  const released = Boolean(release.releasedOn);
  const evaluate = stats.counts.deferred + stats.counts.cancelled;

  return (
    <article className="relative flex flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground shadow-xs transition-all hover:border-foreground/30 hover:shadow-md">
      <header className="space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="font-semibold leading-tight">
            {/* Tautan "membentang" menutupi seluruh kartu. */}
            <Link href={`/release/${release.id}`} className="after:absolute after:inset-0 after:rounded-xl hover:underline">
              {sourceName} · {release.name}
            </Link>
          </h2>
          <RiskBadge risk={stats.risk} />
        </div>
        <p className="text-xs text-muted-foreground">
          Tag <strong>{release.tag}</strong> · Range {formatRange(release.rangeStart, release.rangeEnd)} · {stats.total} tasks
        </p>
        <p className="text-xs text-muted-foreground">
          {released ? (
            <>Released {formatYmd(release.releasedOn)} (target {formatYmd(release.targetDate)})</>
          ) : (
            <>
              Target {formatYmd(release.targetDate)} ·{" "}
              <span className={stats.daysLeft < 0 ? "font-medium text-red-700 dark:text-red-400" : undefined}>
                {formatDaysLeft(stats.daysLeft)}
              </span>
            </>
          )}
        </p>
      </header>

      {stats.total === 0 ? (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          {overview.tagFound ? "No tasks in this range yet." : "Tag not found in the latest data."}
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-3xl font-semibold tabular-nums">{stats.percentDone}%</p>
            <p className="text-right text-xs text-muted-foreground">
              {stats.done} of {stats.total} done
              {!released && <> · time elapsed {Math.round(stats.elapsedPercent)}%</>}
            </p>
          </div>
          <ReleaseProgress
            label={`Progress ${sourceName} ${release.name}`}
            counts={stats.counts}
            total={stats.total}
            percent={stats.percentDone}
            legend={false}
          />
          <p className="text-xs text-muted-foreground">
            {stats.inProgress} in progress · {stats.counts.pending} pending
            {stats.counts.blocked > 0 && (
              <> · <span className="font-medium text-red-700 dark:text-red-400">{stats.counts.blocked} blocked</span></>
            )}
            {evaluate > 0 && (
              <> · <span className="font-medium text-amber-700 dark:text-amber-400">{evaluate} deferred/cancelled</span></>
            )}
          </p>
        </>
      )}

      {(!overview.sourceActive || overview.syncStatus === "failed") && (
        <p className="text-xs text-muted-foreground">
          {!overview.sourceActive && "Application is inactive. "}
          {overview.syncStatus === "failed" &&
            `The last sync failed; data is from ${formatDateTime(overview.lastSyncedAt)}.`}
        </p>
      )}
    </article>
  );
}
