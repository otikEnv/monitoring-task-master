import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, LoadError } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { ReleaseCard } from "@/components/releases/release-card";
import { ReleaseFilter } from "@/components/releases/release-filter";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { loadReleaseOverviews, type ReleaseOverview } from "@/lib/releases/load";
import { parseReleaseListParams } from "@/lib/releases/params";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Release" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Cache Components aktif: bagian yang membaca sesi dan searchParams harus di dalam Suspense.
export default function ReleasePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton cards={4} />}>
      <ReleaseContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ReleaseContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = parseReleaseListParams(await searchParams);
  const isAdmin = user.role === "admin";

  let data: { overviews: ReleaseOverview[]; sources: { id: string; name: string }[] } | null = null;
  try {
    const db = await createClient();
    const [overviews, sources] = await Promise.all([
      loadReleaseOverviews(db, { sourceId: params.source ?? undefined, includeReleased: params.showReleased }),
      db.from("sources").select("id, name").order("name", { ascending: true }),
    ]);
    if (sources.error) throw new Error(sources.error.message);
    data = { overviews, sources: sources.data as { id: string; name: string }[] };
  } catch (e) {
    console.error("[release] gagal memuat data", { error: (e as Error)?.name });
  }

  return (
    <AppShell user={user}>
      <PageHeader
        title="Release"
        description="Target rilis per aplikasi: rentang task, progres, sisa waktu, dan hambatan."
        actions={
          isAdmin && (
            <Link href="/release/baru" className={buttonVariants()}>
              <Plus aria-hidden="true" /> Tambah release
            </Link>
          )
        }
      />

      {!data ? (
        <LoadError title="Daftar release belum bisa dimuat." />
      ) : (
        <>
          {/* key: formulir dibangun ulang saat URL berubah agar pilihan selalu sama dengan URL */}
          <ReleaseFilter key={JSON.stringify(params)} params={params} sources={data.sources} />

          {data.overviews.length === 0 ? (
            <EmptyState title={params.source || params.showReleased ? "Tidak ada release yang cocok." : "Belum ada release."}>
              {params.showReleased
                ? "Belum ada release pada pilihan ini."
                : "Tidak ada release yang sedang berjalan. Centang “Tampilkan yang sudah rilis” untuk melihat riwayat."}
              {isAdmin && (
                <>
                  {" "}
                  <Link href="/release/baru" className="underline">Tambah release</Link>.
                </>
              )}
            </EmptyState>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.overviews.map((o) => (
                <ReleaseCard key={o.release.id} overview={o} />
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
