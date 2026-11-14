import { beforeEach, describe, expect, it, vi } from "vitest";

const ID = "22222222-2222-4222-8222-222222222222";
const SRC = "11111111-1111-4111-8111-111111111111";
const SRC2 = "22222222-2222-4222-8222-222222222223";

class Redirected extends Error {}
class Denied extends Error {}

const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  assertComponents: vi.fn(),
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
    constructor() { super("A release with this name already exists."); }
  }
  class ReleaseNotFoundError extends Error {
    constructor() { super("Release not found."); }
  }
  class SourceTagError extends Error {
    constructor(public field: "sourceId" | "tag", message: string, public index = 0) { super(message); }
  }
  return {
    DuplicateReleaseError, ReleaseNotFoundError, SourceTagError,
    assertComponents: m.assertComponents, createRelease: m.createRelease, updateRelease: m.updateRelease,
    setReleasedOn: m.setReleasedOn, deleteRelease: m.deleteRelease,
  };
});

import { markReleased, previewRange, removeRelease, saveRelease } from "@/app/release/actions";
import { DuplicateReleaseError, ReleaseNotFoundError, SourceTagError } from "@/lib/releases/repo";

/** Form dengan satu komponen (nomor baris 0); parameter kedua menambah atau menimpa isian. */
const form = (over: Record<string, string> = {}, extra: Record<string, string> = {}) => {
  const fd = new FormData();
  const base: Record<string, string> = {
    name: "v2.1", startDate: "", targetDate: "2026-11-20",
    "components[0].sourceId": SRC, "components[0].tag": "master", "components[0].rangeStart": "100", "components[0].rangeEnd": "200",
  };
  for (const [k, v] of Object.entries({ ...base, ...over, ...extra })) fd.set(k, v);
  return fd;
};
const touching = () => [m.assertComponents, m.createRelease, m.updateRelease, m.setReleasedOn, m.deleteRelease, m.loadPreview];

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
    expect(m.assertComponents).toHaveBeenCalledWith([{ sourceId: SRC, tag: "master", rangeStart: 100, rangeEnd: 200 }]);
    expect(m.createRelease).toHaveBeenCalledWith(expect.objectContaining({
      name: "v2.1", components: [{ sourceId: SRC, tag: "master", rangeStart: 100, rangeEnd: 200 }],
    }));
    expect(m.revalidatePath).toHaveBeenCalledWith("/release");
    expect(m.redirect).toHaveBeenCalledWith(`/release/${ID}`);
  });

  it("release lintas aplikasi: kedua komponen diperiksa dan disimpan dalam satu panggilan", async () => {
    m.createRelease.mockResolvedValue({ id: ID });
    const two = {
      "components[3].sourceId": SRC2, "components[3].tag": "main", "components[3].rangeStart": "20", "components[3].rangeEnd": "45",
    };
    await expect(saveRelease(form({}, two))).rejects.toBeInstanceOf(Redirected);
    const comps = [
      { sourceId: SRC, tag: "master", rangeStart: 100, rangeEnd: 200 },
      { sourceId: SRC2, tag: "main", rangeStart: 20, rangeEnd: 45 },
    ];
    expect(m.assertComponents).toHaveBeenCalledWith(comps);
    expect(m.createRelease).toHaveBeenCalledTimes(1);
    expect(m.createRelease).toHaveBeenCalledWith(expect.objectContaining({ components: comps }));
  });

  it("ubah: memakai updateRelease dan tetap ke detail release yang sama", async () => {
    await expect(saveRelease(form({ id: ID }))).rejects.toBeInstanceOf(Redirected);
    expect(m.updateRelease).toHaveBeenCalledWith(ID, expect.objectContaining({ name: "v2.1" }));
    expect(m.createRelease).not.toHaveBeenCalled();
    expect(m.redirect).toHaveBeenCalledWith(`/release/${ID}`);
  });

  it("isian tidak valid: galat per isian, database tidak disentuh", async () => {
    const r = await saveRelease(form({ "components[0].rangeStart": "300" }));
    expect(r).toEqual({ ok: false, fieldErrors: { items: { 0: { rangeEnd: expect.any(String) } } } });
    for (const fn of touching()) expect(fn).not.toHaveBeenCalled();
  });

  it("id ubah yang bukan UUID ditolak", async () => {
    expect(await saveRelease(form({ id: "bukan-uuid" }))).toEqual({ ok: false, error: "Invalid release ID." });
    expect(m.updateRelease).not.toHaveBeenCalled();
  });

  it("tag tidak ada pada aplikasi: galat pada isian tag baris yang bersangkutan", async () => {
    m.assertComponents.mockRejectedValue(new SourceTagError("tag", "This tag does not exist on this application."));
    expect(await saveRelease(form())).toEqual({
      ok: false, fieldErrors: { items: { 0: { tag: "This tag does not exist on this application." } } },
    });
    expect(m.createRelease).not.toHaveBeenCalled();
  });

  it("galat komponen dipetakan ke nomor baris form, bukan posisi dalam daftar", async () => {
    const two = {
      "components[7].sourceId": SRC2, "components[7].tag": "main", "components[7].rangeStart": "20", "components[7].rangeEnd": "45",
    };
    m.assertComponents.mockRejectedValue(new SourceTagError("sourceId", "Application not found.", 1));
    expect(await saveRelease(form({}, two))).toEqual({
      ok: false, fieldErrors: { items: { 7: { sourceId: "Application not found." } } },
    });
  });

  it("tanpa komponen: galat umum, database tidak disentuh", async () => {
    const fd = form();
    for (const k of [...fd.keys()]) if (k.startsWith("components[")) fd.delete(k);
    expect(await saveRelease(fd)).toEqual({ ok: false, fieldErrors: { components: expect.stringContaining("at least one") } });
    for (const fn of touching()) expect(fn).not.toHaveBeenCalled();
  });

  it("pasangan (aplikasi, tag) ganda ditolak sebelum menyentuh database", async () => {
    const dup = {
      "components[1].sourceId": SRC, "components[1].tag": "master", "components[1].rangeStart": "1", "components[1].rangeEnd": "2",
    };
    const r = await saveRelease(form({}, dup));
    expect(r).toEqual({ ok: false, fieldErrors: { items: { 1: { tag: expect.stringContaining("already used") } } } });
    for (const fn of touching()) expect(fn).not.toHaveBeenCalled();
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
