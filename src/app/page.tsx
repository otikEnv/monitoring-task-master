import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/lib/auth";

// Sementara: halaman beranda terproteksi. Dashboard sebenarnya dibuat di task 10.
// Cache Components aktif: bagian yang membaca sesi (cookies) harus di dalam <Suspense>.
export default function Home() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-sm text-neutral-500">Memuat…</p>}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const user = await requireUser();

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Anda masuk sebagai {user.email} ({user.role}). Ringkasan aplikasi akan
          tampil di sini.
        </p>
      </main>
    </>
  );
}
