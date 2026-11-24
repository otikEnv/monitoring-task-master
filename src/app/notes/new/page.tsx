import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadError, Notice } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { NoteForm, type NoteFormInitial } from "@/components/notes/note-form";
import { requireAdmin } from "@/lib/auth";
import { buildFollowUp } from "@/lib/notes/follow-up";
import { checkLinks, loadLinkOptions, rowToInput, type LinkOptions } from "@/lib/notes/links";
import { getNote, loadActionItems, loadNoteLinks } from "@/lib/notes/load";
import { todayWib } from "@/lib/notes/model";
import { listUserOptions, type UserOption } from "@/lib/notes/users";
import { isValidDate, UUID } from "@/lib/releases/validate";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New note" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function NewNotePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewNoteContent searchParams={searchParams} />
    </Suspense>
  );
}

async function NewNoteContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  // ?date= dari Calendar (tanggal yang diklik); tidak valid = hari ini.
  const date = first(sp.date);
  const noteDate = date && isValidDate(date) ? date : todayWib();

  let users: UserOption[] | null = null;
  let options: LinkOptions | null = null;
  let initial: NoteFormInitial = { title: "", noteDate, kind: "meeting", body: "", links: [], items: [] };
  let followUpOf: { id: string; title: string } | null = null;
  let followUpMissing = false;
  let dropped = 0;
  try {
    const db = await createClient();
    [users, options] = await Promise.all([listUserOptions(), loadLinkOptions(db)]);

    // ?followUp=<id>: catatan lanjutan dengan tautan dan action item terbuka dari catatan asal.
    const followUp = first(sp.followUp);
    if (followUp && UUID.test(followUp)) {
      const fid = followUp.toLowerCase();
      const note = await getNote(db, fid);
      if (note) {
        const [links, items] = await Promise.all([loadNoteLinks(db, fid), loadActionItems(db, fid)]);
        // Tautan ke sasaran yang sudah hilang atau terarsip tidak dibawa (tidak bisa disimpan sebagai tautan baru).
        const inputs = links.map(rowToInput);
        const bad = await checkLinks(db, inputs, inputs.map((_, i) => i));
        dropped = bad.size;
        const fu = buildFollowUp(note, links.filter((_, i) => !bad.has(i)), items, todayWib());
        initial = fu;
        followUpOf = { id: note.id, title: note.title };
      } else {
        followUpMissing = true;
      }
    }
  } catch (e) {
    console.error("[notes] gagal memuat form", { error: (e as Error)?.name });
  }

  return (
    <AppShell user={user} width="narrow">
      <PageHeader
        title={followUpOf ? "Follow up" : "New note"}
        description="Meeting results, decisions, or any note, with optional action items."
      />
      {followUpMissing && <Notice>The note to follow up no longer exists. You can still write a new note.</Notice>}
      {dropped > 0 && (
        <Notice>
          {dropped} {dropped === 1 ? "link was" : "links were"} not copied because the application, release, or task is
          archived or no longer exists.
        </Notice>
      )}
      {users === null || options === null ? (
        <LoadError title="The form could not be loaded." />
      ) : (
        <NoteForm initial={initial} users={users} sources={options.sources} releases={options.releases} followUpOf={followUpOf} />
      )}
    </AppShell>
  );
}
