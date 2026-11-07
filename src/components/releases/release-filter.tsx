"use client";

import Link from "next/link";
import { useRef } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { ReleaseListParams } from "@/lib/releases/params";

/**
 * Filter lewat <form method="get">: jalan tanpa JavaScript (tombol Terapkan) dan otomatis diterapkan
 * saat pilihan berubah, seperti filter pada Daftar task.
 */
export function ReleaseFilter({
  params, sources,
}: { params: ReleaseListParams; sources: { id: string; name: string }[] }) {
  const form = useRef<HTMLFormElement>(null);
  const active = Boolean(params.source || params.showReleased);

  return (
    <form
      ref={form}
      method="get"
      action="/release"
      onChange={() => form.current?.requestSubmit()}
      className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4"
    >
      <div className="min-w-48 space-y-1.5">
        <Label htmlFor="r-source" className="text-xs text-muted-foreground">Aplikasi</Label>
        <NativeSelect id="r-source" name="source" defaultValue={params.source ?? ""} className="w-full">
          <option value="">Semua aplikasi</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </NativeSelect>
      </div>

      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" name="rilis" value="1" defaultChecked={params.showReleased} className="size-4 accent-primary" />
        Tampilkan yang sudah rilis
      </label>

      <div className="flex items-center gap-2 pb-0.5">
        <Button type="submit" variant="outline" size="sm">Terapkan</Button>
        {active && (
          <Link href="/release" className={buttonVariants({ variant: "ghost", size: "sm" })}>Hapus filter</Link>
        )}
      </div>
    </form>
  );
}
