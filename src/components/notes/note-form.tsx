"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { saveNoteAction } from "@/app/notes/actions";
import { Markdown } from "@/components/markdown";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS, NOTE_KINDS, NOTE_KIND_LABEL, type NoteKind } from "@/lib/notes/model";
import { itemField, type NoteFieldErrors } from "@/lib/notes/validate";
import { LinkPicker, type LinkInitial, type LinkReleaseChoice, type LinkSourceChoice } from "./link-picker";
import { cn } from "@/lib/utils";

export type ItemInitial = {
  /** Item yang sudah tersimpan; kosong = item baru. */
  id: string;
  body: string;
  assigneeId: string;
  dueDate: string;
  done: boolean;
  /** Follow up: item asal yang dibawa. */
  carriedFromId: string;
};

export type NoteFormInitial = {
  id?: string;
  title: string;
  noteDate: string;
  kind: NoteKind;
  body: string;
  followsUpId?: string;
  links: LinkInitial[];
  items: ItemInitial[];
};

export type UserChoice = { id: string; email: string };

type ItemRow = ItemInitial & { key: number };

const EMPTY_ITEM: ItemInitial = { id: "", body: "", assigneeId: "", dueDate: "", done: false, carriedFromId: "" };

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

/**
 * Form catatan (buat, ubah, Follow up). Nomor baris action item naik terus dan tidak dipakai ulang; itu yang dikirim
 * sebagai items[N].… dan dipakai untuk memetakan galat server ke barisnya. Hal yang sama berlaku untuk tautan.
 */
export function NoteForm({
  initial, users, sources, releases, followUpOf,
}: {
  initial: NoteFormInitial;
  users: UserChoice[];
  sources: LinkSourceChoice[];
  releases: LinkReleaseChoice[];
  followUpOf?: { id: string; title: string } | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const editing = Boolean(initial.id);
  const [list, setList] = useState<{ rows: ItemRow[]; next: number }>(() => ({
    rows: initial.items.map((it, i) => ({ ...it, key: i })),
    next: initial.items.length,
  }));
  const [body, setBody] = useState(initial.body);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [errors, setErrors] = useState<NoteFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const patchRow = (key: number, patch: Partial<ItemInitial>) => {
    setList((l) => ({ ...l, rows: l.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
    setErrors((e) => (e.itemRows?.[key] ? { ...e, itemRows: { ...e.itemRows, [key]: {} } } : e));
  };
  const addRow = () =>
    setList((l) => (l.rows.length >= LIMITS.items ? l : { rows: [...l.rows, { ...EMPTY_ITEM, key: l.next }], next: l.next + 1 }));
  const removeRow = (key: number) => setList((l) => ({ ...l, rows: l.rows.filter((r) => r.key !== key) }));

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    const fd = new FormData(formRef.current!);
    startSave(async () => {
      const res = await saveNoteAction(fd); // sukses = redirect, tidak kembali ke sini
      if (res && !res.ok) {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.error ?? (res.fieldErrors ? "Check the highlighted fields." : null));
      }
    });
  }

  const cancelHref = initial.id ? `/notes/${initial.id}` : followUpOf ? `/notes/${followUpOf.id}` : "/notes";
  const bodyLength = body.length;

  return (
    <Card>
      <CardContent>
        <form ref={formRef} onSubmit={onSave} className="space-y-5" noValidate>
          {initial.id && <input type="hidden" name="id" value={initial.id} />}
          {initial.followsUpId && <input type="hidden" name="followsUpId" value={initial.followsUpId} />}

          {followUpOf && (
            <p className="rounded-md bg-muted p-3 text-sm">
              Following up <Link href={`/notes/${followUpOf.id}`} className="font-medium underline">{followUpOf.title}</Link>.
              Its links and unfinished action items are copied below.
            </p>
          )}

          <Field label="Title" htmlFor="title" error={errors.title}>
            <Input
              id="title" name="title" defaultValue={initial.title} required maxLength={LIMITS.title}
              placeholder="e.g. Weekly sync: mobile v2" aria-invalid={errors.title ? true : undefined}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Date" htmlFor="noteDate" error={errors.noteDate}>
              <Input id="noteDate" name="noteDate" type="date" defaultValue={initial.noteDate} required />
            </Field>
            <Field label="Type" htmlFor="kind" error={errors.kind}>
              <NativeSelect id="kind" name="kind" defaultValue={initial.kind} className="w-full">
                {NOTE_KINDS.map((k) => (
                  <option key={k} value={k}>{NOTE_KIND_LABEL[k]}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label htmlFor="body">Content</Label>
              <div role="tablist" aria-label="Content view" className="inline-flex rounded-lg border p-0.5 text-xs">
                {(["write", "preview"] as const).map((t) => (
                  <button
                    key={t} type="button" role="tab" aria-selected={tab === t}
                    className={cn("rounded-md px-2.5 py-1 font-medium", tab === t ? "bg-muted text-foreground" : "text-muted-foreground")}
                    onClick={() => setTab(t)}
                  >
                    {t === "write" ? "Write" : "Preview"}
                  </button>
                ))}
              </div>
            </div>
            {/* Textarea tetap terpasang (tersembunyi saat pratinjau) agar isinya ikut terkirim. */}
            <Textarea
              id="body" name="body" rows={12} value={body} onChange={(e) => setBody(e.target.value)}
              placeholder={"Agenda, discussion, decisions…\n\nMarkdown is supported: **bold**, - lists, [links](https://…)"}
              className={cn("font-mono text-sm", tab === "preview" && "hidden")}
              aria-invalid={errors.body ? true : undefined}
            />
            {tab === "preview" && (
              <div className="min-h-40 space-y-2 rounded-lg border p-3 text-sm">
                {body.trim() ? <Markdown>{body}</Markdown> : <p className="text-muted-foreground">Nothing to preview.</p>}
              </div>
            )}
            <div className="flex justify-between gap-2 text-xs text-muted-foreground">
              <span>Markdown supported. HTML is shown as text.</span>
              <span className={cn("tabular-nums", bodyLength > LIMITS.body && "text-destructive")}>
                {bodyLength.toLocaleString("en")}/{LIMITS.body.toLocaleString("en")}
              </span>
            </div>
            {errors.body && <p role="alert" className="text-xs text-destructive">{errors.body}</p>}
          </div>

          <LinkPicker initial={initial.links} sources={sources} releases={releases} errors={errors.linkItems} />

          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-medium">Action items</h2>
              <p className="text-xs text-muted-foreground">Follow-ups with an optional owner and due date.</p>
            </div>

            {list.rows.length > 0 && (
              <ul className="space-y-3">
                {list.rows.map((row, i) => {
                  const err = errors.itemRows?.[row.key] ?? {};
                  const f = (n: Parameters<typeof itemField>[1]) => itemField(row.key, n);
                  const id = (n: string) => `item${row.key}-${n}`;
                  return (
                    <li key={row.key} role="group" aria-label={`Action item ${i + 1}`} className="space-y-3 rounded-lg border p-3">
                      {row.id && <input type="hidden" name={f("id")} value={row.id} />}
                      {row.carriedFromId && <input type="hidden" name={f("carriedFromId")} value={row.carriedFromId} />}
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox" name={f("done")} checked={row.done} aria-label={`Action item ${i + 1} done`}
                          className="mt-2.5 size-4 shrink-0 accent-primary"
                          onChange={(e) => patchRow(row.key, { done: e.target.checked })}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <Label htmlFor={id("body")} className="sr-only">Action item {i + 1}</Label>
                          <Input
                            id={id("body")} name={f("body")} value={row.body} maxLength={LIMITS.item}
                            placeholder="What needs to happen?" aria-invalid={err.body ? true : undefined}
                            onChange={(e) => patchRow(row.key, { body: e.target.value })}
                          />
                          {err.body && <p role="alert" className="text-xs text-destructive">{err.body}</p>}
                        </div>
                        <Button
                          type="button" variant="ghost" size="icon-sm" className="mt-0.5"
                          aria-label={`Remove action item ${i + 1}`} onClick={() => removeRow(row.key)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                      <div className="grid gap-3 pl-6 sm:grid-cols-2">
                        <Field label="Owner" htmlFor={id("assignee")} error={err.assigneeId}>
                          <NativeSelect
                            id={id("assignee")} name={f("assigneeId")} value={row.assigneeId} className="w-full"
                            onChange={(e) => patchRow(row.key, { assigneeId: e.target.value })}
                          >
                            <option value="">No owner</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>{u.email}</option>
                            ))}
                          </NativeSelect>
                        </Field>
                        <Field label="Due date" htmlFor={id("due")} error={err.dueDate}>
                          <Input
                            id={id("due")} name={f("dueDate")} type="date" value={row.dueDate}
                            onChange={(e) => patchRow(row.key, { dueDate: e.target.value })}
                          />
                        </Field>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {errors.items && <p role="alert" className="text-xs text-destructive">{errors.items}</p>}
            <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={list.rows.length >= LIMITS.items}>
              <Plus aria-hidden="true" /> Add action item
            </Button>
          </div>

          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Save note"}
            </Button>
            <Link href={cancelHref} className={buttonVariants({ variant: "ghost" })}>Cancel</Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
