import Link from "next/link";
import { EmptyState } from "@/components/layout/notices";
import { Pagination } from "@/components/tasks/pagination";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { archiveHref, type ArchiveParams, type ArchiveTab } from "@/lib/archive/params";
import type { ArchivePage, ArchivedReleaseRow, ArchivedSourceRow } from "@/lib/archive/load";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatYmd } from "@/lib/releases/format";
import { RowMenu } from "./row-menu";

const TAB_LABEL: Record<ArchiveTab, string> = { applications: "Applications", releases: "Releases" };

/** Dua tab sebagai tautan (jalan tanpa JavaScript); label memuat jumlah item terarsip. */
function Tabs({ params, counts }: { params: ArchiveParams; counts: Record<ArchiveTab, number> }) {
  return (
    <nav aria-label="Archive sections" className="flex gap-1 border-b">
      {(Object.keys(TAB_LABEL) as ArchiveTab[]).map((tab) => {
        const on = params.tab === tab;
        return (
          <Link
            key={tab}
            href={archiveHref({ tab })}
            aria-current={on ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              on ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {TAB_LABEL[tab]} <span className="tabular-nums text-muted-foreground">({counts[tab]})</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SourceRows({ page, canRestore }: { page: ArchivePage<ArchivedSourceRow>; canRestore: boolean }) {
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">Application</TableHead>
            <TableHead scope="col" className="text-right">Tasks</TableHead>
            <TableHead scope="col" className="hidden sm:table-cell">Last sync</TableHead>
            <TableHead scope="col" className="hidden sm:table-cell">Archived</TableHead>
            <TableHead scope="col" className="w-12"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.rows.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="whitespace-normal">
                <p className="font-medium break-words">{s.name}</p>
                {!s.isActive && <Badge variant="outline" className="mt-1">Inactive</Badge>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{s.taskCount}</TableCell>
              <TableCell className="hidden sm:table-cell">{s.lastSyncedAt ? formatDateTime(s.lastSyncedAt) : "Never synced"}</TableCell>
              <TableCell className="hidden sm:table-cell">{formatDate(s.archivedAt)}</TableCell>
              <TableCell>
                <RowMenu
                  kind="application" id={s.id} name={s.name}
                  detailsHref={`/tasks?source=${encodeURIComponent(s.id)}`} canRestore={canRestore}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ReleaseRows({ page, canRestore }: { page: ArchivePage<ArchivedReleaseRow>; canRestore: boolean }) {
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">Release</TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col" className="hidden sm:table-cell">Target</TableHead>
            <TableHead scope="col" className="text-right">Components</TableHead>
            <TableHead scope="col" className="hidden sm:table-cell">Archived</TableHead>
            <TableHead scope="col" className="w-12"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-normal font-medium break-words">{r.name}</TableCell>
              <TableCell>
                {r.releasedOn ? <Badge variant="secondary">Released {formatYmd(r.releasedOn)}</Badge> : <Badge variant="outline">Not released</Badge>}
              </TableCell>
              <TableCell className="hidden sm:table-cell">{formatYmd(r.targetDate)}</TableCell>
              <TableCell className="text-right tabular-nums">{r.componentCount}</TableCell>
              <TableCell className="hidden sm:table-cell">{formatDate(r.archivedAt)}</TableCell>
              <TableCell>
                <RowMenu kind="release" id={r.id} name={r.name} detailsHref={`/release/${r.id}`} canRestore={canRestore} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Halaman Archive: dua tab (Applications, Releases), berhalaman. Presentasional; menu baris (Details dan
 * Restore) adalah komponen klien terpisah.
 */
export function ArchiveView({
  params, applications, releases, counts, isAdmin,
}: {
  params: ArchiveParams;
  applications: ArchivePage<ArchivedSourceRow> | null;
  releases: ArchivePage<ArchivedReleaseRow> | null;
  counts: Record<ArchiveTab, number>;
  isAdmin: boolean;
}) {
  const current = params.tab === "applications" ? applications : releases;
  const from = current && current.total > 0 ? (current.page - 1) * current.pageSize + 1 : 0;
  const to = current ? Math.min(current.page * current.pageSize, current.total) : 0;

  return (
    <div className="space-y-4">
      <Tabs params={params} counts={counts} />

      {!current || current.total === 0 ? (
        <EmptyState title="Nothing is archived.">
          {params.tab === "applications"
            ? "Archive an application from the menu on its Dashboard card, and it will be listed here."
            : "Archive a release from the menu on its card on the Release page, and it will be listed here."}
          {" "}
          <Link href={params.tab === "applications" ? "/" : "/release"} className={buttonVariants({ variant: "link", size: "sm" })}>
            {params.tab === "applications" ? "Go to the Dashboard" : "Go to Release"}
          </Link>
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Showing {from}–{to} of {current.total} archived {params.tab === "applications" ? "applications" : "releases"}
          </p>
          {params.tab === "applications" && applications && <SourceRows page={applications} canRestore={isAdmin} />}
          {params.tab === "releases" && releases && <ReleaseRows page={releases} canRestore={isAdmin} />}
          <Pagination
            page={current.page}
            pageCount={current.pageCount}
            href={(page) => archiveHref({ tab: params.tab, page })}
          />
        </>
      )}
    </div>
  );
}
