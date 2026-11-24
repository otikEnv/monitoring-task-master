import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCog } from "lucide-react";
import { Suspense } from "react";
import { CalendarGrid } from "@/components/calendar/calendar-grid";
import { CalendarToolbar, MissingHolidays } from "@/components/calendar/calendar-toolbar";
import { AppShell } from "@/components/layout/app-shell";
import { LoadError } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { loadCalendar } from "@/lib/calendar/data";
import { buildDays, parseCalendarParams, visibleDays, type CalendarData } from "@/lib/calendar/model";
import { loadAppOptions } from "@/lib/notes/list";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Calendar" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CalendarContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CalendarContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const now = new Date();
  const params = parseCalendarParams(await searchParams, now);
  const days = visibleDays(params);

  let data: CalendarData | null = null;
  let apps: { id: string; name: string }[] = [];
  try {
    const db = await createClient();
    [data, apps] = await Promise.all([loadCalendar(db, params, days[0], days[days.length - 1], now), loadAppOptions(db)]);
  } catch (e) {
    console.error("[calendar] gagal memuat", { error: (e as Error)?.name });
  }

  const isAdmin = user.role === "admin";
  // Revisi SKB libur dilakukan admin di halaman Holidays; tautan membawa tahun yang sedang dilihat.
  const year = (params.view === "week" ? params.week : params.month).slice(0, 4);
  return (
    <AppShell user={user} width="wide">
      <PageHeader
        title="Calendar"
        description="Notes, releases, action item due dates, and Indonesian holidays."
        actions={
          isAdmin ? (
            <Link href={`/notes/holidays?year=${year}`} className={buttonVariants({ variant: "outline" })}>
              <CalendarCog aria-hidden="true" /> Manage holidays
            </Link>
          ) : undefined
        }
      />
      <CalendarToolbar params={params} apps={apps} now={now} />
      {data === null ? (
        <LoadError title="The calendar could not be loaded." />
      ) : (
        <>
          <MissingHolidays years={data.missingHolidayYears} isAdmin={isAdmin} />
          {/* key: periode baru = grid baru (panel hari tertutup). */}
          <CalendarGrid
            key={`${params.view}-${days[0]}`}
            cells={buildDays(days, data, params, now)}
            view={params.view}
            isAdmin={isAdmin}
            initialDate={params.date}
          />
        </>
      )}
    </AppShell>
  );
}
