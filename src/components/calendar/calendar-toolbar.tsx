import Link from "next/link";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { NOTE_KIND_STYLE } from "@/components/notes/note-kind-badge";
import { RISK_TONE } from "@/components/releases/risk-badge";
import { buttonVariants } from "@/components/ui/button";
import { calendarHref, navHrefs, periodLabel, type CalendarParams } from "@/lib/calendar/model";
import { NOTE_KINDS, NOTE_KIND_LABEL } from "@/lib/notes/model";
import { cn } from "@/lib/utils";
import { CalendarFilter } from "./calendar-filter";
import { ITEM_TONE } from "./calendar-item";

/** Navigasi periode, pilihan Month/Week, dan filter (diterapkan dengan Apply). State ada di URL. */
export function CalendarToolbar({
  params, apps, now = new Date(),
}: { params: CalendarParams; apps: { id: string; name: string }[]; now?: Date }) {
  const nav = navHrefs(params, now);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Link href={nav.prev} aria-label={params.view === "week" ? "Previous week" : "Previous month"} className={buttonVariants({ variant: "outline", size: "icon" })}>
            <ChevronLeft aria-hidden="true" />
          </Link>
          <Link href={nav.today} className={buttonVariants({ variant: "outline" })}>Today</Link>
          <Link href={nav.next} aria-label={params.view === "week" ? "Next week" : "Next month"} className={buttonVariants({ variant: "outline", size: "icon" })}>
            <ChevronRight aria-hidden="true" />
          </Link>
          <h2 className="ml-2 text-lg font-semibold" aria-live="polite">{periodLabel(params)}</h2>
        </div>
        <nav aria-label="View" className="inline-flex rounded-lg border p-0.5 text-sm">
          {(["month", "week"] as const).map((v) => (
            <Link
              key={v}
              href={calendarHref(params, { view: v, date: null }, now)}
              aria-current={params.view === v ? "page" : undefined}
              className={cn("rounded-md px-3 py-1 font-medium", params.view === v ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {v === "month" ? "Month" : "Week"}
            </Link>
          ))}
        </nav>
      </div>

      <CalendarFilter params={params} apps={apps} />
    </div>
  );
}

function Swatch({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden="true" className={cn("inline-block size-3 rounded-sm", className)} />
      {children}
    </li>
  );
}

/** Legenda warna di bawah calendar. */
export function CalendarLegend() {
  return (
    <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {NOTE_KINDS.map((k) => <Swatch key={k} className={NOTE_KIND_STYLE[k].badge}>{NOTE_KIND_LABEL[k]} note</Swatch>)}
      <Swatch className={ITEM_TONE.releaseStart}>Release start</Swatch>
      <Swatch className={RISK_TONE.on_track}>Release target (risk color)</Swatch>
      <Swatch className={ITEM_TONE.released}>Released</Swatch>
      <Swatch className={ITEM_TONE.item}>Action item due</Swatch>
      <Swatch className={ITEM_TONE.itemOverdue}>Action item overdue</Swatch>
      <Swatch className="bg-rose-100 dark:bg-rose-950">National holiday</Swatch>
      <Swatch className="bg-rose-50 ring-1 ring-inset ring-rose-200 dark:bg-rose-950/40 dark:ring-rose-900">Collective leave</Swatch>
      <Swatch className="bg-muted">Weekend (dimmed date)</Swatch>
    </ul>
  );
}

/** Pemberitahuan tahun yang belum punya data libur. */
export function MissingHolidays({ years, isAdmin }: { years: number[]; isAdmin: boolean }) {
  if (years.length === 0) return null;
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>
        Holidays for {years.join(" and ")} have not been added yet.
        {isAdmin && <> <Link href={`/notes/holidays?year=${years[0]}`} className="underline">Add them</Link>.</>}
      </span>
    </p>
  );
}
