import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadError } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { HolidayManager } from "@/components/notes/holiday-manager";
import { buttonVariants } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { loadHolidaysForYear, type Holiday } from "@/lib/notes/holidays";
import { todayWib } from "@/lib/notes/model";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Holidays" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function HolidaysPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HolidaysContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HolidaysContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireAdmin();
  const raw = (await searchParams).year;
  const v = Array.isArray(raw) ? raw[0] : raw;
  const year = v && /^(19|20|21)\d{2}$/.test(v) ? Number(v) : Number(todayWib().slice(0, 4));

  let holidays: Holiday[] | null = null;
  try {
    holidays = await loadHolidaysForYear(await createClient(), year);
  } catch (e) {
    console.error("[holidays] gagal memuat", { error: (e as Error)?.name });
  }

  const national = holidays?.filter((h) => h.kind === "national").length ?? 0;
  const leave = holidays?.filter((h) => h.kind === "collective_leave").length ?? 0;
  return (
    <AppShell user={user} width="narrow">
      <PageHeader
        title="Holidays"
        description="Indonesian national holidays and collective leave. They appear on the Calendar and are skipped when counting release working days."
      />
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/notes/holidays?year=${year - 1}`} aria-label="Previous year" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronLeft aria-hidden="true" />
        </Link>
        <h2 className="min-w-16 text-center text-lg font-semibold tabular-nums">{year}</h2>
        <Link href={`/notes/holidays?year=${year + 1}`} aria-label="Next year" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronRight aria-hidden="true" />
        </Link>
        {holidays && (
          <p className="text-sm text-muted-foreground">{national} national {national === 1 ? "holiday" : "holidays"} · {leave} collective leave</p>
        )}
        <Link href={`/calendar?month=${year}-01`} className="ml-auto text-sm underline">View in calendar</Link>
      </div>
      {holidays === null ? (
        <LoadError title="The holidays could not be loaded." />
      ) : (
        <HolidayManager key={year} year={year} holidays={holidays} />
      )}
    </AppShell>
  );
}
