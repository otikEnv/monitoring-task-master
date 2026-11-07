"use client";

import Link from "next/link";
import { useRef } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { DEFAULT_RANGE, RANGES, RANGE_LABEL, trendHref, type TrendParams } from "@/lib/trend/series";

/**
 * Satu baris filter di atas semua grafik (tidak per grafik): rentang waktu dan aplikasi.
 * Rentang berupa tautan (bekerja tanpa JavaScript); aplikasi berupa <form method="get"> yang otomatis dikirim
 * saat pilihan berubah dan tetap berfungsi tanpa JavaScript lewat tombol Terapkan.
 */
export function TrendControls({
  params, sources,
}: { params: TrendParams; sources: { id: string; name: string; isActive: boolean }[] }) {
  const form = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border bg-card p-4">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Time range</p>
        <div role="group" aria-label="Time range" className="inline-flex gap-1 rounded-lg bg-muted p-1">
          {RANGES.map((r) => {
            const on = params.range === r;
            return (
              <Link
                key={r}
                href={trendHref(params, { range: r })}
                aria-current={on ? "true" : undefined}
                className={cn(
                  buttonVariants({ variant: on ? "default" : "ghost", size: "sm" }),
                  !on && "hover:bg-background",
                )}
              >
                {RANGE_LABEL[r]}
              </Link>
            );
          })}
        </div>
      </div>

      <form ref={form} method="get" action="/tren" onChange={() => form.current?.requestSubmit()} className="flex items-end gap-2">
        {params.range !== DEFAULT_RANGE && <input type="hidden" name="range" value={params.range} />}
        <div className="space-y-1.5">
          <Label htmlFor="trend-source" className="text-xs text-muted-foreground">Application</Label>
          <NativeSelect id="trend-source" name="source" defaultValue={params.source ?? ""} className="min-w-56">
            <option value="">All applications (combined)</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isActive ? "" : " (inactive)"}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">Apply</Button>
      </form>
    </div>
  );
}
