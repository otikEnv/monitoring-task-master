import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadError } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { NoteHistory } from "@/components/notes/note-history";
import { requireMenu } from "@/lib/auth";
import { getNote, loadRevisions, type NoteRow, type RevisionRow } from "@/lib/notes/load";
import { UUID } from "@/lib/releases/validate";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Note history" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function NoteHistoryPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NoteHistoryContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function NoteHistoryContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const user = await requireMenu("notes");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const nid = id.toLowerCase();
  const v = (await searchParams).v;
  const selected = typeof v === "string" && /^[0-9]{1,18}$/.test(v) ? Number(v) : null;

  let note: NoteRow | null;
  let revisions: RevisionRow[] = [];
  try {
    const db = await createClient();
    note = await getNote(db, nid);
    if (note) revisions = await loadRevisions(db, nid);
  } catch (e) {
    console.error("[notes] gagal memuat riwayat", { error: (e as Error)?.name });
    return (
      <AppShell user={user} width="normal">
        <LoadError title="The history could not be loaded." />
      </AppShell>
    );
  }
  if (!note) notFound();

  return (
    <AppShell user={user} width="normal">
      <PageHeader
        title="History"
        description={<>Earlier versions of <Link href={`/notes/${note.id}`} className="font-medium underline">{note.title}</Link></>}
      />
      <NoteHistory note={note} revisions={revisions} selected={selected} />
    </AppShell>
  );
}
