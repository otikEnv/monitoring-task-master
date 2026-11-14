import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { hrefFor, pageWindow, type TaskListParams } from "@/lib/tasks/list-params";

const idle = buttonVariants({ variant: "outline", size: "sm" });
const current = buttonVariants({ variant: "default", size: "sm" });
const disabled = `${buttonVariants({ variant: "outline", size: "sm" })} pointer-events-none opacity-50`;

/**
 * Nomor halaman bertanda ‹ Previous / Next ›. Tautan dibentuk dari `params` (Daftar task) atau dari fungsi
 * `href` (halaman lain, mis. Archive).
 */
export function Pagination({
  params, page, pageCount, href,
}: { params?: TaskListParams; page: number; pageCount: number; href?: (page: number) => string }) {
  if (pageCount <= 1) return null;
  const to = (n: number) => (href ? href(n) : hrefFor(params!, { page: n }));

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1.5">
      {page > 1 ? (
        <Link href={to(page - 1)} rel="prev" className={idle}>‹ Previous</Link>
      ) : (
        <span aria-disabled="true" className={disabled}>‹ Previous</span>
      )}

      {pageWindow(page, pageCount).map((n, i) =>
        n === "gap" ? (
          <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted-foreground">…</span>
        ) : n === page ? (
          <span key={n} aria-current="page" className={current}>{n}</span>
        ) : (
          <Link key={n} href={to(n)} className={idle}>{n}</Link>
        ),
      )}

      {page < pageCount ? (
        <Link href={to(page + 1)} rel="next" className={idle}>Next ›</Link>
      ) : (
        <span aria-disabled="true" className={disabled}>Next ›</span>
      )}
    </nav>
  );
}
