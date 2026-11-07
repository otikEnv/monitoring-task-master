import { AppSidebar } from "@/components/layout/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { SessionUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

const WIDTH = { wide: "max-w-7xl", normal: "max-w-6xl", narrow: "max-w-4xl" } as const;

/** Kerangka halaman terautentikasi: sidebar + konten. Dipakai di dalam Suspense halaman. */
export function AppShell({
  user, width = "wide", children,
}: { user: SessionUser; width?: keyof typeof WIDTH; children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset className="min-w-0">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm font-medium">Task Master</span>
        </header>
        <div className={cn("mx-auto w-full min-w-0 flex-1 space-y-6 px-4 py-6 md:px-8 md:py-8", WIDTH[width])}>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
