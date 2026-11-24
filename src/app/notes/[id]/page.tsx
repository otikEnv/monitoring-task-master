import type { Metadata } from "next";
import Link from "next/link";
import { CornerDownRight } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadError } from "@/components/layout/notices";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { NoteDetailView } from "@/components/notes/note-detail";
import { NoteLinks } from "@/components/notes/note-links";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { resolveLinkViews, type LinkView } from "@/lib/notes/links";
import { getNoteDetail, type NoteDetail } from "@/lib/notes/load";
import { markNoteRead } from "@/lib/notes/repo";
import { UUID } from "@/lib/releases/validate";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Note" };

type Params = Promise<{ id: string }>;

// Cache Components aktif: bagian yang membaca sesi dan params harus di dalam Suspense.
export default function NoteDetailPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NoteDetailContent params={params} />
    </Suspense>
  );
}

async function NoteDetailContent({ params }: { params: Params }) {
  const user = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const nid = id.toLowerCase();

  let detail: NoteDetail | null;
  let links: LinkView[] = [];
  try {
    const db = await createClient();
    detail = await getNoteDetail(db, nid);
    if (detail) links = await resolveLinkViews(db, detail.links);
  } catch (e) {
    console.error("[notes] gagal memuat detail", { error: (e as Error)?.name });
    return (
      <AppShell user={user} width="normal">
        <LoadError title="The note could not be loaded." />
      </AppShell>
    );
  }
  if (!detail) notFound();

  // Membuka catatan menandai komentarnya sudah dibaca. Kegagalannya tidak boleh menjatuhkan halaman.
  try {
    await markNoteRead(nid, { id: user.id, email: user.email });
  } catch (e) {
    console.error("[notes] gagal menandai dibaca", { error: (e as Error)?.name });
  }

  return (
    <AppShell user={user} width="normal">
      <NoteDetailView
        detail={detail}
        user={user}
        links={<NoteLinks links={links} />}
        followUp={
          user.role === "admin" ? (
            <Link href={`/notes/new?followUp=${detail.note.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <CornerDownRight aria-hidden="true" /> Follow up
            </Link>
          ) : undefined
        }
      />
    </AppShell>
  );
}
