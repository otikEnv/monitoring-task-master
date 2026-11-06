import { beforeEach, describe, expect, it, vi } from "vitest";

const ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "github_pat_TOKEN_RAHASIA_123";

class Redirected extends Error {}
class Denied extends Error {}

const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createSource: vi.fn(),
  updateSource: vi.fn(),
  setSourceActive: vi.fn(),
  deleteSource: vi.fn(),
  getStoredToken: vi.fn(),
  runConnectionTest: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: m.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/sources/test-connection", () => ({ runConnectionTest: m.runConnectionTest }));
vi.mock("@/lib/sources/repo", () => {
  class DuplicateSourceError extends Error {
    constructor() { super("Sumber dengan URL repo, branch, dan path yang sama sudah terdaftar."); }
  }
  class SourceNotFoundError extends Error {
    constructor() { super("Sumber tidak ditemukan."); }
  }
  return {
    DuplicateSourceError, SourceNotFoundError,
    createSource: m.createSource, updateSource: m.updateSource, setSourceActive: m.setSourceActive,
    deleteSource: m.deleteSource, getStoredToken: m.getStoredToken,
  };
});

import { removeSource, saveSource, setActive, testConnection } from "@/app/pengaturan/sumber/actions";
import { DuplicateSourceError, SourceNotFoundError } from "@/lib/sources/repo";

const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  const base: Record<string, string> = {
    name: "Echo", provider: "github", repoUrl: "https://github.com/o/r", branch: "stg",
    filePath: ".taskmaster/tasks/tasks.json", token: TOKEN, tokenExpiresAt: "",
  };
  for (const [k, v] of Object.entries({ ...base, ...over })) fd.set(k, v);
  return fd;
};
const writers = () => [m.createSource, m.updateSource, m.setSourceActive, m.deleteSource, m.getStoredToken, m.runConnectionTest];

beforeEach(() => {
  vi.clearAllMocks();
  m.requireAdmin.mockResolvedValue({ id: "u1", email: "a@b.c", role: "admin" });
  m.redirect.mockImplementation(() => { throw new Redirected(); });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("otorisasi: hanya admin", () => {
  const calls: Array<[string, () => Promise<unknown>]> = [
    ["saveSource (baru)", () => saveSource(form())],
    ["saveSource (ubah)", () => saveSource(form({ id: ID }))],
    ["testConnection", () => testConnection(form())],
    ["setActive", () => setActive(ID, false)],
    ["removeSource", () => removeSource(ID)],
  ];

  it.each(calls)("%s: bukan admin -> ditolak dan tidak menyentuh database atau penyedia", async (_name, call) => {
    m.requireAdmin.mockRejectedValue(new Denied());
    await expect(call()).rejects.toBeInstanceOf(Denied);
    for (const fn of writers()) expect(fn).not.toHaveBeenCalled();
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(calls)("%s: requireAdmin dipanggil sebelum apa pun", async (_name, call) => {
    m.createSource.mockResolvedValue({ id: ID });
    m.updateSource.mockResolvedValue(undefined);
    m.setSourceActive.mockResolvedValue(undefined);
    m.deleteSource.mockResolvedValue(undefined);
    m.runConnectionTest.mockResolvedValue({ ok: true });
    await call().catch(() => {});
    expect(m.requireAdmin).toHaveBeenCalledTimes(1);
  });
});

describe("saveSource", () => {
  it("isian tidak valid -> galat per field, tanpa menulis", async () => {
    const r = await saveSource(form({ name: "", branch: "" }));
    expect(r).toMatchObject({ ok: false, fieldErrors: { name: expect.any(String), branch: expect.any(String) } });
    expect(m.createSource).not.toHaveBeenCalled();
  });

  it("sumber baru: membuat, memperbarui daftar, lalu redirect", async () => {
    m.createSource.mockResolvedValue({ id: ID });
    await expect(saveSource(form())).rejects.toBeInstanceOf(Redirected);
    expect(m.createSource).toHaveBeenCalledWith(expect.objectContaining({ name: "Echo", provider: "github", token: TOKEN }));
    expect(m.revalidatePath).toHaveBeenCalledWith("/pengaturan/sumber");
    expect(m.redirect).toHaveBeenCalledWith("/pengaturan/sumber");
  });

  it("sumber baru tanpa token ditolak", async () => {
    const r = await saveSource(form({ token: "" }));
    expect(r).toMatchObject({ ok: false, fieldErrors: { token: expect.any(String) } });
    expect(m.createSource).not.toHaveBeenCalled();
  });

  it("ubah sumber: token kosong -> dikirim null (token lama dipertahankan)", async () => {
    m.updateSource.mockResolvedValue(undefined);
    await expect(saveSource(form({ id: ID, token: "" }))).rejects.toBeInstanceOf(Redirected);
    expect(m.updateSource).toHaveBeenCalledWith(ID, expect.objectContaining({ token: null }));
    expect(m.createSource).not.toHaveBeenCalled();
  });

  it("ubah sumber dengan token baru -> token baru dikirim", async () => {
    m.updateSource.mockResolvedValue(undefined);
    await expect(saveSource(form({ id: ID }))).rejects.toBeInstanceOf(Redirected);
    expect(m.updateSource).toHaveBeenCalledWith(ID, expect.objectContaining({ token: TOKEN }));
  });

  it("ID bukan UUID -> galat, tanpa menulis", async () => {
    expect(await saveSource(form({ id: "bukan-uuid" }))).toMatchObject({ ok: false, error: expect.stringMatching(/tidak valid/i) });
    expect(m.updateSource).not.toHaveBeenCalled();
    expect(m.createSource).not.toHaveBeenCalled();
  });

  it("duplikat -> pesan yang ramah, tanpa redirect", async () => {
    m.createSource.mockRejectedValue(new DuplicateSourceError());
    const r = await saveSource(form());
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/sudah terdaftar/) });
    expect(m.redirect).not.toHaveBeenCalled();
  });

  it("sumber hilang saat diubah -> pesan tidak ditemukan", async () => {
    m.updateSource.mockRejectedValue(new SourceNotFoundError());
    expect(await saveSource(form({ id: ID }))).toMatchObject({ ok: false, error: "Sumber tidak ditemukan." });
  });

  it("galat database tak terduga -> pesan generik; detail dan token tidak bocor ke klien maupun log", async () => {
    m.createSource.mockRejectedValue(new Error(`insert gagal: ${TOKEN} kolom rahasia`));
    const r = await saveSource(form());
    expect(r).toMatchObject({ ok: false, error: "Gagal menyimpan sumber. Coba lagi." });
    expect(JSON.stringify(r)).not.toContain(TOKEN);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(TOKEN);
    expect(m.redirect).not.toHaveBeenCalled();
  });
});

describe("testConnection", () => {
  const okResult = { ok: true, bytes: 10, taskCount: 3, tags: [], warnings: 0, lastCommitAt: null, tokenExpiresAt: null };

  it("memakai token dari form dan tidak menyimpan apa pun", async () => {
    m.runConnectionTest.mockResolvedValue(okResult);
    const r = await testConnection(form());
    expect(r).toEqual(okResult);
    expect(m.runConnectionTest).toHaveBeenCalledWith({
      provider: "github", repoUrl: "https://github.com/o/r", branch: "stg",
      filePath: ".taskmaster/tasks/tasks.json", token: TOKEN,
    });
    expect(m.getStoredToken).not.toHaveBeenCalled();
    for (const fn of [m.createSource, m.updateSource, m.setSourceActive, m.deleteSource]) expect(fn).not.toHaveBeenCalled();
  });

  it("saat mengedit dengan token kosong -> memakai token tersimpan", async () => {
    m.getStoredToken.mockResolvedValue("token-tersimpan-123");
    m.runConnectionTest.mockResolvedValue(okResult);
    await testConnection(form({ id: ID, token: "" }));
    expect(m.getStoredToken).toHaveBeenCalledWith(ID);
    expect(m.runConnectionTest).toHaveBeenCalledWith(expect.objectContaining({ token: "token-tersimpan-123" }));
  });

  it("saat mengedit dengan token baru -> token baru, bukan yang tersimpan", async () => {
    m.runConnectionTest.mockResolvedValue(okResult);
    await testConnection(form({ id: ID }));
    expect(m.getStoredToken).not.toHaveBeenCalled();
    expect(m.runConnectionTest).toHaveBeenCalledWith(expect.objectContaining({ token: TOKEN }));
  });

  it("sumber baru tanpa token -> galat validasi, tanpa memanggil penyedia", async () => {
    const r = await testConnection(form({ token: "" }));
    expect(r).toMatchObject({ ok: false, kind: "validation", fieldErrors: { token: expect.any(String) } });
    expect(m.runConnectionTest).not.toHaveBeenCalled();
  });

  it("edit tanpa token dan sumber belum punya token -> galat validasi", async () => {
    m.getStoredToken.mockResolvedValue(null);
    expect(await testConnection(form({ id: ID, token: "" }))).toMatchObject({ ok: false, kind: "validation" });
    expect(m.runConnectionTest).not.toHaveBeenCalled();
  });

  it("token tersimpan tidak bisa didekripsi -> token_decrypt", async () => {
    m.getStoredToken.mockRejectedValue(new Error("rusak"));
    expect(await testConnection(form({ id: ID, token: "" }))).toMatchObject({ ok: false, kind: "token_decrypt" });
    expect(m.runConnectionTest).not.toHaveBeenCalled();
  });

  it("isian tidak valid -> galat validasi per field", async () => {
    const r = await testConnection(form({ repoUrl: "bukan url" }));
    expect(r).toMatchObject({ ok: false, kind: "validation", fieldErrors: { repoUrl: expect.any(String) } });
    expect(m.runConnectionTest).not.toHaveBeenCalled();
  });

  it("galat penyedia diteruskan apa adanya", async () => {
    m.runConnectionTest.mockResolvedValue({ ok: false, kind: "not_found", message: "Tidak ditemukan (404)" });
    expect(await testConnection(form())).toEqual({ ok: false, kind: "not_found", message: "Tidak ditemukan (404)" });
  });

  it("hasil tidak pernah memuat token", async () => {
    m.runConnectionTest.mockResolvedValue(okResult);
    expect(JSON.stringify(await testConnection(form()))).not.toContain(TOKEN);
  });
});

describe("setActive dan removeSource", () => {
  it("setActive berhasil memperbarui daftar", async () => {
    m.setSourceActive.mockResolvedValue(undefined);
    expect(await setActive(ID, false)).toEqual({ ok: true });
    expect(m.setSourceActive).toHaveBeenCalledWith(ID, false);
    expect(m.revalidatePath).toHaveBeenCalledWith("/pengaturan/sumber");
  });

  it("removeSource berhasil menghapus", async () => {
    m.deleteSource.mockResolvedValue(undefined);
    expect(await removeSource(ID)).toEqual({ ok: true });
    expect(m.deleteSource).toHaveBeenCalledWith(ID);
  });

  it("ID bukan UUID ditolak sebelum menyentuh database", async () => {
    expect(await setActive("x", true)).toMatchObject({ ok: false });
    expect(await removeSource("x")).toMatchObject({ ok: false });
    expect(m.setSourceActive).not.toHaveBeenCalled();
    expect(m.deleteSource).not.toHaveBeenCalled();
  });

  it("sumber tidak ada -> pesan tidak ditemukan", async () => {
    m.deleteSource.mockRejectedValue(new SourceNotFoundError());
    expect(await removeSource(ID)).toEqual({ ok: false, error: "Sumber tidak ditemukan." });
  });

  it("galat tak terduga -> pesan generik", async () => {
    m.setSourceActive.mockRejectedValue(new Error("db rahasia"));
    const r = await setActive(ID, true);
    expect(r).toEqual({ ok: false, error: "Gagal mengubah status sumber." });
  });
});
