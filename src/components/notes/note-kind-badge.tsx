import { Gavel, NotebookPen, Users } from "lucide-react";
import { NOTE_KIND_LABEL, type NoteKind } from "@/lib/notes/model";
import { cn } from "@/lib/utils";

/** Warna per jenis catatan (PRD-Note.md): Meeting biru, Decision ungu, General abu-abu. Selalu dengan ikon + label. */
export const NOTE_KIND_STYLE: Record<NoteKind, { badge: string; dot: string; Icon: typeof Users }> = {
  meeting: {
    badge: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
    dot: "bg-blue-500 dark:bg-blue-400",
    Icon: Users,
  },
  decision: {
    badge: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
    dot: "bg-violet-500 dark:bg-violet-400",
    Icon: Gavel,
  },
  general: {
    badge: "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-200",
    dot: "bg-slate-500 dark:bg-slate-400",
    Icon: NotebookPen,
  },
};

export function NoteKindBadge({ kind, className }: { kind: NoteKind; className?: string }) {
  const { badge, Icon } = NOTE_KIND_STYLE[kind];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium", badge, className)}>
      <Icon aria-hidden="true" className="size-3" />
      {NOTE_KIND_LABEL[kind]}
    </span>
  );
}
