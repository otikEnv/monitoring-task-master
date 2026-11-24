import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadError, Notice } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { KeepLinks } from "@/components/notes/keep-links";
import { NoteForm, type NoteFormInitial } from "@/components/notes/note-form";
import { requireAdmin } from "@/lib/auth";
import { getNote, loadActionItems, loadNoteLinks, type ActionItemRow, type NoteLinkRow, type NoteRow } from "@/lib/notes/load";
import { listUserOptions, type UserOption } from "@/lib/notes/users";
import { UUID } from "@/lib/releases/validate";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit note" };

type Params = Promise<{ id: string }>;

export default function EditNotePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditNoteContent params={params} />
    </Suspense>
  );
}

async function EditNoteContent({ params }: { params: Params }) {
  const user = await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const nid = id.toLowerCase();

  let note: NoteRow | null;
  let items: ActionItemRow[] = [];
  let links: NoteLinkRow[] = [];
  let users: UserOption[] = [];
  try {
    const db = await createClient();
    note = await getNote(db, nid);
    if (note) [items, links, users] = await Promise.all([loadActionItems(db, nid), loadNoteLinks(db, nid), listUserOptions()]);
  } catch (e) {
    console.error("[notes] gagal memuat form ubah", { error: (e as Error)?.name });
    return (
      <AppShell user={user} width="narrow">
        <LoadError title="The note could not be loaded." />
      </AppShell>
    );
  }
  if (!note) notFound();

  // Hanya penulis yang boleh mengubah (database memeriksanya lagi saat menyimpan).
  if (note.authorId !== user.id) {
    return (
      <AppShell user={user} width="narrow">
        <PageHeader title="Edit note" />
        <Notice>
          Only the author ({note.authorEmail}) can edit this note.{" "}
          <Link href={`/notes/${note.id}`} className="underline">Back to the note</Link>
        </Notice>
      </AppShell>
    );
  }

  const initial: NoteFormInitial = {
    id: note.id,
    title: note.title,
    noteDate: note.noteDate,
    kind: note.kind,
    body: note.body,
    items: items.map((it) => ({
      id: it.id, body: it.body, assigneeId: it.assigneeId ?? "", dueDate: it.dueDate ?? "", done: it.done, carriedFromId: "",
    })),
  };

  // Penanggung jawab lama yang sudah tidak terdaftar tetap tampil sebagai pilihan agar tidak hilang diam-diam.
  for (const it of items) {
    if (it.assigneeId && it.assigneeEmail && !users.some((u) => u.id === it.assigneeId)) {
      users = [...users, { id: it.assigneeId, email: it.assigneeEmail }];
    }
  }

  return (
    <AppShell user={user} width="narrow">
      <PageHeader title="Edit note" />
      <NoteForm initial={initial} users={users} links={<KeepLinks links={links} />} />
    </AppShell>
  );
}
