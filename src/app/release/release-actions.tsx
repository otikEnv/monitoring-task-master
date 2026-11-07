"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { markReleased, removeRelease } from "./actions";

/** Tombol admin pada detail release: Ubah, Tandai rilis (atau batalkan), Hapus dengan konfirmasi. */
export function ReleaseActions({ id, name, released }: { id: string; name: string; released: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) {
        toast.success(success);
        after?.();
      } else {
        setError(res.error ?? "Gagal.");
      }
      setConfirming(false);
    });

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5">
        <Link href={`/release/${id}/ubah`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Ubah
        </Link>
        <Button
          type="button" variant="outline" size="sm" disabled={pending}
          onClick={() =>
            run(
              () => markReleased(id, !released),
              released ? `Tanda rilis ${name} dibatalkan.` : `${name} ditandai sudah rilis.`,
              () => router.refresh(),
            )
          }
        >
          {released ? "Batalkan tanda rilis" : "Tandai rilis"}
        </Button>
        <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={() => setConfirming(true)}>
          Hapus
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      <AlertDialog open={confirming} onOpenChange={(o) => !pending && setConfirming(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus release {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Hanya catatan release ini yang dihapus. Task di repo dan di dashboard tidak terpengaruh.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <Button
              type="button" variant="destructive" disabled={pending}
              onClick={() => run(() => removeRelease(id), `Release ${name} dihapus.`, () => router.push("/release"))}
            >
              {pending ? "Menghapus…" : "Ya, hapus"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
