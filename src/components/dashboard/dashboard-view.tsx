"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/notices";
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
      <EmptyState title="No applications are monitored yet.">
        {isAdmin ? (
          <>
            Register the first repo in{" "}
            <Link href="/pengaturan/sumber/baru" className="underline">Source settings</Link>.
          </>
        ) : (
          "Ask an admin to register an application."
        )}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm" aria-label="Summary">
          <span className="text-sm font-medium">{summary.apps} {summary.apps === 1 ? "application" : "applications"}</span>
          {problems === 0 ? (
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-900 dark:bg-green-950 dark:text-green-200">
              All running well
            </span>
          ) : (
            <>
              {summary.failed > 0 && <Chip tone="red">{summary.failed} failed to sync</Chip>}
              {summary.blocked > 0 && <Chip tone="red">{summary.blocked} with blocked tasks</Chip>}
              {summary.tokenIssues > 0 && <Chip tone="amber">{summary.tokenIssues} with token issues</Chip>}
              {summary.neverSynced > 0 && <Chip tone="neutral">{summary.neverSynced} never synced</Chip>}
            </>
          )}
        </div>

        <Button type="button" onClick={() => refresh(activeIds)} disabled={busy > 0 || activeIds.length === 0}>
          <RefreshCw aria-hidden="true" className={busy > 0 ? "animate-spin" : ""} />
          {busy > 0 ? `Refreshing… (${busy} left)` : "Refresh all"}
        </Button>
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
    neutral: "bg-muted text-foreground",
  }[tone];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
