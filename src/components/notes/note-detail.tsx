import Link from "next/link";
import { History, Pencil } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { isOverdueItem, todayWib } from "@/lib/notes/model";
import type { NoteDetail } from "@/lib/notes/load";
import { formatRelative, formatYmd } from "@/lib/releases/format";
import { NoteActionItems, type ActionItemView } from "./note-action-items";
import { CopyNoteButton, DeleteNoteButton } from "./note-buttons";
import { NoteComments, type CommentView } from "./note-comments";
import { NoteKindBadge } from "./note-kind-badge";

/**
 * Detail catatan: judul, jenis, tanggal, penulis, isi Markdown, tautan, action item, dan komentar.
 * Edit dan Delete hanya untuk penulisnya; Follow up untuk admin (slot `followUp`); Copy untuk semua.
 */
export function NoteDetailView({
  detail, user, links, followUp, now = new Date(),
}: {
  detail: NoteDetail;
  user: { id: string; role: "admin" | "viewer" };
  links?: React.ReactNode;
  followUp?: React.ReactNode;
  now?: Date;
}) {
  const { note, items, comments } = detail;
  const isAuthor = note.authorId !== null && note.authorId === user.id && user.role === "admin";
  const today = todayWib(now);

  const itemViews: ActionItemView[] = items.map((it) => ({
    id: it.id, body: it.body, assigneeId: it.assigneeId, assigneeEmail: it.assigneeEmail, dueDate: it.dueDate,
    done: it.done, carried: it.carriedToId !== null, overdue: isOverdueItem(it, today),
  }));
  const commentViews: CommentView[] = comments.map((c) => ({
    id: c.id, parentId: c.parentId, body: c.body, authorEmail: c.authorEmail,
    mine: c.authorId !== null && c.authorId === user.id && c.deletedAt === null,
    createdAt: c.createdAt, when: formatRelative(c.createdAt, now), absolute: formatDateTime(c.createdAt),
    edited: c.editedAt !== null, deleted: c.deletedAt !== null,
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <NoteKindBadge kind={note.kind} />
              <time dateTime={note.noteDate}>{formatYmd(note.noteDate)}</time>
            </div>
            <h1 className="break-words text-2xl font-semibold tracking-tight">{note.title}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyNoteButton
              noteId={note.id} title={note.title} kind={note.kind} noteDate={note.noteDate} body={note.body}
              items={items.map((it) => ({ body: it.body, done: it.done, assigneeEmail: it.assigneeEmail, dueDate: it.dueDate }))}
            />
            {followUp}
            {isAuthor && (
              <>
                <Link href={`/notes/${note.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <Pencil aria-hidden="true" /> Edit
                </Link>
                <DeleteNoteButton noteId={note.id} title={note.title} />
              </>
            )}
          </div>
        </div>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>By <span className="break-all font-medium text-foreground">{note.authorEmail}</span></span>
          <span aria-hidden="true">·</span>
          <span>Created {formatDateTime(note.createdAt)}</span>
          {note.editedAt && (
            <>
              <span aria-hidden="true">·</span>
              <span>Edited {formatDateTime(note.editedAt)}</span>
            </>
          )}
          {detail.revisionCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <Link href={`/notes/${note.id}/history`} className="inline-flex items-center gap-1 underline">
                <History aria-hidden="true" className="size-3" />
                Edited {detail.revisionCount} {detail.revisionCount === 1 ? "time" : "times"}
              </Link>
            </>
          )}
        </p>

        {(detail.followsUp || detail.followedUpIn.length > 0) && (
          <div className="space-y-1 text-sm">
            {detail.followsUp && (
              <p>
                Follows up{" "}
                <Link href={`/notes/${detail.followsUp.id}`} className="font-medium underline">{detail.followsUp.title}</Link>{" "}
                <span className="text-muted-foreground">({formatYmd(detail.followsUp.noteDate)})</span>
              </p>
            )}
            {detail.followedUpIn.map((f) => (
              <p key={f.id}>
                Followed up in{" "}
                <Link href={`/notes/${f.id}`} className="font-medium underline">{f.title}</Link>{" "}
                <span className="text-muted-foreground">({formatYmd(f.noteDate)})</span>
              </p>
            ))}
          </div>
        )}
      </div>

      <section aria-label="Content" className="space-y-2 rounded-xl border bg-card p-5 text-sm">
        {note.body.trim() ? <Markdown>{note.body}</Markdown> : <p className="text-muted-foreground">No content.</p>}
      </section>

      {links}

      <section aria-labelledby="sec-items" className="space-y-3 rounded-xl border bg-card p-5">
        <h2 id="sec-items" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Action items{items.length > 0 ? ` (${items.filter((i) => i.done).length}/${items.length} done)` : ""}
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No action items.</p>
        ) : (
          <NoteActionItems items={itemViews} userId={user.id} isAuthor={isAuthor} />
        )}
      </section>

      <NoteComments noteId={note.id} comments={commentViews} />
    </div>
  );
}
