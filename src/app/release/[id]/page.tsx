import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadError, Notice } from "@/components/layout/notices";
import { RelatedNotes } from "@/components/notes/note-links";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { ReleaseActivity } from "@/components/releases/release-activity";
import { ReleaseDetailView } from "@/components/releases/release-detail";
import { requireUser } from "@/lib/auth";
import { yearsWithHolidays } from "@/lib/notes/holidays";
import { loadRelatedNotes } from "@/lib/notes/links";
import { yearsInRange } from "@/lib/releases/workdays";
import type { NoteRow } from "@/lib/notes/load";
import { getReleaseOverview, type ReleaseOverview } from "@/lib/releases/load";
import { loadCurrentHold, loadReleaseActivity, type NotesPage } from "@/lib/releases/notes";
import { UUID } from "@/lib/releases/validate";
import { createClient } from "@/lib/supabase/server";
import { ReleaseActions } from "../release-actions";

export const metadata: Metadata = { title: "Release detail" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Nomor halaman Activity dari ?page=; tidak valid = 1 (nilai di luar rentang dipotong oleh pemuat). */
function pageFrom(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && /^[0-9]{1,6}$/.test(v) ? Math.max(1, Number(v)) : 1;
}

// Cache Components aktif: bagian yang membaca sesi, params, dan searchParams harus di dalam Suspense.
export default function ReleaseDetailPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReleaseDetailContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ReleaseDetailContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const user = await requireUser();
  const { id } = await params;
  const page = pageFrom((await searchParams).page);
  if (!UUID.test(id)) notFound();
  const rid = id.toLowerCase();

  let overview: ReleaseOverview | null;
  try {
    overview = await getReleaseOverview(rid);
  } catch (e) {
    console.error("[release] gagal memuat detail", { error: (e as Error)?.name });
    return (
      <AppShell user={user} width="normal">
        <LoadError title="The release detail could not be loaded." />
      </AppShell>
    );
  }
  if (!overview) notFound();

  // Log dan info hold dibaca terpisah: kegagalannya tidak boleh menjatuhkan seluruh halaman.
  const db = await createClient();
  let activity: NotesPage | null = null;
  let heldBy: string | null = null;
  let related: NoteRow[] | null = null;
  try {
    [activity, heldBy] = await Promise.all([
      loadReleaseActivity(db, rid, page),
      overview.stats.heldAt ? loadCurrentHold(db, rid).then((h) => h?.authorEmail ?? null) : Promise.resolve(null),
    ]);
  } catch (e) {
    console.error("[release] gagal memuat log", { error: (e as Error)?.name });
  }
  try {
    related = await loadRelatedNotes(db, { releaseId: rid });
  } catch (e) {
    console.error("[release] gagal memuat catatan terkait", { error: (e as Error)?.name });
  }
  // Hari kerja tanpa data libur hanya melewati akhir pekan: beri tahu bila tahun yang dicakup belum diisi.
  let missingYears: number[] = [];
  if (!overview.release.releasedOn) {
    try {
      const years = yearsInRange(overview.release.startDate, overview.release.targetDate);
      const have = await yearsWithHolidays(db, years);
      missingYears = years.filter((y) => !have.has(y));
    } catch (e) {
      console.error("[release] gagal memeriksa data libur", { error: (e as Error)?.name });
    }
  }

  const isAdmin = user.role === "admin";
  return (
    <AppShell user={user} width="normal">
      {missingYears.length > 0 && (
        <Notice>
          Holidays for {missingYears.join(" and ")} have not been added yet, so working days for this release only skip
          weekends.{isAdmin && <> <Link href={`/notes/holidays?year=${missingYears[0]}`} className="underline">Add them</Link>.</>}
        </Notice>
      )}
      <ReleaseDetailView
        overview={overview}
        heldBy={heldBy}
        activity={<ReleaseActivity releaseId={rid} activity={activity} isAdmin={isAdmin} />}
        related={<RelatedNotes notes={related} />}
        actions={
          isAdmin ? (
            <ReleaseActions
              id={overview.release.id}
              name={overview.release.name}
              released={Boolean(overview.release.releasedOn)}
              archived={Boolean(overview.release.archivedAt)}
              held={Boolean(overview.release.heldAt)}
            />
          ) : undefined
        }
      />
    </AppShell>
  );
}
