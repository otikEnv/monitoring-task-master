import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadError } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { NoteForm, type NoteFormInitial } from "@/components/notes/note-form";
import { requireAdmin } from "@/lib/auth";
import { loadLinkOptions, type LinkOptions } from "@/lib/notes/links";
import { todayWib } from "@/lib/notes/model";
import { listUserOptions, type UserOption } from "@/lib/notes/users";
import { isValidDate } from "@/lib/releases/validate";
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
  try {
    [users, options] = await Promise.all([listUserOptions(), loadLinkOptions(await createClient())]);
  } catch (e) {
    console.error("[notes] gagal memuat pengguna", { error: (e as Error)?.name });
  }

  const initial: NoteFormInitial = { title: "", noteDate, kind: "meeting", body: "", links: [], items: [] };

  return (
    <AppShell user={user} width="narrow">
      <PageHeader title="New note" description="Meeting results, decisions, or any note, with optional action items." />
      {users === null || options === null ? (
        <LoadError title="The form could not be loaded." />
      ) : (
        <NoteForm initial={initial} users={users} sources={options.sources} releases={options.releases} />
      )}
    </AppShell>
  );
}
