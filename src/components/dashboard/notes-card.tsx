"use client";

import Link from "next/link";
import { ChevronDown, NotebookText } from "lucide-react";
import { useState } from "react";
import { NoteKindBadge } from "@/components/notes/note-kind-badge";
import { HOLIDAY_KIND_LABEL } from "@/lib/notes/model";
import { formatYmd } from "@/lib/releases/format";
import { cn } from "@/lib/utils";
import type { NotesSummary } from "@/lib/dashboard/notes-summary";

const COOKIE = "notes_card_open";
const MAX_AGE = 60 * 60 * 24 * 365;

function Section({ title, link, children }: { title: string; link?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="min-w-0 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {link && <Link href={link.href} className="text-xs underline">{link.label}</Link>}
      </div>
      {children}
    </section>
  );
}

/**
 * Kartu Notes di atas Dashboard: catatan hari ini, action item yang lewat tenggat, dan libur 14 hari ke depan.
 * Bisa dilipat; pilihan diingat lewat cookie agar tetap sama setiap membuka Dashboard.
 */
export function NotesCard({ summary, defaultOpen }: { summary: NotesSummary; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  function toggle() {
    const next = !open;
    setOpen(next);
    document.cookie = `${COOKIE}=${next}; path=/; max-age=${MAX_AGE}; samesite=lax`;
  }

  const { today, overdue, overdueTotal, holidays } = summary;
  const bodyId = "notes-card-body";
  return (
    <section aria-labelledby="notes-card-title" className="rounded-xl border bg-card">
      <h2 id="notes-card-title">
        <button
          type="button" onClick={toggle} aria-expanded={open} aria-controls={bodyId}
          className="flex w-full items-center justify-between gap-2 rounded-xl p-4 text-left hover:bg-muted/40"
        >
          <span className="flex min-w-0 items-center gap-2">
            <NotebookText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="font-semibold">Notes</span>
            <span className="truncate text-sm text-muted-foreground">
              {today.length} today · {overdueTotal} overdue · {holidays.length} upcoming {holidays.length === 1 ? "holiday" : "holidays"}
            </span>
          </span>
          <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
        </button>
      </h2>

      {open && (
        <div id={bodyId} className="grid gap-5 border-t p-4 md:grid-cols-3">
          <Section title="Today" link={{ href: "/calendar", label: "Calendar" }}>
            {today.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notes today</p>
            ) : (
              <ul className="space-y-1.5">
                {today.map((n) => (
                  <li key={n.id} className="flex min-w-0 items-center gap-2">
                    <NoteKindBadge kind={n.kind} className="shrink-0" />
                    <Link href={`/notes/${n.id}`} className="truncate text-sm underline">{n.title}</Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Overdue action items"
            link={overdueTotal > overdue.length ? { href: `/calendar?month=${summary.oldestDue?.slice(0, 7) ?? ""}&show=items`, label: `View all (${overdueTotal})` } : undefined}
          >
            {overdue.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing overdue</p>
            ) : (
              <ul className="space-y-2">
                {overdue.map((it) => (
                  <li key={it.id} className="min-w-0 text-sm">
                    <Link href={`/notes/${it.noteId}#item-${it.id}`} className="block break-words underline">{it.body}</Link>
                    <p className="flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
                      <span className="font-medium text-red-700 dark:text-red-300">Due {formatYmd(it.dueDate)}</span>
                      {it.mine ? <span>· Yours</span> : it.assigneeEmail ? <span className="break-all">· {it.assigneeEmail}</span> : null}
                      <span className="truncate">· {it.noteTitle}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Upcoming holidays">
            {holidays.length === 0 ? (
              <p className="text-sm text-muted-foreground">No holidays in the next 14 days</p>
            ) : (
              <ul className="space-y-1.5">
                {holidays.map((h) => (
                  <li key={h.id} className="text-sm">
                    <span className="font-medium">{formatYmd(h.date)}</span> · {h.name}
                    <span className="text-xs text-muted-foreground"> ({HOLIDAY_KIND_LABEL[h.kind]})</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </section>
  );
}
