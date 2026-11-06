"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DashboardCard, DashboardSummary } from "@/lib/dashboard/cards";
import { REFRESH_CONCURRENCY, refreshSource, runPool } from "@/lib/dashboard/refresh";
import { SourceCard, type RefreshUi } from "./source-card";

export function DashboardView({
  cards,
  summary,
  isAdmin,
}: {
  cards: DashboardCard[];
  summary: DashboardSummary;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [ui, setUi] = useState<Record<string, RefreshUi>>({});
  const [busy, setBusy] = useState(0); // jumlah sumber yang sedang disegarkan

  const set = (id: string, v: RefreshUi) => setUi((prev) => ({ ...prev, [id]: v }));

  async function refresh(ids: string[]) {
    if (ids.length === 0) return;
    setBusy((n) => n + ids.length);
    ids.forEach((id) => set(id, { phase: "running" }));

    let changed = false;
    await runPool(ids, REFRESH_CONCURRENCY, async (id) => {
      const out = await refreshSource(id);
      changed ||= out.changed;
      set(id, { phase: "done", tone: out.tone, message: out.message });
      setBusy((n) => n - 1);
    });

    // Muat ulang data server (hitungan, waktu sinkron, penanda gagal).
    if (changed) router.refresh();
  }

  const activeIds = cards.filter((c) => c.isActive).map((c) => c.id);
  const problems = summary.failed + summary.blocked + summary.tokenIssues + summary.neverSynced;

  if (cards.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
        <p className="font-medium">Belum ada aplikasi yang dipantau.</p>
        <p className="mt-1 text-sm text-neutral-500">
          {isAdmin ? (
            <>
              Daftarkan repo pertama di{" "}
              <Link href="/pengaturan/sumber/baru" className="underline">Pengaturan sumber</Link>.
            </>
          ) : (
            "Hubungi admin untuk mendaftarkan aplikasi."
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm" aria-label="Ringkasan">
          <span className="font-medium">{summary.apps} aplikasi</span>
          {problems === 0 ? (
            <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-900 dark:bg-green-950 dark:text-green-200">
              Semua berjalan baik
            </span>
          ) : (
            <>
              {summary.failed > 0 && <Chip tone="red">{summary.failed} gagal sinkron</Chip>}
              {summary.blocked > 0 && <Chip tone="red">{summary.blocked} punya task terhambat</Chip>}
              {summary.tokenIssues > 0 && <Chip tone="amber">{summary.tokenIssues} token bermasalah</Chip>}
              {summary.neverSynced > 0 && <Chip tone="neutral">{summary.neverSynced} belum disinkronkan</Chip>}
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => refresh(activeIds)}
          disabled={busy > 0 || activeIds.length === 0}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {busy > 0 ? `Menyegarkan… (${busy} tersisa)` : "Segarkan semua"}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <SourceCard
            key={card.id}
            card={card}
            refresh={ui[card.id] ?? { phase: "idle" }}
            onRefresh={(id) => refresh([id])}
          />
        ))}
      </div>
    </div>
  );
}

function Chip({ tone, children }: { tone: "red" | "amber" | "neutral"; children: React.ReactNode }) {
  const cls = {
    red: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
    amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    neutral: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
  }[tone];
  return <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{children}</span>;
}
