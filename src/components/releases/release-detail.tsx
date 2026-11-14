import Link from "next/link";
import { RiskBadge } from "@/components/releases/risk-badge";
import { ReleaseProgress } from "@/components/releases/release-progress";
import { PriorityBadge, StatusBadge } from "@/components/tasks/task-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { formatDaysLeft, formatRange, formatYmd } from "@/lib/releases/format";
import type { ComponentOverview, ReleaseOverview } from "@/lib/releases/load";
import { AMBANG_BERISIKO, AMBANG_TERTINGGAL, type ReleaseTask } from "@/lib/releases/model";
import { taskHref } from "@/lib/tasks/list-params";

const section = "space-y-3 rounded-xl border bg-card p-5";
const heading = "text-sm font-semibold uppercase tracking-wide text-muted-foreground";

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TaskLink({ sourceId, tag, task }: { sourceId: string; tag: string; task: ReleaseTask }) {
  return (
    <Link href={taskHref(sourceId, tag, task.taskId)} className="underline break-words">
      #{task.taskId} {task.title}
    </Link>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-medium">{title}</h4>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <ul className="space-y-1 text-sm">{children}</ul>
    </div>
  );
}

/** Aplikasi dan tag satu komponen, mis. "Web · master". */
const label = (c: ComponentOverview) => `${c.sourceName} · ${c.component.tag}`;

const hasAttention = (c: ComponentOverview) => {
  const a = c.stats.attention;
  return a.blocked.length + a.waiting.length + a.missingDeps.length + a.deferred.length + a.cancelled.length > 0;
};

/** Peringatan data satu komponen (tag hilang, aplikasi nonaktif, sinkronisasi gagal). */
function ComponentWarnings({ c }: { c: ComponentOverview }) {
  return (
    <>
      {!c.tagFound && (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          Tag <strong>{c.component.tag}</strong> was not found in the latest data of {c.sourceName}. Its numbers are treated as zero; edit the release if the tag was renamed in the repo.
        </p>
      )}
      {(!c.sourceActive || c.syncStatus === "failed") && (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          {!c.sourceActive && `${c.sourceName} is inactive. `}
          {c.syncStatus === "failed" &&
            `The last sync of ${c.sourceName} failed; the data comes from the last successful sync on ${formatDateTime(c.lastSyncedAt)}.`}
        </p>
      )}
    </>
  );
}

/** Daftar perhatian satu komponen: terhambat, menunggu dependensi, ditunda/dibatalkan, dependensi hilang. */
function AttentionGroups({ c }: { c: ComponentOverview }) {
  const { attention } = c.stats;
  const sourceId = c.component.sourceId;
  const tag = c.component.tag;
  return (
    <div className="space-y-5">
      {attention.blocked.length > 0 && (
        <Group title={`Blocked (${attention.blocked.length})`}>
          {attention.blocked.map((t) => (
            <li key={t.taskId}><TaskLink sourceId={sourceId} tag={tag} task={t} /></li>
          ))}
        </Group>
      )}
      {attention.waiting.length > 0 && (
        <Group
          title={`Waiting on tasks outside the range (${attention.waiting.length})`}
          hint="These dependencies are not counted in the release progress, but they hold back tasks inside it."
        >
          {attention.waiting.map((w) => (
            <li key={w.task.taskId} className="space-y-0.5">
              <TaskLink sourceId={sourceId} tag={tag} task={w.task} />
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                waiting on
                {w.deps.map((d) => (
                  <span key={d.id} className="inline-flex items-center gap-1.5">
                    <Link href={taskHref(sourceId, tag, d.id)} className="underline">#{d.id} {d.title}</Link>
                    <StatusBadge status={d.status === "in_progress" ? "in-progress" : d.status} />
                  </span>
                ))}
              </p>
            </li>
          ))}
        </Group>
      )}
      {attention.deferred.length + attention.cancelled.length > 0 && (
        <Group
          title={`To evaluate: ${attention.deferred.length} deferred, ${attention.cancelled.length} cancelled`}
          hint="Still counted in the total so you can see what is holding back progress."
        >
          {[...attention.deferred, ...attention.cancelled]
            .sort((a, b) => a.seq - b.seq)
            .map((t) => (
              <li key={t.taskId} className="flex flex-wrap items-center gap-2">
                <TaskLink sourceId={sourceId} tag={tag} task={t} />
                <StatusBadge status={t.status === "deferred" ? "deferred" : "cancelled"} />
              </li>
            ))}
        </Group>
      )}
      {attention.missingDeps.length > 0 && (
        <Group
          title={`Dependencies not found (${attention.missingDeps.length})`}
          hint="These dependency IDs do not exist in this tag; check tasks.json in the repo."
        >
          {attention.missingDeps.map((m) => (
            <li key={m.task.taskId} className="space-y-0.5">
              <TaskLink sourceId={sourceId} tag={tag} task={m.task} />
              <p className="text-xs text-muted-foreground">depends on {m.ids.map((i) => `#${i}`).join(", ")}</p>
            </li>
          ))}
        </Group>
      )}
    </div>
  );
}

function TaskTable({ c }: { c: ComponentOverview }) {
  return (
    <div className="rounded-xl border bg-card">
      <Table className="min-w-[40rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="w-16">ID</TableHead>
            <TableHead scope="col">Title</TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col">Priority</TableHead>
            <TableHead scope="col" className="text-right">Subtask</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {c.stats.tasks.map((t) => (
            <TableRow key={t.taskId} className="align-top">
              <TableCell className="tabular-nums">{t.taskId}</TableCell>
              <TableCell className="whitespace-normal">
                <Link href={taskHref(c.component.sourceId, c.component.tag, t.taskId)} className="font-medium hover:underline">
                  {t.title}
                </Link>
              </TableCell>
              <TableCell><StatusBadge status={t.status === "in_progress" ? "in-progress" : t.status} /></TableCell>
              <TableCell><PriorityBadge priority={t.priority} /></TableCell>
              <TableCell className="text-right tabular-nums">
                {t.subtasksTotal > 0 ? `${t.subtasksDone}/${t.subtasksTotal}` : <span className="text-muted-foreground">-</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Tampilan detail satu release. Presentasional; tombol admin dipasang lewat slot `actions`. */
export function ReleaseDetailView({
  overview, actions,
}: { overview: ReleaseOverview; actions?: React.ReactNode }) {
  const { release, stats, components } = overview;
  const released = Boolean(release.releasedOn);
  const multi = components.length > 1;
  const withAttention = components.filter(hasAttention);
  const risky = stats.riskComponents.map((i) => components[i]).filter(Boolean);

  return (
    <div className="space-y-6">
      <nav aria-label="Navigation" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/release" className="hover:underline">Release</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{release.name}</span>
      </nav>

      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold leading-snug tracking-tight break-words">{release.name}</h1>
            <RiskBadge risk={stats.risk} />
          </div>
          {actions}
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="inline">Components: </dt><dd className="inline text-foreground">{components.length}</dd></div>
          <div><dt className="inline">Start: </dt><dd className="inline text-foreground">{formatYmd(release.startDate)}</dd></div>
          <div>
            <dt className="inline">Target: </dt>
            <dd className="inline text-foreground">
              {formatYmd(release.targetDate)}
              {!released && ` (${formatDaysLeft(stats.daysLeft)})`}
            </dd>
          </div>
          {released && (
            <div><dt className="inline">Released: </dt><dd className="inline text-foreground">{formatYmd(release.releasedOn)}</dd></div>
          )}
        </dl>
        {components.map((c) => <ComponentWarnings key={c.component.id} c={c} />)}
      </header>

      {released && (
        <p className="text-sm">
          Released on <strong>{formatYmd(release.releasedOn)}</strong>
          {stats.percentDone !== null && <>, current task progress {stats.percentDone}%</>}.
        </p>
      )}

      {components.length === 0 ? (
        <p role="status" className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          This release has no components because the applications it covered were removed. Edit it to add components, or delete it.
        </p>
      ) : (
        <>
          <section aria-labelledby="sec-ringkasan" className="space-y-3">
            <h2 id="sec-ringkasan" className="sr-only">Summary</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="Total tasks" value={stats.total} />
              <Tile label="Done" value={stats.done} hint={stats.percentDone === null ? undefined : `${stats.percentDone}% of total`} />
              <Tile label="In progress" value={stats.inProgress} hint="in progress and in review" />
              <Tile label="Needs attention" value={stats.attentionCount} hint="blocked, deferred, cancelled" />
            </div>
          </section>

          <section aria-labelledby="sec-progres" className={section}>
            <h2 id="sec-progres" className={heading}>Progress</h2>
            {stats.total === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks in the ranges yet.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-3xl font-semibold tabular-nums">{stats.percentDone}%</p>
                  <p className="text-sm text-muted-foreground">
                    {stats.done} of {stats.total} done
                    {!released && <> · time elapsed {Math.round(stats.elapsedPercent)}%</>}
                    {!released && stats.gap !== null && stats.gap > 0 && (
                      <> · {Math.round(stats.gap)} points behind the elapsed time</>
                    )}
                  </p>
                </div>
                <ReleaseProgress
                  label={`Progress ${release.name}`}
                  counts={stats.counts}
                  total={stats.total}
                  percent={stats.percentDone}
                />
              </>
            )}
            {multi && !released && risky.length > 0 && (
              <p role="status" className="text-sm">
                Needs a look: <strong>{risky.map(label).join(", ")}</strong>
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {multi && "Progress is the total of done tasks divided by all tasks across the components. "}
              The indicator compares the share of time that has elapsed with the share of tasks done: more than{" "}
              {AMBANG_BERISIKO} points behind = At risk, more than {AMBANG_TERTINGGAL} points behind = Behind. Blocked tasks or
              unfinished dependencies outside the range also mark the release At risk. This is guidance, not an exact prediction.
            </p>
          </section>

          <section aria-labelledby="sec-komponen" className="space-y-3">
            <h2 id="sec-komponen" className={heading}>Components ({components.length})</h2>
            <div className={multi ? "grid gap-3 lg:grid-cols-2" : "grid gap-3"}>
              {components.map((c) => (
                <article key={c.component.id} className="space-y-3 rounded-xl border bg-card p-5" aria-label={`Component ${label(c)}`}>
                  <header className="space-y-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-semibold leading-tight break-words">{label(c)}</h3>
                      <RiskBadge risk={c.stats.risk} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Task range {formatRange(c.component.rangeStart, c.component.rangeEnd)}
                      {c.stats.firstId && ` (existing: #${c.stats.firstId}–#${c.stats.lastId})`} · {c.stats.total} tasks
                    </p>
                    <p className="text-xs text-muted-foreground">Task data updated {formatDateTime(c.lastSyncedAt)}</p>
                  </header>
                  {c.stats.total === 0 ? (
                    <p className="text-sm text-muted-foreground">No tasks in this range yet.</p>
                  ) : (
                    <>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-2xl font-semibold tabular-nums">{c.stats.percentDone}%</p>
                        <p className="text-xs text-muted-foreground">{c.stats.done} of {c.stats.total} done</p>
                      </div>
                      <ReleaseProgress
                        label={`Progress ${label(c)}`}
                        counts={c.stats.counts}
                        total={c.stats.total}
                        percent={c.stats.percentDone}
                      />
                    </>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="sec-perhatian" className={section}>
            <h2 id="sec-perhatian" className={heading}>Needs attention</h2>
            {withAttention.length === 0 ? (
              <p className="text-sm text-muted-foreground">No blockers.</p>
            ) : (
              <div className="space-y-6">
                {withAttention.map((c) => (
                  <div key={c.component.id} className="space-y-3">
                    {multi && <h3 className="text-sm font-semibold">{label(c)}</h3>}
                    <AttentionGroups c={c} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="sec-task" className="space-y-5">
            <h2 id="sec-task" className={heading}>Tasks in range ({stats.total})</h2>
            {stats.total === 0 ? (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                No tasks in the ranges yet.
              </p>
            ) : (
              components.filter((c) => c.stats.total > 0).map((c) => (
                <div key={c.component.id} className="space-y-2">
                  {multi && <h3 className="text-sm font-semibold">{label(c)} ({c.stats.total})</h3>}
                  <TaskTable c={c} />
                </div>
              ))
            )}
          </section>
        </>
      )}

      <p>
        <Link href="/release" className="text-sm text-muted-foreground hover:underline">← Back to release list</Link>
      </p>
    </div>
  );
}
