import Link from "next/link";
import { hrefFor, pageWindow, type TaskListParams } from "@/lib/tasks/list-params";

const base = "rounded-md border px-3 py-1 text-sm";
const idle = `${base} border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900`;
const current = `${base} border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900`;
const disabled = `${base} border-neutral-200 text-neutral-400 dark:border-neutral-800`;

export function Pagination({
  params, page, pageCount,
}: { params: TaskListParams; page: number; pageCount: number }) {
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="Halaman" className="flex flex-wrap items-center gap-1.5">
      {page > 1 ? (
        <Link href={hrefFor(params, { page: page - 1 })} rel="prev" className={idle}>‹ Sebelumnya</Link>
      ) : (
        <span aria-disabled="true" className={disabled}>‹ Sebelumnya</span>
      )}

      {pageWindow(page, pageCount).map((n, i) =>
        n === "gap" ? (
          <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-neutral-400">…</span>
        ) : n === page ? (
          <span key={n} aria-current="page" className={current}>{n}</span>
        ) : (
          <Link key={n} href={hrefFor(params, { page: n })} className={idle}>{n}</Link>
        ),
      )}

      {page < pageCount ? (
        <Link href={hrefFor(params, { page: page + 1 })} rel="next" className={idle}>Berikutnya ›</Link>
      ) : (
        <span aria-disabled="true" className={disabled}>Berikutnya ›</span>
      )}
    </nav>
  );
}
