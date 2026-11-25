import { ActivityEntry } from "@/components/releases/activity-entry";
import { AddNoteForm } from "@/components/releases/add-note-form";
import { Pagination } from "@/components/tasks/pagination";
import { formatDateTime } from "@/lib/format";
import { formatRelative } from "@/lib/releases/format";
import type { NotesPage, ReleaseNoteRow } from "@/lib/releases/notes";

/** Tautan halaman Activity: halaman 1 tanpa parameter; selalu kembali ke bagian Activity. */
export const activityHref = (releaseId: string, page: number) =>
  `/release/${releaseId}${page > 1 ? `?page=${page}` : ""}#activity`;

/**
 * Hak atas activity untuk pengguna yang melihat:
 *  - canAdd: menambah Note (superadmin, admin, developer)
 *  - canChangeAll: mengubah semua entri (admin, superadmin); selain itu hanya Note milik `userId`
 */
export type ActivityAccess = { userId: string; canAdd: boolean; canChangeAll: boolean };

/** Boleh mengubah (dan, untuk Note, menghapus) entri ini. Database memeriksanya lagi. */
export const canChangeEntry = (a: ActivityAccess, n: Pick<ReleaseNoteRow, "kind" | "authorId">) =>
  a.canChangeAll || (a.canAdd && n.kind === "note" && n.authorId !== null && n.authorId === a.userId);

/**
 * Bagian Activity pada detail release: form catatan (yang boleh menambah), daftar entri terbaru di atas, dan pager.
 * `activity` null = log gagal dimuat (halaman tetap tampil).
 */
export function ReleaseActivity({
  releaseId, activity, access, now = new Date(),
}: { releaseId: string; activity: NotesPage | null; access: ActivityAccess; now?: Date }) {
  return (
    <section id="activity" aria-labelledby="sec-activity" className="space-y-3 rounded-xl border bg-card p-5">
      <h2 id="sec-activity" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Activity{activity && activity.total > 0 ? ` (${activity.total})` : ""}
      </h2>

      {access.canAdd && <AddNoteForm releaseId={releaseId} />}

      {activity === null ? (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">The activity log could not be loaded.</p>
      ) : activity.rows.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          No activity yet.{access.canAdd && " Add a note to explain delays or decisions."}
        </p>
      ) : (
        <>
          <ul className="divide-y">
            {activity.rows.map((n) => (
              <ActivityEntry
                key={n.id}
                note={n}
                canChange={canChangeEntry(access, n)}
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
