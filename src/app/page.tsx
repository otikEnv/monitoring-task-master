import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { NotesCard } from "@/components/dashboard/notes-card";
import { AppShell } from "@/components/layout/app-shell";
import { LoadError, Notice } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { can, menuAllowed } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { getDashboardData, type DashboardData } from "@/lib/dashboard/data";
import { NOTES_CARD_COOKIE, loadNotesSummary, type NotesSummary } from "@/lib/dashboard/notes-summary";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

// Cache Components aktif: bagian yang membaca sesi (cookies) harus di dalam Suspense.
export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<PageSkeleton cards={6} />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeContent({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const user = await requireUser();
  // Dialihkan dari menu yang tidak diizinkan (requireMenu).
  const noAccess = (await searchParams).notice === "no-access";

  let data: DashboardData | null = null;
  let notes: NotesSummary | null = null;
  const notesOpen = (await cookies()).get(NOTES_CARD_COOKIE)?.value !== "false";
  try {
    data = await getDashboardData();
  } catch (e) {
    // Jangan bocorkan detail ke halaman; catat hanya nama galatnya.
    console.error("[dashboard] gagal memuat data", { error: (e as Error)?.name });
  }
  // Kartu Notes dimuat terpisah: kegagalannya tidak boleh menjatuhkan Dashboard (kartu disembunyikan).
  try {
    if (menuAllowed(user, "notes")) notes = await loadNotesSummary(await createClient(), user.id);
  } catch (e) {
    console.error("[dashboard] gagal memuat ringkasan catatan", { error: (e as Error)?.name });
  }

  return (
    <AppShell user={user}>
      <PageHeader
        title="Dashboard"
        description="Task master progress for all applications. Data is updated with the Refresh button."
      />
      {noAccess && <Notice>You don&apos;t have access to that page.</Notice>}
      {notes && <NotesCard summary={notes} defaultOpen={notesOpen} />}
      {data ? (
        <DashboardView cards={data.cards} summary={data.summary} isAdmin={can(user.role, "release.manage")} />
      ) : (
        <LoadError title="The dashboard data could not be loaded." />
      )}
    </AppShell>
  );
}
