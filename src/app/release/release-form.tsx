"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { parseRangeNumber, type ReleaseFieldErrors } from "@/lib/releases/validate";
import { previewRange, saveRelease, type PreviewResult } from "./actions";

export type FormInitial = {
  id?: string;
  sourceId: string;
  tag: string;
  name: string;
  rangeStart: string;
  rangeEnd: string;
  /** yyyy-mm-dd; kosong = hari ini */
  startDate: string;
  targetDate: string;
};

export type SourceChoice = { id: string; name: string; tags: string[] };

function Field({
  label, htmlFor, error, hint, children,
}: { label: string; htmlFor: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function ReleaseForm({ initial, sources }: { initial: FormInitial; sources: SourceChoice[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const editing = Boolean(initial.id);
  const [sourceId, setSourceId] = useState(initial.sourceId);
  const [tag, setTag] = useState(initial.tag);
  const [rangeStart, setRangeStart] = useState(initial.rangeStart);
  const [rangeEnd, setRangeEnd] = useState(initial.rangeEnd);
  const [errors, setErrors] = useState<ReleaseFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [preview, setPreview] = useState<{ key: string; result: PreviewResult } | null>(null);

  const source = sources.find((s) => s.id === sourceId);
  // Tag lama tetap tampil saat mengubah release walau sudah tidak ada pada data terakhir.
  const tagOptions = source ? (initial.tag && !source.tags.includes(initial.tag) && sourceId === initial.sourceId ? [initial.tag, ...source.tags] : source.tags) : [];

  function onSourceChange(id: string) {
    setSourceId(id);
    const next = sources.find((s) => s.id === id);
    // Tag aplikasi sebelumnya belum tentu ada di aplikasi baru; terisi otomatis bila hanya satu tag.
    setTag(next && next.tags.length === 1 ? next.tags[0] : "");
  }

  // Pratinjau jumlah task. Hasil disimpan bersama kuncinya, sehingga hasil usang tidak ditampilkan
  // saat isian berubah dan tidak perlu mengosongkan state di dalam effect.
  const start = parseRangeNumber(rangeStart);
  const end = parseRangeNumber(rangeEnd);
  const previewKey = sourceId && tag && start !== null && end !== null && start <= end ? `${sourceId}|${tag}|${start}|${end}` : null;
  useEffect(() => {
    if (!previewKey) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await previewRange(sourceId, tag, rangeStart, rangeEnd);
      if (!cancelled) setPreview({ key: previewKey, result: res });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [previewKey, sourceId, tag, rangeStart, rangeEnd]);
  const shown = preview && preview.key === previewKey ? preview.result : null;

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    const fd = new FormData(formRef.current!);
    startSave(async () => {
      const res = await saveRelease(fd); // sukses = redirect, tidak kembali ke sini
      if (res && !res.ok) {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.error ?? null);
      }
    });
  }

  return (
    <Card>
      <CardContent>
        <form ref={formRef} onSubmit={onSave} className="space-y-5">
          {initial.id && <input type="hidden" name="id" value={initial.id} />}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Application" htmlFor="sourceId" error={errors.sourceId}>
              <NativeSelect
                id="sourceId" name="sourceId" value={sourceId} required className="w-full"
                onChange={(e) => onSourceChange(e.target.value)}
              >
                <option value="">Select an application</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              label="Tag" htmlFor="tag" error={errors.tag}
              hint={source && source.tags.length === 0 ? "This application has no tasks yet. Refresh it on the Dashboard first." : "Task numbers are only unique within one tag."}
            >
              <NativeSelect id="tag" name="tag" value={tag} required className="w-full" onChange={(e) => setTag(e.target.value)}>
                <option value="">{source ? "Select a tag" : "Select an application first"}</option>
                {tagOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <Field label="Release name/version" htmlFor="name" error={errors.name}>
            <Input id="name" name="name" defaultValue={initial.name} required maxLength={100} placeholder="e.g. v2.1" />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Start task" htmlFor="rangeStart" error={errors.rangeStart}>
              <Input
                id="rangeStart" name="rangeStart" inputMode="numeric" required placeholder="100"
                value={rangeStart} onChange={(e) => setRangeStart(e.target.value)}
              />
            </Field>
            <Field label="End task" htmlFor="rangeEnd" error={errors.rangeEnd} hint="The start and end tasks are included.">
              <Input
                id="rangeEnd" name="rangeEnd" inputMode="numeric" required placeholder="200"
                value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)}
              />
            </Field>
          </div>

          {shown && (
            shown.ok ? (
              shown.count > 0 ? (
                <p role="status" className="rounded-md bg-muted p-3 text-sm">
                  This range contains <strong>{shown.count} tasks</strong> (existing IDs: #{shown.firstId}–#{shown.lastId}).
                </p>
              ) : (
                <Alert role="status">
                  <TriangleAlert aria-hidden="true" />
                  <AlertDescription>
                    There are no tasks in this range yet. You can still save the release; tasks that appear later are counted automatically.
                  </AlertDescription>
                </Alert>
              )
            ) : (
              <p role="status" className="text-sm text-muted-foreground">{shown.error}</p>
            )
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Start date (optional)" htmlFor="startDate" error={errors.startDate}
              hint="If empty, the date the release is created is used. Fill it in if work started earlier."
            >
              <Input id="startDate" name="startDate" type="date" defaultValue={initial.startDate} />
            </Field>
            <Field label="Target date" htmlFor="targetDate" error={errors.targetDate}>
              <Input id="targetDate" name="targetDate" type="date" defaultValue={initial.targetDate} required />
            </Field>
          </div>

          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Save release"}</Button>
            <Link
              href={initial.id ? `/release/${initial.id}` : "/release"}
              className={buttonVariants({ variant: "ghost" })}
            >
              Cancel
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
