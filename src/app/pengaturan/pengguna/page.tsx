import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, LoadError } from "@/components/layout/notices";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { AddUserDialog } from "@/components/settings/add-user-dialog";
import { MenuAccessForm } from "@/components/settings/menu-access-form";
import { UsersPanel, type UserView } from "@/components/settings/users-panel";
import { requireSuperadmin } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { describeEvent } from "@/lib/users/events";
import { loadMenuAccess, loadUserEvents, loadUsers, type MenuAccess, type UserEvent } from "@/lib/users/load";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };

const TABS = [
  { key: "users", label: "Users" },
  { key: "access", label: "Menu access" },
  { key: "activity", label: "Activity" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const PAGE = 20;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Cache Components aktif: bagian yang membaca sesi dan searchParams harus di dalam Suspense.
export default function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SettingsContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireSuperadmin();
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === first(sp.tab)) ? (first(sp.tab) as Tab) : "users";
  const limit = Math.min(Math.max(PAGE, Math.trunc(Number(first(sp.n)) || PAGE)), 500);

  // Data dimuat dulu; JSX dibuat di luar try/catch.
  let users: UserView[] | null = null;
  let access: MenuAccess | null = null;
  let events: { rows: UserEvent[]; more: boolean } | null = null;
  let failed = false;
  try {
    if (tab === "users") {
      users = (await loadUsers()).map((u) => ({
        ...u, created: formatDate(u.createdAt), lastSignIn: u.lastSignInAt ? formatDateTime(u.lastSignInAt) : "Never",
      }));
    } else if (tab === "access") {
      access = await loadMenuAccess(await createClient());
    } else {
      events = await loadUserEvents(await createClient(), limit);
    }
  } catch (e) {
    console.error("[settings] gagal memuat", { tab, error: (e as Error)?.name });
    failed = true;
  }

  const body = failed ? (
    <LoadError title="This tab could not be loaded." />
  ) : users ? (
    <UsersPanel users={users} meId={user.id} />
  ) : access ? (
    <MenuAccessForm initial={access} />
  ) : events ? (
    <ActivityList events={events.rows} more={events.more} next={limit + PAGE} />
  ) : null;

  return (
    <AppShell user={user} width="wide">
      <PageHeader
        title="Settings"
        description="Users, roles, and which menus each role can open. Only superadmins can see this page."
        actions={tab === "users" ? <AddUserDialog /> : undefined}
      />
      <nav aria-label="Settings sections" className="-mx-1 flex gap-1 overflow-x-auto border-b px-1">
        {TABS.map((t) => (
          <Link
            key={t.key} href={t.key === "users" ? "/pengaturan/pengguna" : `/pengaturan/pengguna?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {body}
    </AppShell>
  );
}

function ActivityList({ events, more, next }: { events: UserEvent[]; more: boolean; next: number }) {
  if (events.length === 0) return <EmptyState>No changes yet.</EmptyState>;
  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-xl border bg-card">
        {events.map((e) => (
          <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
            <p className="min-w-0 break-words">
              <span className="font-medium">{e.actorEmail}</span> {describeEvent(e)}
            </p>
            <time dateTime={e.createdAt} className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatDateTime(e.createdAt)}</time>
          </li>
        ))}
      </ul>
      {more && (
        <Link href={`/pengaturan/pengguna?tab=activity&n=${next}`} scroll={false} className="inline-block text-sm font-medium underline">
          Load more
        </Link>
      )}
    </div>
  );
}
