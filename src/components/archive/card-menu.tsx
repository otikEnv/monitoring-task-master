"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  archiveRelease, archiveSource, restoreRelease, restoreSource, sourceArchiveImpact, type ArchiveResult,
} from "@/app/archive/actions";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type ArchiveKind = "application" | "release";

/**
 * Menu tiga titik pada kartu aplikasi (Dashboard) dan kartu release: Details untuk semua pengguna, Archive
 * hanya untuk admin. Tombol harus berada di atas tautan "membentang" milik kartu (relative z-10).
 */
export function CardMenu({
  kind, id, name, detailsHref, canArchive,
}: { kind: ArchiveKind; id: string; name: string; detailsHref: string; canArchive: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Jumlah release berjalan yang masih memakai aplikasi (hanya untuk dialog aplikasi); null = belum diketahui.
  const [openReleases, setOpenReleases] = useState<number | null>(null);

  const archive = kind === "application" ? archiveSource : archiveRelease;
  const restore = kind === "application" ? restoreSource : restoreRelease;

  function openDialog() {
    setError(null);
    setOpenReleases(null);
    setConfirming(true);
    if (kind === "application") {
      void sourceArchiveImpact(id).then((r) => setOpenReleases(r.ok ? r.openReleases : null));
    }
  }

  function undo() {
    void restore(id).then((r: ArchiveResult) => {
      if (r.ok) {
        toast.success(`Restored ${name}.`);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function confirm() {
    start(async () => {
      setError(null);
      const res = await archive(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirming(false);
      toast.success(`Archived ${name}.`, { action: { label: "Undo", onClick: undo } });
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button" variant="ghost" size="icon-sm" className="relative z-10 -mr-1 -mt-1 shrink-0"
              aria-label={`Actions for ${name}`}
            />
          }
        >
          <MoreVertical aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href={detailsHref} />}>Details</DropdownMenuItem>
          {canArchive && <DropdownMenuItem onClick={openDialog}>Archive</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>

      {canArchive && (
        <AlertDialog open={confirming} onOpenChange={(o) => !pending && setConfirming(o)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive {kind === "application" ? "application" : "release"} {name}?</AlertDialogTitle>
              <AlertDialogDescription>
                {kind === "application" ? (
                  <>
                    It will be hidden from the Dashboard, Task list, and Trend. Its data is kept and syncing continues
                    (use Deactivate in Source settings to stop syncing). You can restore it from the Archive page.
                  </>
                ) : (
                  <>
                    It will be hidden from the Release list and the Dashboard. Its components and tasks are not changed.
                    You can restore it from the Archive page.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {kind === "application" && openReleases !== null && openReleases > 0 && (
              <p role="status" className="text-sm">
                {openReleases} running {openReleases === 1 ? "release still uses" : "releases still use"} this application.
                {" "}{openReleases === 1 ? "It keeps" : "They keep"} running and counting its tasks.
              </p>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <Button type="button" disabled={pending} onClick={confirm}>
                {pending ? "Archiving…" : "Archive"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
