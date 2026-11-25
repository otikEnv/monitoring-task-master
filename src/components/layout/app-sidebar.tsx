"use client";

import {
  Archive, CalendarDays, ChevronsUpDown, KeyRound, LayoutDashboard, ListChecks, LogOut, NotebookText, Rocket, Settings2,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail,
} from "@/components/ui/sidebar";
import { ROLE_LABEL } from "@/lib/access";
import type { SessionUser } from "@/lib/auth";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };

const NAV: NavItem[] = [
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/tasks", label: "Task list", icon: ListChecks },
  { href: "/release", label: "Release", icon: Rocket },
  { href: "/tren", label: "Trend", icon: TrendingUp },
  { href: "/notes", label: "Notes", icon: NotebookText },
];

// Archive dapat dilihat semua pengguna (hanya admin yang bisa Restore); Source settings hanya untuk admin.
const MANAGE_NAV: NavItem[] = [{ href: "/archive", label: "Archive", icon: Archive }];
const ADMIN_NAV: NavItem[] = [{ href: "/pengaturan/sumber", label: "Source settings", icon: Settings2 }];

export function AppSidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const isActive = (n: NavItem) =>
    n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(`${n.href}/`);
  const initial = (user.email[0] ?? "?").toUpperCase();

  const group = (label: string, items: NavItem[]) => (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((n) => (
            <SidebarMenuItem key={n.href}>
              <SidebarMenuButton isActive={isActive(n)} tooltip={n.label} render={<Link href={n.href} />}>
                <n.icon aria-hidden="true" />
                <span>{n.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Monitoring Task Master" render={<Link href="/" />}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ListChecks className="size-4" aria-hidden="true" />
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold">Task Master</span>
                <span className="truncate text-xs text-muted-foreground">Progress monitoring</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {group("Monitor", NAV)}
        {group("Manage", user.role === "admin" ? [...MANAGE_NAV, ...ADMIN_NAV] : MANAGE_NAV)}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" tooltip={user.email} />}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-medium">
                  {initial}
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-medium">{user.email}</span>
                  <span className="truncate text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</span>
                </span>
                <ChevronsUpDown className="ml-auto size-4" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/akun/password" />}>
                  <KeyRound aria-hidden="true" /> Change password
                </DropdownMenuItem>
                <form action={logout}>
                  {/* nativeButton: item dirender sebagai <button> sungguhan (tombol kirim form). */}
                  <DropdownMenuItem nativeButton render={<button type="submit" className="w-full" />}>
                    <LogOut aria-hidden="true" /> Sign out
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
