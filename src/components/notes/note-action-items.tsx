"use client";

import { Circle, CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleActionItemAction } from "@/app/notes/actions";
import { formatYmd } from "@/lib/releases/format";
import { cn } from "@/lib/utils";

export type ActionItemView = {
  id: string;
  body: string;
  assigneeId: string | null;
  assigneeEmail: string | null;
  dueDate: string | null;
  done: boolean;
  carried: boolean;
  overdue: boolean;
};

/**
 * Daftar action item pada detail catatan. Kotak centang aktif hanya untuk penulis catatan atau penanggung jawab
 * item itu (database memeriksanya lagi). Item yang dibawa ke Follow up diberi penanda "Carried over".
 */
export function NoteActionItems({
  items, userId, isAuthor, canCheck,
}: { items: ActionItemView[]; userId: string; isAuthor: boolean; canCheck: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function toggle(item: ActionItemView, done: boolean) {
    setBusy(item.id);
    start(async () => {
      const res = await toggleActionItemAction(item.id, done);
      setBusy(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <ul className="divide-y">
      {items.map((it) => {
        const canToggle = isAuthor || (it.assigneeId !== null && it.assigneeId === userId);
        const inputId = `ai-${it.id}`;
        return (
          <li key={it.id} id={`item-${it.id}`} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            {canCheck ? (
              <input
                id={inputId} type="checkbox" checked={it.done} disabled={!canToggle || (pending && busy === it.id)}
                onChange={(e) => toggle(it, e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-primary disabled:opacity-60"
                title={canToggle ? undefined : "Only the note's author or the person assigned can check this item."}
              />
            ) : (
              // Viewer hanya membaca: status tanpa kotak centang.
              <span role="img" aria-label={it.done ? "Done" : "Not done"} className="mt-0.5 shrink-0 text-muted-foreground">
                {it.done ? <CircleCheck className="size-4 text-primary" aria-hidden="true" /> : <Circle className="size-4" aria-hidden="true" />}
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-0.5">
              {canCheck ? (
                <label htmlFor={inputId} className={cn("block break-words text-sm", it.done && "text-muted-foreground line-through")}>
                  {it.body}
                </label>
              ) : (
                <p className={cn("break-words text-sm", it.done && "text-muted-foreground line-through")}>{it.body}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                {it.assigneeEmail && <span className="break-all">{it.assigneeEmail}</span>}
                {it.dueDate && <span>Due {formatYmd(it.dueDate)}</span>}
                {it.overdue && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-900 dark:bg-red-950 dark:text-red-200">Overdue</span>
                )}
                {it.carried && (
                  <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">Carried over</span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
