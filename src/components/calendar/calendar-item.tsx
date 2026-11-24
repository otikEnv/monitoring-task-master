import Link from "next/link";
import { CheckSquare, Flag, PlayCircle, Rocket } from "lucide-react";
import { NOTE_KIND_STYLE } from "@/components/notes/note-kind-badge";
import { RISK_TONE } from "@/components/releases/risk-badge";
import { RELEASE_EVENT_LABEL, type CalendarItem } from "@/lib/calendar/model";
import { NOTE_KIND_LABEL } from "@/lib/notes/model";
import { RISK_LABEL } from "@/lib/releases/model";
import { cn } from "@/lib/utils";

/** Warna dan ikon per jenis item (dipakai juga oleh legenda dan titik di ponsel). */
export const ITEM_TONE = {
  releaseStart: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200",
  released: "bg-muted text-foreground",
  item: "bg-amber-50 text-amber-950 ring-1 ring-inset ring-amber-300 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800",
  itemOverdue: "bg-red-100 text-red-900 ring-1 ring-inset ring-red-300 dark:bg-red-950 dark:text-red-200 dark:ring-red-900",
} as const;

export const DOT_TONE: Record<CalendarItem["kind"], string> = {
  release: "bg-teal-500 dark:bg-teal-400",
  item: "bg-amber-500 dark:bg-amber-400",
  note: "bg-blue-500 dark:bg-blue-400",
};

export function itemHref(it: CalendarItem): string {
  if (it.kind === "note") return `/notes/${it.id}`;
  if (it.kind === "release") return `/release/${it.id}`;
  return `/notes/${it.noteId}#item-${it.id}`;
}

/** Teks lengkap item (judul tooltip dan pembaca layar). */
export function itemLabel(it: CalendarItem): string {
  if (it.kind === "note") return `${NOTE_KIND_LABEL[it.noteKind]} note: ${it.title}`;
  if (it.kind === "release") {
    const state = it.event === "target" ? `, ${RISK_LABEL[it.risk]}` : it.onHold ? ", On hold" : "";
    return `Release ${RELEASE_EVENT_LABEL[it.event].toLowerCase()}: ${it.name}${state}`;
  }
  return `Action item due${it.overdue ? " (overdue)" : ""}: ${it.body}`;
}

function toneOf(it: CalendarItem): string {
  if (it.kind === "note") return NOTE_KIND_STYLE[it.noteKind].badge;
  if (it.kind === "item") return it.overdue ? ITEM_TONE.itemOverdue : ITEM_TONE.item;
  if (it.event === "target") return RISK_TONE[it.risk];
  return it.event === "released" ? ITEM_TONE.released : ITEM_TONE.releaseStart;
}

function IconOf({ it }: { it: CalendarItem }) {
  const cls = "size-3 shrink-0";
  if (it.kind === "note") {
    const Icon = NOTE_KIND_STYLE[it.noteKind].Icon;
    return <Icon aria-hidden="true" className={cls} />;
  }
  if (it.kind === "item") return <CheckSquare aria-hidden="true" className={cls} />;
  if (it.event === "start") return <PlayCircle aria-hidden="true" className={cls} />;
  if (it.event === "target") return <Flag aria-hidden="true" className={cls} />;
  return <Rocket aria-hidden="true" className={cls} />;
}

function textOf(it: CalendarItem): string {
  if (it.kind === "note") return it.title;
  if (it.kind === "item") return it.body;
  return `${RELEASE_EVENT_LABEL[it.event]}: ${it.name}${it.onHold ? " (On hold)" : ""}`;
}

/** Satu baris item: ikon + teks berwarna, menuju detailnya. `wrap` = tampilkan teks lengkap (Week, panel). */
export function CalendarItemLink({ it, wrap = false, className }: { it: CalendarItem; wrap?: boolean; className?: string }) {
  return (
    <Link
      href={itemHref(it)}
      title={itemLabel(it)}
      aria-label={itemLabel(it)}
      className={cn(
        "flex min-w-0 items-start gap-1 rounded px-1.5 py-0.5 text-xs font-medium hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring",
        toneOf(it),
        className,
      )}
    >
      <span className="mt-0.5"><IconOf it={it} /></span>
      <span className={wrap ? "min-w-0 break-words" : "min-w-0 truncate"}>{textOf(it)}</span>
    </Link>
  );
}
