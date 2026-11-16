import { cookies } from "next/headers";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { SessionUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

const WIDTH = { wide: "max-w-7xl", normal: "max-w-6xl", narrow: "max-w-4xl" } as const;

/** Nama cookie yang ditulis SidebarProvider (src/components/ui/sidebar.tsx) setiap kali sidebar dibuka atau dilipat. */
const SIDEBAR_COOKIE = "sidebar_state";

/**
 * Kerangka halaman terautentikasi: sidebar + konten. Dipakai di dalam Suspense halaman.
 *
 * Sidebar bisa dilipat menjadi deretan ikon di tepi kiri (tombol di bilah atas, atau Ctrl/Cmd+B) dan dibuka lagi.
 * Karena setiap halaman merakit AppShell sendiri, pilihan terakhir dibaca dari cookie agar tidak kembali terbuka
 * setiap berpindah halaman. Tanpa cookie, sidebar terbuka.
 */
export async function AppShell({
  user, width = "wide", children,
}: { user: SessionUser; width?: keyof typeof WIDTH; children: React.ReactNode }) {
  const defaultOpen = (await cookies()).get(SIDEBAR_COOKIE)?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar user={user} />
      <SidebarInset className="min-w-0">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4 md:hidden" />
          <span className="text-sm font-medium md:hidden">Task Master</span>
          <ThemeToggle className="ml-auto" />
        </header>
        <div className={cn("mx-auto w-full min-w-0 flex-1 space-y-6 px-4 py-6 md:px-8 md:py-8", WIDTH[width])}>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
