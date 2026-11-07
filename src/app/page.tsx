import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { AppShell } from "@/components/layout/app-shell";
import { LoadError } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { requireUser } from "@/lib/auth";
import { getDashboardData, type DashboardData } from "@/lib/dashboard/data";

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
  try {
    data = await getDashboardData();
  } catch (e) {
    // Jangan bocorkan detail ke halaman; catat hanya nama galatnya.
    console.error("[dashboard] gagal memuat data", { error: (e as Error)?.name });
  }

  return (
    <AppShell user={user}>
      <PageHeader
        title="Dashboard"
        description="Task master progress for all applications. Data is updated with the Refresh button."
      />
      {data ? (
        <DashboardView cards={data.cards} summary={data.summary} isAdmin={user.role === "admin"} />
      ) : (
        <LoadError title="The dashboard data could not be loaded." />
      )}
    </AppShell>
  );
}
