"use client";

import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { LIMITS } from "@/lib/notes/model";
import { validateComment } from "@/lib/notes/validate";
import { cn } from "@/lib/utils";

/** Komentar siap tampil. Teks waktu dihitung di server agar sama antara render server dan hidrasi. */
export type CommentView = {
  id: string;
  body: string;
  authorEmail: string;
  mine: boolean;
  createdAt: string;
  when: string;
  absolute: string;
  edited: boolean;
};

function Counter({ length }: { length: number }) {
  return (
    <span className={cn("text-xs tabular-nums", length > LIMITS.comment ? "text-destructive" : "text-muted-foreground")}>
      {length}/{LIMITS.comment.toLocaleString("en")}
    </span>
  );
}

function CommentItem({ c }: { c: CommentView }) {
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

  return (
    <li className="space-y-1.5 py-3 first:pt-0 last:pb-0">
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
              render={<Button type="button" variant="ghost" size="icon-sm" className="-mr-1 -mt-1 shrink-0" aria-label={`Actions for your comment from ${c.absolute}`} />}
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
            aria-label="Edit your comment" value={text} rows={3} autoFocus disabled={pending}
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
      <AlertDialog open={deleting} onOpenChange={(o) => !pending && setDeleting(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your comment?</AlertDialogTitle>
            <AlertDialogDescription>The comment is removed for everyone. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={pending} onClick={remove}>
              {pending ? "Deleting…" : "Delete comment"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/** Bagian Comments: daftar datar urut terlama, dan kotak komentar untuk semua pengguna login. */
export function NoteComments({ noteId, comments }: { noteId: string; comments: CommentView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const check = validateComment(text);
    if (!check.ok) return setError(check.error);
    start(async () => {
      const res = await addCommentAction(noteId, check.value);
      if (!res.ok) return setError(res.error);
      setText("");
      router.refresh();
    });
  }

  return (
    <section id="comments" aria-labelledby="sec-comments" className="space-y-3 rounded-xl border bg-card p-5">
      <h2 id="sec-comments" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Comments{comments.length > 0 ? ` (${comments.length})` : ""}
      </h2>
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="divide-y">
          {comments.map((c) => <CommentItem key={c.id} c={c} />)}
        </ul>
      )}
      <form onSubmit={submit} className="space-y-1.5 border-t pt-3">
        <Label htmlFor={`comment-${noteId}`}>Add a comment</Label>
        <Textarea
          id={`comment-${noteId}`} value={text} rows={3} disabled={pending} placeholder="Write a comment…"
          onChange={(e) => { setText(e.target.value); setError(null); }}
          aria-invalid={error ? true : undefined}
        />
        <div className="flex items-center justify-between gap-2">
          <Counter length={text.trim().length} />
          <Button type="submit" size="sm" disabled={pending || text.trim().length === 0}>
            {pending ? "Posting…" : "Comment"}
          </Button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
    </section>
  );
}
