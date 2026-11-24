import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import {
  DuplicateHolidayError, InvalidNoteError, NotAllowedError, NoteNotFoundError, addComment, deleteHoliday, deleteNote,
  saveHoliday, saveNote, setActionItemDone,
} from "@/lib/notes/repo";
import type { NoteInput } from "@/lib/notes/validate";

const ACTOR = { id: "u1", email: "admin@envisions.app" };

function rpcDb(result: { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  return { db: { rpc } as never, rpc };
}

const input: NoteInput = {
  title: "Rapat", noteDate: "2026-11-24", kind: "meeting", body: "isi", followsUpId: "f1",
  links: [
    { kind: "source", sourceId: "s1" },
    { kind: "release", releaseId: "r1" },
    { kind: "task", sourceId: "s1", tag: "master", taskId: "7" },
  ],
  items: [
    { id: null, body: "Siapkan", assigneeId: "u2", dueDate: "2026-11-30", done: false, carriedFromId: "i0" },
    { id: "i1", body: "Lama", assigneeId: null, dueDate: null, done: true, carriedFromId: null },
  ],
};

describe("saveNote (fungsi database save_note)", () => {
  it("membuat: follows_up_id, carried_from_id, rekaman release, dan email penanggung jawab dari server", async () => {
    const { db, rpc } = rpcDb({ data: "n1" });
    const res = await saveNote(null, input, ACTOR, {
      snapshots: new Map([["r1", { progressPercent: 45.555, done: 4, total: 9, risk: "at_risk", daysLeft: 12, targetDate: "2026-12-01" }]]),
      assigneeEmails: new Map([["u2", "dev@envisions.app"]]),
    }, db);
    expect(res).toEqual({ id: "n1" });
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe("save_note");
    expect(args.p_id).toBeNull();
    expect(args.p_actor).toBe("u1");
    expect(args.p_note).toEqual({ title: "Rapat", note_date: "2026-11-24", kind: "meeting", body: "isi", follows_up_id: "f1" });
    expect(args.p_links).toEqual([
      { kind: "source", source_id: "s1" },
      { kind: "release", release_id: "r1", snapshot: {
        progress_percent: 45.56, done: 4, total: 9, risk: "at_risk", days_left: 12, target_date: "2026-12-01" } },
      { kind: "task", source_id: "s1", tag: "master", task_id: "7" },
    ]);
    expect(args.p_items).toEqual([
      { body: "Siapkan", assignee_id: "u2", assignee_email: "dev@envisions.app", due_date: "2026-11-30", done: false, carried_from_id: "i0" },
      { id: "i1", body: "Lama", assignee_id: null, assignee_email: null, due_date: null, done: true },
    ]);
  });

  it("mengubah: follows_up_id dan carried_from_id tidak dikirim", async () => {
    const { db, rpc } = rpcDb({ data: "n1" });
    await saveNote("n1", input, ACTOR, {}, db);
    const args = rpc.mock.calls[0][1];
    expect(args.p_note).not.toHaveProperty("follows_up_id");
    expect(args.p_items[0]).not.toHaveProperty("carried_from_id");
    expect(args.p_links[1]).toEqual({ kind: "release", release_id: "r1" });
  });

  it("galat database dipetakan ke galat domain", async () => {
    await expect(saveNote("n1", input, ACTOR, {}, rpcDb({ error: { code: "42501", message: "not_author" } }).db))
      .rejects.toBeInstanceOf(NotAllowedError);
    await expect(saveNote("n1", input, ACTOR, {}, rpcDb({ error: { code: "P0002", message: "note not found" } }).db))
      .rejects.toBeInstanceOf(NoteNotFoundError);
    await expect(saveNote(null, input, ACTOR, {}, rpcDb({ error: { code: "23514", message: "x" } }).db))
      .rejects.toBeInstanceOf(InvalidNoteError);
    await expect(saveNote(null, input, ACTOR, {}, rpcDb({ error: { message: "boom" } }).db))
      .rejects.toThrow("Gagal menyimpan catatan: boom");
  });
});

describe("fungsi lain", () => {
  it("deleteNote, setActionItemDone, addComment meneruskan pelaku", async () => {
    const a = rpcDb({});
    await deleteNote("n1", ACTOR, a.db);
    expect(a.rpc).toHaveBeenCalledWith("delete_note", { p_id: "n1", p_actor: "u1" });

    const b = rpcDb({ data: "n1" });
    expect(await setActionItemDone("i1", true, ACTOR, b.db)).toEqual({ noteId: "n1" });
    expect(b.rpc).toHaveBeenCalledWith("set_action_item_done", { p_item: "i1", p_actor: "u1", p_done: true });

    const c = rpcDb({ data: "c1" });
    await addComment("n1", "Setuju", ACTOR, c.db);
    expect(c.rpc).toHaveBeenCalledWith("add_note_comment", {
      p_note: "n1", p_actor: "u1", p_actor_email: "admin@envisions.app", p_body: "Setuju", p_parent: null,
    });
    const r = rpcDb({ data: "c2" });
    await addComment("n1", "Balas", ACTOR, r.db, "c1");
    expect(r.rpc.mock.calls[0][1]).toMatchObject({ p_parent: "c1" });
  });

  it("not_allowed pada action item memberi pesan penanggung jawab", async () => {
    await expect(setActionItemDone("i1", true, ACTOR, rpcDb({ error: { code: "42501", message: "not_allowed" } }).db))
      .rejects.toThrow("Only the note's author or the person assigned can check this item.");
  });
});

describe("libur", () => {
  function tableDb(result: { data?: unknown; error?: { code?: string; message?: string } | null }) {
    const q: Record<string, ReturnType<typeof vi.fn>> = {};
    const chain = () => q as never;
    for (const k of ["insert", "update", "delete", "eq", "select"]) q[k] = vi.fn(chain);
    const done = { data: result.data ?? null, error: result.error ?? null };
    q.single = vi.fn().mockResolvedValue(done);
    q.maybeSingle = vi.fn().mockResolvedValue(done);
    (q as Record<string, unknown>).then = (res: (v: unknown) => void) => res(done);
    return { db: { from: vi.fn(() => q) } as never, q };
  }

  it("tanggal ganda: DuplicateHolidayError; tidak ditemukan: NoteNotFoundError", async () => {
    await expect(saveHoliday(null, { date: "2026-01-01", name: "x", kind: "national" },
      tableDb({ error: { code: "23505", message: "dup" } }).db)).rejects.toBeInstanceOf(DuplicateHolidayError);
    await expect(saveHoliday("h1", { date: "2026-01-01", name: "x", kind: "national" }, tableDb({ data: null }).db))
      .rejects.toBeInstanceOf(NoteNotFoundError);
    await expect(deleteHoliday("h1", tableDb({ data: [] }).db)).rejects.toBeInstanceOf(NoteNotFoundError);
  });

  it("menyimpan kolom holiday_date, name, kind", async () => {
    const { db, q } = tableDb({ data: { id: "h1" } });
    expect(await saveHoliday(null, { date: "2028-01-01", name: "New Year", kind: "national" }, db)).toEqual({ id: "h1" });
    expect(q.insert).toHaveBeenCalledWith({ holiday_date: "2028-01-01", name: "New Year", kind: "national" });
  });
});
