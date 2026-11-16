import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReleaseInput } from "./validate";

/** Satu komponen release: aplikasi + tag + rentang task (inklusif). */
export type ComponentRow = {
  id: string;
  releaseId: string;
  sourceId: string;
  tag: string;
  rangeStart: number;
  rangeEnd: number;
};

/** Tampilan release untuk UI: header dan komponennya. */
export type ReleaseRow = {
  id: string;
  name: string;
  startDate: string;
  targetDate: string;
  releasedOn: string | null;
  createdAt: string;
  /** Waktu diarsipkan; null = aktif (PRD-Archive.md). */
  archivedAt: string | null;
  /** Waktu ditahan; null = Active (PRD-Release-Hold-Catatan.md). */
  heldAt: string | null;
  holdReason: string | null;
  components: ComponentRow[];
};

/** Siapa yang melakukan perubahan; dicatat pada log catatan. id null untuk aksi tanpa pengguna. */
export type Author = { id: string | null; email: string };

export type ReleaseStateCode = "already_released" | "archived" | "already_on_hold" | "not_on_hold";
const STATE_MESSAGE: Record<ReleaseStateCode, string> = {
  already_released: "This release has already been released.",
  archived: "This release is archived. Restore it first.",
  already_on_hold: "This release is already on hold.",
  not_on_hold: "This release is not on hold.",
};
/** Keadaan release tidak mengizinkan aksi (mis. hold pada release yang sudah rilis). */
export class ReleaseStateError extends Error {
  constructor(public code: ReleaseStateCode) {
    super(STATE_MESSAGE[code]);
    this.name = "ReleaseStateError";
  }
}
export class NoteNotFoundError extends Error {
  constructor() {
    super("Note not found.");
    this.name = "NoteNotFoundError";
  }
}
/** Hanya catatan bebas (Note) yang bisa dihapus; entri sistem adalah riwayat. */
export class NoteNotDeletableError extends Error {
  constructor() {
    super("Only notes can be deleted. Hold, resume, target change, and release entries are part of the history.");
    this.name = "NoteNotDeletableError";
  }
}

/** Alasan perubahan target (sudah divalidasi) dan penulisnya; dicatat database bila tanggal target berubah. */
export type ChangeAudit = { reason: string; author: Author };

export class DuplicateReleaseError extends Error {
  constructor() {
    super("A release with this name already exists.");
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
  constructor(
    public field: "sourceId" | "tag",
    message: string,
    /** Posisi komponen pada masukan (mulai 0). */
    public index = 0,
  ) {
    super(message);
    this.name = "SourceTagError";
  }
}

export const RELEASE_COLUMNS =
  "id, name, start_date, target_date, released_on, created_at, archived_at, held_at, hold_reason";
export const COMPONENT_COLUMNS = "id, release_id, source_id, tag, range_start, range_end";

type Row = {
  id: string; name: string; start_date: string; target_date: string; released_on: string | null; created_at: string;
  archived_at: string | null; held_at: string | null; hold_reason: string | null;
};
type ComponentDbRow = {
  id: string; release_id: string; source_id: string; tag: string; range_start: number; range_end: number;
};

export function toComponent(r: ComponentDbRow): ComponentRow {
  return {
    id: r.id,
    releaseId: r.release_id,
    sourceId: r.source_id,
    tag: r.tag,
    rangeStart: Number(r.range_start),
    rangeEnd: Number(r.range_end),
  };
}

/** Satu-satunya tempat baris database dipetakan ke tampilan. */
export function toRelease(r: Row, components: ComponentRow[] = []): ReleaseRow {
  return {
    id: r.id,
    name: r.name,
    startDate: r.start_date,
    targetDate: r.target_date,
    releasedOn: r.released_on,
    createdAt: r.created_at,
    archivedAt: r.archived_at,
    heldAt: r.held_at ?? null,
    holdReason: r.hold_reason ?? null,
    components,
  };
}

/** Pembacaan memakai klien bersesi pengguna (RLS berlaku). */
export async function getRelease(db: SupabaseClient, id: string): Promise<ReleaseRow | null> {
  const { data, error } = await db.from("releases").select(RELEASE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Gagal membaca release: ${error.message}`);
  if (!data) return null;
  const comps = await db.from("release_components").select(COMPONENT_COLUMNS).eq("release_id", id);
  if (comps.error) throw new Error(`Gagal membaca komponen release: ${comps.error.message}`);
  return toRelease(data as unknown as Row, (comps.data as unknown as ComponentDbRow[]).map(toComponent));
}

/** Memastikan aplikasi ada dan tag itu ada pada aplikasi tersebut. Melempar SourceTagError. */
export async function assertSourceTag(
  sourceId: string,
  tag: string,
  db: SupabaseClient = createAdminClient(),
  index = 0,
): Promise<void> {
  const { data: src, error } = await db.from("sources").select("id").eq("id", sourceId).maybeSingle();
  if (error) throw new Error(`Gagal membaca sumber: ${error.message}`);
  if (!src) throw new SourceTagError("sourceId", "Application not found.", index);

  const { data: tags, error: tagError } = await db
    .from("source_tags").select("tag").eq("source_id", sourceId).eq("tag", tag).limit(1);
  if (tagError) throw new Error(`Gagal membaca tag: ${tagError.message}`);
  if (!tags?.length) throw new SourceTagError("tag", "This tag does not exist on this application.", index);
}

/** Memeriksa setiap komponen (aplikasi ada, tag ada). Melempar SourceTagError dengan indeks komponen. */
export async function assertComponents(
  components: ReleaseInput["components"],
  db: SupabaseClient = createAdminClient(),
): Promise<void> {
  for (let i = 0; i < components.length; i++) {
    await assertSourceTag(components[i].sourceId, components[i].tag, db, i);
  }
}

type PgError = { code?: string; message?: string };
const isDuplicateName = (e: PgError) => e.code === "23505" && /releases_unique_name/.test(e.message ?? "");

/**
 * Menyimpan release dan seluruh komponennya secara atomik lewat fungsi database save_release.
 * id null = buat baru; selain itu ubah (komponen diganti seluruhnya, tanggal rilis tidak disentuh).
 */
export async function saveRelease(
  id: string | null,
  input: ReleaseInput,
  db: SupabaseClient = createAdminClient(),
  audit?: ChangeAudit,
): Promise<{ id: string }> {
  const { data, error } = await db.rpc("save_release", {
    p_id: id,
    p_header: {
      name: input.name,
      // null = bawaan database (hari ini WIB) saat membuat; saat mengubah, null tidak menimpa.
      start_date: input.startDate,
      target_date: input.targetDate,
      // Alasan dan penulis hanya dipakai database bila target_date berubah pada ubah release.
      ...(audit?.reason ? { change_reason: audit.reason, author_id: audit.author.id, author_email: audit.author.email } : {}),
    },
    p_components: input.components.map((c) => ({
      source_id: c.sourceId,
      tag: c.tag,
      range_start: c.rangeStart,
      range_end: c.rangeEnd,
    })),
  });
  if (error) {
    if (isDuplicateName(error)) throw new DuplicateReleaseError();
    if (error.code === "P0002") throw new ReleaseNotFoundError();
    throw new Error(`Gagal menyimpan release: ${error.message}`);
  }
  return { id: data as string };
}

export async function createRelease(
  input: ReleaseInput,
  db: SupabaseClient = createAdminClient(),
): Promise<{ id: string }> {
  return saveRelease(null, input, db);
}

export async function updateRelease(
  id: string,
  input: ReleaseInput,
  db: SupabaseClient = createAdminClient(),
  audit?: ChangeAudit,
): Promise<void> {
  await saveRelease(id, input, db, audit);
}

/** Penulis bawaan untuk aksi tanpa pengguna (skrip, tes). */
export const SYSTEM_AUTHOR: Author = { id: null, email: "system" };

/**
 * releasedOn null = batalkan tanda rilis. Menandai rilis saat release di-hold mengakhiri hold dan mencatatnya
 * di log (fungsi database set_release_released, atomik).
 */
export async function setReleasedOn(
  id: string,
  releasedOn: string | null,
  db: SupabaseClient = createAdminClient(),
  author: Author = SYSTEM_AUTHOR,
): Promise<void> {
  const { error } = await db.rpc("set_release_released", {
    p_id: id, p_released_on: releasedOn, p_author: author.id, p_email: author.email,
  });
  if (error) {
    if (error.code === "P0002") throw new ReleaseNotFoundError();
    throw new Error(`Gagal mengubah status rilis: ${error.message}`);
  }
}

type RpcError = { code?: string; message?: string };

/** Memetakan galat fungsi hold/resume: P0002 = tidak ada, 55000 = keadaan tidak mengizinkan. */
function releaseFunctionError(what: string, e: RpcError): Error {
  if (e.code === "P0002") return new ReleaseNotFoundError();
  if (e.code === "55000" && e.message && e.message in STATE_MESSAGE) return new ReleaseStateError(e.message as ReleaseStateCode);
  return new Error(`Gagal ${what}: ${e.message}`);
}

/** Menahan release dengan alasan (sudah divalidasi 1..500 karakter). Mengembalikan id entri log. */
export async function holdRelease(
  id: string,
  reason: string,
  author: Author,
  db: SupabaseClient = createAdminClient(),
): Promise<{ noteId: string }> {
  const { data, error } = await db.rpc("hold_release", {
    p_id: id, p_reason: reason, p_author: author.id, p_email: author.email,
  });
  if (error) throw releaseFunctionError("menahan release", error);
  return { noteId: data as string };
}

/** Melanjutkan release yang ditahan; alasan opsional (null atau kosong = tanpa teks). */
export async function resumeRelease(
  id: string,
  reason: string | null,
  author: Author,
  db: SupabaseClient = createAdminClient(),
): Promise<{ noteId: string }> {
  const { data, error } = await db.rpc("resume_release", {
    p_id: id, p_reason: reason ?? "", p_author: author.id, p_email: author.email,
  });
  if (error) throw releaseFunctionError("melanjutkan release", error);
  return { noteId: data as string };
}

/** Catatan bebas pada sebuah release (sudah divalidasi 1..2000 karakter). */
export async function addReleaseNote(
  releaseId: string,
  body: string,
  author: Author,
  db: SupabaseClient = createAdminClient(),
): Promise<{ noteId: string }> {
  const { data, error } = await db.rpc("add_release_note", {
    p_id: releaseId, p_body: body, p_author: author.id, p_email: author.email,
  });
  if (error) throw releaseFunctionError("menambah catatan", error);
  return { noteId: data as string };
}

/**
 * Menghapus sebuah catatan bebas secara permanen. Entri sistem ditolak (NoteNotDeletableError). Mengembalikan id
 * release pemilik catatan.
 */
export async function deleteReleaseNote(
  noteId: string,
  db: SupabaseClient = createAdminClient(),
): Promise<{ releaseId: string }> {
  const { data, error } = await db.rpc("delete_release_note", { p_note_id: noteId });
  if (error) {
    if (error.code === "P0002") throw new NoteNotFoundError();
    if (error.code === "55000" && error.message === "not_deletable") throw new NoteNotDeletableError();
    throw new Error(`Gagal menghapus catatan: ${error.message}`);
  }
  return { releaseId: data as string };
}

/** Mengubah teks sebuah catatan; hanya teks yang berubah (fakta terkunci di database). */
export async function editReleaseNote(
  noteId: string,
  body: string,
  editorEmail: string,
  db: SupabaseClient = createAdminClient(),
): Promise<void> {
  const { error } = await db.rpc("edit_release_note", { p_note_id: noteId, p_body: body, p_email: editorEmail });
  if (error) {
    if (error.code === "P0002") throw new NoteNotFoundError();
    throw new Error(`Gagal mengubah catatan: ${error.message}`);
  }
}

/**
 * Mengarsipkan (true) atau mengembalikan (false) release. Hanya menyembunyikan: tanggal rilis dan komponen
 * tidak berubah. Mengarsipkan yang sudah terarsip menjaga waktu arsip yang lama (idempoten).
 */
export async function setReleaseArchived(
  id: string,
  archived: boolean,
  db: SupabaseClient = createAdminClient(),
): Promise<void> {
  const base = db.from("releases").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id);
  const { data, error } = await (archived ? base.is("archived_at", null) : base).select("id");
  if (error) throw new Error(`Gagal mengubah status arsip release: ${error.message}`);
  if (data?.length) return;
  const { data: exists, error: e2 } = await db.from("releases").select("id").eq("id", id).maybeSingle();
  if (e2) throw new Error(`Gagal membaca release: ${e2.message}`);
  if (!exists) throw new ReleaseNotFoundError();
}

/**
 * Jumlah release aktif (belum rilis, belum diarsipkan) yang masih punya komponen dari aplikasi ini.
 * Dipakai dialog konfirmasi saat mengarsipkan aplikasi.
 */
export async function countOpenReleasesForSource(
  sourceId: string,
  db: SupabaseClient = createAdminClient(),
): Promise<number> {
  const comps = await db.from("release_components").select("release_id").eq("source_id", sourceId);
  if (comps.error) throw new Error(`Gagal membaca komponen release: ${comps.error.message}`);
  const ids = [...new Set((comps.data as { release_id: string }[]).map((c) => c.release_id))];
  if (ids.length === 0) return 0;
  const { count, error } = await db
    .from("releases").select("id", { count: "exact", head: true })
    .in("id", ids).is("released_on", null).is("archived_at", null);
  if (error) throw new Error(`Gagal menghitung release: ${error.message}`);
  return count ?? 0;
}

/** Komponen ikut terhapus (cascade). */
export async function deleteRelease(id: string, db: SupabaseClient = createAdminClient()): Promise<void> {
  const { data, error } = await db.from("releases").delete().eq("id", id).select("id");
  if (error) throw new Error(`Gagal menghapus release: ${error.message}`);
  if (!data?.length) throw new ReleaseNotFoundError();
}
