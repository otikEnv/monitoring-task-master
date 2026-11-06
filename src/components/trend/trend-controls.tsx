"use client";

import Link from "next/link";
import { useRef } from "react";
import { DEFAULT_RANGE, RANGES, RANGE_LABEL, trendHref, type TrendParams } from "@/lib/trend/series";

const select =
  "rounded-md border border-neutral-300 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-400";

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
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div>
        <p className="mb-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">Rentang waktu</p>
        <div role="group" aria-label="Rentang waktu" className="inline-flex overflow-hidden rounded-md border border-neutral-300 text-sm dark:border-neutral-700">
          {RANGES.map((r) => {
            const on = params.range === r;
            return (
              <Link
                key={r}
                href={trendHref(params, { range: r })}
                aria-current={on ? "true" : undefined}
                className={`px-3 py-1.5 ${
                  on
                    ? "bg-neutral-900 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "hover:bg-neutral-100 dark:hover:bg-neutral-900"
                } ${r !== RANGES[0] ? "border-l border-neutral-300 dark:border-neutral-700" : ""}`}
              >
                {RANGE_LABEL[r]}
              </Link>
            );
          })}
        </div>
      </div>

      <form ref={form} method="get" action="/tren" onChange={() => form.current?.requestSubmit()} className="flex items-end gap-2">
        {params.range !== DEFAULT_RANGE && <input type="hidden" name="range" value={params.range} />}
        <label className="space-y-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Aplikasi
          <select name="source" defaultValue={params.source ?? ""} className={`${select} block min-w-56`}>
            <option value="">Semua aplikasi (gabungan)</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isActive ? "" : " (nonaktif)"}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">
          Terapkan
        </button>
      </form>
    </div>
  );
}
