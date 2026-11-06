import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decryptToken } from "@/lib/crypto";
import {
  DuplicateSourceError,
  SourceNotFoundError,
  createSource,
  deleteSource,
  getSourceView,
  getStoredToken,
  listSources,
  setSourceActive,
  updateSource,
} from "@/lib/sources/repo";
import type { SourceInput } from "@/lib/sources/validate";

/**
 * Lapisan data sumber terhadap Supabase asli. Hanya lewat `npm run test:live`.
 * Semua data uji diberi awalan nama TMP-SRC- dan dihapus di akhir.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENABLED = Boolean(URL_ && SERVICE && process.env.TOKEN_ENCRYPTION_KEY);

describe.skipIf(!ENABLED)("data sumber (Supabase asli)", () => {
  let db: SupabaseClient;
  const run = randomBytes(3).toString("hex");
  const TOKEN_1 = `github_pat_PERTAMA_${run}_abcdef`;
  const TOKEN_2 = `github_pat_KEDUA_${run}_abcdef`;
  const input = (over: Partial<SourceInput> = {}): SourceInput => ({
    name: `TMP-SRC-${run}`,
    provider: "github",
    repoUrl: `https://github.com/tmp/${run}`,
    branch: "stg",
    filePath: ".taskmaster/tasks/tasks.json",
    token: TOKEN_1,
    tokenExpiresAt: null,
    ...over,
  });
  const raw = async (id: string) =>
    (await db.from("sources").select("*").eq("id", id).single()).data as Record<string, unknown>;
  let id: string;

  beforeAll(() => {
    db = createClient(URL_!, SERVICE!, { auth: { persistSession: false, autoRefreshToken: false } });
  });
  afterAll(async () => {
    await db.from("sources").delete().like("name", "TMP-SRC-%");
  });

  it("membuat sumber: token tersimpan TERENKRIPSI dan bisa didekripsi kembali", async () => {
    const created = await createSource(input(), db);
    id = created.id;
    const row = await raw(id);
    expect(row.token_encrypted).toMatch(/^v1\./);
    expect(row.token_encrypted).not.toContain(TOKEN_1);
    expect(decryptToken(row.token_encrypted as string)).toBe(TOKEN_1);
    expect(row.is_active).toBe(true);
    expect(row.last_sync_status).toBe("never");
  });

  it("tampilan sumber TIDAK memuat token (asli maupun terenkripsi), hanya penanda hasToken", async () => {
    const view = await getSourceView(id, db);
    expect(view).toMatchObject({ id, name: `TMP-SRC-${run}`, branch: "stg", hasToken: true, isActive: true });
    const stored = (await raw(id)).token_encrypted as string;
    const json = JSON.stringify(view);
    expect(json).not.toContain(TOKEN_1);
    expect(json).not.toContain(stored);
    expect(json).not.toContain("v1.");
    expect(json).not.toMatch(/token_encrypted/);

    const list = JSON.stringify(await listSources(db));
    expect(list).not.toContain(TOKEN_1);
    expect(list).not.toContain(stored);
  });

  it("getStoredToken mengembalikan teks asli (khusus kode server) dan null bila tidak ada token", async () => {
    expect(await getStoredToken(id, db)).toBe(TOKEN_1);
    expect(await getStoredToken("00000000-0000-0000-0000-0000000000ee", db)).toBeNull();
  });

  it("mengubah tanpa token baru: token terenkripsi PERSIS sama (tidak dienkripsi ulang atau dihapus)", async () => {
    const before = (await raw(id)).token_encrypted;
    await updateSource(id, input({ name: `TMP-SRC-${run}-ubah`, token: null }), db);
    const row = await raw(id);
    expect(row.name).toBe(`TMP-SRC-${run}-ubah`);
    expect(row.token_encrypted).toBe(before);
  });

  it("mengubah nama saja tidak membuang ETag; mengubah branch membuangnya", async () => {
    await db.from("sources").update({ etag: '"etag-x"' }).eq("id", id);
    await updateSource(id, input({ name: `TMP-SRC-${run}-nama2`, token: null }), db);
    expect((await raw(id)).etag).toBe('"etag-x"');

    await updateSource(id, input({ name: `TMP-SRC-${run}-nama2`, branch: "main", token: null }), db);
    expect((await raw(id)).etag).toBeNull();
  });

  it("mengubah path atau URL juga membuang ETag", async () => {
    for (const patch of [{ filePath: "lain/tasks.json" }, { repoUrl: `https://github.com/tmp/${run}-lain` }]) {
      await db.from("sources").update({ etag: '"etag-y"' }).eq("id", id);
      const current = await getSourceView(id, db);
      await updateSource(id, input({ name: current!.name, branch: current!.branch, filePath: current!.filePath, repoUrl: current!.repoUrl, token: null, ...patch }), db);
      expect((await raw(id)).etag).toBeNull();
    }
  });

  it("token baru menggantikan yang lama dan membuang ETag", async () => {
    const current = await getSourceView(id, db);
    await db.from("sources").update({ etag: '"etag-z"' }).eq("id", id);
    const before = (await raw(id)).token_encrypted;
    await updateSource(id, input({ name: current!.name, branch: current!.branch, filePath: current!.filePath, repoUrl: current!.repoUrl, token: TOKEN_2 }), db);
    const row = await raw(id);
    expect(row.token_encrypted).not.toBe(before);
    expect(decryptToken(row.token_encrypted as string)).toBe(TOKEN_2);
    expect(row.etag).toBeNull();
  });

  it("tanggal kedaluwarsa token disimpan dan bisa dikosongkan", async () => {
    const c = await getSourceView(id, db);
    const keep = { name: c!.name, branch: c!.branch, filePath: c!.filePath, repoUrl: c!.repoUrl, token: null };
    await updateSource(id, input({ ...keep, tokenExpiresAt: "2027-02-04T23:59:59.000Z" }), db);
    expect(new Date((await getSourceView(id, db))!.tokenExpiresAt!).toISOString()).toBe("2027-02-04T23:59:59.000Z");
    await updateSource(id, input({ ...keep, tokenExpiresAt: null }), db);
    expect((await getSourceView(id, db))!.tokenExpiresAt).toBeNull();
  });

  it("sumber dengan URL, branch, dan path yang sama ditolak (DuplicateSourceError)", async () => {
    const c = await getSourceView(id, db);
    await expect(
      createSource(input({ name: `TMP-SRC-${run}-dup`, repoUrl: c!.repoUrl, branch: c!.branch, filePath: c!.filePath }), db),
    ).rejects.toBeInstanceOf(DuplicateSourceError);
    // mengubah sumber lain menjadi target yang sama juga ditolak
    const other = await createSource(input({ name: `TMP-SRC-${run}-lain`, repoUrl: `https://github.com/tmp/${run}-x` }), db);
    await expect(
      updateSource(other.id, input({ name: `TMP-SRC-${run}-lain`, repoUrl: c!.repoUrl, branch: c!.branch, filePath: c!.filePath, token: null }), db),
    ).rejects.toBeInstanceOf(DuplicateSourceError);
  });

  it("sumber baru tanpa token ditolak sebelum menyentuh database", async () => {
    await expect(createSource(input({ name: `TMP-SRC-${run}-nt`, token: null }), db)).rejects.toThrow(/token/i);
    expect((await db.from("sources").select("id").eq("name", `TMP-SRC-${run}-nt`)).data).toEqual([]);
  });

  it("nonaktifkan dan aktifkan", async () => {
    await setSourceActive(id, false, db);
    expect((await getSourceView(id, db))!.isActive).toBe(false);
    await setSourceActive(id, true, db);
    expect((await getSourceView(id, db))!.isActive).toBe(true);
  });

  it("sumber yang tidak ada -> SourceNotFoundError untuk ubah, aktifkan, dan hapus", async () => {
    const ghost = "00000000-0000-0000-0000-0000000000ee";
    await expect(updateSource(ghost, input({ token: null }), db)).rejects.toBeInstanceOf(SourceNotFoundError);
    await expect(setSourceActive(ghost, true, db)).rejects.toBeInstanceOf(SourceNotFoundError);
    await expect(deleteSource(ghost, db)).rejects.toBeInstanceOf(SourceNotFoundError);
    expect(await getSourceView(ghost, db)).toBeNull();
  });

  it("menghapus sumber ikut menghapus task dan snapshot-nya (cascade)", async () => {
    await db.from("tasks").insert({ source_id: id, tag: "master", task_id: "1", title: "T", status: "done" });
    await db.from("snapshots").insert({ source_id: id, tag: "master", total: 1, done: 1 });
    await deleteSource(id, db);

    expect(await getSourceView(id, db)).toBeNull();
    const t = await db.from("tasks").select("*", { count: "exact", head: true }).eq("source_id", id);
    const s = await db.from("snapshots").select("*", { count: "exact", head: true }).eq("source_id", id);
    expect(t.count).toBe(0);
    expect(s.count).toBe(0);
  });
});
