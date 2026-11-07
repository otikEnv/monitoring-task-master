import { RowActions } from "@/app/pengaturan/sumber/row-actions";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";
import type { SourceView } from "@/lib/sources/repo";

const PROVIDER_LABEL = { github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket" } as const;

function SyncBadge({ s }: { s: SourceView }) {
  if (s.lastSyncStatus === "never") return <span className="text-muted-foreground">Never</span>;
  if (s.lastSyncStatus === "failed") {
    return (
      <div className="space-y-0.5 whitespace-normal">
        <span className="font-medium text-red-700 dark:text-red-400">Failed</span>
        {s.lastError && <p className="max-w-64 text-xs text-red-700 dark:text-red-400">{s.lastError}</p>}
        <p className="text-xs text-muted-foreground">Last successful data: {formatDateTime(s.lastSyncedAt)}</p>
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      <span className="font-medium text-green-700 dark:text-green-400">Succeeded</span>
      <p className="text-xs text-muted-foreground">{formatDateTime(s.lastSyncedAt)}</p>
    </div>
  );
}

function TokenCell({ s }: { s: SourceView }) {
  if (!s.hasToken) return <span className="text-red-700 dark:text-red-400">Not set</span>;
  const state = s.tokenExpiry;
  return (
    <div className="space-y-0.5">
      <span>Stored</span>
      {state === "expired" && <p className="text-xs font-medium text-red-700 dark:text-red-400">Expired {formatDate(s.tokenExpiresAt)}</p>}
      {state === "soon" && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Expires soon: {formatDate(s.tokenExpiresAt)}</p>}
      {state === "ok" && <p className="text-xs text-muted-foreground">Valid until {formatDate(s.tokenExpiresAt)}</p>}
    </div>
  );
}

/** Tabel sumber untuk halaman Pengaturan sumber. Presentasional; aksi lewat RowActions. */
export function SourcesTable({ sources }: { sources: SourceView[] }) {
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Application</TableHead>
            <TableHead>Repo</TableHead>
            <TableHead>Token</TableHead>
            <TableHead>Sync</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.map((s) => (
            <TableRow key={s.id} className="align-top">
              <TableCell className="whitespace-normal">
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">{PROVIDER_LABEL[s.provider]}</p>
              </TableCell>
              <TableCell className="whitespace-normal">
                <p className="break-all">{s.repoUrl}</p>
                <p className="text-xs text-muted-foreground">
                  Branch <strong>{s.branch}</strong> · <span className="break-all">{s.filePath}</span>
                </p>
                {/* Mengungkap repo yang belum di-commit atau di-push: file lama berarti dashboard ikut lama. */}
                {s.lastCommitAt && (
                  <p className="text-xs text-muted-foreground">File changed: {formatDateTime(s.lastCommitAt)}</p>
                )}
              </TableCell>
              <TableCell><TokenCell s={s} /></TableCell>
              <TableCell><SyncBadge s={s} /></TableCell>
              <TableCell>
                {s.isActive ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
              </TableCell>
              <TableCell><RowActions id={s.id} name={s.name} isActive={s.isActive} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
