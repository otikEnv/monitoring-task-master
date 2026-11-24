"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { LIMITS, type LinkKind } from "@/lib/notes/model";
import { linkField } from "@/lib/notes/validate";

export type LinkInitial = { kind: LinkKind | ""; sourceId: string; releaseId: string; tag: string; taskId: string };
export type LinkSourceChoice = { id: string; name: string; tags: string[] };
export type LinkReleaseChoice = { id: string; name: string; released: boolean };

type Row = LinkInitial & { key: number };

const NO_ERRORS: Record<number, string> = {};
const EMPTY: LinkInitial ={ kind: "", sourceId: "", releaseId: "", tag: "", taskId: "" };
const KIND_LABEL: Record<LinkKind, string> = { source: "Application", release: "Release", task: "Task" };

/**
 * Tautan catatan ke aplikasi, release, atau task (aplikasi, lalu tag, lalu nomor task). Dirender di dalam form
 * catatan; nomor baris naik terus dan dikirim sebagai links[N].… agar galat server bisa dipetakan ke barisnya.
 */
export function LinkPicker({
  initial, sources, releases, errors = NO_ERRORS,
}: {
  initial: LinkInitial[];
  sources: LinkSourceChoice[];
  releases: LinkReleaseChoice[];
  /** Galat per nomor baris, dari server. */
  errors?: Record<number, string>;
}) {
  const [list, setList] = useState<{ rows: Row[]; next: number }>(() => ({
    rows: initial.map((l, i) => ({ ...l, key: i })),
    next: initial.length,
  }));
  // Baris yang diubah setelah galat server diterima tidak lagi menampilkan galatnya. Penanda ini berlaku untuk
  // satu objek `errors`: galat baru dari server (objek baru) menampilkan semua pesannya lagi.
  const [cleared, setCleared] = useState<{ for: Record<number, string>; keys: Set<number> }>({ for: errors, keys: new Set() });
  const clearedKeys = cleared.for === errors ? cleared.keys : new Set<number>();

  const patch = (key: number, p: Partial<LinkInitial>) => {
    setList((l) => ({ ...l, rows: l.rows.map((r) => (r.key === key ? { ...r, ...p } : r)) }));
    setCleared({ for: errors, keys: new Set(clearedKeys).add(key) });
  };
  const add = () =>
    setList((l) => (l.rows.length >= LIMITS.links ? l : { rows: [...l.rows, { ...EMPTY, key: l.next }], next: l.next + 1 }));
  const remove = (key: number) => setList((l) => ({ ...l, rows: l.rows.filter((r) => r.key !== key) }));

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-medium">Links</h2>
        <p className="text-xs text-muted-foreground">
          Applications, releases, or tasks this note is about. The note then appears under Related notes on those pages.
        </p>
      </div>

      {list.rows.length > 0 && (
        <ul className="space-y-3">
          {list.rows.map((row, i) => {
            const f = (n: Parameters<typeof linkField>[1]) => linkField(row.key, n);
            const id = (n: string) => `link${row.key}-${n}`;
            const source = sources.find((s) => s.id === row.sourceId);
            const tags = source ? (row.tag && !source.tags.includes(row.tag) ? [row.tag, ...source.tags] : source.tags) : [];
            const sourceList = row.sourceId && !source ? [{ id: row.sourceId, name: "(archived or deleted application)", tags: [] }, ...sources] : sources;
            const releaseList = row.releaseId && !releases.some((r) => r.id === row.releaseId)
              ? [{ id: row.releaseId, name: "(archived or deleted release)", released: false }, ...releases]
              : releases;
            const error = clearedKeys.has(row.key) ? undefined : errors[row.key];
            return (
              <li key={row.key} role="group" aria-label={`Link ${i + 1}`} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label htmlFor={id("kind")}>Link to</Label>
                    <NativeSelect
                      id={id("kind")} name={f("kind")} value={row.kind} className="w-full"
                      onChange={(e) => patch(row.key, { ...EMPTY, kind: e.target.value as LinkKind })}
                    >
                      <option value="">Choose…</option>
                      {(Object.keys(KIND_LABEL) as LinkKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </NativeSelect>
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" className="mb-0.5" aria-label={`Remove link ${i + 1}`} onClick={() => remove(row.key)}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>

                {row.kind === "release" && (
                  <div className="space-y-1.5">
                    <Label htmlFor={id("release")}>Release</Label>
                    <NativeSelect
                      id={id("release")} name={f("releaseId")} value={row.releaseId} className="w-full"
                      onChange={(e) => patch(row.key, { releaseId: e.target.value })}
                    >
                      <option value="">Select a release</option>
                      {releaseList.map((r) => <option key={r.id} value={r.id}>{r.name}{r.released ? " (released)" : ""}</option>)}
                    </NativeSelect>
                  </div>
                )}

                {(row.kind === "source" || row.kind === "task") && (
                  <div className={row.kind === "task" ? "grid gap-3 sm:grid-cols-3" : ""}>
                    <div className="space-y-1.5">
                      <Label htmlFor={id("source")}>Application</Label>
                      <NativeSelect
                        id={id("source")} name={f("sourceId")} value={row.sourceId} className="w-full"
                        onChange={(e) => {
                          const s = sources.find((x) => x.id === e.target.value);
                          patch(row.key, { sourceId: e.target.value, tag: s && s.tags.length === 1 ? s.tags[0] : "", taskId: "" });
                        }}
                      >
                        <option value="">Select an application</option>
                        {sourceList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </NativeSelect>
                    </div>
                    {row.kind === "task" && (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor={id("tag")}>Tag</Label>
                          <NativeSelect
                            id={id("tag")} name={f("tag")} value={row.tag} className="w-full"
                            onChange={(e) => patch(row.key, { tag: e.target.value })}
                          >
                            <option value="">{source ? "Select a tag" : "Select an application first"}</option>
                            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
                          </NativeSelect>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={id("task")}>Task number</Label>
                          <Input
                            id={id("task")} name={f("taskId")} value={row.taskId} maxLength={LIMITS.taskId} placeholder="e.g. 12"
                            onChange={(e) => patch(row.key, { taskId: e.target.value })}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <Button type="button" variant="outline" size="sm" onClick={add} disabled={list.rows.length >= LIMITS.links}>
        <Plus aria-hidden="true" /> Add link
      </Button>
    </div>
  );
}
