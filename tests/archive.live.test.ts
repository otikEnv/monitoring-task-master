import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadArchivedReleases, loadArchivedSources } from "@/lib/archive/load";
import {
  countOpenReleasesForSource, createRelease, getRelease, ReleaseNotFoundError, setReleaseArchived, setReleasedOn,
} from "@/lib/releases/repo";
import { setSourceArchived, SourceNotFoundError } from "@/lib/sources/repo";

/**
 * Archive dan Restore dengan SESI VIEWER NYATA terhadap Supabase asli. Hanya lewat `npm run test:live`.
 * Butuh migrasi 20261115000000_archive.sql. Data uji berawalan TMP-ARC- dan dihapus di akhir.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENABLED = Boolean(URL_ && ANON && SERVICE);

describe.skipIf(!ENABLED)("archive (Supabase asli, sesi viewer)", () => {
  const opt = { auth: { persistSession: false, autoRefreshToken: false } };
  const run = randomBytes(3).toString("hex");
  const email = `tmp-arc-${run}@envisions.app`;
  const password = "Tmp!" + randomBytes(9).toString("base64url");
  let admin: SupabaseClient;
  let viewer: SupabaseClient;
  let userId: string;
  const ids: Record<string, string> = {};
  const rel: Record<string, string> = {};
  const nm = (k: string) => `TMP-ARC-${run}-${k}`;

  const addSource = async (key: string, over: Record<string, unknown> = {}) => {
    const { data, error } = await admin.from("sources").insert({
      name: nm(key), provider: "github", repo_url: `https://github.com/tmp/arc-${run}-${key}`,
      token_encrypted: "v1.RAHASIA.RAHASIA.RAHASIA", ...over,
    }).select("id").single();
    if (error) throw error;
    ids[key] = data.id as string;
  };
  const archivedAt = async (table: "sources" | "releases", id: string) =>
    (await admin.from(table).select("archived_at").eq("id", id).single()).data?.archived_at as string | null;

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, opt);
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;

    await addSource("a", { is_active: false }); // nonaktif: status ini harus bertahan setelah archive dan restore
    await addSource("b");
    const { error: te } = await admin.from("tasks").insert([
      { source_id: ids.a, tag: "master", task_id: "1", title: "A1", status: "done" },
      { source_id: ids.a, tag: "master", task_id: "2", title: "A2", status: "pending" },
      { source_id: ids.b, tag: "master", task_id: "1", title: "B1", status: "done" },
    ]);
    if (te) throw te;

    viewer = createClient(URL_!, ANON!, opt);
    const { error: se } = await viewer.auth.signInWithPassword({ email, password });
    if (se) throw se;

    const mk = async (key: string, sources: string[], over: Record<string, unknown> = {}) => {
      rel[key] = (await createRelease({
        name: nm(key), startDate: "2026-11-01", targetDate: "2026-12-01",
        components: sources.map((s) => ({ sourceId: ids[s], tag: "master", rangeStart: 1, rangeEnd: 9 })),
        ...over,
      }, admin)).id;
    };
    await mk("open", ["a", "b"]); // berjalan, lintas aplikasi
    await mk("done", ["a"]); // sudah rilis
    await setReleasedOn(rel.done, "2026-11-10", admin);
    await mk("solo", ["b"]);
  }, 120_000);

  afterAll(async () => {
    await admin.from("releases").delete().like("name", `TMP-ARC-${run}-%`);
    await admin.from("sources").delete().like("name", `TMP-ARC-${run}-%`);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("arsipkan aplikasi: archived_at terisi, status lain dan data tidak berubah; idempoten", async () => {
    await setSourceArchived(ids.a, true, admin);
    const first = await archivedAt("sources", ids.a);
    expect(first).toBeTruthy();

    // mengarsipkan lagi tidak menimpa waktu arsip yang lama
    await new Promise((r) => setTimeout(r, 30));
    await setSourceArchived(ids.a, true, admin);
    expect(await archivedAt("sources", ids.a)).toBe(first);

    const { data: s } = await admin.from("sources").select("is_active").eq("id", ids.a).single();
    expect(s?.is_active).toBe(false); // tetap nonaktif
    const { count } = await admin.from("tasks").select("task_id", { count: "exact", head: true }).eq("source_id", ids.a);
    expect(count).toBe(2);
  });

  it("restore aplikasi: archived_at kosong lagi, status nonaktif tetap; restore ulang tidak galat", async () => {
    await setSourceArchived(ids.a, false, admin);
    expect(await archivedAt("sources", ids.a)).toBeNull();
    await expect(setSourceArchived(ids.a, false, admin)).resolves.toBeUndefined();
    const { data: s } = await admin.from("sources").select("is_active").eq("id", ids.a).single();
    expect(s?.is_active).toBe(false);
  });

  it("aplikasi dan release yang tidak ada: galat yang jelas", async () => {
    const ghost = "00000000-0000-4000-8000-000000000000";
    await expect(setSourceArchived(ghost, true, admin)).rejects.toBeInstanceOf(SourceNotFoundError);
    await expect(setSourceArchived(ghost, false, admin)).rejects.toBeInstanceOf(SourceNotFoundError);
    await expect(setReleaseArchived(ghost, true, admin)).rejects.toBeInstanceOf(ReleaseNotFoundError);
    await expect(setReleaseArchived(ghost, false, admin)).rejects.toBeInstanceOf(ReleaseNotFoundError);
  });

  it("arsipkan release: tanggal rilis dan komponen tidak berubah; restore mengembalikannya", async () => {
    await setReleaseArchived(rel.done, true, admin);
    const archived = await getRelease(viewer, rel.done);
    expect(archived?.archivedAt).toBeTruthy();
    expect(archived?.releasedOn).toBe("2026-11-10");
    expect(archived?.components).toHaveLength(1);

    await setReleaseArchived(rel.done, false, admin);
    const back = await getRelease(viewer, rel.done);
    expect(back?.archivedAt).toBeNull();
    expect(back?.releasedOn).toBe("2026-11-10");
  });

  it("dampak arsip aplikasi: hanya release berjalan (belum rilis, belum terarsip) yang dihitung", async () => {
    // a: open (berjalan) dan done (sudah rilis) -> 1; b: open dan solo -> 2
    expect(await countOpenReleasesForSource(ids.a, admin)).toBe(1);
    expect(await countOpenReleasesForSource(ids.b, admin)).toBe(2);
    await setReleaseArchived(rel.solo, true, admin);
    expect(await countOpenReleasesForSource(ids.b, admin)).toBe(1);
    await setReleaseArchived(rel.solo, false, admin);
    expect(await countOpenReleasesForSource(ids.b, admin)).toBe(2);
    expect(await countOpenReleasesForSource("00000000-0000-4000-8000-000000000000", admin)).toBe(0);
  });

  it("halaman Archive: viewer melihat item terarsip (terbaru dulu), jumlah task, tanpa token", async () => {
    await setSourceArchived(ids.a, true, admin);
    await new Promise((r) => setTimeout(r, 30));
    await setSourceArchived(ids.b, true, admin);
    await setReleaseArchived(rel.open, true, admin);
    await setReleaseArchived(rel.done, true, admin);

    const sources = await loadArchivedSources(viewer, 1);
    const mine = sources.rows.filter((r) => r.name.startsWith(`TMP-ARC-${run}-`));
    expect(mine.map((r) => [r.name, r.taskCount, r.isActive])).toEqual([[nm("b"), 1, true], [nm("a"), 2, false]]); // terbaru dulu
    expect(sources.total).toBeGreaterThanOrEqual(2);
    expect(sources.pageSize).toBe(10);

    const releases = await loadArchivedReleases(viewer, 1);
    const rmine = releases.rows.filter((r) => r.name.startsWith(`TMP-ARC-${run}-`));
    expect(rmine.map((r) => [r.name, r.componentCount, r.releasedOn])).toEqual([
      [nm("done"), 1, "2026-11-10"], [nm("open"), 2, null],
    ]);

    const json = JSON.stringify([sources, releases]);
    expect(json).not.toContain("RAHASIA");
    expect(json).not.toContain("token_encrypted");
  });

  it("aplikasi dan release yang aktif tidak muncul di daftar Archive", async () => {
    await setSourceArchived(ids.a, false, admin);
    await setReleaseArchived(rel.open, false, admin);
    const sources = await loadArchivedSources(viewer, 1);
    expect(sources.rows.map((r) => r.name)).not.toContain(nm("a"));
    expect(sources.rows.map((r) => r.name)).toContain(nm("b"));
    const releases = await loadArchivedReleases(viewer, 1);
    expect(releases.rows.map((r) => r.name)).not.toContain(nm("open"));
  });

  it("halaman melewati akhir dipotong ke halaman terakhir (tanpa galat)", async () => {
    const p = await loadArchivedSources(viewer, 9999);
    expect(p.page).toBe(p.pageCount);
  });

  it("viewer tidak bisa mengubah status arsip", async () => {
    const before = await archivedAt("sources", ids.b);
    await viewer.from("sources").update({ archived_at: null }).eq("id", ids.b);
    await viewer.from("releases").update({ archived_at: new Date().toISOString() }).eq("id", rel.solo);
    expect(await archivedAt("sources", ids.b)).toBe(before);
    expect(await archivedAt("releases", rel.solo)).toBeNull();
  });
});
