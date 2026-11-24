import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { NotesCard } from "@/components/dashboard/notes-card";
import { AppShell } from "@/components/layout/app-shell";
import { LoadError } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { requireUser } from "@/lib/auth";
import { getDashboardData, type DashboardData } from "@/lib/dashboard/data";
import { NOTES_CARD_COOKIE, loadNotesSummary, type NotesSummary } from "@/lib/dashboard/notes-summary";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

// Cache Components aktif: bagian yang membaca sesi (cookies) harus di dalam Suspense.
export default function Home() {
  return (
    <Suspense fallback={<PageSkeleton cards={6} />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const user = await requireUser();

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
    notes = await loadNotesSummary(await createClient(), user.id);
  } catch (e) {
    console.error("[dashboard] gagal memuat ringkasan catatan", { error: (e as Error)?.name });
  }

  return (
    <AppShell user={user}>
      <PageHeader
        title="Dashboard"
        description="Task master progress for all applications. Data is updated with the Refresh button."
      />
      {notes && <NotesCard summary={notes} defaultOpen={notesOpen} />}
      {data ? (
        <DashboardView cards={data.cards} summary={data.summary} isAdmin={user.role === "admin"} />
      ) : (
        <LoadError title="The dashboard data could not be loaded." />
      )}
    </AppShell>
  );
}
