import Link from "next/link";
import { AppWindow, ListChecks, Rocket } from "lucide-react";
import { RISK_LABEL, type RiskLevel } from "@/lib/releases/model";
import { formatDaysLeft, formatSnapshotDaysLeft } from "@/lib/releases/format";
import type { LinkView } from "@/lib/notes/links";
import type { NoteRow } from "@/lib/notes/load";
import { taskHref } from "@/lib/tasks/list-params";
import { formatYmd } from "@/lib/releases/format";
import { NoteKindBadge } from "./note-kind-badge";

const RISK_TEXT = (r: string) => RISK_LABEL[r as RiskLevel] ?? r;

function Flag({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{children}</span>;
}

/** Ringkasan kondisi release: "45% done (4/9), At risk, 12 working days left". */
function condition(c: { percent: number | null; done: number; total: number; risk: string }, left: string | null) {
  const pct = c.percent === null || c.total === 0 ? "no tasks" : `${Math.round(c.percent)}% done (${c.done}/${c.total})`;
  return [pct, RISK_TEXT(c.risk), left].filter(Boolean).join(", ");
}

/** Tautan catatan ke aplikasi, release, dan task. Sasaran yang hilang tetap tampil dengan penanda Not found. */
export function NoteLinks({ links }: { links: LinkView[] }) {
  if (links.length === 0) return null;
  return (
    <section aria-labelledby="sec-links" className="space-y-3 rounded-xl border bg-card p-5">
      <h2 id="sec-links" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Links</h2>
      <ul className="space-y-3">
        {links.map((l) => (
          <li key={l.id} className="flex items-start gap-2 text-sm">
            {l.kind === "release" ? (
              <>
                <Rocket aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground">Release</span>
                    {l.name ? <Link href={`/release/${l.releaseId}`} className="font-medium underline">{l.name}</Link> : <span className="font-medium">Unknown release</span>}
                    {!l.name && <Flag>Not found</Flag>}
                    {l.archived && <Flag>Archived</Flag>}
                  </div>
                  {l.snapshot && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">At the time:</span>{" "}
                      {condition(
                        { percent: l.snapshot.progressPercent, done: l.snapshot.done, total: l.snapshot.total, risk: l.snapshot.risk },
                        l.snapshot.risk === "released" ? null : formatSnapshotDaysLeft(l.snapshot.daysLeft),
                      )}
                      {" "}· target {formatYmd(l.snapshot.targetDate)}
                    </p>
                  )}
                  {l.now && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Now:</span>{" "}
                      {condition(l.now, l.now.risk === "released" ? null : formatDaysLeft(l.now.daysLeft, l.now.workingDaysLeft))} · target {formatYmd(l.now.targetDate)}
                    </p>
                  )}
                </div>
              </>
            ) : l.kind === "task" ? (
              <>
                <ListChecks aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Task</span>
                  {l.title ? (
                    <Link href={taskHref(l.sourceId, l.tag, l.taskId)} className="break-words font-medium underline">
                      #{l.taskId} {l.title}
                    </Link>
                  ) : (
                    <span className="font-medium">#{l.taskId}</span>
                  )}
                  <span className="break-all text-xs text-muted-foreground">{l.sourceName ?? "Unknown application"} · {l.tag}</span>
                  {!l.title && <Flag>Not found</Flag>}
                  {l.archived && <Flag>Archived</Flag>}
                </div>
              </>
            ) : (
              <>
                <AppWindow aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Application</span>
                  {l.name ? (
                    <Link href={`/tasks?source=${l.sourceId}`} className="font-medium underline">{l.name}</Link>
                  ) : (
                    <span className="font-medium">Unknown application</span>
                  )}
                  {!l.name && <Flag>Not found</Flag>}
                  {l.archived && <Flag>Archived</Flag>}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Bagian "Related notes" pada detail release dan detail task. `notes` null = gagal dimuat. */
export function RelatedNotes({ notes }: { notes: NoteRow[] | null }) {
  return (
    <section id="related-notes" aria-labelledby="sec-related" className="space-y-3 rounded-xl border bg-card p-5">
      <h2 id="sec-related" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Related notes{notes && notes.length > 0 ? ` (${notes.length})` : ""}
      </h2>
      {notes === null ? (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">The related notes could not be loaded.</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes link here yet.</p>
      ) : (
        <ul className="divide-y">
          {notes.map((n) => (
            <li key={n.id} className="py-2.5 first:pt-0 last:pb-0">
              <Link href={`/notes/${n.id}`} className="break-words text-sm font-medium underline">{n.title}</Link>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <NoteKindBadge kind={n.kind} />
                <time dateTime={n.noteDate}>{formatYmd(n.noteDate)}</time>
                <span aria-hidden="true">·</span>
                <span className="break-all">{n.authorEmail}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
