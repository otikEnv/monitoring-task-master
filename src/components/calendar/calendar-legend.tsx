"use client";

import { Popover } from "@base-ui/react/popover";
import { Info, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { CalendarItem } from "@/lib/calendar/model";
import { NOTE_KINDS, NOTE_KIND_LABEL } from "@/lib/notes/model";
import { RISK_LABEL, type RiskLevel } from "@/lib/releases/model";
import { cn } from "@/lib/utils";
import { CalendarItemChip } from "./calendar-item";

const BASE = { id: "legend", date: "", createdAt: "" };
const note = (noteKind: (typeof NOTE_KINDS)[number]): CalendarItem => ({ ...BASE, kind: "note", title: "", noteKind });
const release = (event: "start" | "target" | "released", risk: RiskLevel = "on_track"): CalendarItem =>
  ({ ...BASE, kind: "release", name: "", event, risk, onHold: false });
const item = (overdue: boolean): CalendarItem => ({ ...BASE, kind: "item", noteId: "", body: "", overdue });

const TARGET_RISKS: RiskLevel[] = ["on_track", "at_risk", "behind", "overdue"];

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </section>
  );
}

/** Contoh sel tanggal untuk kelompok Days (latar libur, angka akhir pekan, hari ini). */
function DayChip({ label, cell, num }: { label: string; cell: string; num: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs", cell)}>
      <span className={cn("inline-flex size-5 items-center justify-center rounded-full text-[0.7rem] font-medium", num)}>24</span>
      {label}
    </span>
  );
}

/**
 * Tombol Legend di baris filter Calendar. Popover berisi contoh item dengan bentuk dan warna yang sama persis dengan
 * kalender, dikelompokkan: Notes, Releases, Action items, Days.
 */
export function CalendarLegend() {
  return (
    <Popover.Root>
      <Popover.Trigger className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <Info aria-hidden="true" /> Legend
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={12} className="z-50">
          <Popover.Popup className="max-h-[70vh] w-[min(22rem,calc(100vw-1.5rem))] space-y-3 overflow-y-auto rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg outline-none">
            <div className="flex items-center justify-between gap-2">
              <Popover.Title className="text-sm font-semibold">Legend</Popover.Title>
              <Popover.Close aria-label="Close" className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
                <X aria-hidden="true" />
              </Popover.Close>
            </div>
            <Group title="Notes">
              {NOTE_KINDS.map((k) => <CalendarItemChip key={k} it={note(k)} label={NOTE_KIND_LABEL[k]} />)}
            </Group>
            <Group title="Releases">
              <CalendarItemChip it={release("start")} label="Start" />
              {TARGET_RISKS.map((r) => <CalendarItemChip key={r} it={release("target", r)} label={`Target · ${RISK_LABEL[r]}`} />)}
              <CalendarItemChip it={release("released")} label="Released" />
            </Group>
            <Group title="Action items">
              <CalendarItemChip it={item(false)} label="Due" />
              <CalendarItemChip it={item(true)} label="Overdue" />
            </Group>
            <Group title="Days">
              <DayChip label="National holiday" cell="bg-rose-50 dark:bg-rose-950/40" num="text-rose-700 dark:text-rose-300" />
              <DayChip label="Collective leave" cell="bg-rose-50/50 dark:bg-rose-950/20" num="text-rose-700 dark:text-rose-300" />
              <DayChip label="Weekend" cell="bg-muted/40" num="text-muted-foreground" />
              <DayChip label="Today" cell="bg-muted/40" num="bg-primary text-primary-foreground" />
            </Group>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
