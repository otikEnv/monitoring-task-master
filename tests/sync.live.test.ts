import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encryptToken } from "@/lib/crypto";
import { createSupabaseStore } from "@/lib/sync/supabase-store";
import { defaultDeps, syncSource } from "@/lib/sync/sync-source";

/**
 * Integrasi nyata: Supabase asli + GitHub asli (repo echoapp, branch stg).
 * Hanya jalan lewat `npm run test:live`. Membuat sumber sementara dan menghapusnya di akhir.
 * Prasyarat: migrasi 20261107000000_sync_apply_success.sql sudah diterapkan.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GH_TOKEN = process.env.AGG_TOKEN_ECHOAPP;
const ENABLED = Boolean(URL_ && SERVICE && GH_TOKEN && process.env.TOKEN_ENCRYPTION_KEY);

describe.skipIf(!ENABLED)("sinkronisasi nyata (echoapp -> Supabase)", () => {
  let db: SupabaseClient;
  let sourceId: string;
  const marker = `TMP-LIVE-${randomBytes(3).toString("hex")}`;

  const source = async () =>
    (await db.from("sources").select("*").eq("id", sourceId).single()).data as Record<string, unknown>;
  const count = async (table: "tasks" | "snapshots") =>
    (await db.from(table).select("*", { count: "exact", head: true }).eq("source_id", sourceId)).count;
  const deps = () => ({ ...defaultDeps(), store: createSupabaseStore(db) });

  beforeAll(async () => {
    db = createClient(URL_!, SERVICE!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db
      .from("sources")
      .insert({
        name: marker,
        provider: "github",
        repo_url: "https://github.com/echoenvisions/echoapp",
        branch: "stg",
        file_path: ".taskmaster/tasks/tasks.json",
        token_encrypted: encryptToken(GH_TOKEN!),
      })
      .select("id")
      .single();
    if (error) throw error;
    sourceId = data.id;
  });

  afterAll(async () => {
    if (sourceId) await db.from("sources").delete().eq("id", sourceId); // cascade: tasks, snapshots
  });

  it("sinkron pertama: task masuk, snapshot tercatat, status sumber sukses", async () => {
    const r = await syncSource(sourceId, deps());
    expect(r.status).toBe("success");
    if (r.status !== "success") return;
    console.log("[live] sinkron pertama:", r.taskCount, "task,", r.durationMs, "ms,", r.warnings.length, "peringatan");

    expect(r.taskCount).toBeGreaterThan(100);
    expect(await count("tasks")).toBe(r.taskCount);
    expect(await count("snapshots")).toBe(1);

    const s = await source();
    expect(s.last_sync_status).toBe("success");
    expect(s.last_error).toBeNull();
    expect(s.last_synced_at).toBeTruthy();
    expect(s.etag).toBeTruthy();
    expect(s.last_commit_at).toBeTruthy();
    expect(s.token_expires_at).toBeTruthy(); // dilaporkan GitHub

    // Hitungan snapshot konsisten dengan baris task yang tersimpan.
    const snap = (await db.from("snapshots").select("*").eq("source_id", sourceId).single()).data!;
    const { count: done } = await db.from("tasks").select("*", { count: "exact", head: true }).eq("source_id", sourceId).eq("status", "done");
    expect(snap.total).toBe(r.taskCount);
    expect(snap.done).toBe(done);
    expect(snap.pending + snap.in_progress + snap.review + snap.blocked + snap.done + snap.deferred + snap.cancelled + snap.other).toBe(snap.total);
  });

  it("subtask dan dependensi tersimpan sebagai JSON dengan ID yang sudah diseragamkan", async () => {
    const { data } = await db.from("tasks").select("task_id, dependencies, subtasks, subtasks_total, subtasks_done").eq("source_id", sourceId).eq("task_id", "165").single();
    expect(data).toBeTruthy();
    expect(data!.dependencies).toEqual(expect.arrayContaining(["159"]));
    expect(data!.subtasks_total).toBe(data!.subtasks.length);
    const ids = (data!.subtasks as Array<{ id: string }>).map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((x) => typeof x === "string")).toBe(true);
  });

  it("sinkron kedua tanpa perubahan: not_modified, tidak ada snapshot baru", async () => {
    const before = (await source()).last_synced_at;
    const r = await syncSource(sourceId, deps());
    expect(r.status).toBe("not_modified");
    expect(await count("snapshots")).toBe(1);
    expect(await count("tasks")).toBeGreaterThan(100);
    expect(new Date((await source()).last_synced_at as string).getTime()).toBeGreaterThanOrEqual(new Date(before as string).getTime());
  });

  it("kegagalan: data terakhir tetap ada, sumber ditandai gagal, last_synced_at tidak berubah", async () => {
    const tasksBefore = await count("tasks");
    const syncedBefore = (await source()).last_synced_at;

    await db.from("sources").update({ file_path: ".taskmaster/tasks/tidak-ada.json", etag: null }).eq("id", sourceId);
    const r = await syncSource(sourceId, deps());

    expect(r).toMatchObject({ status: "failed", error: { kind: "not_found" } });
    expect(JSON.stringify(r)).not.toContain(GH_TOKEN!);
    expect(await count("tasks")).toBe(tasksBefore); // tidak berubah
    expect(await count("snapshots")).toBe(1);
    const s = await source();
    expect(s.last_sync_status).toBe("failed");
    expect(s.last_error).toMatch(/404/);
    expect(s.last_synced_at).toBe(syncedBefore); // kesegaran data = sinkron berhasil terakhir
  });

  it("pulih: path diperbaiki -> sukses, galat dibersihkan, snapshot kedua tercatat", async () => {
    await db.from("sources").update({ file_path: ".taskmaster/tasks/tasks.json" }).eq("id", sourceId);
    const r = await syncSource(sourceId, deps());
    expect(r.status).toBe("success");
    const s = await source();
    expect(s.last_sync_status).toBe("success");
    expect(s.last_error).toBeNull();
    expect(await count("snapshots")).toBe(2);
  });

  it("token palsu: unauthorized, data tetap ada", async () => {
    const tasksBefore = await count("tasks");
    await db.from("sources").update({ token_encrypted: encryptToken("ghp_palsu1234567890"), etag: null }).eq("id", sourceId);
    const r = await syncSource(sourceId, deps());
    expect(r).toMatchObject({ status: "failed", error: { kind: "unauthorized" } });
    expect(await count("tasks")).toBe(tasksBefore);
    expect((await source()).last_sync_status).toBe("failed");
  });

  it("token palsu dan tanggal kedaluwarsa SUDAH LEWAT: pesan 'token kedaluwarsa' dengan tanggalnya, tersimpan untuk dashboard", async () => {
    const tasksBefore = await count("tasks");
    await db.from("sources").update({
      token_encrypted: encryptToken("ghp_palsu1234567890"), token_expires_at: "2026-11-01T09:30:29Z", etag: null,
    }).eq("id", sourceId);

    const r = await syncSource(sourceId, deps());
    expect(r).toMatchObject({ status: "failed", error: { kind: "token_expired" } });
    const msg = r.status === "failed" ? r.error.message : "";
    expect(msg).toContain("Token kedaluwarsa pada 01 Nov 2026");
    expect(msg).toContain("Pengaturan sumber");

    const s = await source();
    expect(s.last_sync_status).toBe("failed");
    expect(s.last_error).toBe(msg); // pesan yang sama yang dibaca dashboard
    expect(await count("tasks")).toBe(tasksBefore); // data terakhir yang berhasil tetap ada
  });

  it("token terenkripsi rusak: token_decrypt, tanpa memanggil GitHub", async () => {
    await db.from("sources").update({ token_encrypted: "v1.rusak.rusak.rusak" }).eq("id", sourceId);
    const r = await syncSource(sourceId, deps());
    expect(r).toMatchObject({ status: "failed", error: { kind: "token_decrypt" } });
  });

  it("sumber nonaktif dilewati", async () => {
    await db.from("sources").update({ is_active: false }).eq("id", sourceId);
    const r = await syncSource(sourceId, deps());
    expect(r).toMatchObject({ status: "skipped", reason: "inactive" });
  });
});
