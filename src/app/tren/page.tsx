import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { TrendCharts } from "@/components/trend/trend-charts";
import { TrendControls } from "@/components/trend/trend-controls";
import { TrendTiles } from "@/components/trend/trend-tiles";
import { requireUser } from "@/lib/auth";
import { getTrend, type TrendData } from "@/lib/trend/data";
import { RANGE_LABEL, parseTrendParams, summarizeTrend } from "@/lib/trend/series";

export const metadata: Metadata = { title: "Tren" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Cache Components aktif: bagian yang membaca sesi dan searchParams harus di dalam <Suspense>.
export default function TrendPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-sm text-neutral-500">Memuat…</p>}>
      <TrendContent searchParams={searchParams} />
    </Suspense>
  );
}

async function TrendContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const requested = parseTrendParams(await searchParams);

  let data: TrendData | null = null;
  try {
    data = await getTrend(requested);
  } catch (e) {
    console.error("[tren] gagal memuat data", { error: (e as Error)?.name });
  }

  const summary = data ? summarizeTrend(data.points) : null;
  const rangeLabel = data ? (data.params.range === "all" ? "awal data" : `awal rentang (${RANGE_LABEL[data.params.range]})`) : "";

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 py-8">
        <div>
          <h1 className="text-xl font-semibold">Tren progres</h1>
          <p className="text-sm text-neutral-500">
            Perkembangan jumlah task dan persentase selesai dari waktu ke waktu, dari snapshot tiap sinkronisasi.
          </p>
        </div>

        {!data ? (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950/40">
            <p className="font-medium text-red-800 dark:text-red-300">Data tren belum bisa dimuat.</p>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">Coba muat ulang halaman ini. Bila terus terjadi, hubungi admin.</p>
          </div>
        ) : (
          <>
            <TrendControls params={data.params} sources={data.sources} />

            {data.ignoredSource && (
              <p role="status" className="rounded-md bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Aplikasi yang dipilih tidak ditemukan, jadi yang ditampilkan adalah gabungan semua aplikasi.
              </p>
            )}
            {data.truncated && (
              <p role="status" className="rounded-md bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Data pada rentang ini sangat banyak, jadi hanya sebagian yang terbaca. Pilih rentang yang lebih pendek.
              </p>
            )}

            {data.sources.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
                Belum ada aplikasi yang dipantau.{" "}
                {user.role === "admin" ? (
                  <Link href="/pengaturan/sumber/baru" className="underline">Tambahkan sumber</Link>
                ) : (
                  "Hubungi admin untuk mendaftarkan aplikasi."
                )}
              </div>
            ) : data.points.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
                <p className="font-medium text-neutral-700 dark:text-neutral-300">Belum ada data tren pada rentang ini.</p>
                <p className="mt-1">
                  Snapshot terbentuk setiap kali Segarkan menemukan perubahan pada tasks.json. Coba rentang yang lebih
                  panjang, atau tekan Segarkan di{" "}
                  <Link href="/" className="underline">Dashboard</Link>.
                </p>
              </div>
            ) : (
              <>
                {summary && <TrendTiles summary={summary} period={rangeLabel} />}
                {data.points.length === 1 && (
                  <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
                    Baru ada satu titik data. Garis tren muncul setelah ada sinkronisasi berikutnya yang mengubah data.
                  </p>
                )}
                <TrendCharts points={data.points} start={data.start} end={data.end} downsampled={data.downsampled} />
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
