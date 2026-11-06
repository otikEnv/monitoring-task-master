import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { requireAdmin } from "@/lib/auth";
import { getSourceView } from "@/lib/sources/repo";
import { SourceForm } from "../source-form";

export const metadata: Metadata = { title: "Ubah sumber" };
// Uji koneksi berjalan sebagai server action di rute ini.
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function EditSourcePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-sm text-neutral-500">Memuat…</p>}>
      <EditSourceContent params={params} />
    </Suspense>
  );
}

async function EditSourceContent({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const source = await getSourceView(id);
  if (!source) notFound();

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-4 py-8">
        <h1 className="text-xl font-semibold">Ubah sumber: {source.name}</h1>
        {/* key: form dibangun ulang bila data sumber berubah. Token TIDAK ikut dikirim ke klien. */}
        <SourceForm
          key={`${source.id}-${source.branch}-${source.filePath}`}
          initial={{
            id: source.id,
            name: source.name,
            provider: source.provider,
            repoUrl: source.repoUrl,
            branch: source.branch,
            filePath: source.filePath,
            hasToken: source.hasToken,
            tokenExpiresOn: source.tokenExpiresAt ? source.tokenExpiresAt.slice(0, 10) : "",
          }}
        />
      </main>
    </>
  );
}
