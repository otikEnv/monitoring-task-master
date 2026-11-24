"use client";

import { useRouter } from "next/navigation";
import { CornerDownRight, MessageSquare, MoreVertical, Reply } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addCommentAction, editCommentAction, removeCommentAction } from "@/app/notes/actions";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS } from "@/lib/notes/model";
import { validateComment } from "@/lib/notes/validate";
import { cn } from "@/lib/utils";

/** Komentar siap tampil. Teks waktu dihitung di server agar sama antara render server dan hidrasi. */
export type CommentView = {
  id: string;
  /** Komentar utama yang dibalas; null = komentar utama. */
  parentId: string | null;
  body: string;
  authorEmail: string;
  mine: boolean;
  createdAt: string;
  when: string;
  absolute: string;
  edited: boolean;
  /** Komentar utama yang dihapus penulisnya tetapi masih punya balasan. */
  deleted: boolean;
};

type Thread = { root: CommentView; replies: CommentView[] };

/** Komentar utama urut terlama, masing-masing dengan balasannya (urut terlama). */
export function toThreads(comments: CommentView[]): Thread[] {
  const roots = comments.filter((c) => c.parentId === null);
  const byParent = new Map<string, CommentView[]>();
  for (const c of comments) {
    if (c.parentId === null) continue;
    byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
  }
  return roots.map((root) => ({ root, replies: byParent.get(root.id) ?? [] }));
}

function Counter({ length }: { length: number }) {
  return (
    <span className={cn("text-xs tabular-nums", length > LIMITS.comment ? "text-destructive" : "text-muted-foreground")}>
      {length}/{LIMITS.comment.toLocaleString("en")}
    </span>
  );
}

/** Kotak tulis komentar: dipakai untuk komentar baru dan balasan. */
function CommentBox({
  noteId, parentId, label, placeholder, submitLabel, autoFocus, onDone, onCancel, idPrefix = "",
}: {
  idPrefix?: string;
  noteId: string;
  parentId: string | null;
  label: string;
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = `${idPrefix}comment-${parentId ?? noteId}`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const check = validateComment(text);
    if (!check.ok) return setError(check.error);
    start(async () => {
      const res = await addCommentAction(noteId, check.value, parentId);
      if (!res.ok) return setError(res.error);
      setText("");
      onDone?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-1.5">
      <Label htmlFor={id} className={parentId ? "sr-only" : undefined}>{label}</Label>
      <Textarea
        id={id} value={text} rows={parentId ? 2 : 3} disabled={pending} placeholder={placeholder} autoFocus={autoFocus}
        onChange={(e) => { setText(e.target.value); setError(null); }}
        onKeyDown={(e) => { if (e.key === "Escape" && onCancel) onCancel(); }}
        aria-invalid={error ? true : undefined}
      />
      <div className="flex items-center justify-between gap-2">
        <Counter length={text.trim().length} />
        <div className="flex gap-1.5">
          {onCancel && <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>Cancel</Button>}
          <Button type="submit" size="sm" disabled={pending || text.trim().length === 0}>
            {pending ? "Posting…" : submitLabel}
          </Button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

function CommentItem({ c, onReply }: { c: CommentView; onReply?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function save() {
    const check = validateComment(text);
    if (!check.ok) return setError(check.error);
    start(async () => {
      const res = await editCommentAction(c.id, check.value);
      if (!res.ok) return setError(res.error);
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    start(async () => {
      const res = await removeCommentAction(c.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDeleting(false);
      toast.success("Comment deleted.");
      router.refresh();
    });
  }

  if (c.deleted) {
    return (
      <div className="py-1">
        <p className="text-sm italic text-muted-foreground">This comment was deleted.</p>
      </div>
    );
  }

  const kind = c.parentId ? "reply" : "comment";
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="break-all font-medium text-foreground">{c.authorEmail}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={c.createdAt} title={c.absolute}>{c.when}</time>
          {c.edited && <span>(edited)</span>}
        </div>
        {c.mine && !editing && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="ghost" size="icon-sm" className="-mr-1 -mt-1 shrink-0" aria-label={`Actions for your ${kind} from ${c.absolute}`} />}
            >
              <MoreVertical aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setText(c.body); setError(null); setEditing(true); }}>Edit</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {editing ? (
        <div className="space-y-1.5">
          <Textarea
            aria-label={`Edit your ${kind}`} value={text} rows={3} autoFocus disabled={pending}
            onChange={(e) => { setText(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Counter length={text.trim().length} />
            <div className="flex gap-1.5">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="button" size="sm" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</Button>
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
      )}
      {onReply && !editing && (
        <button
          type="button" onClick={onReply}
          className="inline-flex items-center gap-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Reply aria-hidden="true" className="size-3.5" /> Reply
        </button>
      )}
      <AlertDialog open={deleting} onOpenChange={(o) => !pending && setDeleting(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your {kind}?</AlertDialogTitle>
            <AlertDialogDescription>
              The {kind} is removed for everyone. This cannot be undone.
              {!c.parentId && " If it has replies, the replies stay and the comment shows as deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={pending} onClick={remove}>
              {pending ? "Deleting…" : `Delete ${kind}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Satu utas: komentar utama, balasannya (menjorok), dan kotak balasan. */
function ThreadItem({ noteId, thread, idPrefix }: { noteId: string; thread: Thread; idPrefix: string }) {
  const [replying, setReplying] = useState(false);
  const { root, replies } = thread;
  return (
    <li className="space-y-3 py-3 first:pt-0 last:pb-0">
      <CommentItem c={root} onReply={root.deleted ? undefined : () => setReplying(true)} />
      {(replies.length > 0 || replying) && (
        <div className="ml-3 space-y-3 border-l-2 pl-4 sm:ml-4">
          {replies.length > 0 && (
            <ul aria-label={`${replies.length} ${replies.length === 1 ? "reply" : "replies"}`} className="space-y-3">
              {replies.map((r) => (
                <li key={r.id} className="flex gap-2">
                  <CornerDownRight aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    {/* Membalas balasan tetap masuk utas ini (satu tingkat). */}
                    <CommentItem c={r} onReply={() => setReplying(true)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {replying ? (
            <CommentBox
              noteId={noteId} parentId={root.id} label="Reply" placeholder="Write a reply…" submitLabel="Reply" autoFocus
              idPrefix={idPrefix}
              onDone={() => setReplying(false)} onCancel={() => setReplying(false)}
            />
          ) : (
            !root.deleted && replies.length > 0 && (
              <button
                type="button" onClick={() => setReplying(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Reply aria-hidden="true" className="size-3.5" /> Reply to this thread
              </button>
            )
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Bagian Comments: utas komentar (komentar utama dengan balasan satu tingkat), urut terlama, dan kotak komentar
 * baru untuk semua pengguna login.
 *  - "panel": kotak di halaman. Di panel kanan desktop judul tetap, daftar scroll sendiri, kotak tulis di bawah.
 *  - "sheet": isi sheet komentar di ponsel (tanpa kotak; daftar scroll sendiri, kotak tulis selalu di bawah).
 */
export function NoteComments({
  noteId, comments, variant = "panel", className,
}: { noteId: string; comments: CommentView[]; variant?: "panel" | "sheet"; className?: string }) {
  const threads = toThreads(comments);
  const count = comments.filter((c) => !c.deleted).length;
  const sheet = variant === "sheet";
  const prefix = sheet ? "sheet-" : "";
  return (
    <section
      id={sheet ? undefined : "comments"} aria-labelledby={`${prefix}sec-comments`}
      className={cn(
        sheet
          ? "flex min-h-0 flex-1 flex-col gap-3"
          : "scroll-mt-4 space-y-3 rounded-xl border bg-card p-5 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:space-y-0 lg:gap-3",
        className,
      )}
    >
      <h2 id={`${prefix}sec-comments`} className={cn("text-sm font-semibold uppercase tracking-wide text-muted-foreground", sheet ? "shrink-0" : "lg:shrink-0")}>
        Comments{count > 0 ? ` (${count})` : ""}
      </h2>
      <div className={sheet ? "-mr-2 min-h-0 flex-1 overflow-y-auto pr-2" : "lg:-mr-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2"}>
        {threads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        ) : (
          <ul className="divide-y">
            {threads.map((t) => <ThreadItem key={t.root.id} noteId={noteId} thread={t} idPrefix={prefix} />)}
          </ul>
        )}
      </div>
      <div className={cn("border-t pt-3", sheet ? "shrink-0" : "lg:shrink-0")}>
        <CommentBox
          noteId={noteId} parentId={null} label="Add a comment" placeholder="Write a new comment…" submitLabel="Comment"
          idPrefix={prefix}
        />
      </div>
    </section>
  );
}

/**
 * Ponsel dan tablet: bilah komentar yang menempel di bawah layar. Mengetuknya membuka sheet dari bawah berisi
 * komentar dan kotak tulis, sehingga tidak perlu scroll ke bawah catatan yang panjang. Desktop tidak memakainya.
 */
export function MobileCommentsBar({ noteId, comments }: { noteId: string; comments: CommentView[] }) {
  const [open, setOpen] = useState(false);
  const count = comments.filter((c) => !c.deleted).length;
  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
        <button
          type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
          className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm"
        >
          <MessageSquare aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="shrink-0 font-medium">Comments ({count})</span>
          <span aria-hidden="true" className="text-muted-foreground">·</span>
          <span className="truncate text-muted-foreground">Write a comment…</span>
        </button>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="flex max-h-[85svh] flex-col gap-0 p-4 lg:hidden">
          <SheetTitle className="sr-only">Comments</SheetTitle>
          <NoteComments noteId={noteId} comments={comments} variant="sheet" />
        </SheetContent>
      </Sheet>
    </>
  );
}
