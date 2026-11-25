import { beforeEach, describe, expect, it, vi } from "vitest";

const ID = "22222222-2222-4222-8222-222222222222";
const NOTE = "33333333-3333-4333-8333-333333333333";
const ME = { id: "u1", email: "admin@envisions.app", role: "admin" };

class Denied extends Error {}

const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  holdRelease: vi.fn(),
  resumeRelease: vi.fn(),
  addReleaseNote: vi.fn(),
  editReleaseNote: vi.fn(),
  deleteReleaseNote: vi.fn(),
  getReleaseNote: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

// requireAbility (activity) dan requireAdmin (lainnya) memakai tiruan yang sama: dipanggil tepat sekali per action.
vi.mock("@/lib/auth", () => ({ requireAdmin: m.requireAdmin, requireAbility: m.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.createClient }));
vi.mock("@/lib/releases/load", () => ({ previewRange: vi.fn() }));
vi.mock("@/lib/releases/notes", () => ({ getReleaseNote: m.getReleaseNote }));
vi.mock("@/lib/releases/repo", () => {
  class ReleaseNotFoundError extends Error {
    constructor() { super("Release not found."); }
  }
  class NoteNotFoundError extends Error {
    constructor() { super("Note not found."); }
  }
  class ReleaseStateError extends Error {
    constructor(public code: string) { super(`state:${code}`); }
  }
  class NoteNotDeletableError extends Error {
    constructor() { super("Only notes can be deleted."); }
  }
  class NoteNotAllowedError extends Error {
    constructor() { super("You can only change your own notes."); }
  }
  class DuplicateReleaseError extends Error {}
  class SourceTagError extends Error {}
  return {
    ReleaseNotFoundError, NoteNotFoundError, NoteNotDeletableError, NoteNotAllowedError, ReleaseStateError, DuplicateReleaseError, SourceTagError,
    deleteReleaseNote: m.deleteReleaseNote,
    holdRelease: m.holdRelease, resumeRelease: m.resumeRelease, addReleaseNote: m.addReleaseNote,
    editReleaseNote: m.editReleaseNote, getRelease: vi.fn(), assertComponents: vi.fn(), createRelease: vi.fn(),
    updateRelease: vi.fn(), setReleasedOn: vi.fn(), deleteRelease: vi.fn(),
  };
});

import { addNote, deleteNote, editNote, putOnHold, resumeHold } from "@/app/release/actions";
import { NoteNotDeletableError, NoteNotFoundError, ReleaseNotFoundError, ReleaseStateError } from "@/lib/releases/repo";

const touching = () => [m.holdRelease, m.resumeRelease, m.addReleaseNote, m.editReleaseNote, m.deleteReleaseNote, m.getReleaseNote];

beforeEach(() => {
  vi.resetAllMocks();
  m.requireAdmin.mockResolvedValue(ME);
  m.createClient.mockResolvedValue({ tag: "sesi" });
  m.getReleaseNote.mockResolvedValue({ id: NOTE, releaseId: ID, kind: "note" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("otorisasi: hanya admin", () => {
  const calls: Array<[string, () => Promise<unknown>]> = [
    ["putOnHold", () => putOnHold(ID, "Menunggu API")],
    ["resumeHold", () => resumeHold(ID, "")],
    ["addNote", () => addNote(ID, "Catatan")],
    ["editNote", () => editNote(NOTE, "Catatan")],
    ["deleteNote", () => deleteNote(NOTE)],
  ];

  it.each(calls)("%s: bukan admin -> ditolak sebelum menyentuh data", async (_name, call) => {
    m.requireAdmin.mockRejectedValue(new Denied());
    await expect(call()).rejects.toBeInstanceOf(Denied);
    for (const fn of touching()) expect(fn).not.toHaveBeenCalled();
    expect(m.createClient).not.toHaveBeenCalled();
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(calls)("%s: requireAdmin dipanggil tepat sekali dan sebelum apa pun", async (_name, call) => {
    await call();
    expect(m.requireAdmin).toHaveBeenCalledTimes(1);
  });
});

describe("developer pada activity", () => {
  const DEV = { id: "d1", email: "dev@envisions.app", role: "developer" };

  it("mengubah dan menghapus Note miliknya; Note orang lain dan entri sistem ditolak tanpa menyentuh data", async () => {
    m.requireAdmin.mockResolvedValue(DEV);
    m.getReleaseNote.mockResolvedValue({ id: NOTE, releaseId: ID, kind: "note", authorId: "d1" });
    m.deleteReleaseNote.mockResolvedValue({ releaseId: ID });
    expect(await editNote(NOTE, "Milik saya")).toEqual({ ok: true });
    expect(m.editReleaseNote).toHaveBeenCalledWith(NOTE, "Milik saya", { id: "d1", email: "dev@envisions.app" });
    expect(await deleteNote(NOTE)).toEqual({ ok: true });

    vi.clearAllMocks();
    m.requireAdmin.mockResolvedValue(DEV);
    m.createClient.mockResolvedValue({ tag: "sesi" });
    for (const other of [{ kind: "note", authorId: "u1" }, { kind: "note", authorId: null }, { kind: "hold", authorId: "d1" }]) {
      m.getReleaseNote.mockResolvedValue({ id: NOTE, releaseId: ID, ...other });
      expect(await editNote(NOTE, "x")).toEqual({ ok: false, error: "You can only change your own notes." });
    }
    m.getReleaseNote.mockResolvedValue({ id: NOTE, releaseId: ID, kind: "note", authorId: "u1" });
    expect(await deleteNote(NOTE)).toEqual({ ok: false, error: "You can only change your own notes." });
    expect(m.editReleaseNote).not.toHaveBeenCalled();
    expect(m.deleteReleaseNote).not.toHaveBeenCalled();
  });

  it("admin tetap mengubah entri siapa pun", async () => {
    m.getReleaseNote.mockResolvedValue({ id: NOTE, releaseId: ID, kind: "hold", authorId: "lain" });
    expect(await editNote(NOTE, "Alasan baru")).toEqual({ ok: true });
  });
});

describe("putOnHold", () => {
  it("menahan dengan alasan yang dirapikan; penulis dari sesi admin; menyegarkan tampilan terkait", async () => {
    expect(await putOnHold(ID.toUpperCase(), "  Menunggu API backend \r\n")).toEqual({ ok: true });
    expect(m.holdRelease).toHaveBeenCalledWith(ID, "Menunggu API backend", { id: "u1", email: "admin@envisions.app" });
    for (const p of ["/", "/release", `/release/${ID}`]) expect(m.revalidatePath).toHaveBeenCalledWith(p);
  });

  it("alasan kosong, hanya spasi, atau terlalu panjang ditolak tanpa menyentuh data", async () => {
    for (const bad of ["", "   ", "x".repeat(501)]) {
      expect(await putOnHold(ID, bad)).toEqual({ ok: false, error: expect.stringContaining("Hold reason") });
    }
    expect(await putOnHold(ID, 42 as never)).toEqual({ ok: false, error: "Hold reason is required." });
    expect(m.holdRelease).not.toHaveBeenCalled();
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("id tidak valid ditolak", async () => {
    for (const bad of ["", "x", `${ID}; drop`]) expect(await putOnHold(bad, "ok")).toEqual({ ok: false, error: "Invalid release ID." });
    expect(m.holdRelease).not.toHaveBeenCalled();
  });

  it("keadaan tidak mengizinkan dan tidak ditemukan: pesan domain yang jelas, tanpa menyegarkan tampilan", async () => {
    m.holdRelease.mockRejectedValueOnce(new ReleaseStateError("already_released"));
    expect(await putOnHold(ID, "ok")).toEqual({ ok: false, error: "state:already_released" });
    m.holdRelease.mockRejectedValueOnce(new ReleaseNotFoundError());
    expect(await putOnHold(ID, "ok")).toEqual({ ok: false, error: "Release not found." });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("galat tak terduga tidak membocorkan pesan asli", async () => {
    m.holdRelease.mockRejectedValue(new Error("password authentication failed for user postgres"));
    const r = await putOnHold(ID, "ok");
    expect(r).toEqual({ ok: false, error: "Could not put the release on hold." });
    expect(JSON.stringify([r, vi.mocked(console.error).mock.calls])).not.toContain("password");
  });
});

describe("resumeHold", () => {
  it("melanjutkan; alasan opsional (kosong dikirim sebagai null)", async () => {
    expect(await resumeHold(ID)).toEqual({ ok: true });
    expect(m.resumeRelease).toHaveBeenLastCalledWith(ID, null, { id: "u1", email: "admin@envisions.app" });
    expect(await resumeHold(ID, "  API sudah siap ")).toEqual({ ok: true });
    expect(m.resumeRelease).toHaveBeenLastCalledWith(ID, "API sudah siap", { id: "u1", email: "admin@envisions.app" });
    for (const p of ["/", "/release", `/release/${ID}`]) expect(m.revalidatePath).toHaveBeenCalledWith(p);
  });

  it("alasan terlalu panjang dan id tidak valid ditolak", async () => {
    expect(await resumeHold(ID, "x".repeat(501))).toEqual({ ok: false, error: expect.stringContaining("500") });
    expect(await resumeHold("x", "")).toEqual({ ok: false, error: "Invalid release ID." });
    expect(m.resumeRelease).not.toHaveBeenCalled();
  });

  it("tidak sedang ditahan dan galat tak terduga", async () => {
    m.resumeRelease.mockRejectedValueOnce(new ReleaseStateError("not_on_hold"));
    expect(await resumeHold(ID)).toEqual({ ok: false, error: "state:not_on_hold" });
    m.resumeRelease.mockRejectedValueOnce(new Error("rahasia internal"));
    const r = await resumeHold(ID);
    expect(r).toEqual({ ok: false, error: "Could not resume the release." });
    expect(JSON.stringify(r)).not.toContain("rahasia");
  });
});

describe("addNote", () => {
  it("menambah catatan yang dirapikan; HTML disimpan apa adanya (di-escape saat tampil)", async () => {
    expect(await addNote(ID, "  Perlu cek <b>QA</b>  ")).toEqual({ ok: true });
    expect(m.addReleaseNote).toHaveBeenCalledWith(ID, "Perlu cek <b>QA</b>", { id: "u1", email: "admin@envisions.app" });
    for (const p of ["/", "/release", `/release/${ID}`]) expect(m.revalidatePath).toHaveBeenCalledWith(p);
  });

  it("catatan kosong, terlalu panjang, atau berkarakter kontrol ditolak", async () => {
    expect(await addNote(ID, "  ")).toEqual({ ok: false, error: "Note is required." });
    expect(await addNote(ID, "x".repeat(2001))).toEqual({ ok: false, error: "Note must be at most 2000 characters." });
    expect(await addNote(ID, "a\u0000b")).toEqual({ ok: false, error: "Note contains invalid characters." });
    expect((await addNote(ID, "x".repeat(2000))).ok).toBe(true);
    expect(m.addReleaseNote).toHaveBeenCalledTimes(1);
  });

  it("id tidak valid, release tidak ada, dan galat tak terduga", async () => {
    expect(await addNote("x", "ok")).toEqual({ ok: false, error: "Invalid release ID." });
    m.addReleaseNote.mockRejectedValueOnce(new ReleaseNotFoundError());
    expect(await addNote(ID, "ok")).toEqual({ ok: false, error: "Release not found." });
    m.addReleaseNote.mockRejectedValueOnce(new Error("rahasia internal"));
    expect(await addNote(ID, "ok")).toEqual({ ok: false, error: "Could not add the note." });
  });
});

describe("editNote", () => {
  it("mengubah teks: membaca jenis entri lewat sesi pengguna, mengirim email penyunting, menyegarkan release-nya", async () => {
    expect(await editNote(NOTE, "  Typo diperbaiki ")).toEqual({ ok: true });
    expect(m.getReleaseNote).toHaveBeenCalledWith({ tag: "sesi" }, NOTE);
    expect(m.editReleaseNote).toHaveBeenCalledWith(NOTE, "Typo diperbaiki", expect.objectContaining({ email: "admin@envisions.app" }));
    for (const p of ["/", "/release", `/release/${ID}`]) expect(m.revalidatePath).toHaveBeenCalledWith(p);
  });

  it("batas mengikuti jenis entri: hold 500, resume boleh kosong, note wajib terisi", async () => {
    m.getReleaseNote.mockResolvedValue({ id: NOTE, releaseId: ID, kind: "hold" });
    expect((await editNote(NOTE, "x".repeat(501))).ok).toBe(false);
    expect((await editNote(NOTE, "x".repeat(500))).ok).toBe(true);
    m.getReleaseNote.mockResolvedValue({ id: NOTE, releaseId: ID, kind: "resume" });
    expect((await editNote(NOTE, "")).ok).toBe(true);
    m.getReleaseNote.mockResolvedValue({ id: NOTE, releaseId: ID, kind: "note" });
    expect(await editNote(NOTE, "  ")).toEqual({ ok: false, error: "Note is required." });
    expect(m.editReleaseNote).toHaveBeenCalledTimes(2);
  });

  it("id tidak valid dan catatan tidak ditemukan", async () => {
    expect(await editNote("x", "ok")).toEqual({ ok: false, error: "Invalid note ID." });
    expect(m.getReleaseNote).not.toHaveBeenCalled();
    m.getReleaseNote.mockResolvedValueOnce(null);
    expect(await editNote(NOTE, "ok")).toEqual({ ok: false, error: "Note not found." });
    m.editReleaseNote.mockRejectedValueOnce(new NoteNotFoundError());
    expect(await editNote(NOTE, "ok")).toEqual({ ok: false, error: "Note not found." });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("galat tak terduga tidak membocorkan pesan asli", async () => {
    m.editReleaseNote.mockRejectedValue(new Error("password authentication failed"));
    const r = await editNote(NOTE, "ok");
    expect(r).toEqual({ ok: false, error: "Could not save the note." });
    expect(JSON.stringify([r, vi.mocked(console.error).mock.calls])).not.toContain("password");
  });
});

describe("deleteNote", () => {
  it("menghapus catatan bebas: membaca jenis lewat sesi, menghapus, dan menyegarkan release-nya", async () => {
    m.deleteReleaseNote.mockResolvedValue({ releaseId: ID });
    expect(await deleteNote(NOTE.toUpperCase())).toEqual({ ok: true });
    expect(m.getReleaseNote).toHaveBeenCalledWith({ tag: "sesi" }, NOTE);
    expect(m.deleteReleaseNote).toHaveBeenCalledWith(NOTE, expect.objectContaining({ email: expect.any(String) }));
    for (const p of ["/", "/release", `/release/${ID}`]) expect(m.revalidatePath).toHaveBeenCalledWith(p);
  });

  it("entri sistem ditolak sebelum menyentuh database (hold, resume, target_change, released)", async () => {
    for (const kind of ["hold", "resume", "target_change", "released"]) {
      m.getReleaseNote.mockResolvedValue({ id: NOTE, releaseId: ID, kind });
      const r = await deleteNote(NOTE);
      expect(r, kind).toEqual({ ok: false, error: "Only notes can be deleted." });
    }
    expect(m.deleteReleaseNote).not.toHaveBeenCalled();
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("id tidak valid dan catatan tidak ditemukan", async () => {
    for (const bad of ["", "x", `${NOTE}; drop`]) expect(await deleteNote(bad)).toEqual({ ok: false, error: "Invalid note ID." });
    expect(m.getReleaseNote).not.toHaveBeenCalled();
    m.getReleaseNote.mockResolvedValueOnce(null);
    expect(await deleteNote(NOTE)).toEqual({ ok: false, error: "Note not found." });
    m.deleteReleaseNote.mockRejectedValueOnce(new NoteNotFoundError()); // terhapus oleh orang lain di sela-sela
    expect(await deleteNote(NOTE)).toEqual({ ok: false, error: "Note not found." });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("database menolak entri sistem (lapisan kedua): pesan domain dari repo", async () => {
    m.deleteReleaseNote.mockRejectedValueOnce(new NoteNotDeletableError());
    expect(await deleteNote(NOTE)).toEqual({ ok: false, error: "Only notes can be deleted." });
  });

  it("galat tak terduga tidak membocorkan pesan asli", async () => {
    m.deleteReleaseNote.mockRejectedValue(new Error("password authentication failed"));
    const r = await deleteNote(NOTE);
    expect(r).toEqual({ ok: false, error: "Could not delete the note." });
    expect(JSON.stringify([r, vi.mocked(console.error).mock.calls])).not.toContain("password");
  });
});
