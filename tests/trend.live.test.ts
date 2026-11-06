import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadTrend } from "@/lib/trend/data";
import type { Range, TrendParams } from "@/lib/trend/series";

/**
 * Data tren dengan SESI VIEWER NYATA terhadap Supabase asli. Hanya lewat `npm run test:live`.
 * Prasyarat: migrasi 20261107030000_source_snapshot_totals_view.sql diterapkan.
 * Data uji berawalan TMP-TREN- dan dihapus di akhir.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENABLED = Boolean(URL_ && ANON && SERVICE);

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

describe.skipIf(!ENABLED)("data tren (Supabase asli, sesi viewer)", () => {
  const opt = { auth: { persistSession: false, autoRefreshToken: false } };
  const run = randomBytes(3).toString("hex");
  const email = `tmp-tren-${run}@example.com`;
  const password = "Tmp!" + randomBytes(9).toString("base64url");
  const NOW = Date.now();
  const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
  let admin: SupabaseClient;
  let viewer: SupabaseClient;
  let userId: string;
  const ids: Record<string, string> = {};
  /** Ada data nyata lain di database: pengujian gabungan tidak bisa dihitung manual dan dilewati. */
  let othersExist = false;

  const P = (range: Range, source: string | null = null): TrendParams => ({ range, source });
  const load = (range: Range, source: string | null = null) => loadTrend(viewer, P(range, source), NOW);
  const totals = (points: { total: number; done: number }[]) => points.map((p) => [p.total, p.done]);

  const addSource = async (key: string, name = key) => {
    const { data, error } = await admin.from("sources").insert({
      name: `TMP-TREN-${run}-${name}`, provider: "github", repo_url: `https://github.com/tmp/${run}-${key}`,
      token_encrypted: "v1.RAHASIA.RAHASIA.RAHASIA",
    }).select("id").single();
    if (error) throw error;
    ids[key] = data.id as string;
  };
  type Snap = { tag: string; at: string; total: number; done: number; blocked?: number; pending?: number; other?: number };
  const addSnaps = async (key: string, snaps: Snap[]) => {
    const rows = snaps.map((s) => ({
      source_id: ids[key], tag: s.tag, taken_at: s.at, total: s.total, done: s.done,
      blocked: s.blocked ?? 0, pending: s.pending ?? 0, other: s.other ?? 0,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("snapshots").insert(rows.slice(i, i + 500));
      if (error) throw error;
    }
  };

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, opt);
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;

    const { count } = await admin.from("snapshots").select("*", { count: "exact", head: true });
    othersExist = (count ?? 0) > 0;

    await addSource("a", "Alfa");
    await addSource("b", "Beta");
    await addSource("c", "Gamma");
    await addSource("kosong", "Kosong");

    // A: dua tag pada waktu yang sama (satu sinkronisasi), tiga sinkronisasi
    await addSnaps("a", [
      { tag: "master", at: ago(40), total: 10, done: 2, blocked: 1 }, { tag: "fitur", at: ago(40), total: 4, done: 1 },
      { tag: "master", at: ago(8), total: 12, done: 6, blocked: 2 }, { tag: "fitur", at: ago(8), total: 4, done: 4 },
      { tag: "master", at: ago(2), total: 12, done: 9 }, { tag: "fitur", at: ago(2), total: 4, done: 4 },
    ]);
    // B: satu snapshot lama, sebelum semua rentang kecuali "all"
    await addSnaps("b", [{ tag: "master", at: ago(100), total: 50, done: 40 }]);
    // C: dua snapshot
    await addSnaps("c", [{ tag: "master", at: ago(10), total: 6, done: 1 }, { tag: "master", at: ago(5), total: 6, done: 3 }]);

    viewer = createClient(URL_!, ANON!, opt);
    const { error: signInError } = await viewer.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  }, 60_000);

  afterAll(async () => {
    await admin.from("sources").delete().like("name", `TMP-TREN-${run}-%`);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  describe("satu aplikasi", () => {
    it("dua tag pada sinkronisasi yang sama dijumlahkan menjadi satu titik", async () => {
      const d = await load("all", ids.a);
      expect(d.points).toHaveLength(3);
      expect(totals(d.points)).toEqual([[14, 3], [16, 10], [16, 13]]);
    });

    it("rentang menyaring titik; titik sebelum rentang tidak ikut dan tidak dibawa maju", async () => {
      expect(totals((await load("30d", ids.a)).points)).toEqual([[16, 10], [16, 13]]);
      expect(totals((await load("7d", ids.a)).points)).toEqual([[16, 13]]);
      expect(totals((await load("90d", ids.a)).points)).toEqual([[14, 3], [16, 10], [16, 13]]);
    });

    it("titik berurutan waktu dan hanya ada di waktu snapshot sungguhan (tanpa titik buatan)", async () => {
      const d = await load("all", ids.a);
      const ts = d.points.map((p) => p.t);
      expect(ts).toEqual([...ts].sort((a, b) => a - b));
      expect(ts).toHaveLength(3);
      expect(new Date(ts[0]).toISOString()).toBe(ago(40));
    });

    it("kategori lain ikut terbawa (blocked dijumlahkan lintas tag)", async () => {
      const d = await load("all", ids.a);
      expect(d.points[0].blocked).toBe(1);
      expect(d.points[1].blocked).toBe(2);
    });

    it("aplikasi tanpa snapshot -> tidak ada titik, sumbu waktu tetap valid", async () => {
      const d = await load("30d", ids.kosong);
      expect(d.points).toEqual([]);
      expect(d.start).toBe(NOW - 30 * DAY);
      expect(d.end).toBe(NOW);
    });

    it("batas sumbu: awal rentang dan akhir 'sekarang' (jeda sejak snapshot terakhir terlihat)", async () => {
      const d = await load("30d", ids.a);
      expect(d.start).toBe(NOW - 30 * DAY);
      expect(d.end).toBe(NOW);
      expect(d.points.at(-1)!.t).toBeLessThan(d.end);
    });

    it("'all': awal sumbu = titik pertama", async () => {
      const d = await load("all", ids.a);
      expect(d.start).toBe(d.points[0].t);
    });
  });

  describe("gabungan (nilai terakhir dibawa maju)", () => {
    it("30 hari: keadaan awal A (40 hari) dan B (100 hari) dibawa maju ke setiap titik", async (ctx) => {
      if (othersExist) ctx.skip();
      const d = await load("30d");
      // 10h C(6/1) ; 8h A(16/10) ; 5h C(6/3) ; 2h A(16/13), dengan B(50/40) selalu ikut
      expect(totals(d.points)).toEqual([[70, 44], [72, 51], [72, 53], [72, 56]]);
    });

    it("semua: dimulai dari snapshot terlama (B) lalu bertambah seiring aplikasi lain muncul", async (ctx) => {
      if (othersExist) ctx.skip();
      const d = await load("all");
      expect(totals(d.points)).toEqual([[50, 40], [64, 43], [70, 44], [72, 51], [72, 53], [72, 56]]);
    });

    it("7 hari: hanya titik dalam rentang, keadaan awal tetap dibawa maju", async (ctx) => {
      if (othersExist) ctx.skip();
      const d = await load("7d");
      expect(totals(d.points)).toEqual([[72, 53], [72, 56]]);
    });

    it("90 hari: B (100 hari lalu) menjadi keadaan awal, bukan titik", async (ctx) => {
      if (othersExist) ctx.skip();
      const d = await load("90d");
      expect(totals(d.points)).toEqual([[64, 43], [70, 44], [72, 51], [72, 53], [72, 56]]);
    });

    it("jumlah baris yang dibaca dilaporkan dan tidak diringkas pada data kecil", async () => {
      const d = await load("30d");
      expect(d.downsampled).toBe(false);
      expect(d.truncated).toBe(false);
      expect(d.rowCount).toBeGreaterThanOrEqual(4);
    });
  });

  describe("daftar aplikasi dan aplikasi tak dikenal", () => {
    it("memuat aplikasi uji dengan statusnya", async () => {
      const d = await load("30d");
      const mine = d.sources.filter((s) => s.name.startsWith(`TMP-TREN-${run}-`));
      expect(mine.map((s) => s.name).sort()).toEqual(["Alfa", "Beta", "Gamma", "Kosong"].map((n) => `TMP-TREN-${run}-${n}`));
      expect(mine.every((s) => s.isActive)).toBe(true);
    });

    it("aplikasi yang tidak ada diabaikan dan dilaporkan (kembali ke gabungan)", async () => {
      const ghost = "00000000-0000-4000-8000-0000000000ee";
      const d = await load("30d", ghost);
      expect(d.ignoredSource).toBe(ghost);
      expect(d.params.source).toBeNull();
    });

    it("aplikasi valid tidak dilaporkan sebagai diabaikan", async () => {
      const d = await load("30d", ids.a);
      expect(d.ignoredSource).toBeNull();
      expect(d.params.source).toBe(ids.a);
    });
  });

  describe("keamanan", () => {
    it("viewer tidak melihat token lewat jalur apa pun", async () => {
      const json = JSON.stringify(await load("all"));
      expect(json).not.toContain("RAHASIA");
      expect(json).not.toContain("token_encrypted");
      expect((await viewer.from("sources").select("token_encrypted")).error).toBeTruthy();
    });

    it("anon (tanpa login) tidak bisa membaca view tren", async () => {
      const anon = createClient(URL_!, ANON!, opt);
      expect((await anon.from("source_snapshot_totals").select("*")).error).toBeTruthy();
    });

    it("viewer tidak bisa menulis ke view maupun mengubah snapshot", async () => {
      expect((await viewer.from("source_snapshot_totals").delete().eq("source_id", ids.a)).error).toBeTruthy();
      await viewer.from("snapshots").delete().eq("source_id", ids.a);
      await viewer.from("snapshots").update({ total: 999 }).eq("source_id", ids.a);
      expect(totals((await load("all", ids.a)).points)).toEqual([[14, 3], [16, 10], [16, 13]]);
    });
  });

  describe("paginasi dan peringkasan (> 1000 baris)", () => {
    beforeAll(async () => {
      await addSource("besar", "Besar");
      await addSource("tepat", "Tepat");
      // 1200 snapshot per jam (~50 hari) -> melewati batas 1000 baris PostgREST
      await addSnaps("besar", Array.from({ length: 1200 }, (_, i) => ({
        tag: "master", at: new Date(NOW - (1200 - i) * HOUR).toISOString(), total: 100, done: Math.floor(i / 12),
      })));
      // tepat 1000 baris: halaman kedua kosong (PGRST103) tidak boleh dianggap galat
      await addSnaps("tepat", Array.from({ length: 1000 }, (_, i) => ({
        tag: "master", at: new Date(NOW - (1000 - i) * HOUR).toISOString(), total: 10, done: i % 10,
      })));
    }, 60_000);

    it("1200 baris terbaca SEMUA (tidak terpotong di 1000), lalu diringkas satu titik per hari", async () => {
      const d = await load("90d", ids.besar);
      expect(d.rowCount).toBe(1200);
      expect(d.truncated).toBe(false);
      expect(d.downsampled).toBe(true);
      expect(d.points.length).toBeLessThanOrEqual(52);
      expect(d.points.length).toBeGreaterThanOrEqual(49);
      // titik terakhir adalah baris TERAKHIR (done = 99), bukan baris ke-1000 (done = 83)
      expect(d.points.at(-1)!.done).toBe(99);
    }, 60_000);

    it("tepat 1000 baris: tidak galat, semua terbaca", async () => {
      const d = await load("all", ids.tepat);
      expect(d.rowCount).toBe(1000);
      expect(d.truncated).toBe(false);
      expect(d.downsampled).toBe(true); // 1000 > 300 titik
    }, 60_000);

    it("urutan waktu menaik setelah diringkas dan tanpa duplikat hari", async () => {
      const d = await load("90d", ids.besar);
      const ts = d.points.map((p) => p.t);
      expect(ts).toEqual([...ts].sort((a, b) => a - b));
      expect(new Set(ts).size).toBe(ts.length);
    }, 60_000);

    it("rentang 7 hari pada data padat: hanya 7 hari terakhir dan tidak perlu diringkas bila <= 300 titik", async () => {
      const d = await load("7d", ids.besar);
      expect(d.rowCount).toBe(7 * 24);
      expect(d.downsampled).toBe(false);
      expect(d.points).toHaveLength(7 * 24);
    }, 60_000);
  });
});
