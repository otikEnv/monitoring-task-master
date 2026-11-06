import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { requireUser } from "@/lib/auth";
import { getDashboardData, type DashboardData } from "@/lib/dashboard/data";

export const metadata: Metadata = { title: "Dashboard" };

// Cache Components aktif: bagian yang membaca sesi (cookies) harus di dalam <Suspense>.
export default function Home() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-sm text-neutral-500">Memuat…</p>}>
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
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-8">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-neutral-500">
            Progres task master semua aplikasi. Data dimutakhirkan lewat tombol Segarkan.
          </p>
        </div>

        {data ? (
          <DashboardView cards={data.cards} summary={data.summary} isAdmin={user.role === "admin"} />
        ) : (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950/40">
            <p className="font-medium text-red-800 dark:text-red-300">Data dashboard belum bisa dimuat.</p>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
              Coba muat ulang halaman ini. Bila terus terjadi, hubungi admin.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
