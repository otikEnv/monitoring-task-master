import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReleaseInput } from "./validate";

/** Tampilan release untuk UI. */
export type ReleaseRow = {
  id: string;
  sourceId: string;
  tag: string;
  name: string;
  rangeStart: number;
  rangeEnd: number;
  startDate: string;
  targetDate: string;
  releasedOn: string | null;
  createdAt: string;
};

export class DuplicateReleaseError extends Error {
  constructor() {
    super("A release with this name already exists for this application.");
    this.name = "DuplicateReleaseError";
  }
}
export class ReleaseNotFoundError extends Error {
  constructor() {
    super("Release not found.");
    this.name = "ReleaseNotFoundError";
  }
}
export class SourceTagError extends Error {
  constructor(public field: "sourceId" | "tag", message: string) {
    super(message);
    this.name = "SourceTagError";
  }
}

export const RELEASE_COLUMNS =
  "id, source_id, tag, name, range_start, range_end, start_date, target_date, released_on, created_at";

type Row = {
  id: string; source_id: string; tag: string; name: string; range_start: number; range_end: number;
  start_date: string; target_date: string; released_on: string | null; created_at: string;
};

/** Satu-satunya tempat baris database dipetakan ke tampilan. */
export function toRelease(r: Row): ReleaseRow {
  return {
    id: r.id,
    sourceId: r.source_id,
    tag: r.tag,
    name: r.name,
    rangeStart: Number(r.range_start),
    rangeEnd: Number(r.range_end),
    startDate: r.start_date,
    targetDate: r.target_date,
    releasedOn: r.released_on,
    createdAt: r.created_at,
  };
}

const isUnique = (e: { code?: string }) => e.code === "23505";

/** Pembacaan memakai klien bersesi pengguna (RLS berlaku). */
export async function getRelease(db: SupabaseClient, id: string): Promise<ReleaseRow | null> {
  const { data, error } = await db.from("releases").select(RELEASE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Gagal membaca release: ${error.message}`);
  return data ? toRelease(data as unknown as Row) : null;
}

/** Memastikan aplikasi ada dan tag itu ada pada aplikasi tersebut. Melempar SourceTagError. */
export async function assertSourceTag(
  sourceId: string,
  tag: string,
  db: SupabaseClient = createAdminClient(),
): Promise<void> {
  const { data: src, error } = await db.from("sources").select("id").eq("id", sourceId).maybeSingle();
  if (error) throw new Error(`Gagal membaca sumber: ${error.message}`);
  if (!src) throw new SourceTagError("sourceId", "Application not found.");

  const { data: tags, error: tagError } = await db
    .from("source_tags").select("tag").eq("source_id", sourceId).eq("tag", tag).limit(1);
  if (tagError) throw new Error(`Gagal membaca tag: ${tagError.message}`);
  if (!tags?.length) throw new SourceTagError("tag", "This tag does not exist on this application.");
}

const payload = (input: ReleaseInput) => ({
  source_id: input.sourceId,
  tag: input.tag,
  name: input.name,
  range_start: input.rangeStart,
  range_end: input.rangeEnd,
  target_date: input.targetDate,
  // null = biarkan bawaan database (hari ini WIB) saat membuat; saat mengubah, null tidak menimpa.
  ...(input.startDate ? { start_date: input.startDate } : {}),
});

export async function createRelease(
  input: ReleaseInput,
  db: SupabaseClient = createAdminClient(),
): Promise<{ id: string }> {
  const { data, error } = await db.from("releases").insert(payload(input)).select("id").single();
  if (error) {
    if (isUnique(error)) throw new DuplicateReleaseError();
    throw new Error(`Gagal menyimpan release: ${error.message}`);
  }
  return { id: data.id as string };
}

export async function updateRelease(
  id: string,
  input: ReleaseInput,
  db: SupabaseClient = createAdminClient(),
): Promise<void> {
  const { data, error } = await db.from("releases").update(payload(input)).eq("id", id).select("id");
  if (error) {
    if (isUnique(error)) throw new DuplicateReleaseError();
    throw new Error(`Gagal memperbarui release: ${error.message}`);
  }
  if (!data?.length) throw new ReleaseNotFoundError();
}

/** releasedOn null = batalkan tanda rilis. */
export async function setReleasedOn(
  id: string,
  releasedOn: string | null,
  db: SupabaseClient = createAdminClient(),
): Promise<void> {
  const { data, error } = await db.from("releases").update({ released_on: releasedOn }).eq("id", id).select("id");
  if (error) throw new Error(`Gagal mengubah status rilis: ${error.message}`);
  if (!data?.length) throw new ReleaseNotFoundError();
}

export async function deleteRelease(id: string, db: SupabaseClient = createAdminClient()): Promise<void> {
  const { data, error } = await db.from("releases").delete().eq("id", id).select("id");
  if (error) throw new Error(`Gagal menghapus release: ${error.message}`);
  if (!data?.length) throw new ReleaseNotFoundError();
}
