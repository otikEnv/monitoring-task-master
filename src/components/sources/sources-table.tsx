import { RowActions } from "@/app/pengaturan/sumber/row-actions";
import { formatDate, formatDateTime } from "@/lib/format";
import type { SourceView } from "@/lib/sources/repo";

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

/** Tabel sumber untuk halaman Pengaturan sumber. Presentasional; aksi lewat RowActions. */
export function SourcesTable({ sources }: { sources: SourceView[] }) {
  return (
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
                {/* Mengungkap repo yang belum di-commit atau di-push: file lama berarti dashboard ikut lama. */}
                {s.lastCommitAt && (
                  <p className="text-xs text-neutral-500">File diubah: {formatDateTime(s.lastCommitAt)}</p>
                )}
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
  );
}
