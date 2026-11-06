import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { requireAdmin } from "@/lib/auth";
import { SourcesTable } from "@/components/sources/sources-table";
import { listSources } from "@/lib/sources/repo";

export const metadata: Metadata = { title: "Pengaturan sumber" };

// Cache Components aktif: bagian yang membaca sesi (cookies) harus di dalam <Suspense>.
export default function SourcesPage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-sm text-neutral-500">Memuat…</p>}>
      <SourcesContent />
    </Suspense>
  );
}

async function SourcesContent() {
  const user = await requireAdmin();
  const sources = await listSources();

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Pengaturan sumber</h1>
            <p className="text-sm text-neutral-500">
              Repo yang dipantau. Token disimpan terenkripsi dan tidak pernah ditampilkan.
            </p>
          </div>
          <Link
            href="/pengaturan/sumber/baru"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            Tambah sumber
          </Link>
        </div>

        {sources.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
            Belum ada sumber. Klik <strong>Tambah sumber</strong> untuk mendaftarkan repo pertama.
          </div>
        ) : (
          <SourcesTable sources={sources} />
        )}
      </main>
    </>
  );
}
