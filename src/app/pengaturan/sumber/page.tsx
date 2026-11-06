import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { listSources, type SourceView } from "@/lib/sources/repo";
import { RowActions } from "./row-actions";

export const metadata: Metadata = { title: "Pengaturan sumber" };

// Cache Components aktif: bagian yang membaca sesi (cookies) harus di dalam <Suspense>.
export default function SourcesPage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-sm text-neutral-500">Memuat…</p>}>
      <SourcesContent />
    </Suspense>
  );
}

const PROVIDER_LABEL = { github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket" } as const;

function SyncBadge({ s }: { s: SourceView }) {
  if (s.lastSyncStatus === "never") return <span className="text-neutral-500">Belum pernah</span>;
  if (s.lastSyncStatus === "failed") {
    return (
      <div className="space-y-0.5">
        <span className="font-medium text-red-700 dark:text-red-400">Gagal</span>
        {s.lastError && <p className="max-w-64 text-xs text-red-700 dark:text-red-400">{s.lastError}</p>}
        <p className="text-xs text-neutral-500">Data terakhir berhasil: {formatDateTime(s.lastSyncedAt)}</p>
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      <span className="font-medium text-green-700 dark:text-green-400">Berhasil</span>
      <p className="text-xs text-neutral-500">{formatDateTime(s.lastSyncedAt)}</p>
    </div>
  );
}

function TokenCell({ s }: { s: SourceView }) {
  if (!s.hasToken) return <span className="text-red-700 dark:text-red-400">Belum diisi</span>;
  const state = s.tokenExpiry;
  return (
    <div className="space-y-0.5">
      <span>Tersimpan</span>
      {state === "expired" && <p className="text-xs font-medium text-red-700 dark:text-red-400">Kedaluwarsa {formatDate(s.tokenExpiresAt)}</p>}
      {state === "soon" && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Segera kedaluwarsa: {formatDate(s.tokenExpiresAt)}</p>}
      {state === "ok" && <p className="text-xs text-neutral-500">Berlaku sampai {formatDate(s.tokenExpiresAt)}</p>}
    </div>
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
          <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-3 py-2">Aplikasi</th>
                  <th className="px-3 py-2">Repo</th>
                  <th className="px-3 py-2">Token</th>
                  <th className="px-3 py-2">Sinkronisasi</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {sources.map((s) => (
                  <tr key={s.id} className="align-top">
                    <td className="px-3 py-3">
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-neutral-500">{PROVIDER_LABEL[s.provider]}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="break-all">{s.repoUrl}</p>
                      <p className="text-xs text-neutral-500">
                        Branch <strong>{s.branch}</strong> · <span className="break-all">{s.filePath}</span>
                      </p>
                    </td>
                    <td className="px-3 py-3"><TokenCell s={s} /></td>
                    <td className="px-3 py-3"><SyncBadge s={s} /></td>
                    <td className="px-3 py-3">
                      {s.isActive ? "Aktif" : <span className="text-neutral-500">Nonaktif</span>}
                    </td>
                    <td className="px-3 py-3"><RowActions id={s.id} name={s.name} isActive={s.isActive} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
