"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { removeSource, setActive } from "./actions";

export function RowActions({ id, name, isActive }: { id: string; name: string; isActive: boolean }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) toast.success(success);
      else setError(res.error ?? "Gagal.");
      setConfirming(false);
    });

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5">
        <Link href={`/pengaturan/sumber/${id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Ubah
        </Link>
        <Button
          type="button" variant="outline" size="sm" disabled={pending}
          onClick={() =>
            run(() => setActive(id, !isActive), isActive ? `${name} dinonaktifkan.` : `${name} diaktifkan.`)
          }
        >
          {isActive ? "Nonaktifkan" : "Aktifkan"}
        </Button>
        <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={() => setConfirming(true)}>
          Hapus
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      <AlertDialog open={confirming} onOpenChange={(o) => !pending && setConfirming(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua task dan riwayat tren aplikasi ini ikut terhapus dan tidak bisa dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <Button
              type="button" variant="destructive" disabled={pending}
              onClick={() => run(() => removeSource(id), `${name} dihapus.`)}
            >
              {pending ? "Menghapus…" : "Ya, hapus"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
