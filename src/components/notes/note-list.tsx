import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/layout/notices";
import { Pagination } from "@/components/tasks/pagination";
import type { NoteListPage } from "@/lib/notes/list";
import { notesHref, type NoteListParams } from "@/lib/notes/list-params";
import { formatYmd } from "@/lib/releases/format";
import { NoteKindBadge } from "./note-kind-badge";

/** Daftar catatan berhalaman: judul, jenis, tanggal, penulis, jumlah komentar, dan penanda komentar baru. */
export function NoteList({
  list, params, isAdmin, filtered,
}: { list: NoteListPage; params: NoteListParams; isAdmin: boolean; filtered: boolean }) {
  if (list.total === 0) {
    return filtered ? (
      <EmptyState title="No matching notes">Try other filters or <Link href="/notes" className="underline">reset them</Link>.</EmptyState>
    ) : (
      <EmptyState title="No notes yet.">
        {isAdmin ? <>Use <Link href="/notes/new" className="underline">New note</Link> to record a meeting or decision.</> : "Notes written by admins appear here."}
      </EmptyState>
    );
  }

  const first = (list.page - 1) * list.pageSize + 1;
  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-xl border bg-card">
        {list.rows.map((n) => (
          <li key={n.id}>
            <Link href={`/notes/${n.id}`} className="flex flex-col gap-1.5 p-4 hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="break-words font-medium">{n.title}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <NoteKindBadge kind={n.kind} />
                  <time dateTime={n.noteDate}>{formatYmd(n.noteDate)}</time>
                  <span aria-hidden="true">·</span>
                  <span className="break-all">{n.authorEmail}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1" aria-label={`${n.commentCount} comments`}>
                  <MessageSquare aria-hidden="true" className="size-3.5" />
                  {n.commentCount}
                </span>
                {n.newComments > 0 && (
                  <span className="rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground">
                    {n.newComments} new
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Showing {first}–{first + list.rows.length - 1} of {list.total} notes
      </p>
      <Pagination page={list.page} pageCount={list.pageCount} href={(page) => notesHref({ ...params, page })} />
    </div>
  );
}
