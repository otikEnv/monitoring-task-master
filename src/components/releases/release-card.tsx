import Link from "next/link";
import { RiskBadge } from "@/components/releases/risk-badge";
import { ReleaseProgress } from "@/components/releases/release-progress";
import { formatDateTime } from "@/lib/format";
import { formatDaysLeft, formatRange, formatYmd } from "@/lib/releases/format";
import type { ComponentOverview, ReleaseOverview } from "@/lib/releases/load";

const warn = "font-medium text-amber-700 dark:text-amber-400";

/** Catatan pendek per komponen bila datanya perlu dicurigai; null = tidak ada. */
function componentNote(c: ComponentOverview): string | null {
  const notes: string[] = [];
  if (!c.tagFound) notes.push("tag not found in the latest data");
  if (!c.sourceActive) notes.push("application inactive");
  if (c.syncStatus === "failed") notes.push(`last sync failed, data from ${formatDateTime(c.lastSyncedAt)}`);
  return notes.length > 0 ? notes.join("; ") : null;
}

/** Kartu satu release. Presentasional; seluruh kartu menaut ke detail release. */
export function ReleaseCard({ overview }: { overview: ReleaseOverview }) {
  const { release, stats, components } = overview;
  const released = Boolean(release.releasedOn);
  const evaluate = stats.counts.deferred + stats.counts.cancelled;

  return (
    <article className="relative flex flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground shadow-xs transition-all hover:border-foreground/30 hover:shadow-md">
      <header className="space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="font-semibold leading-tight">
            {/* Tautan "membentang" menutupi seluruh kartu. */}
            <Link href={`/release/${release.id}`} className="after:absolute after:inset-0 after:rounded-xl hover:underline">
              {release.name}
            </Link>
          </h2>
          <RiskBadge risk={stats.risk} />
        </div>
        <p className="text-xs text-muted-foreground">
          {stats.total} tasks · {components.length} {components.length === 1 ? "component" : "components"}
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

      {components.length === 0 ? (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          No components (their applications were removed).
        </p>
      ) : (
        <>
          {stats.total === 0 ? (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">No tasks in the ranges yet.</p>
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
                label={`Progress ${release.name}`}
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
                {evaluate > 0 && <> · <span className={warn}>{evaluate} deferred/cancelled</span></>}
              </p>
            </>
          )}

          <ul className="space-y-1 border-t pt-3 text-xs">
            {components.map((c) => {
              const note = componentNote(c);
              return (
                <li key={c.component.id} className="space-y-0.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 break-words">
                      <span className="font-medium">{c.sourceName}</span>
                      <span className="text-muted-foreground">
                        {" "}· {c.component.tag} · {formatRange(c.component.rangeStart, c.component.rangeEnd)}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {c.stats.total === 0 ? "no tasks" : `${c.stats.percentDone}% · ${c.stats.done}/${c.stats.total}`}
                    </span>
                  </div>
                  {note && <p className="text-muted-foreground">{note}</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </article>
  );
}
