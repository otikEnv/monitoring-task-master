import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/lib/auth";

// Sementara: halaman beranda terproteksi. Dashboard sebenarnya dibuat di task 10.
export default async function Home() {
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
