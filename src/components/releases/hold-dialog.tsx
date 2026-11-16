"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { putOnHold, resumeHold } from "@/app/release/actions";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_LIMITS, validateHoldReason, validateResumeReason } from "@/lib/releases/validate";

export type HoldMode = "hold" | "resume";

function Body({
  mode, releaseId, releaseName, close,
}: { mode: HoldMode; releaseId: string; releaseName: string; close: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const holding = mode === "hold";
  const max = NOTE_LIMITS[holding ? "hold" : "resume"].max;
  const inputId = `hold-reason-${mode}-${releaseId}`;

  function submit() {
    const check = holding ? validateHoldReason(reason) : validateResumeReason(reason);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    start(async () => {
      setError(null);
      const res = holding ? await putOnHold(releaseId, check.value) : await resumeHold(releaseId, check.value);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(holding ? `${releaseName} is on hold.` : `${releaseName} resumed.`);
      close();
      router.refresh();
    });
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{holding ? `Put release ${releaseName} on hold?` : `Resume release ${releaseName}?`}</AlertDialogTitle>
        <AlertDialogDescription>
          {holding ? (
            <>
              The release stays visible and its target date and progress do not change. The automatic status (such as
              Overdue) is replaced by On hold until you resume it. This is not the same as Archive, which hides the release.
            </>
          ) : (
            <>The automatic status (On track, At risk, Behind, or Overdue) is shown again from today.</>
          )}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor={inputId}>{holding ? "Reason (required)" : "Reason (optional)"}</Label>
        <Textarea
          id={inputId}
          value={reason}
          onChange={(e) => { setReason(e.target.value); setError(null); }}
          disabled={pending}
          rows={3}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          placeholder={holding ? "Why is the release being held? What is it waiting for?" : "What changed?"}
        />
        <p className="text-right text-xs tabular-nums text-muted-foreground">{reason.trim().length}/{max}</p>
        {error && <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        <Button type="button" disabled={pending} onClick={submit}>
          {pending ? (holding ? "Saving…" : "Resuming…") : holding ? "Put on hold" : "Resume"}
        </Button>
      </AlertDialogFooter>
    </>
  );
}

/**
 * Dialog Hold (alasan wajib) atau Resume (alasan opsional) untuk sebuah release. Dipakai halaman detail dan
 * menu kartu. Isinya dipasang hanya saat terbuka sehingga isian selalu mulai kosong.
 */
export function HoldDialog({
  mode, releaseId, releaseName, open, onOpenChange,
}: {
  mode: HoldMode; releaseId: string; releaseName: string; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <Body mode={mode} releaseId={releaseId} releaseName={releaseName} close={() => onOpenChange(false)} />
      </AlertDialogContent>
    </AlertDialog>
  );
}
