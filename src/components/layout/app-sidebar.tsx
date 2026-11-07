"use client";

import { ChevronsUpDown, KeyRound, LayoutDashboard, ListChecks, LogOut, Settings2, TrendingUp } from "lucide-react";
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
import type { SessionUser } from "@/lib/auth";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/tasks", label: "Daftar task", icon: ListChecks },
  { href: "/tren", label: "Tren", icon: TrendingUp },
];

const ADMIN_NAV: NavItem[] = [{ href: "/pengaturan/sumber", label: "Pengaturan sumber", icon: Settings2 }];

const ROLE_LABEL: Record<SessionUser["role"], string> = { admin: "Admin", viewer: "Penampil" };

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
                <span className="truncate text-xs text-muted-foreground">Monitoring progres</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {group("Pantau", NAV)}
        {user.role === "admin" && group("Kelola", ADMIN_NAV)}
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
                  <KeyRound aria-hidden="true" /> Ganti password
                </DropdownMenuItem>
                <form action={logout}>
                  <DropdownMenuItem render={<button type="submit" className="w-full" />}>
                    <LogOut aria-hidden="true" /> Keluar
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
