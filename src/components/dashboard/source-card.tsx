import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { RiskBadge } from "@/components/releases/risk-badge";
import { Button } from "@/components/ui/button";
import type { DashboardCard } from "@/lib/dashboard/cards";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatDaysLeft } from "@/lib/releases/format";
import { releaseListHref } from "@/lib/releases/params";
import { STATUS_LABEL, STATUS_ORDER, STATUS_RAW, STATUS_TONE } from "@/lib/status";

export type RefreshUi =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; tone: "success" | "info" | "error"; message: string };

const PROVIDER_LABEL = { github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket" } as const;

const MESSAGE_TONE = {
  success: "text-green-700 dark:text-green-400",
  info: "text-muted-foreground",
  error: "text-red-700 dark:text-red-400",
} as const;

/** Kartu satu aplikasi. Tidak memakai hook; semua aksi lewat props. */
export function SourceCard({
  card,
  refresh,
  onRefresh,
}: {
  card: DashboardCard;
  refresh: RefreshUi;
  onRefresh: (id: string) => void;
}) {
  const failed = card.lastSyncStatus === "failed";
  const never = card.lastSyncStatus === "never";
  const running = refresh.phase === "running";

  return (
    <article
      className={`relative flex flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground shadow-xs transition-all hover:shadow-md ${
        failed ? "border-red-400 dark:border-red-800" : "hover:border-foreground/30"
      } ${card.isActive ? "" : "opacity-60"}`}
    >
      <header className="space-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold leading-tight">
            {/* Tautan "membentang" menutupi seluruh kartu; tombol di bawah diberi z-10 agar tetap bisa diklik. */}
            <Link
              href={`/tasks?source=${encodeURIComponent(card.id)}`}
              className="after:absolute after:inset-0 after:rounded-xl hover:underline"
            >
              {card.name}
            </Link>
          </h2>
          {!card.isActive && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">
              Nonaktif
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {PROVIDER_LABEL[card.provider]} · Branch <strong>{card.branch}</strong>
        </p>
      </header>

      {failed && (
        <div role="alert" className="space-y-1 rounded-md border border-red-300 bg-red-50 p-2.5 text-xs dark:border-red-900 dark:bg-red-950/40">
          <p className="font-semibold text-red-800 dark:text-red-300">Sinkronisasi gagal</p>
          {card.lastError && <p className="break-words text-red-800 dark:text-red-300">{card.lastError}</p>}
          <p className="text-muted-foreground">
            {card.lastSyncedAt
              ? `Data di bawah berasal dari sinkronisasi terakhir yang berhasil: ${formatDateTime(card.lastSyncedAt)}.`
              : "Belum pernah berhasil disinkronkan."}
          </p>
        </div>
      )}

      {card.hasData ? (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-3xl font-semibold tabular-nums">{formatPercent(card.percentDone)}%</p>
            <p className="text-right text-xs text-muted-foreground">
              {card.counts.done} dari {card.total} task selesai
              {card.tagCount > 1 && ` · ${card.tagCount} tag`}
            </p>
          </div>
          <div
            role="progressbar"
            aria-label={`Progres ${card.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={card.percentDone}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-green-600" style={{ width: `${card.percentDone}%` }} />
          </div>
        </div>
      ) : (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          {never ? "Belum pernah disinkronkan. Tekan Segarkan untuk mengambil data." : "Belum ada task pada file ini."}
        </p>
      )}

      {card.hasData && (
        <ul className="grid grid-cols-2 gap-1.5 text-xs">
          {STATUS_ORDER.filter((s) => s !== "other" || card.counts.other > 0).map((s) => (
            <li
              key={s}
              title={s === "other" ? "Status lain yang tidak dikenal" : `Status "${STATUS_RAW[s]}" di tasks.json`}
              className={`flex items-center justify-between gap-1 rounded-md px-2.5 py-1 ${STATUS_TONE[s]} ${
                s === "blocked" && card.counts.blocked > 0 ? "ring-1 ring-red-500" : ""
              }`}
            >
              <span>{STATUS_LABEL[s]}</span>
              <span className="font-semibold tabular-nums">{card.counts[s]}</span>
            </li>
          ))}
        </ul>
      )}

      {card.release && (
        <div className="relative z-10 space-y-1 rounded-md border bg-muted/40 p-2.5 text-xs">
          <Link href={`/release/${card.release.releaseId}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 hover:underline">
            <span className="font-medium">Release {card.release.name}</span>
            <span className="text-muted-foreground">
              {card.release.percent === null ? "belum ada task" : `${card.release.percent}%`} · {formatDaysLeft(card.release.daysLeft)}
            </span>
            <RiskBadge risk={card.release.risk} />
          </Link>
          {card.release.extra > 0 && (
            <Link href={releaseListHref({ source: card.id })} className="block text-muted-foreground hover:underline">
              +{card.release.extra} release lain
            </Link>
          )}
        </div>
      )}

      {(card.tokenExpiry === "expired" || card.tokenExpiry === "soon") && (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
          {card.tokenExpiry === "expired"
            ? `Token akses kedaluwarsa sejak ${formatDate(card.tokenExpiresAt)}.`
            : `Token akses segera kedaluwarsa: ${formatDate(card.tokenExpiresAt)}.`}
        </p>
      )}

      <footer className="mt-auto space-y-2">
        <p className="text-xs text-muted-foreground">
          {card.lastSyncedAt ? `Sinkron terakhir: ${formatDateTime(card.lastSyncedAt)}` : "Belum pernah disinkronkan"}
          {card.lastCommitAt && ` · File diubah: ${formatDateTime(card.lastCommitAt)}`}
        </p>
        <div className="relative z-10 flex flex-wrap items-center gap-2">
          {card.isActive && (
            <Button type="button" variant="outline" size="sm" onClick={() => onRefresh(card.id)} disabled={running}>
              <RefreshCw aria-hidden="true" className={running ? "animate-spin" : ""} />
              {running ? "Menyegarkan…" : "Segarkan"}
            </Button>
          )}
          {refresh.phase === "done" && (
            <p role="status" className={`text-xs ${MESSAGE_TONE[refresh.tone]}`}>
              {refresh.message}
            </p>
          )}
        </div>
      </footer>
    </article>
  );
}

function formatPercent(p: number) {
  return Number.isInteger(p) ? String(p) : p.toFixed(1);
}
