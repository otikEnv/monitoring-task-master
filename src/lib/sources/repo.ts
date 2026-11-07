import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "@/lib/crypto";
import type { Provider } from "@/lib/providers/types";
import { tokenExpiryState, type TokenExpiry } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SourceInput } from "./validate";

/**
 * Tampilan sumber untuk UI. SENGAJA tidak memuat token (asli maupun terenkripsi):
 * UI hanya tahu apakah token sudah terisi.
 */
export type SourceView = {
  id: string;
  name: string;
  provider: Provider;
  repoUrl: string;
  branch: string;
  filePath: string;
  isActive: boolean;
  hasToken: boolean;
  tokenExpiresAt: string | null;
  /** Dihitung saat data dibaca: none | ok | soon (<14 hari) | expired. */
  tokenExpiry: TokenExpiry;
  lastSyncStatus: "never" | "success" | "failed";
  lastAttemptAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastCommitAt: string | null;
  createdAt: string;
};

export class DuplicateSourceError extends Error {
  constructor() {
    super("A source with the same repo URL, branch, and path is already registered.");
    this.name = "DuplicateSourceError";
  }
}
export class SourceNotFoundError extends Error {
  constructor() {
    super("Source not found.");
    this.name = "SourceNotFoundError";
  }
}

const COLUMNS =
  "id, name, provider, repo_url, branch, file_path, is_active, token_encrypted, token_expires_at, " +
  "last_sync_status, last_attempt_at, last_synced_at, last_error, last_commit_at, created_at";

type Row = {
  id: string; name: string; provider: Provider; repo_url: string; branch: string; file_path: string;
  is_active: boolean; token_encrypted: string | null; token_expires_at: string | null;
  last_sync_status: SourceView["lastSyncStatus"]; last_attempt_at: string | null;
  last_synced_at: string | null; last_error: string | null; last_commit_at: string | null;
  created_at: string;
};

/** Satu-satunya tempat baris database dipetakan ke tampilan; token_encrypted dibuang di sini. */
function toView(r: Row): SourceView {
  return {
    id: r.id,
    name: r.name,
    provider: r.provider,
    repoUrl: r.repo_url,
    branch: r.branch,
    filePath: r.file_path,
    isActive: r.is_active,
    hasToken: Boolean(r.token_encrypted),
    tokenExpiresAt: r.token_expires_at,
    tokenExpiry: tokenExpiryState(r.token_expires_at, Date.now()),
    lastSyncStatus: r.last_sync_status,
    lastAttemptAt: r.last_attempt_at,
    lastSyncedAt: r.last_synced_at,
    lastError: r.last_error,
    lastCommitAt: r.last_commit_at,
    createdAt: r.created_at,
  };
}

const isUnique = (e: { code?: string }) => e.code === "23505";

export async function listSources(db: SupabaseClient = createAdminClient()): Promise<SourceView[]> {
  const { data, error } = await db.from("sources").select(COLUMNS).order("name", { ascending: true });
  if (error) throw new Error(`Gagal membaca daftar sumber: ${error.message}`);
  return (data as unknown as Row[]).map(toView);
}

export async function getSourceView(
  id: string,
  db: SupabaseClient = createAdminClient(),
): Promise<SourceView | null> {
  const { data, error } = await db.from("sources").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Gagal membaca sumber: ${error.message}`);
  return data ? toView(data as unknown as Row) : null;
}

/** Token tersimpan dalam teks biasa. Hanya untuk kode server (uji koneksi). Jangan dikembalikan ke klien. */
export async function getStoredToken(
  id: string,
  db: SupabaseClient = createAdminClient(),
): Promise<string | null> {
  const { data, error } = await db.from("sources").select("token_encrypted").eq("id", id).maybeSingle();
  if (error) throw new Error(`Gagal membaca token: ${error.message}`);
  if (!data?.token_encrypted) return null;
  return decryptToken(data.token_encrypted as string);
}

export async function createSource(
  input: SourceInput,
  db: SupabaseClient = createAdminClient(),
): Promise<{ id: string }> {
  if (!input.token) throw new Error("Token wajib diisi untuk sumber baru.");
  const { data, error } = await db
    .from("sources")
    .insert({
      name: input.name,
      provider: input.provider,
      repo_url: input.repoUrl,
      branch: input.branch,
      file_path: input.filePath,
      token_encrypted: encryptToken(input.token),
      token_expires_at: input.tokenExpiresAt,
    })
    .select("id")
    .single();
  if (error) {
    if (isUnique(error)) throw new DuplicateSourceError();
    throw new Error(`Gagal menyimpan sumber: ${error.message}`);
  }
  return { id: data.id as string };
}

/**
 * Mengubah sumber. input.token null = token lama dipertahankan.
 * Bila target (URL/branch/path) atau token berubah, ETag dibuang agar sinkron berikutnya mengunduh ulang.
 */
export async function updateSource(
  id: string,
  input: SourceInput,
  db: SupabaseClient = createAdminClient(),
): Promise<void> {
  const { data: current, error: readError } = await db
    .from("sources")
    .select("repo_url, branch, file_path, provider")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw new Error(`Gagal membaca sumber: ${readError.message}`);
  if (!current) throw new SourceNotFoundError();

  const targetChanged =
    current.repo_url !== input.repoUrl ||
    current.branch !== input.branch ||
    current.file_path !== input.filePath ||
    current.provider !== input.provider;

  const patch: Record<string, unknown> = {
    name: input.name,
    provider: input.provider,
    repo_url: input.repoUrl,
    branch: input.branch,
    file_path: input.filePath,
    token_expires_at: input.tokenExpiresAt,
  };
  if (input.token) patch.token_encrypted = encryptToken(input.token);
  if (targetChanged || input.token) patch.etag = null;

  const { error } = await db.from("sources").update(patch).eq("id", id);
  if (error) {
    if (isUnique(error)) throw new DuplicateSourceError();
    throw new Error(`Gagal memperbarui sumber: ${error.message}`);
  }
}

export async function setSourceActive(
  id: string,
  isActive: boolean,
  db: SupabaseClient = createAdminClient(),
): Promise<void> {
  const { data, error } = await db.from("sources").update({ is_active: isActive }).eq("id", id).select("id");
  if (error) throw new Error(`Gagal mengubah status sumber: ${error.message}`);
  if (!data?.length) throw new SourceNotFoundError();
}

/** Menghapus sumber beserta semua task dan snapshot-nya (cascade). */
export async function deleteSource(
  id: string,
  db: SupabaseClient = createAdminClient(),
): Promise<void> {
  const { data, error } = await db.from("sources").delete().eq("id", id).select("id");
  if (error) throw new Error(`Gagal menghapus sumber: ${error.message}`);
  if (!data?.length) throw new SourceNotFoundError();
}
