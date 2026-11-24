"use client";

import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { removeHolidayAction, saveHolidayAction } from "@/app/notes/holidays/actions";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { HOLIDAY_KINDS, HOLIDAY_KIND_LABEL, LIMITS, type HolidayKind } from "@/lib/notes/model";
import type { HolidayFieldErrors } from "@/lib/notes/validate";
import { formatYmd } from "@/lib/releases/format";

export type HolidayRow = { id: string; date: string; name: string; kind: HolidayKind };

/** Form tambah/ubah satu libur. `initial` kosong = tambah. */
function HolidayForm({
  initial, year, onDone, onCancel,
}: { initial?: HolidayRow; year: number; onDone: () => void; onCancel?: () => void }) {
  const ref = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<HolidayFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const p = initial?.id ?? "new";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData(ref.current!);
    start(async () => {
      setErrors({});
      setError(null);
      const res = await saveHolidayAction(fd);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setError(res.error ?? null);
        return;
      }
      toast.success(initial ? "Holiday updated." : "Holiday added.");
      if (!initial) ref.current?.reset();
      onDone();
    });
  }

  return (
    <form ref={ref} onSubmit={submit} className="grid gap-3 sm:grid-cols-[10rem_1fr_12rem_auto] sm:items-end" noValidate>
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div className="space-y-1.5">
        <Label htmlFor={`h-${p}-date`}>Date</Label>
        <Input id={`h-${p}-date`} name="date" type="date" defaultValue={initial?.date ?? ""} min={`${year}-01-01`} max={`${year}-12-31`} required aria-invalid={errors.date ? true : undefined} />
        {errors.date && <p role="alert" className="text-xs text-destructive">{errors.date}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`h-${p}-name`}>Name</Label>
        <Input id={`h-${p}-name`} name="name" defaultValue={initial?.name ?? ""} maxLength={LIMITS.holidayName} required placeholder="e.g. Eid al-Fitr" aria-invalid={errors.name ? true : undefined} />
        {errors.name && <p role="alert" className="text-xs text-destructive">{errors.name}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`h-${p}-kind`}>Type</Label>
        <NativeSelect id={`h-${p}-kind`} name="kind" defaultValue={initial?.kind ?? "national"} className="w-full">
          {HOLIDAY_KINDS.map((k) => <option key={k} value={k}>{HOLIDAY_KIND_LABEL[k]}</option>)}
        </NativeSelect>
        {errors.kind && <p role="alert" className="text-xs text-destructive">{errors.kind}</p>}
      </div>
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : initial ? "Save" : "Add holiday"}</Button>
        {onCancel && <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>Cancel</Button>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive sm:col-span-4">{error}</p>}
    </form>
  );
}

/** Daftar libur satu tahun dengan tambah, ubah, dan hapus (hanya admin). */
export function HolidayManager({ year, holidays }: { year: number; holidays: HolidayRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<HolidayRow | null>(null);
  const [pending, start] = useTransition();

  function confirmDelete() {
    if (!deleting) return;
    start(async () => {
      const res = await removeHolidayAction(deleting.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Holiday deleted.");
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section aria-labelledby="add-holiday" className="space-y-3 rounded-xl border bg-card p-4">
        <h2 id="add-holiday" className="text-sm font-semibold">Add a holiday</h2>
        <HolidayForm year={year} onDone={() => router.refresh()} />
      </section>

      {holidays.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No holidays for {year} yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {holidays.map((h) => (
            <li key={h.id} className="p-3">
              {editing === h.id ? (
                <HolidayForm
                  initial={h} year={year}
                  onDone={() => { setEditing(null); router.refresh(); }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm"><span className="font-medium tabular-nums">{formatYmd(h.date)}</span> · {h.name}</p>
                    <p className={h.kind === "national" ? "text-xs text-rose-700 dark:text-rose-300" : "text-xs text-muted-foreground"}>
                      {HOLIDAY_KIND_LABEL[h.kind]}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(h.id)} aria-label={`Edit ${h.name} on ${formatYmd(h.date)}`}>
                      <Pencil aria-hidden="true" /> Edit
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(h)} aria-label={`Delete ${h.name} on ${formatYmd(h.date)}`}>
                      <Trash2 aria-hidden="true" /> Delete
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(o) => { if (!o && !pending) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this holiday?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `${formatYmd(deleting.date)} · ${deleting.name}` : ""} is removed from the Calendar, and release working
              days are counted again for that date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={pending} onClick={confirmDelete}>
              {pending ? "Deleting…" : "Delete holiday"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
