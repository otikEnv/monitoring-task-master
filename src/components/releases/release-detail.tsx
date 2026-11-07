import Link from "next/link";
import { RiskBadge } from "@/components/releases/risk-badge";
import { ReleaseProgress } from "@/components/releases/release-progress";
import { PriorityBadge, StatusBadge } from "@/components/tasks/task-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { formatDaysLeft, formatRange, formatYmd } from "@/lib/releases/format";
import type { ReleaseOverview } from "@/lib/releases/load";
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
      <h3 className="text-sm font-medium">{title}</h3>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <ul className="space-y-1 text-sm">{children}</ul>
    </div>
  );
}

/** Tampilan detail satu release. Presentasional; tombol admin dipasang lewat slot `actions`. */
export function ReleaseDetailView({
  overview, actions,
}: { overview: ReleaseOverview; actions?: React.ReactNode }) {
  const { release, stats, sourceName } = overview;
  const { attention } = stats;
  const released = Boolean(release.releasedOn);
  const attentionCount = stats.counts.blocked + stats.counts.deferred + stats.counts.cancelled;
  const hasAttention =
    attention.blocked.length + attention.waiting.length + attention.missingDeps.length +
      attention.deferred.length + attention.cancelled.length > 0;
  const sourceId = release.sourceId;

  return (
    <div className="space-y-6">
      <nav aria-label="Navigasi" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/release" className="hover:underline">Release</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{sourceName} · {release.name}</span>
      </nav>

      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold leading-snug tracking-tight break-words">
              {sourceName} · {release.name}
            </h1>
            <RiskBadge risk={stats.risk} />
          </div>
          {actions}
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="inline">Tag: </dt><dd className="inline text-foreground">{release.tag}</dd></div>
          <div>
            <dt className="inline">Rentang task: </dt>
            <dd className="inline text-foreground">
              {formatRange(release.rangeStart, release.rangeEnd)}
              {stats.firstId && ` (yang ada: #${stats.firstId}–#${stats.lastId})`}
            </dd>
          </div>
          <div><dt className="inline">Mulai: </dt><dd className="inline text-foreground">{formatYmd(release.startDate)}</dd></div>
          <div>
            <dt className="inline">Target: </dt>
            <dd className="inline text-foreground">
              {formatYmd(release.targetDate)}
              {!released && ` (${formatDaysLeft(stats.daysLeft)})`}
            </dd>
          </div>
          {released && (
            <div><dt className="inline">Dirilis: </dt><dd className="inline text-foreground">{formatYmd(release.releasedOn)}</dd></div>
          )}
          <div>
            <dt className="inline">Data task diperbarui: </dt>
            <dd className="inline text-foreground">{formatDateTime(overview.lastSyncedAt)}</dd>
          </div>
        </dl>
        {!overview.tagFound && (
          <p role="status" className="rounded-md bg-muted p-3 text-sm">
            Tag <strong>{release.tag}</strong> tidak ditemukan pada data terakhir. Angka di bawah dianggap nol; ubah
            tag release bila namanya berganti di repo.
          </p>
        )}
        {(!overview.sourceActive || overview.syncStatus === "failed") && (
          <p role="status" className="rounded-md bg-muted p-3 text-sm">
            {!overview.sourceActive && "Aplikasi ini nonaktif. "}
            {overview.syncStatus === "failed" &&
              `Sinkronisasi terakhir gagal; data berasal dari sinkronisasi yang berhasil pada ${formatDateTime(overview.lastSyncedAt)}.`}
          </p>
        )}
      </header>

      {released && (
        <p className="text-sm">
          Dirilis pada <strong>{formatYmd(release.releasedOn)}</strong>
          {stats.percentDone !== null && <>, progres task saat ini {stats.percentDone}%</>}.
        </p>
      )}

      <section aria-labelledby="sec-ringkasan" className="space-y-3">
        <h2 id="sec-ringkasan" className="sr-only">Ringkasan</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Total task" value={stats.total} />
          <Tile label="Selesai" value={stats.done} hint={stats.percentDone === null ? undefined : `${stats.percentDone}% dari total`} />
          <Tile label="Dalam pengerjaan" value={stats.inProgress} hint="dikerjakan dan ditinjau" />
          <Tile label="Perlu perhatian" value={attentionCount} hint="terhambat, ditunda, dibatalkan" />
        </div>
      </section>

      <section aria-labelledby="sec-progres" className={section}>
        <h2 id="sec-progres" className={heading}>Progres</h2>
        {stats.total === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada task di rentang ini.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-3xl font-semibold tabular-nums">{stats.percentDone}%</p>
              <p className="text-sm text-muted-foreground">
                {stats.done} dari {stats.total} selesai
                {!released && <> · waktu berjalan {Math.round(stats.elapsedPercent)}%</>}
                {!released && stats.gap !== null && stats.gap > 0 && (
                  <> · tertinggal {Math.round(stats.gap)} poin dari waktu</>
                )}
              </p>
            </div>
            <ReleaseProgress
              label={`Progres ${sourceName} ${release.name}`}
              counts={stats.counts}
              total={stats.total}
              percent={stats.percentDone}
            />
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Penanda dihitung dari selisih persen waktu yang sudah lewat dan persen task selesai: tertinggal lebih dari{" "}
          {AMBANG_BERISIKO} poin = Berisiko, lebih dari {AMBANG_TERTINGGAL} poin = Tertinggal. Task terhambat atau
          dependensi di luar rentang yang belum selesai juga menandai Berisiko. Ini panduan, bukan prediksi pasti.
        </p>
      </section>

      <section aria-labelledby="sec-perhatian" className={section}>
        <h2 id="sec-perhatian" className={heading}>Perlu perhatian</h2>
        {!hasAttention ? (
          <p className="text-sm text-muted-foreground">Tidak ada hambatan.</p>
        ) : (
          <div className="space-y-5">
            {attention.blocked.length > 0 && (
              <Group title={`Terhambat (${attention.blocked.length})`}>
                {attention.blocked.map((t) => (
                  <li key={t.taskId}><TaskLink sourceId={sourceId} tag={release.tag} task={t} /></li>
                ))}
              </Group>
            )}
            {attention.waiting.length > 0 && (
              <Group
                title={`Menunggu task di luar rentang (${attention.waiting.length})`}
                hint="Dependensi ini tidak dihitung di progres release, tetapi menahan task di dalamnya."
              >
                {attention.waiting.map((w) => (
                  <li key={w.task.taskId} className="space-y-0.5">
                    <TaskLink sourceId={sourceId} tag={release.tag} task={w.task} />
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      menunggu
                      {w.deps.map((d) => (
                        <span key={d.id} className="inline-flex items-center gap-1.5">
                          <Link href={taskHref(sourceId, release.tag, d.id)} className="underline">#{d.id} {d.title}</Link>
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
                title={`Perlu dievaluasi: ditunda ${attention.deferred.length}, dibatalkan ${attention.cancelled.length}`}
                hint="Tetap dihitung di total sehingga terlihat apa yang menahan progres."
              >
                {[...attention.deferred, ...attention.cancelled]
                  .sort((a, b) => a.seq - b.seq)
                  .map((t) => (
                    <li key={t.taskId} className="flex flex-wrap items-center gap-2">
                      <TaskLink sourceId={sourceId} tag={release.tag} task={t} />
                      <StatusBadge status={t.status === "deferred" ? "deferred" : "cancelled"} />
                    </li>
                  ))}
              </Group>
            )}
            {attention.missingDeps.length > 0 && (
              <Group
                title={`Dependensi tidak ditemukan (${attention.missingDeps.length})`}
                hint="ID dependensi ini tidak ada pada tag ini; periksa tasks.json di repo."
              >
                {attention.missingDeps.map((m) => (
                  <li key={m.task.taskId} className="space-y-0.5">
                    <TaskLink sourceId={sourceId} tag={release.tag} task={m.task} />
                    <p className="text-xs text-muted-foreground">bergantung pada {m.ids.map((i) => `#${i}`).join(", ")}</p>
                  </li>
                ))}
              </Group>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="sec-task" className="space-y-3">
        <h2 id="sec-task" className={heading}>Task di rentang ({stats.total})</h2>
        {stats.total === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Belum ada task di rentang ini.
          </p>
        ) : (
          <div className="rounded-xl border bg-card">
            <Table className="min-w-[40rem]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col" className="w-16">ID</TableHead>
                  <TableHead scope="col">Judul</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Prioritas</TableHead>
                  <TableHead scope="col" className="text-right">Subtask</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.tasks.map((t) => (
                  <TableRow key={t.taskId} className="align-top">
                    <TableCell className="tabular-nums">{t.taskId}</TableCell>
                    <TableCell className="whitespace-normal">
                      <Link href={taskHref(sourceId, release.tag, t.taskId)} className="font-medium hover:underline">
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
        )}
      </section>

      <p>
        <Link href="/release" className="text-sm text-muted-foreground hover:underline">← Kembali ke daftar release</Link>
      </p>
    </div>
  );
}
