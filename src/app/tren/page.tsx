import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, LoadError, Notice } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { TrendCharts } from "@/components/trend/trend-charts";
import { TrendControls } from "@/components/trend/trend-controls";
import { TrendTiles } from "@/components/trend/trend-tiles";
import { requireUser } from "@/lib/auth";
import { getTrend, type TrendData } from "@/lib/trend/data";
import { RANGE_LABEL, parseTrendParams, summarizeTrend } from "@/lib/trend/series";

export const metadata: Metadata = { title: "Tren" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Cache Components aktif: bagian yang membaca sesi dan searchParams harus di dalam Suspense.
export default function TrendPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
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
    <AppShell user={user} width="normal">
      <PageHeader
        title="Tren progres"
        description="Perkembangan jumlah task dan persentase selesai dari waktu ke waktu, dari snapshot tiap sinkronisasi."
      />

      {!data ? (
        <LoadError title="Data tren belum bisa dimuat." />
      ) : (
        <>
          <TrendControls params={data.params} sources={data.sources} />

          {data.ignoredSource && (
            <Notice>Aplikasi yang dipilih tidak ditemukan, jadi yang ditampilkan adalah gabungan semua aplikasi.</Notice>
          )}
          {data.truncated && (
            <Notice>Data pada rentang ini sangat banyak, jadi hanya sebagian yang terbaca. Pilih rentang yang lebih pendek.</Notice>
          )}

          {data.sources.length === 0 ? (
            <EmptyState>
              Belum ada aplikasi yang dipantau.{" "}
              {user.role === "admin" ? (
                <Link href="/pengaturan/sumber/baru" className="underline">Tambahkan sumber</Link>
              ) : (
                "Hubungi admin untuk mendaftarkan aplikasi."
              )}
            </EmptyState>
          ) : data.points.length === 0 ? (
            <EmptyState title="Belum ada data tren pada rentang ini.">
              Snapshot terbentuk setiap kali Segarkan menemukan perubahan pada tasks.json. Coba rentang yang lebih
              panjang, atau tekan Segarkan di <Link href="/" className="underline">Dashboard</Link>.
            </EmptyState>
          ) : (
            <>
              {summary && <TrendTiles summary={summary} period={rangeLabel} />}
              {data.points.length === 1 && (
                <p role="status" className="text-sm text-muted-foreground">
                  Baru ada satu titik data. Garis tren muncul setelah ada sinkronisasi berikutnya yang mengubah data.
                </p>
              )}
              <TrendCharts points={data.points} start={data.start} end={data.end} downsampled={data.downsampled} />
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
