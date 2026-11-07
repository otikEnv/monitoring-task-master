"use client";

import Link from "next/link";
import { useRef } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { STATUS_LABEL, STATUS_RAW } from "@/lib/status";
import { PRIORITY_LABEL } from "@/lib/status";
import { hasActiveFilters, type TaskListParams } from "@/lib/tasks/list-params";

const STATUS_OPTIONS = [
  ...(Object.entries(STATUS_RAW) as Array<[keyof typeof STATUS_RAW, string]>).map(([key, raw]) => ({
    value: raw,
    label: STATUS_LABEL[key],
  })),
  { value: "other", label: STATUS_LABEL.other },
];

/**
 * Filter lewat <form method="get">: bekerja tanpa JavaScript (tombol Terapkan) dan otomatis
 * diterapkan saat pilihan berubah. Mengubah filter selalu kembali ke halaman 1 (halaman tidak
 * ikut dikirim); urutan dipertahankan lewat input tersembunyi.
 */
export function FilterBar({
  params, sources, tags,
}: {
  params: TaskListParams;
  sources: { id: string; name: string }[];
  tags: string[];
}) {
  const form = useRef<HTMLFormElement>(null);

  function onChange(e: React.FormEvent<HTMLFormElement>) {
    const f = form.current;
    if (!f) return;
    // Tag yang dipilih untuk aplikasi lain belum tentu ada di aplikasi baru: kosongkan.
    if ((e.target as HTMLSelectElement).name === "source") {
      const tag = f.elements.namedItem("tag") as HTMLSelectElement | null;
      if (tag) tag.value = "";
    }
    f.requestSubmit();
  }

  // Tag yang dipilih tetap tampil walau tidak ada di daftar (mis. dari URL lama), supaya tidak diam-diam hilang.
  const tagOptions = params.tag && !tags.includes(params.tag) ? [params.tag, ...tags] : tags;

  return (
    <form ref={form} method="get" action="/tasks" onChange={onChange} className="space-y-3 rounded-xl border bg-card p-4">
      {(params.sort !== "app" || params.dir !== "asc") && (
        <>
          <input type="hidden" name="sort" value={params.sort} />
          <input type="hidden" name="dir" value={params.dir} />
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="f-source" className="text-xs text-muted-foreground">Application</Label>
          <NativeSelect id="f-source" name="source" defaultValue={params.source ?? ""} className="w-full">
            <option value="">All applications</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-tag" className="text-xs text-muted-foreground">Tag</Label>
          <NativeSelect id="f-tag" name="tag" defaultValue={params.tag ?? ""} className="w-full">
            <option value="">All tags</option>
            {tagOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-status" className="text-xs text-muted-foreground">Status</Label>
          <NativeSelect id="f-status" name="status" defaultValue={params.status ?? ""} className="w-full">
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-priority" className="text-xs text-muted-foreground">Priority</Label>
          <NativeSelect id="f-priority" name="priority" defaultValue={params.priority ?? ""} className="w-full">
            <option value="">All priorities</option>
            {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" size="sm">Apply</Button>
        {hasActiveFilters(params) && (
          <Link href="/tasks" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Clear all filters
          </Link>
        )}
      </div>
    </form>
  );
}
