import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { hrefFor, pageWindow, type TaskListParams } from "@/lib/tasks/list-params";

const idle = buttonVariants({ variant: "outline", size: "sm" });
const current = buttonVariants({ variant: "default", size: "sm" });
const disabled = `${buttonVariants({ variant: "outline", size: "sm" })} pointer-events-none opacity-50`;

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
          <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted-foreground">…</span>
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
