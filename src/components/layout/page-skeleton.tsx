import { Skeleton } from "@/components/ui/skeleton";

/** Fallback Suspense: judul + blok konten (sidebar menyusul setelah sesi terbaca). */
export function PageSkeleton({ cards = 0 }: { cards?: number }) {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {cards > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: cards }, (_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
        </div>
      ) : (
        <Skeleton className="h-72 rounded-xl" />
      )}
    </div>
  );
}
