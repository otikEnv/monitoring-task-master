"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  componentField, MAX_COMPONENTS, parseRangeNumber, type ComponentFieldErrors, type ReleaseFieldErrors,
} from "@/lib/releases/validate";
import { previewRange, saveRelease, type PreviewResult } from "./actions";

export type ComponentInitial = {
  sourceId: string;
  tag: string;
  rangeStart: string;
  rangeEnd: string;
};

export type FormInitial = {
  id?: string;
  name: string;
  /** yyyy-mm-dd; kosong = hari ini */
  startDate: string;
  targetDate: string;
  /** Minimal satu baris; daftar kosong diperlakukan sebagai satu baris kosong. */
  components: ComponentInitial[];
};

export type SourceChoice = { id: string; name: string; tags: string[] };

type Row = ComponentInitial & { key: number };

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

const EMPTY_ROW: ComponentInitial = { sourceId: "", tag: "", rangeStart: "", rangeEnd: "" };

/** Satu baris komponen: aplikasi, tag, rentang task, dan pratinjau jumlah task. */
function ComponentEditor({
  row, number, sources, savedTag, errors, canRemove, onChange, onRemove,
}: {
  row: Row;
  number: number;
  sources: SourceChoice[];
  /** Tag yang tersimpan; tetap tampil walau sudah tidak ada pada data terakhir. */
  savedTag: { sourceId: string; tag: string } | null;
  errors: ComponentFieldErrors;
  canRemove: boolean;
  onChange: (patch: Partial<ComponentInitial>) => void;
  onRemove: () => void;
}) {
  const f = (name: Parameters<typeof componentField>[1]) => componentField(row.key, name);
  const id = (name: string) => `c${row.key}-${name}`;
  const { sourceId, tag, rangeStart, rangeEnd } = row;
  const [preview, setPreview] = useState<{ key: string; result: PreviewResult } | null>(null);

  const source = sources.find((s) => s.id === sourceId);
  const tagOptions = source
    ? savedTag && savedTag.sourceId === sourceId && !source.tags.includes(savedTag.tag) ? [savedTag.tag, ...source.tags] : source.tags
    : [];

  function onSourceChange(next: string) {
    const s = sources.find((x) => x.id === next);
    // Tag aplikasi sebelumnya belum tentu ada di aplikasi baru; terisi otomatis bila hanya satu tag.
    onChange({ sourceId: next, tag: s && s.tags.length === 1 ? s.tags[0] : "" });
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

  return (
    <div role="group" aria-label={`Component ${number}`} className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Component {number}</p>
        {canRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove component ${number}`}>
            <Trash2 aria-hidden="true" /> Remove
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Application" htmlFor={id("sourceId")} error={errors.sourceId}>
          <NativeSelect
            id={id("sourceId")} name={f("sourceId")} value={sourceId} required className="w-full"
            onChange={(e) => onSourceChange(e.target.value)}
          >
            <option value="">Select an application</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label="Tag" htmlFor={id("tag")} error={errors.tag}
          hint={source && source.tags.length === 0 ? "This application has no tasks yet. Refresh it on the Dashboard first." : "Task numbers are only unique within one tag."}
        >
          <NativeSelect id={id("tag")} name={f("tag")} value={tag} required className="w-full" onChange={(e) => onChange({ tag: e.target.value })}>
            <option value="">{source ? "Select a tag" : "Select an application first"}</option>
            {tagOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start task" htmlFor={id("rangeStart")} error={errors.rangeStart}>
          <Input
            id={id("rangeStart")} name={f("rangeStart")} inputMode="numeric" required placeholder="100"
            value={rangeStart} onChange={(e) => onChange({ rangeStart: e.target.value })}
          />
        </Field>
        <Field label="End task" htmlFor={id("rangeEnd")} error={errors.rangeEnd} hint="The start and end tasks are included.">
          <Input
            id={id("rangeEnd")} name={f("rangeEnd")} inputMode="numeric" required placeholder="200"
            value={rangeEnd} onChange={(e) => onChange({ rangeEnd: e.target.value })}
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
    </div>
  );
}

export function ReleaseForm({ initial, sources }: { initial: FormInitial; sources: SourceChoice[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const editing = Boolean(initial.id);
  // Nomor baris naik terus dan tidak dipakai ulang; itu juga yang dikirim sebagai components[N].… dan
  // dipakai untuk memetakan galat server ke barisnya.
  const [list, setList] = useState<{ rows: Row[]; next: number }>(() => {
    const start = initial.components.length > 0 ? initial.components : [EMPTY_ROW];
    return { rows: start.map((c, i) => ({ ...c, key: i })), next: start.length };
  });
  const rows = list.rows;
  // Tag yang tersimpan per baris awal (untuk tag yang sudah tidak ada pada data terakhir).
  const [saved] = useState(() => new Map(rows.map((r) => [r.key, { sourceId: r.sourceId, tag: r.tag }])));
  const [errors, setErrors] = useState<ReleaseFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const patchRow = (key: number, patch: Partial<ComponentInitial>) => {
    setList((l) => ({ ...l, rows: l.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
    // Galat server pada baris ini sudah tidak berlaku setelah isiannya diubah.
    setErrors((e) => (e.items?.[key] ? { ...e, items: { ...e.items, [key]: {} } } : e));
  };
  const addRow = () =>
    setList((l) => (l.rows.length >= MAX_COMPONENTS ? l : { rows: [...l.rows, { ...EMPTY_ROW, key: l.next }], next: l.next + 1 }));
  const removeRow = (key: number) =>
    setList((l) => (l.rows.length <= 1 ? l : { ...l, rows: l.rows.filter((r) => r.key !== key) }));

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

          <Field label="Release name/version" htmlFor="name" error={errors.name}>
            <Input id="name" name="name" defaultValue={initial.name} required maxLength={100} placeholder="e.g. 2.1" />
          </Field>

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

          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-medium">Components</h2>
              <p className="text-xs text-muted-foreground">
                One component per application and tag, each with its own task range. For example a web and a backend application in the same release.
              </p>
            </div>

            {rows.map((row, i) => (
              <ComponentEditor
                key={row.key}
                row={row}
                number={i + 1}
                sources={sources}
                savedTag={saved.get(row.key) ?? null}
                errors={errors.items?.[row.key] ?? {}}
                canRemove={rows.length > 1}
                onChange={(patch) => patchRow(row.key, patch)}
                onRemove={() => removeRow(row.key)}
              />
            ))}

            {errors.components && <p role="alert" className="text-xs text-destructive">{errors.components}</p>}

            <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={rows.length >= MAX_COMPONENTS}>
              <Plus aria-hidden="true" /> Add component
            </Button>
            {rows.length >= MAX_COMPONENTS && (
              <p className="text-xs text-muted-foreground">A release can have at most {MAX_COMPONENTS} components.</p>
            )}
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
