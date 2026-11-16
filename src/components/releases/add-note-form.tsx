"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addNote } from "@/app/release/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_LIMITS, validateNoteBody } from "@/lib/releases/validate";

/** Form catatan bebas pada log release (hanya dipasang untuk admin). */
export function AddNoteForm({ releaseId }: { releaseId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const max = NOTE_LIMITS.note.max;
  const length = text.trim().length;
  const id = `add-note-${releaseId}`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const check = validateNoteBody(text);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    start(async () => {
      setError(null);
      const res = await addNote(releaseId, check.value);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setText("");
      toast.success("Note added.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2" noValidate>
      <Label htmlFor={id} className="sr-only">Add a note</Label>
      <Textarea
        id={id}
        value={text}
        onChange={(e) => { setText(e.target.value); setError(null); }}
        disabled={pending}
        rows={3}
        placeholder="Add a note, for example why the release is delayed or what it is waiting for."
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs tabular-nums ${length > max ? "text-destructive" : "text-muted-foreground"}`}>
          {length}/{max}
        </p>
        <Button type="submit" size="sm" disabled={pending || length === 0 || length > max}>
          {pending ? "Adding…" : "Add note"}
        </Button>
      </div>
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
