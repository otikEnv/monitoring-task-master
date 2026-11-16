"use client";

import { useRouter } from "next/navigation";
import { CalendarClock, CirclePause, CirclePlay, MoreVertical, Rocket, StickyNote } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { editNote } from "@/app/release/actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { formatYmd } from "@/lib/releases/format";
import type { ReleaseNoteRow } from "@/lib/releases/notes";
import { NOTE_LIMITS, validateNoteText } from "@/lib/releases/validate";

const KIND = {
  note: { label: "Note", Icon: StickyNote },
  hold: { label: "On hold", Icon: CirclePause },
  resume: { label: "Resumed", Icon: CirclePlay },
  target_change: { label: "Target changed", Icon: CalendarClock },
  released: { label: "Released", Icon: Rocket },
} as const;

/**
 * Satu entri log. Teks waktu dihitung di server dan dikirim sebagai props (tidak dihitung ulang di klien) agar
 * tidak berbeda antara render server dan hidrasi. Admin dapat mengedit teksnya di tempat; fakta entri terkunci.
 */
export function ActivityEntry({
  note, isAdmin, when, absolute, editedAbsolute,
}: { note: ReleaseNoteRow; isAdmin: boolean; when: string; absolute: string; editedAbsolute: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.body);
  const [error, setError] = useState<string | null>(null);
  const { label, Icon } = KIND[note.kind];
  const max = NOTE_LIMITS[note.kind].max;
  const inputId = `edit-note-${note.id}`;

  function open() {
    setText(note.body);
    setError(null);
    setEditing(true);
  }

  function save() {
    const check = validateNoteText(text, note.kind);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    start(async () => {
      setError(null);
      const res = await editNote(note.id, check.value);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      toast.success("Entry updated.");
      router.refresh();
    });
  }

  return (
    <li className="space-y-1.5 py-3 first:pt-0 last:pb-0" aria-label={`${label} entry`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <Icon aria-hidden="true" className="size-3.5" />
            {label}
          </span>
          <span className="break-all">{note.authorEmail}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={note.createdAt} title={absolute}>{when}</time>
          {editedAbsolute && (
            <span title={`Edited by ${note.editedByEmail ?? "unknown"} on ${editedAbsolute}`}>(edited)</span>
          )}
        </div>
        {isAdmin && !editing && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button" variant="ghost" size="icon-sm" className="-mr-1 -mt-1 shrink-0"
                  aria-label={`Actions for the ${label.toLowerCase()} entry from ${absolute}`}
                />
              }
            >
              <MoreVertical aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={open}>Edit</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {note.kind === "target_change" && note.oldTargetDate && note.newTargetDate && (
        <p className="text-sm font-medium">
          {formatYmd(note.oldTargetDate)} <span aria-label="moved to">→</span> {formatYmd(note.newTargetDate)}
        </p>
      )}

      {editing ? (
        <div className="space-y-1.5">
          <Textarea
            id={inputId}
            aria-label={`Text of the ${label.toLowerCase()} entry`}
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
            disabled={pending}
            rows={3}
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`text-xs tabular-nums ${text.trim().length > max ? "text-destructive" : "text-muted-foreground"}`}>
              {text.trim().length}/{max}
            </p>
            <div className="flex gap-1.5">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="button" size="sm" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</Button>
            </div>
          </div>
          {error && <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      ) : (
        note.body && <p className="whitespace-pre-wrap break-words text-sm">{note.body}</p>
      )}
    </li>
  );
}
