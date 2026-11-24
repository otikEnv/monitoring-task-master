"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SHOW_KINDS, SHOW_LABEL, calendarHref, type CalendarParams, type ShowKind } from "@/lib/calendar/model";
import { NOTE_KINDS, NOTE_KIND_LABEL, type NoteKind } from "@/lib/notes/model";
import { cn } from "@/lib/utils";

/**
 * Filter Calendar: jenis item (Show), aplikasi, dan jenis catatan. Mengubah pilihan belum menyaring apa pun;
 * semuanya baru diterapkan (ke URL) saat Apply ditekan.
 */
export function CalendarFilter({ params, apps }: { params: CalendarParams; apps: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [show, setShow] = useState<ShowKind[]>(params.show);
  const [app, setApp] = useState(params.app ?? "");
  const [type, setType] = useState<NoteKind | "">(params.type ?? "");

  const appOptions = params.app && !apps.some((a) => a.id === params.app) ? [{ id: params.app, name: "(archived application)" }, ...apps] : apps;
  const changed =
    show.join(",") !== params.show.join(",") || app !== (params.app ?? "") || type !== (params.type ?? "");

  const toggle = (k: ShowKind) =>
    setShow((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : SHOW_KINDS.filter((x) => x === k || cur.includes(x))));

  function apply(e: React.FormEvent) {
    e.preventDefault();
    start(() => router.push(calendarHref(params, { show, app: app || null, type: type || null, date: null })));
  }

  return (
    <form onSubmit={apply} className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-xl border bg-card p-3">
      <fieldset className="space-y-1.5">
        <legend className="text-xs text-muted-foreground">Show</legend>
        <div className="flex flex-wrap gap-1.5">
          {SHOW_KINDS.map((k) => {
            const on = show.includes(k);
            return (
              <button
                key={k} type="button" aria-pressed={on} onClick={() => toggle(k)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {SHOW_LABEL[k]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="c-app" className="text-xs text-muted-foreground">Application</Label>
          <NativeSelect id="c-app" value={app} onChange={(e) => setApp(e.target.value)}>
            <option value="">All applications</option>
            {appOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-type" className="text-xs text-muted-foreground">Note type</Label>
          <NativeSelect id="c-type" value={type} onChange={(e) => setType(e.target.value as NoteKind | "")}>
            <option value="">All types</option>
            {NOTE_KINDS.map((k) => <option key={k} value={k}>{NOTE_KIND_LABEL[k]}</option>)}
          </NativeSelect>
        </div>
        <Button type="submit" size="sm" variant={changed ? "default" : "outline"} disabled={pending}>
          {pending ? "Applying…" : "Apply"}
        </Button>
        {changed && !pending && <span role="status" className="pb-1 text-xs text-muted-foreground">Not applied yet</span>}
      </div>
    </form>
  );
}
