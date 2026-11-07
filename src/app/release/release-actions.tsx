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

/** Tombol admin pada detail release: Edit, Mark as released (or undo), Delete with confirmation. */
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
        setError(res.error ?? "Failed.");
      }
      setConfirming(false);
    });

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5">
        <Link href={`/release/${id}/ubah`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Edit
        </Link>
        <Button
          type="button" variant="outline" size="sm" disabled={pending}
          onClick={() =>
            run(
              () => markReleased(id, !released),
              released ? `${name} is no longer marked as released.` : `${name} marked as released.`,
              () => router.refresh(),
            )
          }
        >
          {released ? "Unmark as released" : "Mark as released"}
        </Button>
        <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={() => setConfirming(true)}>
          Delete
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      <AlertDialog open={confirming} onOpenChange={(o) => !pending && setConfirming(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete release {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Only this release record is deleted. Tasks in the repo and on the dashboard are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              type="button" variant="destructive" disabled={pending}
              onClick={() => run(() => removeRelease(id), `Release ${name} deleted.`, () => router.push("/release"))}
            >
              {pending ? "Deleting…" : "Yes, delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
