import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDashboardData } from "@/lib/dashboard/data";
import {
  fetchTagTasks, loadReleaseOverviews, loadSourceOptions, previewRange,
} from "@/lib/releases/load";
import {
  DuplicateReleaseError, ReleaseNotFoundError, SourceTagError, assertComponents, assertSourceTag, createRelease,
  deleteRelease, getRelease, setReleasedOn, updateRelease,
} from "@/lib/releases/repo";
import type { ComponentInput, ReleaseInput } from "@/lib/releases/validate";

/**
 * Fitur Release (termasuk lintas aplikasi) dengan SESI VIEWER NYATA terhadap Supabase asli. Hanya lewat
 * `npm run test:live`. Butuh migrasi 20261107040000_releases.sql dan 20261114010000_release_components.sql.
 * Data uji berawalan TMP-REL- dan dihapus di akhir. Release uji selalu bernama TMP-REL-<run>-... karena
 * nama release unik di seluruh aplikasi.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENABLED = Boolean(URL_ && ANON && SERVICE);

describe.skipIf(!ENABLED)("release (Supabase asli, sesi viewer)", () => {
  const opt = { auth: { persistSession: false, autoRefreshToken: false } };
  const run = randomBytes(3).toString("hex");
  const email = `tmp-rel-${run}@envisions.app`;
  const password = "Tmp!" + randomBytes(9).toString("base64url");
  const NOW = new Date("2026-11-11T05:00:00Z");
  let admin: SupabaseClient;
  let viewer: SupabaseClient;
  let userId: string;
  const ids: Record<string, string> = {};
  const relIds: Record<string, string> = {};
  const rname = (key: string) => `TMP-REL-${run}-${key}`;

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
  const comp = (key: string, tag: string, rangeStart: number, rangeEnd: number): ComponentInput =>
    ({ sourceId: ids[key], tag, rangeStart, rangeEnd });
  const input = (key: string, components: ComponentInput[], over: Partial<ReleaseInput> = {}): ReleaseInput => ({
    name: rname(key), startDate: "2026-11-01", targetDate: "2026-11-21", components, ...over,
  });
  const overview = async (key: string, includeReleased = true) =>
    loadReleaseOverviews(viewer, { sourceId: ids[key], includeReleased }, NOW);
  const byId = async (key: string, relKey: string) => (await overview(key)).find((x) => x.release.id === relIds[relKey])!;

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, opt);
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;

    await addSource("a");
    await addSource("b");
    await addSource("kosong");
    // Application A, tag master: #1–#9 milik rilis lama; #10–#19 rilis v2.1; #20 dan seterusnya v2.2; task luar #5.
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
    // Application B (backend): #1–#4 pada tag main, 3 selesai.
    await addTasks("b", "main", [
      { id: 1, status: "done" }, { id: 2, status: "done" }, { id: 3, status: "done" }, { id: 4, status: "pending" },
    ]);

    viewer = createClient(URL_!, ANON!, opt);
    const { error: signInError } = await viewer.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    const mk = async (key: string, components: ComponentInput[], over: Partial<ReleaseInput> = {}) => {
      relIds[key] = (await createRelease(input(key, components, over), admin)).id;
    };
    await mk("v21", [comp("a", "master", 10, 19)]);
    await mk("v22", [comp("a", "master", 20, 29)], { targetDate: "2026-12-15", startDate: "2026-11-15" });
    await mk("lama", [comp("a", "master", 1, 9)], { startDate: "2026-10-01", targetDate: "2026-10-20" });
    await setReleasedOn(relIds.lama, "2026-10-19", admin);
    // Lintas aplikasi: A master #10–#19 (10 task, 5 selesai) + B main #1–#4 (4 task, 3 selesai).
    await mk("x", [comp("a", "master", 10, 19), comp("b", "main", 1, 4)], { targetDate: "2026-11-25" });
  }, 120_000);

  afterAll(async () => {
    await admin.from("releases").delete().like("name", `TMP-REL-${run}-%`);
    await admin.from("sources").delete().like("name", `TMP-REL-${run}-%`);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("viewer menghitung v2.1 sama dengan hitungan manual dari data sumber", async () => {
    const o = await byId("a", "v21");
    // 10 task (#10–#19): 5 selesai, 1 in progress, 1 ditinjau, 1 blocked, 1 ditunda, 1 dibatalkan.
    expect(o.components).toHaveLength(1);
    const c = o.components[0];
    expect(c.stats.total).toBe(10);
    expect(c.stats.counts).toMatchObject({ done: 5, in_progress: 1, review: 1, blocked: 1, deferred: 1, cancelled: 1, pending: 0 });
    expect(c.stats.percentDone).toBe(50);
    expect([c.stats.firstId, c.stats.lastId]).toEqual(["10", "19"]);
    // Tag lain (#10, #11 pada "mobile") dan ID non-angka tidak ikut.
    expect(c.stats.tasks.map((t) => t.taskId)).not.toContain("abc");
    expect(c.sourceName).toBe(rname("a"));
    expect(c.tagFound).toBe(true);
    // Satu komponen: gabungan sama dengan komponen.
    expect([o.stats.total, o.stats.done, o.stats.percentDone, o.stats.risk]).toEqual([10, 5, 50, c.stats.risk]);
  });

  it("hambatan: blocked, dependensi di luar rentang yang belum selesai, ditunda dan dibatalkan", async () => {
    const { stats } = (await byId("a", "v21")).components[0];
    expect(stats.attention.blocked.map((t) => t.taskId)).toEqual(["17"]);
    expect(stats.attention.waiting.map((w) => [w.task.taskId, w.deps.map((d) => d.id)])).toEqual([["15", ["8"]]]);
    expect(stats.attention.deferred.map((t) => t.taskId)).toEqual(["18"]);
    expect(stats.attention.cancelled.map((t) => t.taskId)).toEqual(["19"]);
    expect(["at_risk", "behind"]).toContain(stats.risk);
  });

  it("v2.2: dependensi selesai bukan hambatan, yang belum selesai menahan, yang tidak ditemukan dilaporkan terpisah", async () => {
    const { stats } = (await byId("a", "v22")).components[0];
    expect(stats.total).toBe(2); // #20 dan #21
    // #20 depends on #4 (selesai, bukan hambatan) dan #99 (tidak ada); #21 depends on #17 (di luar rentang, blocked).
    expect(stats.attention.waiting.map((w) => [w.task.taskId, w.deps.map((d) => d.id)])).toEqual([["21", ["17"]]]);
    expect(stats.attention.missingDeps.map((m) => [m.task.taskId, m.ids])).toEqual([["20", ["99"]]]);
  });

  describe("lintas aplikasi", () => {
    it("total gabungan = jumlah task komponen, progres dari jumlah task (bukan rata-rata)", async () => {
      const o = await byId("a", "x");
      expect(o.components.map((c) => [c.sourceName, c.component.tag, c.stats.total, c.stats.done])).toEqual([
        [rname("a"), "master", 10, 5],
        [rname("b"), "main", 4, 3],
      ]);
      // 8 dari 14 = 57%, bukan rata-rata 50% dan 75% = 62,5%.
      expect([o.stats.total, o.stats.done, o.stats.percentDone]).toEqual([14, 8, 57]);
      expect(o.stats.counts).toMatchObject({ done: 8, blocked: 1, deferred: 1, cancelled: 1, in_progress: 1, review: 1, pending: 1 });
    });

    it("risiko gabungan memakai komponen yang terhambat dan menyebutnya", async () => {
      const o = await byId("a", "x");
      expect(["at_risk", "behind"]).toContain(o.stats.risk);
      expect(o.stats.riskComponents).toContain(0); // komponen A punya task terhambat
    });

    it("filter aplikasi: release lintas aplikasi muncul pada kedua aplikasi", async () => {
      const a = (await overview("a")).map((o) => o.release.id);
      const b = (await overview("b")).map((o) => o.release.id);
      expect(a).toEqual(expect.arrayContaining([relIds.v21, relIds.v22, relIds.x, relIds.lama]));
      expect(b).toEqual([relIds.x]);
      expect(await overview("kosong")).toEqual([]);
    });

    it("kedua komponen memakai data task yang benar (task dibaca per aplikasi dan tag)", async () => {
      const o = await byId("b", "x");
      expect(o.components.find((c) => c.component.sourceId === ids.b)?.stats.tasks.map((t) => t.taskId).sort()).toEqual(["1", "2", "3", "4"]);
    });

    it("Dashboard: tiap aplikasi menampilkan progres komponennya dan risiko release", async () => {
      const { cards } = await loadDashboardData(viewer, NOW.getTime());
      const a = cards.find((c) => c.id === ids.a)!;
      const b = cards.find((c) => c.id === ids.b)!;
      // A: v2.1 (target 21 Nov) terdekat; lalu x (25 Nov) dan v2.2 (15 Des) = 2 lainnya.
      expect(a.release).toMatchObject({ releaseId: relIds.v21, total: 10, percent: 50, extra: 2, componentCount: 1 });
      // B hanya ada pada release lintas aplikasi: progres komponen B (3 dari 4), jumlah komponen 2.
      expect(b.release).toMatchObject({ releaseId: relIds.x, total: 4, percent: 75, extra: 0, componentCount: 2 });
    });
  });

  it("release yang sudah rilis tersembunyi secara bawaan dan tampil bila diminta", async () => {
    const aktif = (await overview("a", false)).map((x) => x.release.name).sort();
    expect(aktif).toEqual([rname("v21"), rname("v22"), rname("x")].sort());
    const semua = (await overview("a", true)).map((x) => x.release.name);
    // belum rilis dulu menurut target terdekat, lalu yang rilis
    expect(semua).toEqual([rname("v21"), rname("x"), rname("v22"), rname("lama")]);
    expect((await overview("a", true)).at(-1)?.stats.risk).toBe("released");
  });

  it("viewer tidak bisa menulis release maupun komponennya (hanya-baca) dan tidak bisa memanggil save_release", async () => {
    const ins = await viewer.from("releases").insert({ name: "DIRETAS", target_date: "2026-12-01" });
    expect(ins.error).toBeTruthy();
    const insC = await viewer.from("release_components").insert({
      release_id: relIds.v21, source_id: ids.a, tag: "master", range_start: 1, range_end: 2,
    });
    expect(insC.error).toBeTruthy();
    await viewer.from("releases").update({ name: "DIRETAS" }).eq("id", relIds.v21);
    await viewer.from("release_components").update({ tag: "diretas" }).eq("release_id", relIds.v21);
    await viewer.from("release_components").delete().eq("release_id", relIds.x);
    await viewer.from("releases").delete().eq("id", relIds.v22);
    const rpc = await viewer.rpc("save_release", {
      p_id: null, p_header: { name: "DIRETAS", target_date: "2026-12-01" },
      p_components: [{ source_id: ids.a, tag: "master", range_start: 1, range_end: 2 }],
    });
    expect(rpc.error).toBeTruthy();

    expect((await getRelease(viewer, relIds.v21))).toMatchObject({ name: rname("v21") });
    expect((await getRelease(viewer, relIds.v21))?.components.map((c) => c.tag)).toEqual(["master"]);
    expect((await getRelease(viewer, relIds.x))?.components).toHaveLength(2);
    expect(await getRelease(viewer, relIds.v22)).not.toBeNull();
    const { data } = await admin.from("releases").select("id").eq("name", "DIRETAS");
    expect(data).toEqual([]);
  });

  it("anon (tanpa login) tidak bisa membaca release, komponen, maupun menjalankan save_release", async () => {
    const anon = createClient(URL_!, ANON!, opt);
    const r = await anon.from("releases").select("id");
    expect(r.error || (r.data ?? []).length === 0).toBeTruthy();
    const c = await anon.from("release_components").select("id");
    expect(c.error || (c.data ?? []).length === 0).toBeTruthy();
    const rpc = await anon.rpc("save_release", { p_id: null, p_header: {}, p_components: [] });
    expect(rpc.error).toBeTruthy();
  });

  it("nama ganda (global) dan pasangan (aplikasi, tag) ganda ditolak; aplikasi dan tag divalidasi", async () => {
    // Nama sama walau aplikasinya berbeda tetap ditolak.
    await expect(createRelease(input("v21", [comp("b", "main", 1, 2)]), admin)).rejects.toBeInstanceOf(DuplicateReleaseError);
    await expect(createRelease(input("ganda", [comp("a", "master", 1, 2), comp("a", "master", 3, 4)]), admin)).rejects.toThrow();
    await expect(assertSourceTag(ids.a, "tidak-ada", admin)).rejects.toMatchObject({ field: "tag" });
    await expect(assertSourceTag("00000000-0000-4000-8000-000000000000", "master", admin)).rejects.toBeInstanceOf(SourceTagError);
    await expect(assertSourceTag(ids.a, "mobile", admin)).resolves.toBeUndefined();
    await expect(assertComponents([comp("a", "master", 1, 2), comp("b", "tidak-ada", 1, 2)], admin))
      .rejects.toMatchObject({ field: "tag", index: 1 });
    await expect(assertComponents([comp("a", "master", 1, 2), comp("b", "main", 1, 2)], admin)).resolves.toBeUndefined();
  });

  it("penyimpanan atomik: komponen tidak valid tidak meninggalkan release", async () => {
    const bad = input("atomik", [comp("a", "master", 1, 2), { ...comp("b", "main", 1, 2), rangeStart: 9, rangeEnd: 1 }]);
    await expect(createRelease(bad, admin)).rejects.toThrow();
    const { data } = await admin.from("releases").select("id").eq("name", rname("atomik"));
    expect(data).toEqual([]);

    // Ubah yang gagal tidak mengubah komponen lama.
    await expect(updateRelease(relIds.x, { ...bad, name: rname("x") }, admin)).rejects.toThrow();
    expect((await getRelease(viewer, relIds.x))?.components).toHaveLength(2);
  });

  it("ubah: komponen diganti seluruhnya; tandai rilis, batalkan, dan hapus (komponen ikut terhapus)", async () => {
    const id = (await createRelease(input("sementara", [comp("a", "mobile", 10, 11)], { startDate: null, targetDate: "2026-12-01" }), admin)).id;
    // tanggal mulai kosong memakai bawaan database (today WIB)
    expect((await getRelease(viewer, id))?.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await updateRelease(id, input("sementara-2", [comp("a", "mobile", 10, 12), comp("b", "main", 1, 4)], { startDate: "2026-11-02", targetDate: "2026-12-02" }), admin);
    const after = await getRelease(viewer, id);
    expect(after).toMatchObject({ name: rname("sementara-2"), startDate: "2026-11-02", targetDate: "2026-12-02" });
    expect(after?.components.map((c) => [c.sourceId, c.tag, c.rangeEnd]).sort()).toEqual(
      [[ids.a, "mobile", 12], [ids.b, "main", 4]].sort(),
    );

    // startDate null pada ubah tidak menimpa tanggal lama
    await updateRelease(id, input("sementara-2", [comp("a", "mobile", 10, 12)], { startDate: null, targetDate: "2026-12-02" }), admin);
    expect((await getRelease(viewer, id))?.startDate).toBe("2026-11-02");
    expect((await getRelease(viewer, id))?.components).toHaveLength(1);

    await setReleasedOn(id, "2026-12-01", admin);
    expect((await getRelease(viewer, id))?.releasedOn).toBe("2026-12-01");
    // mengubah komponen tidak membatalkan tanda rilis
    await updateRelease(id, input("sementara-2", [comp("a", "mobile", 10, 11)], { startDate: null, targetDate: "2026-12-02" }), admin);
    expect((await getRelease(viewer, id))?.releasedOn).toBe("2026-12-01");
    await setReleasedOn(id, null, admin);
    expect((await getRelease(viewer, id))?.releasedOn).toBeNull();

    await deleteRelease(id, admin);
    expect(await getRelease(viewer, id)).toBeNull();
    const { data } = await admin.from("release_components").select("id").eq("release_id", id);
    expect(data).toEqual([]);
    await expect(deleteRelease(id, admin)).rejects.toBeInstanceOf(ReleaseNotFoundError);
    await expect(setReleasedOn(id, null, admin)).rejects.toBeInstanceOf(ReleaseNotFoundError);
    await expect(updateRelease(id, input("hantu", [comp("a", "master", 1, 2)]), admin)).rejects.toBeInstanceOf(ReleaseNotFoundError);
  });

  it("pratinjau rentang dan pilihan aplikasi dengan tag", async () => {
    expect(await previewRange(viewer, ids.a, "master", 10, 19)).toEqual({ count: 10, firstId: "10", lastId: "19" });
    expect(await previewRange(viewer, ids.a, "master", 500, 600)).toEqual({ count: 0, firstId: null, lastId: null });
    const opts = await loadSourceOptions(viewer);
    expect(opts.find((s) => s.id === ids.a)?.tags).toEqual(["master", "mobile"]);
    expect(opts.find((s) => s.id === ids.kosong)?.tags).toEqual([]);
  });

  it("tag tanpa task: tagFound false dan statistik nol; komponen lain tetap dihitung", async () => {
    const id = (await createRelease(input("kosong", [comp("kosong", "master", 1, 5), comp("b", "main", 1, 4)]), admin)).id;
    const [o] = await loadReleaseOverviews(viewer, { id }, NOW);
    const kosong = o.components.find((c) => c.component.sourceId === ids.kosong)!;
    expect([kosong.tagFound, kosong.stats.total, kosong.stats.risk]).toEqual([false, 0, "empty"]);
    expect(o.stats.total).toBe(4);
  });

  it("membaca lebih dari 1000 task satu tag berhalaman tanpa terpotong", async () => {
    await addSource("besar");
    await addTasks("besar", "master", Array.from({ length: 1150 }, (_, i) => ({ id: i + 1, status: i % 2 ? "done" : "pending" })));
    const tasks = await fetchTagTasks(viewer, ids.besar, "master");
    expect(tasks).toHaveLength(1150);
    const id = (await createRelease(input("besar", [comp("besar", "master", 1, 1150)], { startDate: null }), admin)).id;
    const [o] = await loadReleaseOverviews(viewer, { id }, NOW);
    expect([o.stats.total, o.stats.done, o.stats.percentDone]).toEqual([1150, 575, 50]);
  }, 60_000);

  it("menghapus aplikasi menghapus komponennya; release tetap ada dan tampil tanpa komponen", async () => {
    const id = (await createRelease(input("yatim", [comp("kosong", "master", 1, 5)]), admin)).id;
    await admin.from("sources").delete().eq("id", ids.kosong);
    const c = await admin.from("release_components").select("id").eq("source_id", ids.kosong);
    expect(c.data).toEqual([]);
    const [o] = await loadReleaseOverviews(viewer, { id }, NOW);
    expect(o.release.id).toBe(id);
    expect([o.components.length, o.stats.total, o.stats.risk]).toEqual([0, 0, "empty"]);
    // Release lintas aplikasi yang kehilangan satu komponen tetap menghitung komponen lainnya.
    const x = (await loadReleaseOverviews(viewer, { id: (await admin.from("releases").select("id").eq("name", rname("kosong")).single()).data!.id }, NOW))[0];
    expect(x.components.map((k) => k.component.sourceId)).toEqual([ids.b]);
    expect(x.stats.total).toBe(4);
  });

  it("viewer tidak melihat token lewat jalur release", async () => {
    const json = JSON.stringify(await overview("a"));
    expect(json).not.toContain("RAHASIA");
    expect(json).not.toContain("token_encrypted");
  });
});
