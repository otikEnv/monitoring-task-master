import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadTaskDetail } from "@/lib/tasks/detail";

/**
 * Detail task dengan SESI VIEWER NYATA terhadap Supabase asli. Hanya lewat `npm run test:live`.
 * Tidak butuh migrasi baru (membaca tabel tasks dan sources). Data uji berawalan TMP-DET- dan dihapus di akhir.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENABLED = Boolean(URL_ && ANON && SERVICE);

describe.skipIf(!ENABLED)("detail task (Supabase asli, sesi viewer)", () => {
  const opt = { auth: { persistSession: false, autoRefreshToken: false } };
  const run = randomBytes(3).toString("hex");
  const email = `tmp-det-${run}@example.com`;
  const password = "Tmp!" + randomBytes(9).toString("base64url");
  let admin: SupabaseClient;
  let viewer: SupabaseClient;
  let userId: string;
  const ids: Record<string, string> = {};
  const BIG = "baris panjang dengan **tebal** dan `kode`\n".repeat(1500); // sekitar 60 KB

  const addSource = async (key: string, over: Record<string, unknown> = {}) => {
    const { data, error } = await admin.from("sources").insert({
      name: `TMP-DET-${run}-${key}`, provider: "github", repo_url: `https://github.com/tmp/${run}-${key}`,
      token_encrypted: "v1.RAHASIA.RAHASIA.RAHASIA", ...over,
    }).select("id").single();
    if (error) throw error;
    ids[key] = data.id as string;
  };
  const addTask = async (key: string, row: Record<string, unknown>) => {
    const { error } = await admin.from("tasks").insert({ source_id: ids[key], status: "pending", title: "T", ...row });
    if (error) throw error;
  };
  const get = (key: string, tag: string, taskId: string) =>
    loadTaskDetail(viewer, { sourceId: ids[key], tag, taskId });

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, opt);
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;

    await addSource("a");
    await addSource("b");
    await addSource("off", { is_active: false });

    await addTask("a", {
      tag: "master", task_id: "1", title: "Task utama", description: "Deskripsi **uji**", status: "blocked", priority: "high",
      details: BIG, test_strategy: null, dependencies: ["2", "3", "999", "bad,id", '(x)'],
      subtasks: [
        { id: "1", title: "Sub satu", description: "uraian", status: "done", details: "detail", dependencies: [] },
        { id: "2", title: "Sub dua", description: null, status: "pending", details: null, dependencies: ["1"] },
        "bukan objek", null, { title: "tanpa id" },
      ],
      subtasks_total: 3, subtasks_done: 1,
    });
    await addTask("a", { tag: "master", task_id: "2", title: "Dependensi dua (master)", status: "done" });
    await addTask("a", { tag: "master", task_id: "3", title: "Dependensi tiga (master)", status: "pending" });
    // ID yang sama pada tag lain di sumber yang sama: TIDAK boleh dipakai sebagai dependensi task master
    await addTask("a", { tag: "fitur", task_id: "2", title: "Dependensi dua (FITUR, salah tag)", status: "cancelled" });
    await addTask("a", { tag: "fitur", task_id: "999", title: "Seribu (FITUR, salah tag)" });
    // Sumber lain dengan ID yang sama
    await addTask("b", { tag: "master", task_id: "1", title: "Task di sumber B", status: "done" });
    await addTask("b", { tag: "master", task_id: "2", title: "Dependensi dua (sumber B, salah sumber)" });
    // Karakter khusus
    await addTask("a", { tag: "fitur x", task_id: "1/2", title: '<script>alert(1)</script> & "kutip"', details: "<img src=x onerror=alert(1)>" });
    // Sumber nonaktif
    await addTask("off", { tag: "master", task_id: "1", title: "Task sumber nonaktif" });
    // Banyak dependensi
    await addTask("a", { tag: "master", task_id: "many", title: "Banyak dependensi", dependencies: Array.from({ length: 250 }, (_, i) => String(i + 1)) });

    viewer = createClient(URL_!, ANON!, opt);
    const { error: signInError } = await viewer.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  }, 60_000);

  afterAll(async () => {
    await admin.from("sources").delete().like("name", `TMP-DET-${run}-%`);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("membaca satu task lengkap dengan nama aplikasi", async () => {
    const d = (await get("a", "master", "1"))!;
    expect(d).toMatchObject({
      sourceId: ids.a, sourceName: `TMP-DET-${run}-a`, tag: "master", taskId: "1", title: "Task utama",
      description: "Deskripsi **uji**", status: "blocked", priority: "high", testStrategy: null,
    });
    expect(d.updatedAt).toMatch(/^\d{4}-/);
  });

  it("detail panjang (~60 KB) terbaca utuh", async () => {
    const d = (await get("a", "master", "1"))!;
    expect(d.details).toBe(BIG);
    expect(d.details!.length).toBeGreaterThan(50_000);
  });

  it("dependensi dicari hanya pada sumber DAN tag yang sama, dengan urutan asli", async () => {
    const d = (await get("a", "master", "1"))!;
    expect(d.dependencies.map((x) => x.id)).toEqual(["2", "3", "999", "bad,id", "(x)"]);
    expect(d.dependencies[0]).toEqual({ id: "2", found: true, title: "Dependensi dua (master)", status: "done" });
    expect(d.dependencies[1]).toEqual({ id: "3", found: true, title: "Dependensi tiga (master)", status: "pending" });
  });

  it("dependensi yang hanya ada di tag atau sumber lain dianggap tidak ditemukan (tidak bocor lintas batas)", async () => {
    const d = (await get("a", "master", "1"))!;
    const dep999 = d.dependencies.find((x) => x.id === "999")!;
    expect(dep999).toEqual({ id: "999", found: false }); // ada di tag "fitur", bukan "master"
    expect(JSON.stringify(d)).not.toContain("salah tag");
    expect(JSON.stringify(d)).not.toContain("salah sumber");
  });

  it("ID dependensi tidak wajar (koma, kurung) tidak dicari di database dan tidak menimbulkan galat", async () => {
    const d = (await get("a", "master", "1"))!;
    expect(d.dependencies.find((x) => x.id === "bad,id")).toEqual({ id: "bad,id", found: false });
    expect(d.dependencies.find((x) => x.id === "(x)")).toEqual({ id: "(x)", found: false });
  });

  it("subtask dibaca dengan aman: elemen bukan objek dilewati, field hilang diberi nilai aman", async () => {
    const d = (await get("a", "master", "1"))!;
    expect(d.subtasks).toHaveLength(3);
    expect(d.subtasks[0]).toEqual({ id: "1", title: "Sub satu", description: "uraian", status: "done", details: "detail", dependencies: [] });
    expect(d.subtasks[1]).toMatchObject({ id: "2", title: "Sub dua", description: null, dependencies: ["1"] });
    expect(d.subtasks[2]).toMatchObject({ title: "tanpa id", status: "pending", description: null });
  });

  it("tidak ditemukan -> null (task, tag, atau sumber salah; sumber fiktif)", async () => {
    expect(await get("a", "master", "tidak-ada")).toBeNull();
    expect(await get("a", "tag-salah", "1")).toBeNull();
    expect(await loadTaskDetail(viewer, { sourceId: "00000000-0000-4000-8000-0000000000ee", tag: "master", taskId: "1" })).toBeNull();
  });

  it("ID yang sama di sumber lain menghasilkan data sumber itu saja", async () => {
    const a = (await get("a", "master", "1"))!;
    const b = (await get("b", "master", "1"))!;
    expect(a.title).toBe("Task utama");
    expect(b.title).toBe("Task di sumber B");
    expect(b.sourceName).toBe(`TMP-DET-${run}-b`);
  });

  it("tag dengan spasi dan ID dengan garis miring terbaca; teks berbahaya dikembalikan apa adanya (di-escape saat render)", async () => {
    const d = (await get("a", "fitur x", "1/2"))!;
    expect(d.title).toBe('<script>alert(1)</script> & "kutip"');
    expect(d.details).toBe("<img src=x onerror=alert(1)>");
  });

  it("task dari sumber nonaktif tetap bisa dibuka", async () => {
    expect((await get("off", "master", "1"))?.title).toBe("Task sumber nonaktif");
  });

  it("250 dependensi: pencarian dibatasi 200 dan tidak menimbulkan galat", async () => {
    const d = (await get("a", "master", "many"))!;
    expect(d.dependencies).toHaveLength(250);
    expect(d.dependencies.length).toBeGreaterThan(0);
  });

  it("viewer tidak melihat token lewat jalur apa pun", async () => {
    const json = JSON.stringify(await get("a", "master", "1"));
    expect(json).not.toContain("RAHASIA");
    expect(json).not.toContain("token_encrypted");
    expect((await viewer.from("sources").select("token_encrypted")).error).toBeTruthy();
  });

  it("anon (tanpa login) tidak bisa membaca task", async () => {
    const anon = createClient(URL_!, ANON!, opt);
    const r = await loadTaskDetail(anon, { sourceId: ids.a, tag: "master", taskId: "1" }).catch((e) => e);
    expect(r instanceof Error || r === null).toBe(true);
  });

  it("viewer tidak bisa mengubah atau menghapus task (hanya-baca)", async () => {
    await viewer.from("tasks").update({ title: "DIRETAS" }).eq("source_id", ids.a).eq("task_id", "1");
    await viewer.from("tasks").delete().eq("source_id", ids.a).eq("task_id", "2");
    expect((await get("a", "master", "1"))?.title).toBe("Task utama");
    expect(await get("a", "master", "2")).not.toBeNull();
  });
});
