"use client";

import Link from "next/link";
import { Popover } from "@base-ui/react/popover";
import { Plus, X } from "lucide-react";
import { useCallback, useState, useSyncExternalStore } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { HOLIDAY_KIND_LABEL } from "@/lib/notes/model";
import { cellSlice, countByKind, type CalendarItem, type CalendarView, type DayCell } from "@/lib/calendar/model";
import { cn } from "@/lib/utils";
import { CalendarItemLink, DOT_TONE } from "./calendar-item";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MOBILE = "(max-width: 639px)";

function useIsMobile(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(MOBILE);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(MOBILE).matches,
    () => false,
  );
}

const dayNumber = (ymd: string) => Number(ymd.slice(8, 10));
const longDate = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });

const GROUPS: { kind: CalendarItem["kind"]; label: string }[] = [
  { kind: "release", label: "Releases" },
  { kind: "item", label: "Action items" },
  { kind: "note", label: "Notes" },
];

/** Isi panel hari: semua item tanggal itu, dikelompokkan Holidays, Releases, Action items, Notes. */
function DayPanelBody({ cell, isAdmin }: { cell: DayCell; isAdmin: boolean }) {
  const empty = cell.items.length === 0 && !cell.holiday;
  return (
    <div className="space-y-4">
      {cell.holiday && (
        <section aria-label="Holidays" className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Holidays</h3>
          <p className="rounded-md bg-rose-100 px-2 py-1 text-sm text-rose-950 dark:bg-rose-950 dark:text-rose-100">
            {cell.holiday.name} <span className="text-xs opacity-80">· {HOLIDAY_KIND_LABEL[cell.holiday.kind]}</span>
          </p>
        </section>
      )}
      {GROUPS.map(({ kind, label }) => {
        const list = cell.items.filter((i) => i.kind === kind);
        if (list.length === 0) return null;
        return (
          <section key={kind} aria-label={label} className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
            <ul className="space-y-1">
              {list.map((it) => (
                <li key={`${it.kind}-${it.id}-${it.date}-${"event" in it ? it.event : ""}`}>
                  <CalendarItemLink it={it} wrap className="py-1 text-sm" />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {empty && <p className="text-sm text-muted-foreground">Nothing on this day.</p>}
      {isAdmin && (
        <Link href={`/notes/new?date=${cell.date}`} className={buttonVariants({ size: "sm", className: "w-full" })}>
          <Plus aria-hidden="true" /> New note
        </Link>
      )}
    </div>
  );
}

/**
 * Grid Calendar. Month: maksimal 3 item per sel, sisanya "+N more"; libur sebagai latar dan nama kecil (tidak
 * dihitung batas). Di ponsel sel hanya berisi titik per jenis. Mengklik sel atau "+N more" membuka panel hari
 * (popover di desktop, sheet dari bawah di ponsel); tanggal terpilih disimpan di URL (?date=).
 */
export function CalendarGrid({
  cells, view, isAdmin, initialDate,
}: { cells: DayCell[]; view: CalendarView; isAdmin: boolean; initialDate: string | null }) {
  const mobile = useIsMobile();
  const [selected, setSelected] = useState<string | null>(
    initialDate && cells.some((c) => c.date === initialDate) ? initialDate : null,
  );
  const cell = cells.find((c) => c.date === selected) ?? null;

  const open = useCallback((date: string | null) => {
    setSelected(date);
    const url = new URL(window.location.href);
    if (date) url.searchParams.set("date", date);
    else url.searchParams.delete("date");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const anchor = useCallback(() => (selected ? document.getElementById(`cell-${selected}`) : null), [selected]);

  return (
    <>
      {view === "month" ? (
        <div role="grid" aria-label="Month" className="overflow-hidden rounded-xl border bg-card">
          <div role="row" className="grid grid-cols-7 border-b bg-muted/50">
            {WEEKDAYS.map((d, i) => (
              <div key={d} role="columnheader" className={cn("px-1 py-1.5 text-center text-xs font-medium text-muted-foreground", i >= 5 && "opacity-70")}>
                {d}
              </div>
            ))}
          </div>
          {Array.from({ length: cells.length / 7 }, (_, w) => (
            <div key={w} role="row" className="grid grid-cols-7 divide-x border-b last:border-b-0">
              {cells.slice(w * 7, w * 7 + 7).map((c) => (
                <MonthCell key={c.date} cell={c} active={c.date === selected} onOpen={() => open(c.date)} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-7">
          {cells.map((c) => (
            <WeekColumn key={c.date} cell={c} active={c.date === selected} onOpen={() => open(c.date)} />
          ))}
        </div>
      )}

      {mobile ? (
        <Sheet open={cell !== null} onOpenChange={(o) => { if (!o) open(null); }}>
          <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto p-4">
            {cell && (
              <>
                <SheetHeader className="p-0">
                  <SheetTitle>{longDate(cell.date)}</SheetTitle>
                  <SheetDescription>{cell.items.length} {cell.items.length === 1 ? "item" : "items"}</SheetDescription>
                </SheetHeader>
                <DayPanelBody cell={cell} isAdmin={isAdmin} />
              </>
            )}
          </SheetContent>
        </Sheet>
      ) : (
        <Popover.Root open={cell !== null} onOpenChange={(o) => { if (!o) open(null); }}>
          <Popover.Portal>
            <Popover.Positioner anchor={anchor} side="bottom" align="start" sideOffset={4} collisionPadding={12} className="z-50">
              <Popover.Popup className="max-h-[70vh] w-80 overflow-y-auto rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg outline-none">
                {cell && (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Popover.Title className="text-sm font-semibold">{longDate(cell.date)}</Popover.Title>
                        <Popover.Description className="text-xs text-muted-foreground">
                          {cell.items.length} {cell.items.length === 1 ? "item" : "items"}
                        </Popover.Description>
                      </div>
                      <Popover.Close aria-label="Close" className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
                        <X aria-hidden="true" />
                      </Popover.Close>
                    </div>
                    <DayPanelBody cell={cell} isAdmin={isAdmin} />
                  </div>
                )}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      )}
    </>
  );
}

function HolidayTag({ cell }: { cell: DayCell }) {
  if (!cell.holiday) return null;
  return (
    <p className={cn("truncate text-[0.7rem] font-medium leading-tight", cell.holiday.kind === "national" ? "text-rose-700 dark:text-rose-300" : "text-rose-600/80 dark:text-rose-300/80")} title={cell.holiday.name}>
      {cell.holiday.name}
    </p>
  );
}

const holidayBg = (c: DayCell) =>
  c.holiday ? (c.holiday.kind === "national" ? "bg-rose-50 dark:bg-rose-950/40" : "bg-rose-50/50 dark:bg-rose-950/20") : "";

function DateButton({ cell, onOpen, className }: { cell: DayCell; onOpen: () => void; className?: string }) {
  const count = cell.items.length;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${longDate(cell.date)}${cell.holiday ? `, ${cell.holiday.name}` : ""}, ${count} ${count === 1 ? "item" : "items"}`}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-full text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
        cell.weekend && "text-muted-foreground",
        cell.holiday && "text-rose-700 dark:text-rose-300",
        cell.today && "bg-primary text-primary-foreground hover:bg-primary/90",
        className,
      )}
    >
      {dayNumber(cell.date)}
    </button>
  );
}

function MonthCell({ cell, active, onOpen }: { cell: DayCell; active: boolean; onOpen: () => void }) {
  const { shown, more } = cellSlice(cell.items);
  const counts = countByKind(cell.items);
  return (
    <div
      id={`cell-${cell.date}`}
      role="gridcell"
      aria-selected={active}
      className={cn(
        "flex min-h-16 min-w-0 flex-col gap-1 p-1 sm:min-h-28 sm:p-1.5",
        holidayBg(cell),
        cell.outside && "opacity-50",
        active && "ring-2 ring-inset ring-ring",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <DateButton cell={cell} onOpen={onOpen} />
      </div>
      <div className="hidden sm:block"><HolidayTag cell={cell} /></div>
      {/* Desktop: baris item. */}
      <ul className="hidden min-w-0 space-y-0.5 sm:block">
        {shown.map((it) => (
          <li key={`${it.kind}-${it.id}-${"event" in it ? it.event : ""}`}><CalendarItemLink it={it} /></li>
        ))}
      </ul>
      {more > 0 && (
        <button
          type="button" onClick={onOpen}
          className="hidden self-start rounded px-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground sm:inline"
        >
          +{more} more
        </button>
      )}
      {/* Ponsel: titik per jenis dan jumlahnya; detail lewat sheet. */}
      <button type="button" onClick={onOpen} tabIndex={-1} aria-hidden="true" className="flex flex-1 flex-wrap content-start gap-1 sm:hidden">
        {cell.holiday && <span className="size-1.5 rounded-full bg-rose-500" />}
        {(Object.keys(counts) as CalendarItem["kind"][]).map((k) => (
          <span key={k} className="inline-flex items-center gap-0.5 text-[0.65rem] leading-none text-muted-foreground">
            <span className={cn("size-1.5 rounded-full", DOT_TONE[k])} />
            {counts[k]! > 1 ? counts[k] : ""}
          </span>
        ))}
      </button>
    </div>
  );
}

function WeekColumn({ cell, active, onOpen }: { cell: DayCell; active: boolean; onOpen: () => void }) {
  const weekday = new Date(`${cell.date}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short" });
  return (
    <section
      id={`cell-${cell.date}`}
      aria-label={longDate(cell.date)}
      className={cn("min-w-0 space-y-1.5 rounded-xl border bg-card p-2 sm:min-h-64", holidayBg(cell), active && "ring-2 ring-ring")}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn("text-xs font-medium text-muted-foreground", cell.weekend && "opacity-70")}>{weekday}</span>
        <DateButton cell={cell} onOpen={onOpen} />
      </div>
      <HolidayTag cell={cell} />
      {cell.items.length === 0 ? (
        <p className="text-xs text-muted-foreground sm:hidden">Nothing scheduled.</p>
      ) : (
        <ul className="space-y-1">
          {cell.items.map((it) => (
            <li key={`${it.kind}-${it.id}-${"event" in it ? it.event : ""}`}><CalendarItemLink it={it} wrap /></li>
          ))}
        </ul>
      )}
    </section>
  );
}
