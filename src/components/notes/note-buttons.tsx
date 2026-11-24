"use client";

import { useRouter } from "next/navigation";
import { Copy, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { removeNoteAction } from "@/app/notes/actions";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { NoteKind } from "@/lib/notes/model";
import { buildShareText, type ShareItem } from "@/lib/notes/share";

/** Menyalin catatan sebagai teks rapi (tanpa komentar) beserta tautan ke halamannya. */
export function CopyNoteButton({
  noteId, title, kind, noteDate, body, items,
}: { noteId: string; title: string; kind: NoteKind; noteDate: string; body: string; items: ShareItem[] }) {
  async function copy() {
    const text = buildShareText({ title, kind, noteDate, body, items, url: `${window.location.origin}/notes/${noteId}` });
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy. Your browser blocked access to the clipboard.");
    }
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      <Copy aria-hidden="true" /> Copy
    </Button>
  );
}

/** Hapus catatan (hanya untuk penulisnya) dengan konfirmasi; lalu kembali ke daftar Notes. */
export function DeleteNoteButton({ noteId, title }: { noteId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirm() {
    start(async () => {
      setError(null);
      const res = await removeNoteAction(noteId);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      toast.success("Note deleted.");
      router.push("/notes");
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => { setError(null); setOpen(true); }}>
        <Trash2 aria-hidden="true" /> Delete
      </Button>
      <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{title}&rdquo; is deleted for everyone, together with its action items, links, edit history, and
              comments. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={pending} onClick={confirm}>
              {pending ? "Deleting…" : "Delete note"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
