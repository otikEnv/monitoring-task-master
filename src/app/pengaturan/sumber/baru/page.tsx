import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { requireAdmin } from "@/lib/auth";
import { SourceForm } from "../source-form";

export const metadata: Metadata = { title: "Tambah sumber" };
// Uji koneksi berjalan sebagai server action di rute ini.
export const maxDuration = 60;

export default function NewSourcePage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-sm text-neutral-500">Memuat…</p>}>
      <NewSourceContent />
    </Suspense>
  );
}

async function NewSourceContent() {
  const user = await requireAdmin();
  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-4 py-8">
        <h1 className="text-xl font-semibold">Tambah sumber</h1>
        <SourceForm
          initial={{
            name: "",
            provider: "github",
            repoUrl: "",
            branch: "main",
            filePath: ".taskmaster/tasks/tasks.json",
            hasToken: false,
            tokenExpiresOn: "",
          }}
        />
      </main>
    </>
  );
}
