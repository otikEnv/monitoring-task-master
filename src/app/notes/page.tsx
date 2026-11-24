import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadError } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { NoteFilter } from "@/components/notes/note-filter";
import { NoteList } from "@/components/notes/note-list";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { loadAppOptions, loadNoteList, type NoteListPage } from "@/lib/notes/list";
import { calendarMonthFor, hasNoteFilters, parseNoteListParams } from "@/lib/notes/list-params";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notes" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function NotesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NotesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function NotesContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = parseNoteListParams(await searchParams);
  const isAdmin = user.role === "admin";

  let list: NoteListPage | null = null;
  let apps: { id: string; name: string }[] = [];
  try {
    const db = await createClient();
    [list, apps] = await Promise.all([loadNoteList(db, params, user.id), loadAppOptions(db)]);
  } catch (e) {
    console.error("[notes] gagal memuat daftar", { error: (e as Error)?.name });
  }

  const month = calendarMonthFor(params);
  return (
    <AppShell user={user} width="normal">
      <PageHeader
        title="Notes"
        description="Meeting results, decisions, and other notes."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={month ? `/calendar?month=${month}` : "/calendar"} className={buttonVariants({ variant: "outline" })}>
              <CalendarDays aria-hidden="true" /> View in calendar
            </Link>
            {isAdmin && (
              <Link href="/notes/new" className={buttonVariants()}>
                <Plus aria-hidden="true" /> New note
              </Link>
            )}
          </div>
        }
      />
      <NoteFilter params={params} apps={apps} />
      {list === null ? (
        <LoadError title="The notes could not be loaded." />
      ) : (
        <NoteList list={list} params={params} isAdmin={isAdmin} filtered={hasNoteFilters(params)} />
      )}
    </AppShell>
  );
}
