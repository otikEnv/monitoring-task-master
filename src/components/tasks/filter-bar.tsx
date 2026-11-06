"use client";

import Link from "next/link";
import { useRef } from "react";
import { STATUS_LABEL, STATUS_RAW } from "@/lib/status";
import { PRIORITY_LABEL } from "@/lib/status";
import { hasActiveFilters, type TaskListParams } from "@/lib/tasks/list-params";

const select =
  "w-full rounded-md border border-neutral-300 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-400";

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
    <form ref={form} method="get" action="/tasks" onChange={onChange} className="space-y-3">
      {(params.sort !== "app" || params.dir !== "asc") && (
        <>
          <input type="hidden" name="sort" value={params.sort} />
          <input type="hidden" name="dir" value={params.dir} />
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Aplikasi
          <select name="source" defaultValue={params.source ?? ""} className={select}>
            <option value="">Semua aplikasi</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Tag
          <select name="tag" defaultValue={params.tag ?? ""} className={select}>
            <option value="">Semua tag</option>
            {tagOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Status
          <select name="status" defaultValue={params.status ?? ""} className={select}>
            <option value="">Semua status</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Prioritas
          <select name="priority" defaultValue={params.priority ?? ""} className={select}>
            <option value="">Semua prioritas</option>
            {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Terapkan
        </button>
        {hasActiveFilters(params) && (
          <Link href="/tasks" className="text-sm text-neutral-500 hover:underline">
            Hapus semua filter
          </Link>
        )}
      </div>
    </form>
  );
}
