"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { removeSource, setActive } from "./actions";

const btn = "rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-900";

export function RowActions({ id, name, isActive }: { id: string; name: string; isActive: boolean }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Gagal.");
      setConfirming(false);
    });

  if (confirming) {
    return (
      <div className="space-y-2">
        <p className="max-w-56 text-xs text-red-700 dark:text-red-400">
          Hapus <strong>{name}</strong>? Semua task dan riwayat tren aplikasi ini ikut terhapus dan tidak bisa dikembalikan.
        </p>
        <div className="flex gap-2">
          <button
            type="button" disabled={pending}
            onClick={() => run(() => removeSource(id))}
            className="rounded-md bg-red-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-60"
          >
            {pending ? "Menghapus…" : "Ya, hapus"}
          </button>
          <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={btn}>Batal</button>
        </div>
        {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <Link href={`/pengaturan/sumber/${id}`} className={btn}>Ubah</Link>
        <button type="button" disabled={pending} onClick={() => run(() => setActive(id, !isActive))} className={btn}>
          {isActive ? "Nonaktifkan" : "Aktifkan"}
        </button>
        <button type="button" disabled={pending} onClick={() => setConfirming(true)} className={btn}>Hapus</button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
