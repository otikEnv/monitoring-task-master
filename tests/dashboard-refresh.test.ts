import { describe, expect, it, vi } from "vitest";
import { refreshSource, runPool } from "@/lib/dashboard/refresh";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fetchOf = (res: Response | (() => Response | Promise<Response>)) =>
  vi.fn(async () => (typeof res === "function" ? res() : res)) as unknown as typeof fetch;

describe("refreshSource", () => {
  it("memanggil POST /api/sync/<id> dengan ID ter-encode", async () => {
    const f = fetchOf(json({ status: "success", taskCount: 3 }));
    await refreshSource("a/b c", f);
    expect(f).toHaveBeenCalledWith("/api/sync/a%2Fb%20c", { method: "POST" });
  });

  it("success -> pesan jumlah task, changed", async () => {
    expect(await refreshSource("x", fetchOf(json({ status: "success", taskCount: 173 })))).toEqual({
      tone: "success", message: "Berhasil: 173 task diperbarui.", changed: true,
    });
  });

  it("not_modified -> info, tetap changed (waktu sinkron diperbarui di database)", async () => {
    expect(await refreshSource("x", fetchOf(json({ status: "not_modified" })))).toMatchObject({ tone: "info", changed: true });
  });

  it("failed -> galat dengan pesan sumber, changed (status gagal tersimpan di database)", async () => {
    const r = await refreshSource("x", fetchOf(json({ status: "failed", error: { kind: "unauthorized", message: "Token ditolak (401)." } })));
    expect(r).toEqual({ tone: "error", message: "Gagal: Token ditolak (401).", changed: true });
  });

  it("failed tanpa pesan -> pesan cadangan", async () => {
    expect((await refreshSource("x", fetchOf(json({ status: "failed" })))).message).toMatch(/alasan tidak diketahui/);
  });

  it("skipped dan 409 -> info nonaktif, tidak perlu muat ulang", async () => {
    expect(await refreshSource("x", fetchOf(json({ status: "skipped" })))).toMatchObject({ tone: "info", changed: false });
    expect(await refreshSource("x", fetchOf(json({ status: "skipped" }, 409)))).toMatchObject({ tone: "info", changed: false });
  });

  it.each([
    [401, /Sesi berakhir/],
    [404, /tidak ditemukan/],
    [503, /tidak tersedia/],
  ])("HTTP %i -> galat yang jelas", async (status, re) => {
    const r = await refreshSource("x", fetchOf(json({ error: "x" }, status)));
    expect(r).toMatchObject({ tone: "error", changed: false });
    expect(r.message).toMatch(re);
  });

  it("HTTP 500 lain -> galat dengan kode", async () => {
    expect((await refreshSource("x", fetchOf(json({}, 500)))).message).toMatch(/HTTP 500/);
  });

  it("jaringan putus -> galat, TIDAK melempar", async () => {
    const f = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    expect(await refreshSource("x", f)).toMatchObject({ tone: "error", changed: false });
  });

  it("respons bukan JSON -> galat, TIDAK melempar", async () => {
    expect((await refreshSource("x", fetchOf(new Response("<html>", { status: 200 })))).tone).toBe("error");
    expect((await refreshSource("x", fetchOf(new Response("<html>", { status: 502 })))).message).toMatch(/502/);
  });

  it("status tak dikenal -> galat", async () => {
    expect((await refreshSource("x", fetchOf(json({ status: "aneh" })))).tone).toBe("error");
  });
});

describe("runPool", () => {
  const tick = () => new Promise((r) => setTimeout(r, 5));

  it("menjalankan semua item dan mengembalikan hasil menurut urutan item", async () => {
    const res = await runPool([1, 2, 3, 4, 5], 2, async (n) => { await tick(); return n * 10; });
    expect(res.map((r) => r.status === "fulfilled" && r.value)).toEqual([10, 20, 30, 40, 50]);
  });

  it("tidak pernah melebihi batas konkurensi", async () => {
    let running = 0;
    let peak = 0;
    await runPool(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
      peak = Math.max(peak, ++running);
      await tick();
      running--;
    });
    expect(peak).toBe(4);
  });

  it("benar-benar paralel (tidak berurutan satu-satu)", async () => {
    let running = 0;
    let peak = 0;
    await runPool([1, 2, 3], 3, async () => { peak = Math.max(peak, ++running); await tick(); running--; });
    expect(peak).toBe(3);
  });

  it("satu worker yang gagal tidak menghentikan yang lain", async () => {
    const done: number[] = [];
    const res = await runPool([1, 2, 3, 4], 2, async (n) => {
      if (n === 2) throw new Error("gagal");
      done.push(n);
    });
    expect(done.sort()).toEqual([1, 3, 4]);
    expect(res.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled", "fulfilled"]);
  });

  it("daftar kosong dan batas tak valid tidak membuat macet", async () => {
    expect(await runPool([], 4, async () => 1)).toEqual([]);
    const res = await runPool([1, 2], 0, async (n) => n);
    expect(res).toHaveLength(2);
    expect(res.every((r) => r.status === "fulfilled")).toBe(true);
  });

  it("batas lebih besar dari jumlah item aman", async () => {
    const res = await runPool([1, 2], 50, async (n) => n);
    expect(res.map((r) => r.status === "fulfilled" && r.value)).toEqual([1, 2]);
  });
});
