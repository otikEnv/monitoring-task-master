import Link from "next/link";
import { Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { NOTE_KINDS, NOTE_KIND_LABEL } from "@/lib/notes/model";
import { hasNoteFilters, MAX_QUERY, type NoteListParams } from "@/lib/notes/list-params";

/**
 * Filter lewat <form method="get">: diterapkan saat Search ditekan (atau Enter). Mengubah filter selalu kembali ke
 * halaman 1 (halaman tidak ikut dikirim). Tanpa JavaScript klien.
 */
export function NoteFilter({ params, apps }: { params: NoteListParams; apps: { id: string; name: string }[] }) {
  // Aplikasi yang dipilih tetap tampil walau sudah terarsip (mis. dari tautan lama).
  const options = params.app && !apps.some((a) => a.id === params.app) ? [{ id: params.app, name: "(archived application)" }, ...apps] : apps;
  return (
    <form method="get" action="/notes" role="search" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="space-y-1.5">
        <Label htmlFor="f-q" className="text-xs text-muted-foreground">Search</Label>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="f-q" name="q" type="search" defaultValue={params.q} maxLength={MAX_QUERY} placeholder="Title or content" className="pl-8" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="f-type" className="text-xs text-muted-foreground">Type</Label>
          <NativeSelect id="f-type" name="type" defaultValue={params.type ?? ""} className="w-full">
            <option value="">All types</option>
            {NOTE_KINDS.map((k) => <option key={k} value={k}>{NOTE_KIND_LABEL[k]}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-app" className="text-xs text-muted-foreground">Application</Label>
          <NativeSelect id="f-app" name="app" defaultValue={params.app ?? ""} className="w-full">
            <option value="">All applications</option>
            {options.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-from" className="text-xs text-muted-foreground">From</Label>
          <Input id="f-from" name="from" type="date" defaultValue={params.from ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-to" className="text-xs text-muted-foreground">To</Label>
          <Input id="f-to" name="to" type="date" defaultValue={params.to ?? ""} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm">Search</Button>
        {hasNoteFilters(params) && <Link href="/notes" className={buttonVariants({ variant: "ghost", size: "sm" })}>Reset</Link>}
      </div>
    </form>
  );
}
