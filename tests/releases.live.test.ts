import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDashboardData } from "@/lib/dashboard/data";
import {
  fetchTagTasks, loadReleaseOverviews, loadSourceOptions, previewRange,
} from "@/lib/releases/load";
import {
  DuplicateReleaseError, ReleaseNotFoundError, SourceTagError, assertSourceTag, createRelease, deleteRelease,
  getRelease, setReleasedOn, updateRelease,
} from "@/lib/releases/repo";

/**
 * Fitur Release dengan SESI VIEWER NYATA terhadap Supabase asli. Hanya lewat `npm run test:live`.
 * Butuh migrasi 20261107040000_releases.sql. Data uji berawalan TMP-REL- dan dihapus di akhir.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENABLED = Boolean(URL_ && ANON && SERVICE);

describe.skipIf(!ENABLED)("release (Supabase asli, sesi viewer)", () => {
  const opt = { auth: { persistSession: false, autoRefreshToken: false } };
  const run = randomBytes(3).toString("hex");
  const email = `tmp-rel-${run}@example.com`;
  const password = "Tmp!" + randomBytes(9).toString("base64url");
  let admin: SupabaseClient;
  let viewer: SupabaseClient;
  let userId: string;
  const ids: Record<string, string> = {};
  const relIds: Record<string, string> = {};

  const addSource = async (key: string) => {
    const { data, error } = await admin.from("sources").insert({
      name: `TMP-REL-${run}-${key}`, provider: "github", repo_url: `https://github.com/tmp/rel-${run}-${key}`,
      token_encrypted: "v1.RAHASIA.RAHASIA.RAHASIA",
    }).select("id").single();
    if (error) throw error;
    ids[key] = data.id as string;
  };
  const addTasks = async (key: string, tag: string, rows: { id: number | string; status: string; deps?: unknown[]; title?: string }[]) => {
    const { error } = await admin.from("tasks").insert(
      rows.map((r) => ({
        source_id: ids[key], tag, task_id: String(r.id), title: r.title ?? `T${r.id}`, status: r.status,
        dependencies: r.deps ?? [],
      })),
    );
    if (error) throw error;
  };
  const overview = async (key: string, includeReleased = true) =>
    (await loadReleaseOverviews(viewer, { sourceId: ids[key], includeReleased }, new Date("2026-11-11T05:00:00Z")));

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, opt);
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;

    await addSource("a");
    await addSource("kosong");
    // Aplikasi A, tag master: #1–#9 milik rilis lama; #10–#19 rilis v2.1; #20 dan seterusnya v2.2; task luar #5.
    await addTasks("a", "master", [
      ...Array.from({ length: 9 }, (_, i) => ({ id: i + 1, status: "done" })),
      { id: 10, status: "done" }, { id: 11, status: "done" }, { id: 12, status: "done" }, { id: 13, status: "done" }, { id: 14, status: "done" },
      { id: 15, status: "in-progress" }, { id: 16, status: "review" },
      { id: 17, status: "blocked" },
      { id: 18, status: "deferred" }, { id: 19, status: "cancelled" },
      { id: 20, status: "pending", deps: [4, 99] },
      { id: 21, status: "pending", deps: [17] },
      { id: "abc", status: "done" },
    ]);
    // Task #8 dibuat belum selesai agar menjadi dependensi luar yang menahan v2.1.
    await admin.from("tasks").update({ status: "pending", title: "Penahan di luar rentang" }).eq("source_id", ids.a).eq("task_id", "8");
    await admin.from("tasks").update({ dependencies: [8] }).eq("source_id", ids.a).eq("task_id", "15");
    // Tag lain dengan nomor yang sama tidak boleh ikut terhitung.
    await addTasks("a", "mobile", [{ id: 10, status: "done" }, { id: 11, status: "done" }]);

    viewer = createClient(URL_!, ANON!, opt);
    const { error: signInError } = await viewer.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    const mk = async (key: string, over: Record<string, unknown>) => {
      relIds[key] = (await createRelease({
        sourceId: ids.a, tag: "master", name: `v-${key}`, rangeStart: 10, rangeEnd: 19, startDate: "2026-11-01",
        targetDate: "2026-11-21", ...over,
      } as never, admin)).id;
    };
    await mk("v21", { name: "v2.1" });
    await mk("v22", { name: "v2.2", rangeStart: 20, rangeEnd: 29, targetDate: "2026-12-15", startDate: "2026-11-15" });
    await mk("lama", { name: "v2.0", rangeStart: 1, rangeEnd: 9, startDate: "2026-10-01", targetDate: "2026-10-20" });
    await setReleasedOn(relIds.lama, "2026-10-19", admin);
  }, 120_000);

  afterAll(async () => {
    await admin.from("sources").delete().like("name", `TMP-REL-${run}-%`);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("viewer menghitung v2.1 sama dengan hitungan manual dari data sumber", async () => {
    const o = (await overview("a")).find((x) => x.release.id === relIds.v21)!;
    // 10 task (#10–#19): 5 selesai, 1 dikerjakan, 1 ditinjau, 1 terhambat, 1 ditunda, 1 dibatalkan.
    expect(o.stats.total).toBe(10);
    expect(o.stats.counts).toMatchObject({ done: 5, in_progress: 1, review: 1, blocked: 1, deferred: 1, cancelled: 1, pending: 0 });
    expect(o.stats.percentDone).toBe(50);
    expect([o.stats.firstId, o.stats.lastId]).toEqual(["10", "19"]);
    // Tag lain (#10, #11 pada "mobile") dan ID non-angka tidak ikut.
    expect(o.stats.tasks.map((t) => t.taskId)).not.toContain("abc");
    expect(o.sourceName).toBe(`TMP-REL-${run}-a`);
    expect(o.tagFound).toBe(true);
  });

  it("hambatan: terhambat, dependensi di luar rentang yang belum selesai, ditunda dan dibatalkan", async () => {
    const o = (await overview("a")).find((x) => x.release.id === relIds.v21)!;
    expect(o.stats.attention.blocked.map((t) => t.taskId)).toEqual(["17"]);
    expect(o.stats.attention.waiting.map((w) => [w.task.taskId, w.deps.map((d) => d.id)])).toEqual([["15", ["8"]]]);
    expect(o.stats.attention.deferred.map((t) => t.taskId)).toEqual(["18"]);
    expect(o.stats.attention.cancelled.map((t) => t.taskId)).toEqual(["19"]);
    expect(["at_risk", "behind"]).toContain(o.stats.risk);
  });

  it("v2.2: dependensi selesai bukan hambatan, yang belum selesai menahan, yang tidak ditemukan dilaporkan terpisah", async () => {
    const o = (await overview("a")).find((x) => x.release.id === relIds.v22)!;
    expect(o.stats.total).toBe(2); // #20 dan #21
    // #20 bergantung pada #4 (selesai, bukan hambatan) dan #99 (tidak ada); #21 bergantung pada #17 (di luar rentang, terhambat).
    expect(o.stats.attention.waiting.map((w) => [w.task.taskId, w.deps.map((d) => d.id)])).toEqual([["21", ["17"]]]);
    expect(o.stats.attention.missingDeps.map((m) => [m.task.taskId, m.ids])).toEqual([["20", ["99"]]]);
  });

  it("release yang sudah rilis tersembunyi secara bawaan dan tampil bila diminta", async () => {
    const aktif = await overview("a", false);
    expect(aktif.map((x) => x.release.name).sort()).toEqual(["v2.1", "v2.2"]);
    const semua = await overview("a", true);
    expect(semua.map((x) => x.release.name)).toEqual(["v2.1", "v2.2", "v2.0"]); // belum rilis dulu, lalu yang rilis
    expect(semua.at(-1)?.stats.risk).toBe("released");
  });

  it("viewer tidak bisa menulis release (hanya-baca)", async () => {
    const ins = await viewer.from("releases").insert({
      source_id: ids.a, tag: "master", name: "DIRETAS", range_start: 1, range_end: 2, target_date: "2026-12-01",
    });
    expect(ins.error).toBeTruthy();
    await viewer.from("releases").update({ name: "DIRETAS" }).eq("id", relIds.v21);
    await viewer.from("releases").delete().eq("id", relIds.v22);
    expect((await getRelease(viewer, relIds.v21))?.name).toBe("v2.1");
    expect(await getRelease(viewer, relIds.v22)).not.toBeNull();
  });

  it("anon (tanpa login) tidak bisa membaca release", async () => {
    const anon = createClient(URL_!, ANON!, opt);
    const r = await anon.from("releases").select("id");
    expect(r.error || (r.data ?? []).length === 0).toBeTruthy();
  });

  it("nama ganda pada aplikasi yang sama ditolak; aplikasi dan tag divalidasi", async () => {
    await expect(createRelease({
      sourceId: ids.a, tag: "master", name: "v2.1", rangeStart: 1, rangeEnd: 2, startDate: null, targetDate: "2026-12-01",
    }, admin)).rejects.toBeInstanceOf(DuplicateReleaseError);
    await expect(assertSourceTag(ids.a, "tidak-ada", admin)).rejects.toMatchObject({ field: "tag" });
    await expect(assertSourceTag("00000000-0000-4000-8000-000000000000", "master", admin)).rejects.toBeInstanceOf(SourceTagError);
    await expect(assertSourceTag(ids.a, "mobile", admin)).resolves.toBeUndefined();
  });

  it("ubah, tandai rilis, batalkan tanda rilis, dan hapus; release hilang memberi galat jelas", async () => {
    const id = (await createRelease({
      sourceId: ids.a, tag: "mobile", name: "v-sementara", rangeStart: 10, rangeEnd: 11, startDate: null, targetDate: "2026-12-01",
    }, admin)).id;
    // tanggal mulai kosong memakai bawaan database (hari ini WIB)
    expect((await getRelease(viewer, id))?.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await updateRelease(id, {
      sourceId: ids.a, tag: "mobile", name: "v-sementara-2", rangeStart: 10, rangeEnd: 12, startDate: "2026-11-02", targetDate: "2026-12-02",
    }, admin);
    expect(await getRelease(viewer, id)).toMatchObject({ name: "v-sementara-2", rangeEnd: 12, startDate: "2026-11-02", targetDate: "2026-12-02" });

    await setReleasedOn(id, "2026-12-01", admin);
    expect((await getRelease(viewer, id))?.releasedOn).toBe("2026-12-01");
    await setReleasedOn(id, null, admin);
    expect((await getRelease(viewer, id))?.releasedOn).toBeNull();

    await deleteRelease(id, admin);
    expect(await getRelease(viewer, id)).toBeNull();
    await expect(deleteRelease(id, admin)).rejects.toBeInstanceOf(ReleaseNotFoundError);
    await expect(setReleasedOn(id, null, admin)).rejects.toBeInstanceOf(ReleaseNotFoundError);
  });

  it("pratinjau rentang dan pilihan aplikasi dengan tag", async () => {
    expect(await previewRange(viewer, ids.a, "master", 10, 19)).toEqual({ count: 10, firstId: "10", lastId: "19" });
    expect(await previewRange(viewer, ids.a, "master", 500, 600)).toEqual({ count: 0, firstId: null, lastId: null });
    const opts = await loadSourceOptions(viewer);
    expect(opts.find((s) => s.id === ids.a)?.tags).toEqual(["master", "mobile"]);
    expect(opts.find((s) => s.id === ids.kosong)?.tags).toEqual([]);
  });

  it("tag tanpa task: tagFound false dan statistik nol, bukan galat", async () => {
    const id = (await createRelease({
      sourceId: ids.kosong, tag: "master", name: "v-kosong", rangeStart: 1, rangeEnd: 5, startDate: null, targetDate: "2026-12-01",
    }, admin)).id;
    const [o] = await loadReleaseOverviews(viewer, { id });
    expect([o.tagFound, o.stats.total, o.stats.risk]).toEqual([false, 0, "empty"]);
  });

  it("membaca lebih dari 1000 task satu tag berhalaman tanpa terpotong", async () => {
    await addSource("besar");
    await addTasks("besar", "master", Array.from({ length: 1150 }, (_, i) => ({ id: i + 1, status: i % 2 ? "done" : "pending" })));
    const tasks = await fetchTagTasks(viewer, ids.besar, "master");
    expect(tasks).toHaveLength(1150);
    const id = (await createRelease({
      sourceId: ids.besar, tag: "master", name: "v-besar", rangeStart: 1, rangeEnd: 1150, startDate: null, targetDate: "2026-12-01",
    }, admin)).id;
    const [o] = await loadReleaseOverviews(viewer, { id });
    expect([o.stats.total, o.stats.done, o.stats.percentDone]).toEqual([1150, 575, 50]);
  }, 60_000);

  it("Dashboard menampilkan release belum rilis terdekat per aplikasi", async () => {
    const { cards } = await loadDashboardData(viewer, new Date("2026-11-11T05:00:00Z").getTime());
    const card = cards.find((c) => c.id === ids.a)!;
    expect(card.release).toMatchObject({ releaseId: relIds.v21, name: "v2.1", extra: 1, total: 10, percent: 50 });
    // aplikasi tanpa release aktif (hanya yang sudah rilis) tidak punya baris release
    const none = cards.find((c) => c.id === ids.kosong)!;
    expect(none.release?.name).toBe("v-kosong");
  });

  it("menghapus aplikasi ikut menghapus release-nya", async () => {
    await admin.from("sources").delete().eq("id", ids.kosong);
    const r = await admin.from("releases").select("id").eq("source_id", ids.kosong);
    expect(r.data).toEqual([]);
  });

  it("viewer tidak melihat token lewat jalur release", async () => {
    const json = JSON.stringify(await overview("a"));
    expect(json).not.toContain("RAHASIA");
    expect(json).not.toContain("token_encrypted");
  });
});
