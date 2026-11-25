"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { countOpenReleasesForSource, ReleaseNotFoundError, setReleaseArchived } from "@/lib/releases/repo";
import { UUID } from "@/lib/releases/validate";
import { SourceNotFoundError, setSourceArchived } from "@/lib/sources/repo";

// Semua action di sini dipanggil dari klien lewat HTTP: requireAdmin() WAJIB di baris pertama
// (server action adalah endpoint publik; pengecekan di UI saja tidak cukup).

export type ArchiveResult = { ok: true } | { ok: false; error: string };
export type ImpactResult = { ok: true; openReleases: number } | { ok: false; error: string };

const fail = (what: string, e: unknown) => console.error(`[archive] gagal ${what}`, { error: (e as Error)?.name });

/** Halaman yang tampilannya berubah saat aplikasi atau release diarsipkan atau dikembalikan. */
function refreshAll(extra: string[] = []) {
  for (const p of ["/", "/release", "/tasks", "/tren", "/archive", "/pengaturan/sumber", ...extra]) revalidatePath(p);
}

async function setSource(id: string, archived: boolean): Promise<ArchiveResult> {
  if (!UUID.test(id)) return { ok: false, error: "Invalid application ID." };
  try {
    await setSourceArchived(id.toLowerCase(), archived);
  } catch (e) {
    if (e instanceof SourceNotFoundError) return { ok: false, error: "Application not found." };
    fail(archived ? "mengarsipkan aplikasi" : "memulihkan aplikasi", e);
    return { ok: false, error: archived ? "Could not archive the application." : "Could not restore the application." };
  }
  refreshAll();
  return { ok: true };
}

async function setRelease(id: string, archived: boolean): Promise<ArchiveResult> {
  if (!UUID.test(id)) return { ok: false, error: "Invalid release ID." };
  try {
    await setReleaseArchived(id.toLowerCase(), archived);
  } catch (e) {
    if (e instanceof ReleaseNotFoundError) return { ok: false, error: "Release not found." };
    fail(archived ? "mengarsipkan release" : "memulihkan release", e);
    return { ok: false, error: archived ? "Could not archive the release." : "Could not restore the release." };
  }
  refreshAll([`/release/${id.toLowerCase()}`]);
  return { ok: true };
}

/** Menyembunyikan aplikasi dari tampilan sehari-hari. Data dan sinkronisasi tidak berubah. */
export async function archiveSource(id: string): Promise<ArchiveResult> {
  await requireAdmin("archive");
  return setSource(id, true);
}

export async function restoreSource(id: string): Promise<ArchiveResult> {
  await requireAdmin("archive");
  return setSource(id, false);
}

export async function archiveRelease(id: string): Promise<ArchiveResult> {
  await requireAdmin("archive");
  return setRelease(id, true);
}

export async function restoreRelease(id: string): Promise<ArchiveResult> {
  await requireAdmin("archive");
  return setRelease(id, false);
}

/** Untuk dialog konfirmasi: berapa release berjalan yang masih memakai aplikasi ini. Hanya membaca. */
export async function sourceArchiveImpact(id: string): Promise<ImpactResult> {
  await requireAdmin("archive");
  if (!UUID.test(id)) return { ok: false, error: "Invalid application ID." };
  try {
    return { ok: true, openReleases: await countOpenReleasesForSource(id.toLowerCase()) };
  } catch (e) {
    fail("menghitung dampak arsip", e);
    return { ok: false, error: "Could not check the releases that use this application." };
  }
}
