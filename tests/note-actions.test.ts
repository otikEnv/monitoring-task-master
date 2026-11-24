import { beforeEach, describe, expect, it, vi } from "vitest";

const NOTE = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";
const ADMIN = { id: "u1", email: "admin@envisions.app", role: "admin" };
const VIEWER = { id: "u9", email: "viewer@envisions.app", role: "viewer" };

class Redirected extends Error {
  constructor(public to: string) { super(`redirect:${to}`); }
}

const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireUser: vi.fn(),
  saveNote: vi.fn(),
  deleteNote: vi.fn(),
  setActionItemDone: vi.fn(),
  addComment: vi.fn(),
  editComment: vi.fn(),
  deleteComment: vi.fn(),
  resolveAssignees: vi.fn(),
  saveHoliday: vi.fn(),
  deleteHoliday: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  loadNoteLinks: vi.fn(),
  checkLinks: vi.fn(),
  releaseSnapshots: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: m.requireAdmin, requireUser: m.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/notes/users", () => ({ resolveAssignees: m.resolveAssignees }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.createClient }));
vi.mock("@/lib/notes/load", () => ({ loadNoteLinks: m.loadNoteLinks }));
vi.mock("@/lib/notes/links", async () => {
  const real = await vi.importActual<typeof import("@/lib/notes/links")>("@/lib/notes/links");
  return { newLinks: real.newLinks, checkLinks: m.checkLinks, releaseSnapshots: m.releaseSnapshots };
});
vi.mock("@/lib/notes/repo", () => {
  class NoteNotFoundError extends Error {}
  class NotAllowedError extends Error {
    constructor(msg = "Only the author can change this.") { super(msg); }
  }
  class InvalidNoteError extends Error {}
  class DuplicateHolidayError extends Error {
    constructor() { super("There is already a holiday on this date."); }
  }
  return {
    NoteNotFoundError, NotAllowedError, InvalidNoteError, DuplicateHolidayError,
    saveNote: m.saveNote, deleteNote: m.deleteNote, setActionItemDone: m.setActionItemDone, addComment: m.addComment,
    editComment: m.editComment, deleteComment: m.deleteComment, saveHoliday: m.saveHoliday, deleteHoliday: m.deleteHoliday,
  };
});

import {
  addCommentAction, editCommentAction, removeCommentAction, removeNoteAction, saveNoteAction, toggleActionItemAction,
} from "@/app/notes/actions";
import { removeHolidayAction, saveHolidayAction } from "@/app/notes/holidays/actions";
import { NotAllowedError } from "@/lib/notes/repo";

class Denied extends Error {}

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

beforeEach(() => {
  vi.resetAllMocks();
  m.requireAdmin.mockResolvedValue(ADMIN);
  m.requireUser.mockResolvedValue(VIEWER);
  m.redirect.mockImplementation((to: string) => { throw new Redirected(to); });
  m.resolveAssignees.mockResolvedValue(new Map([[USER, "dev@envisions.app"]]));
  m.saveNote.mockResolvedValue({ id: NOTE });
  m.setActionItemDone.mockResolvedValue({ noteId: NOTE });
  m.editComment.mockResolvedValue({ noteId: NOTE });
  m.deleteComment.mockResolvedValue({ noteId: NOTE });
  m.createClient.mockResolvedValue({ tag: "sesi" });
  m.loadNoteLinks.mockResolvedValue([]);
  m.checkLinks.mockResolvedValue(new Map());
  m.releaseSnapshots.mockResolvedValue(new Map());
});

describe("hak akses", () => {
  it("menulis catatan dan libur wajib admin: viewer berhenti sebelum menyentuh data", async () => {
    m.requireAdmin.mockRejectedValue(new Denied());
    await expect(saveNoteAction(form({ title: "a" }))).rejects.toBeInstanceOf(Denied);
    await expect(removeNoteAction(NOTE)).rejects.toBeInstanceOf(Denied);
    await expect(saveHolidayAction(form({ date: "2028-01-01", name: "x", kind: "national" }))).rejects.toBeInstanceOf(Denied);
    await expect(removeHolidayAction(NOTE)).rejects.toBeInstanceOf(Denied);
    for (const fn of [m.saveNote, m.deleteNote, m.saveHoliday, m.deleteHoliday]) expect(fn).not.toHaveBeenCalled();
  });

  it("komentar dan centang action item cukup login; pelaku diambil dari sesi", async () => {
    expect(await addCommentAction(NOTE, " Setuju ")).toEqual({ ok: true });
    expect(m.addComment).toHaveBeenCalledWith(NOTE, "Setuju", { id: "u9", email: "viewer@envisions.app" }, undefined, null);
    expect(await addCommentAction(NOTE, "Balas", ITEM.toUpperCase())).toEqual({ ok: true });
    expect(m.addComment).toHaveBeenLastCalledWith(NOTE, "Balas", { id: "u9", email: "viewer@envisions.app" }, undefined, ITEM);
    expect(await addCommentAction(NOTE, "Balas", "bukan-id")).toEqual({ ok: false, error: "Invalid comment ID." });
    expect(await toggleActionItemAction(ITEM, true)).toEqual({ ok: true });
    expect(m.setActionItemDone).toHaveBeenCalledWith(ITEM, true, { id: "u9", email: "viewer@envisions.app" });
    expect(m.requireAdmin).not.toHaveBeenCalled();
  });

  it("belum login: requireUser menghentikan action komentar", async () => {
    m.requireUser.mockRejectedValue(new Denied());
    await expect(addCommentAction(NOTE, "x")).rejects.toBeInstanceOf(Denied);
    await expect(toggleActionItemAction(ITEM, true)).rejects.toBeInstanceOf(Denied);
    expect(m.addComment).not.toHaveBeenCalled();
  });

  it("bukan penulis: pesan dari galat domain diteruskan", async () => {
    m.deleteNote.mockRejectedValue(new NotAllowedError());
    expect(await removeNoteAction(NOTE)).toEqual({ ok: false, error: "Only the author can change this." });
    m.editComment.mockRejectedValue(new NotAllowedError());
    expect(await editCommentAction(NOTE, "x")).toEqual({ ok: false, error: "Only the author can change this." });
  });
});

describe("saveNoteAction", () => {
  it("sukses: penanggung jawab diperiksa, redirect ke detail", async () => {
    await expect(saveNoteAction(form({
      title: "Rapat", noteDate: "2026-11-24", kind: "meeting", "items[0].body": "Siapkan", "items[0].assigneeId": USER,
    }))).rejects.toThrow(`redirect:/notes/${NOTE}`);
    const [id, input, actor, extra] = m.saveNote.mock.calls[0];
    expect(id).toBeNull();
    expect(input.items[0].assigneeId).toBe(USER);
    expect(actor).toEqual({ id: "u1", email: "admin@envisions.app" });
    expect(extra.assigneeEmails.get(USER)).toBe("dev@envisions.app");
    expect(m.revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("penanggung jawab yang bukan pengguna terdaftar ditolak per baris", async () => {
    m.resolveAssignees.mockResolvedValue(new Map());
    const r = await saveNoteAction(form({ title: "Rapat", "items[3].body": "x", "items[3].assigneeId": USER }));
    expect(r).toEqual({ ok: false, fieldErrors: { itemRows: { 3: { assigneeId: "Choose a person from the list." } } } });
    expect(m.saveNote).not.toHaveBeenCalled();
  });

  it("id tidak valid dan galat validasi tidak menyentuh database", async () => {
    expect(await saveNoteAction(form({ id: "bukan", title: "a" }))).toEqual({ ok: false, error: "Invalid note ID." });
    const r = await saveNoteAction(form({ title: "" }));
    expect(r.ok).toBe(false);
    expect(m.saveNote).not.toHaveBeenCalled();
  });

  it("galat tak terduga: pesan umum", async () => {
    m.saveNote.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await saveNoteAction(form({ title: "a" }))).toEqual({ ok: false, error: "Could not save the note. Try again." });
  });
});

describe("tautan pada saveNoteAction", () => {
  const REL = "55555555-5555-4555-8555-555555555555";
  const SRC = "66666666-6666-4666-8666-666666666666";

  it("tautan baru diperiksa; galat dipetakan ke nomor baris form", async () => {
    m.checkLinks.mockResolvedValue(new Map([[1, "This release is archived. Restore it first."]]));
    const r = await saveNoteAction(form({
      title: "a",
      "links[2].kind": "source", "links[2].sourceId": SRC,
      "links[5].kind": "release", "links[5].releaseId": REL,
    }));
    expect(r).toEqual({ ok: false, fieldErrors: { linkItems: { 5: "This release is archived. Restore it first." } } });
    expect(m.checkLinks.mock.calls[0][2]).toEqual([0, 1]);
    expect(m.saveNote).not.toHaveBeenCalled();
  });

  it("ubah: tautan lama tidak diperiksa ulang dan tidak direkam ulang; release baru direkam", async () => {
    const REL2 = "77777777-7777-4777-8777-777777777777";
    m.loadNoteLinks.mockResolvedValue([{ id: "l1", kind: "release", sourceId: null, releaseId: REL, tag: null, taskId: null, snapshot: null }]);
    const snap = new Map([[REL2, { progressPercent: 10, done: 1, total: 10, risk: "on_track", daysLeft: 5, targetDate: "2026-12-01" }]]);
    m.releaseSnapshots.mockResolvedValue(snap);
    await expect(saveNoteAction(form({
      id: NOTE, title: "a",
      "links[0].kind": "release", "links[0].releaseId": REL,
      "links[1].kind": "release", "links[1].releaseId": REL2,
    }))).rejects.toThrow("redirect:");
    expect(m.loadNoteLinks).toHaveBeenCalledWith({ tag: "sesi" }, NOTE);
    expect(m.checkLinks.mock.calls[0][2]).toEqual([1]);
    expect(m.releaseSnapshots.mock.calls[0][1]).toEqual([REL2]);
    expect(m.saveNote.mock.calls[0][3].snapshots).toBe(snap);
  });
});

describe("komentar", () => {
  it("komentar kosong ditolak; id tidak valid ditolak", async () => {
    expect(await addCommentAction(NOTE, "  ")).toEqual({ ok: false, error: "Write a comment." });
    expect(await removeCommentAction("x")).toEqual({ ok: false, error: "Invalid comment ID." });
    expect(m.addComment).not.toHaveBeenCalled();
    expect(m.deleteComment).not.toHaveBeenCalled();
  });
});

describe("libur", () => {
  it("tanggal ganda ditampilkan di kolom tanggal", async () => {
    const { DuplicateHolidayError } = await import("@/lib/notes/repo");
    m.saveHoliday.mockRejectedValue(new DuplicateHolidayError());
    expect(await saveHolidayAction(form({ date: "2026-01-01", name: "x", kind: "national" })))
      .toEqual({ ok: false, fieldErrors: { date: "There is already a holiday on this date." } });
  });
});
