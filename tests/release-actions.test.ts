import { beforeEach, describe, expect, it, vi } from "vitest";

const ID = "22222222-2222-4222-8222-222222222222";
const SRC = "11111111-1111-4111-8111-111111111111";

class Redirected extends Error {}
class Denied extends Error {}

const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  assertSourceTag: vi.fn(),
  createRelease: vi.fn(),
  updateRelease: vi.fn(),
  setReleasedOn: vi.fn(),
  deleteRelease: vi.fn(),
  loadPreview: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: m.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.createClient }));
vi.mock("@/lib/releases/load", () => ({ previewRange: m.loadPreview }));
vi.mock("@/lib/releases/repo", () => {
  class DuplicateReleaseError extends Error {
    constructor() { super("A release with this name already exists for this application."); }
  }
  class ReleaseNotFoundError extends Error {
    constructor() { super("Release not found."); }
  }
  class SourceTagError extends Error {
    constructor(public field: "sourceId" | "tag", message: string) { super(message); }
  }
  return {
    DuplicateReleaseError, ReleaseNotFoundError, SourceTagError,
    assertSourceTag: m.assertSourceTag, createRelease: m.createRelease, updateRelease: m.updateRelease,
    setReleasedOn: m.setReleasedOn, deleteRelease: m.deleteRelease,
  };
});

import { markReleased, previewRange, removeRelease, saveRelease } from "@/app/release/actions";
import { DuplicateReleaseError, ReleaseNotFoundError, SourceTagError } from "@/lib/releases/repo";

const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  const base: Record<string, string> = {
    sourceId: SRC, tag: "master", name: "v2.1", rangeStart: "100", rangeEnd: "200",
    startDate: "", targetDate: "2026-11-20",
  };
  for (const [k, v] of Object.entries({ ...base, ...over })) fd.set(k, v);
  return fd;
};
const touching = () => [m.assertSourceTag, m.createRelease, m.updateRelease, m.setReleasedOn, m.deleteRelease, m.loadPreview];

beforeEach(() => {
  vi.resetAllMocks();
  m.requireAdmin.mockResolvedValue({ id: "u1", email: "a@b.c", role: "admin" });
  m.redirect.mockImplementation(() => { throw new Redirected(); });
  m.createClient.mockResolvedValue({ tag: "sesi" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("otorisasi: hanya admin", () => {
  const calls: Array<[string, () => Promise<unknown>]> = [
    ["saveRelease (baru)", () => saveRelease(form())],
    ["saveRelease (ubah)", () => saveRelease(form({ id: ID }))],
    ["markReleased", () => markReleased(ID, true)],
    ["removeRelease", () => removeRelease(ID)],
    ["previewRange", () => previewRange(SRC, "master", "1", "5")],
  ];

  it.each(calls)("%s: bukan admin -> ditolak sebelum menyentuh data", async (_name, call) => {
    m.requireAdmin.mockRejectedValue(new Denied());
    await expect(call()).rejects.toBeInstanceOf(Denied);
    for (const fn of touching()) expect(fn).not.toHaveBeenCalled();
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("saveRelease", () => {
  it("baru: memvalidasi, memeriksa aplikasi dan tag, menyimpan, lalu redirect ke detail", async () => {
    m.createRelease.mockResolvedValue({ id: ID });
    await expect(saveRelease(form())).rejects.toBeInstanceOf(Redirected);
    expect(m.assertSourceTag).toHaveBeenCalledWith(SRC, "master");
    expect(m.createRelease).toHaveBeenCalledWith(expect.objectContaining({ name: "v2.1", rangeStart: 100, rangeEnd: 200 }));
    expect(m.revalidatePath).toHaveBeenCalledWith("/release");
    expect(m.redirect).toHaveBeenCalledWith(`/release/${ID}`);
  });

  it("ubah: memakai updateRelease dan tetap ke detail release yang sama", async () => {
    await expect(saveRelease(form({ id: ID }))).rejects.toBeInstanceOf(Redirected);
    expect(m.updateRelease).toHaveBeenCalledWith(ID, expect.objectContaining({ name: "v2.1" }));
    expect(m.createRelease).not.toHaveBeenCalled();
    expect(m.redirect).toHaveBeenCalledWith(`/release/${ID}`);
  });

  it("isian tidak valid: galat per isian, database tidak disentuh", async () => {
    const r = await saveRelease(form({ rangeStart: "300" }));
    expect(r).toEqual({ ok: false, fieldErrors: expect.objectContaining({ rangeEnd: expect.any(String) }) });
    for (const fn of touching()) expect(fn).not.toHaveBeenCalled();
  });

  it("id ubah yang bukan UUID ditolak", async () => {
    expect(await saveRelease(form({ id: "bukan-uuid" }))).toEqual({ ok: false, error: "Invalid release ID." });
    expect(m.updateRelease).not.toHaveBeenCalled();
  });

  it("tag tidak ada pada aplikasi: galat pada isian tag", async () => {
    m.assertSourceTag.mockRejectedValue(new SourceTagError("tag", "This tag does not exist on this application."));
    expect(await saveRelease(form())).toEqual({ ok: false, fieldErrors: { tag: "This tag does not exist on this application." } });
    expect(m.createRelease).not.toHaveBeenCalled();
  });

  it("nama ganda: galat pada isian nama", async () => {
    m.createRelease.mockRejectedValue(new DuplicateReleaseError());
    const r = await saveRelease(form());
    expect(r).toEqual({ ok: false, fieldErrors: { name: expect.stringContaining("already exists") } });
  });

  it("release yang diubah sudah hilang: pesan jelas", async () => {
    m.updateRelease.mockRejectedValue(new ReleaseNotFoundError());
    expect(await saveRelease(form({ id: ID }))).toEqual({ ok: false, error: "Release not found." });
  });

  it("galat tak terduga tidak membocorkan pesan asli", async () => {
    m.createRelease.mockRejectedValue(new Error("password authentication failed for user postgres"));
    const r = await saveRelease(form());
    expect(r).toEqual({ ok: false, error: "Could not save the release. Try again." });
    expect(JSON.stringify(r)).not.toContain("password");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("password");
  });
});

describe("markReleased", () => {
  it("menandai rilis dengan tanggal today (yyyy-mm-dd)", async () => {
    expect(await markReleased(ID, true)).toEqual({ ok: true });
    expect(m.setReleasedOn).toHaveBeenCalledWith(ID, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(m.revalidatePath).toHaveBeenCalledWith("/release");
    expect(m.revalidatePath).toHaveBeenCalledWith(`/release/${ID}`);
  });

  it("membatalkan tanda rilis dengan null", async () => {
    await markReleased(ID, false);
    expect(m.setReleasedOn).toHaveBeenCalledWith(ID, null);
  });

  it("id tidak valid dan release hilang", async () => {
    expect(await markReleased("x", true)).toEqual({ ok: false, error: "Invalid release ID." });
    m.setReleasedOn.mockRejectedValue(new ReleaseNotFoundError());
    expect(await markReleased(ID, true)).toEqual({ ok: false, error: "Release not found." });
  });
});

describe("removeRelease", () => {
  it("menghapus dan memperbarui daftar", async () => {
    expect(await removeRelease(ID)).toEqual({ ok: true });
    expect(m.deleteRelease).toHaveBeenCalledWith(ID);
    expect(m.revalidatePath).toHaveBeenCalledWith("/release");
  });

  it("id tidak valid, tidak ditemukan, dan galat tak terduga", async () => {
    expect(await removeRelease("x")).toEqual({ ok: false, error: "Invalid release ID." });
    m.deleteRelease.mockRejectedValueOnce(new ReleaseNotFoundError());
    expect(await removeRelease(ID)).toEqual({ ok: false, error: "Release not found." });
    m.deleteRelease.mockRejectedValueOnce(new Error("rahasia internal"));
    expect(await removeRelease(ID)).toEqual({ ok: false, error: "Could not delete the release." });
  });
});

describe("previewRange", () => {
  it("mengembalikan jumlah task memakai klien bersesi", async () => {
    m.loadPreview.mockResolvedValue({ count: 87, firstId: "101", lastId: "198" });
    expect(await previewRange(SRC, "master", "100", "200")).toEqual({ ok: true, count: 87, firstId: "101", lastId: "198" });
    expect(m.loadPreview).toHaveBeenCalledWith({ tag: "sesi" }, SRC, "master", 100, 200);
  });

  it("rentang atau aplikasi belum valid: tidak membaca data", async () => {
    for (const args of [["x", "master", "1", "5"], [SRC, "", "1", "5"], [SRC, "master", "9", "5"], [SRC, "master", "a", "5"]] as [string, string, string, string][]) {
      expect(await previewRange(...args)).toEqual({ ok: false, error: "The range is not valid yet." });
    }
    expect(m.loadPreview).not.toHaveBeenCalled();
  });

  it("galat pembacaan tidak membocorkan pesan asli", async () => {
    m.loadPreview.mockRejectedValue(new Error("detail internal"));
    expect(await previewRange(SRC, "master", "1", "5")).toEqual({ ok: false, error: "The preview could not be loaded." });
  });
});
