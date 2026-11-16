import { ActivityEntry } from "@/components/releases/activity-entry";
import { AddNoteForm } from "@/components/releases/add-note-form";
import { Pagination } from "@/components/tasks/pagination";
import { formatDateTime } from "@/lib/format";
import { formatRelative } from "@/lib/releases/format";
import type { NotesPage } from "@/lib/releases/notes";

/** Tautan halaman Activity: halaman 1 tanpa parameter; selalu kembali ke bagian Activity. */
export const activityHref = (releaseId: string, page: number) =>
  `/release/${releaseId}${page > 1 ? `?page=${page}` : ""}#activity`;

/**
 * Bagian Activity pada detail release: form catatan (admin), daftar entri terbaru di atas, dan pager.
 * `activity` null = log gagal dimuat (halaman tetap tampil).
 */
export function ReleaseActivity({
  releaseId, activity, isAdmin, now = new Date(),
}: { releaseId: string; activity: NotesPage | null; isAdmin: boolean; now?: Date }) {
  return (
    <section id="activity" aria-labelledby="sec-activity" className="space-y-3 rounded-xl border bg-card p-5">
      <h2 id="sec-activity" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Activity{activity && activity.total > 0 ? ` (${activity.total})` : ""}
      </h2>

      {isAdmin && <AddNoteForm releaseId={releaseId} />}

      {activity === null ? (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">The activity log could not be loaded.</p>
      ) : activity.rows.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          No activity yet.{isAdmin && " Add a note to explain delays or decisions."}
        </p>
      ) : (
        <>
          <ul className="divide-y">
            {activity.rows.map((n) => (
              <ActivityEntry
                key={n.id}
                note={n}
                isAdmin={isAdmin}
                when={formatRelative(n.createdAt, now)}
                absolute={formatDateTime(n.createdAt)}
                editedAbsolute={n.editedAt ? formatDateTime(n.editedAt) : null}
              />
            ))}
          </ul>
          {activity.pageCount > 1 && (
            <div className="space-y-2 pt-1">
              <p className="text-xs text-muted-foreground">
                Showing {(activity.page - 1) * activity.pageSize + 1}–{(activity.page - 1) * activity.pageSize + activity.rows.length} of {activity.total} entries
              </p>
              <Pagination page={activity.page} pageCount={activity.pageCount} href={(n) => activityHref(releaseId, n)} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
