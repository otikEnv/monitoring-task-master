import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDashboardData } from "@/lib/dashboard/data";

/**
 * Data dashboard dengan SESI PENGGUNA NYATA (viewer) terhadap Supabase asli. Hanya lewat
 * `npm run test:live`. Prasyarat: migrasi 20261107010000_source_status_counts_view.sql diterapkan.
 * Semua data uji berawalan TMP-DASH- dan dihapus di akhir.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENABLED = Boolean(URL_ && ANON && SERVICE);

describe.skipIf(!ENABLED)("data dashboard (Supabase asli, sesi viewer)", () => {
  const opt = { auth: { persistSession: false, autoRefreshToken: false } };
  const run = randomBytes(3).toString("hex");
  const email = `tmp-dash-${run}@example.com`;
  const password = "Tmp!" + randomBytes(9).toString("base64url");
  let admin: SupabaseClient;
  let viewer: SupabaseClient;
  let userId: string;
  const ids: Record<string, string> = {};

  const addSource = async (key: string, over: Record<string, unknown> = {}) => {
    const { data, error } = await admin
      .from("sources")
      .insert({
        name: `TMP-DASH-${run}-${key}`,
        provider: "github",
        repo_url: `https://github.com/tmp/${run}-${key}`,
        token_encrypted: "v1.RAHASIA.RAHASIA.RAHASIA",
        ...over,
      })
      .select("id")
      .single();
    if (error) throw error;
    ids[key] = data.id as string;
  };
  const addTasks = async (key: string, statuses: string[], tag = "master") => {
    const rows = statuses.map((status, i) => ({
      source_id: ids[key], tag, task_id: String(i + 1), title: `T${i + 1}`, status,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("tasks").insert(rows.slice(i, i + 500));
      if (error) throw error;
    }
  };
  const mine = async () => {
    const data = await loadDashboardData(viewer);
    return data.cards.filter((c) => c.name.startsWith(`TMP-DASH-${run}-`));
  };

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, opt);
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id; // profil viewer dibuat otomatis oleh trigger

    await addSource("ok", { last_sync_status: "success", last_synced_at: new Date().toISOString() });
    await addTasks("ok", ["done", "done", "done", "pending", "in-progress", "review", "blocked", "deferred", "cancelled", "aneh"]);
    await addSource("gagal", { last_sync_status: "failed", last_error: "Token ditolak (401)", last_synced_at: "2026-11-05T00:00:00Z" });
    await addTasks("gagal", ["done", "pending"]);
    await addSource("kosong", { last_sync_status: "never" });
    await addSource("multitag");
    await addTasks("multitag", ["done", "pending"], "master");
    await addTasks("multitag", ["blocked", "done", "done"], "fitur");
    await addSource("off", { is_active: false });
    await addTasks("off", ["done"]);

    viewer = createClient(URL_!, ANON!, opt);
    const { error: signInError } = await viewer.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  }, 60_000);

  afterAll(async () => {
    await admin.from("sources").delete().like("name", `TMP-DASH-${run}-%`);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("viewer membaca kartu dengan hitungan status yang benar", async () => {
    const ok = (await mine()).find((c) => c.id === ids.ok)!;
    expect(ok).toMatchObject({ total: 10, percentDone: 30, hasData: true, tagCount: 1, branch: "main" });
    expect(ok.counts).toEqual({ pending: 1, in_progress: 1, review: 1, blocked: 1, done: 3, deferred: 1, cancelled: 1, other: 1 });
  });

  it("beberapa tag dijumlahkan dalam satu kartu, tagCount benar", async () => {
    const m = (await mine()).find((c) => c.id === ids.multitag)!;
    expect(m).toMatchObject({ total: 5, tagCount: 2, percentDone: 60 });
    expect(m.counts).toMatchObject({ done: 3, pending: 1, blocked: 1 });
  });

  it("sumber tanpa task: nol, hasData false, tanpa galat", async () => {
    const k = (await mine()).find((c) => c.id === ids.kosong)!;
    expect(k).toMatchObject({ total: 0, percentDone: 0, hasData: false, lastSyncStatus: "never" });
  });

  it("sumber gagal membawa pesan galat dan data lama tetap dihitung", async () => {
    const g = (await mine()).find((c) => c.id === ids.gagal)!;
    expect(g).toMatchObject({ lastSyncStatus: "failed", lastError: "Token ditolak (401)", total: 2, hasData: true });
    expect(g.lastSyncedAt).toBeTruthy();
  });

  it("urutan: gagal sinkron dulu, lalu yang punya task terhambat, lalu belum disinkronkan, nonaktif terakhir", async () => {
    // Catatan: sumber "ok" dan "multitag" sama-sama memuat task terhambat (blocked).
    const order = (await mine()).map((c) => c.name.replace(`TMP-DASH-${run}-`, ""));
    const at = (k: string) => order.indexOf(k);
    expect(at("gagal")).toBeLessThan(at("ok")); // gagal sinkron > terhambat
    expect(at("gagal")).toBeLessThan(at("multitag"));
    expect(at("ok")).toBeLessThan(at("kosong")); // terhambat > belum disinkronkan
    expect(at("multitag")).toBeLessThan(at("kosong"));
    expect(order[order.length - 1]).toBe("off"); // nonaktif paling akhir
  });

  it("ringkasan menghitung masalah dari sumber aktif milik uji ini", async () => {
    const { summary } = await loadDashboardData(viewer);
    expect(summary.failed).toBeGreaterThanOrEqual(1);
    expect(summary.blocked).toBeGreaterThanOrEqual(2); // ok + multitag
    expect(summary.neverSynced).toBeGreaterThanOrEqual(1);
  });

  it("viewer TIDAK bisa membaca token lewat jalur apa pun", async () => {
    const r1 = await viewer.from("sources").select("token_encrypted");
    expect(r1.error).toBeTruthy();
    const json = JSON.stringify(await loadDashboardData(viewer));
    expect(json).not.toContain("RAHASIA");
    expect(json).not.toContain("token_encrypted");
  });

  it("anon (tanpa login) tidak bisa membaca view hitungan", async () => {
    const anon = createClient(URL_!, ANON!, opt);
    const r = await anon.from("source_status_counts").select("*");
    expect(r.error).toBeTruthy();
  });

  it("viewer tidak bisa menulis ke view", async () => {
    const r = await viewer.from("source_status_counts").delete().eq("source_id", ids.ok);
    expect(r.error).toBeTruthy();
  });

  it("hitungan tidak terpotong pada 1000+ task (batas baris PostgREST)", async () => {
    await addSource("besar");
    // 1500 task: 1000 selesai, 500 pending
    await addTasks("besar", [...Array(1000).fill("done"), ...Array(500).fill("pending")]);
    const big = (await mine()).find((c) => c.id === ids.besar)!;
    expect(big.total).toBe(1500);
    expect(big.counts.done).toBe(1000);
    expect(big.counts.pending).toBe(500);
    expect(big.percentDone).toBe(66.7);
  }, 60_000);

  it("hitungan mengikuti perubahan task secara langsung (bukan salinan basi)", async () => {
    await admin.from("tasks").update({ status: "done" }).eq("source_id", ids.ok).eq("status", "blocked");
    const ok = (await mine()).find((c) => c.id === ids.ok)!;
    expect(ok.counts.blocked).toBe(0);
    expect(ok.counts.done).toBe(4);
  });
});
