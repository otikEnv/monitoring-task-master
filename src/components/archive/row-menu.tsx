"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { restoreRelease, restoreSource } from "@/app/archive/actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ArchiveKind } from "./card-menu";

/**
 * Menu tiga titik pada baris halaman Archive: Details untuk semua pengguna, Restore hanya untuk admin.
 * Restore tidak merusak apa pun, jadi dijalankan langsung tanpa konfirmasi.
 */
export function RowMenu({
  kind, id, name, detailsHref, canRestore,
}: { kind: ArchiveKind; id: string; name: string; detailsHref: string; canRestore: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function restore() {
    start(async () => {
      const res = await (kind === "application" ? restoreSource(id) : restoreRelease(id));
      if (res.ok) {
        toast.success(`Restored ${name}.`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" disabled={pending} aria-label={`Actions for ${name}`} />}
      >
        <MoreVertical aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link href={detailsHref} />}>Details</DropdownMenuItem>
        {canRestore && <DropdownMenuItem onClick={restore}>Restore</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
