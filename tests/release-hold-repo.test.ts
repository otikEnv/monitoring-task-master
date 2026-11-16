import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import {
  addReleaseNote, deleteReleaseNote, editReleaseNote, holdRelease, NoteNotDeletableError, NoteNotFoundError, ReleaseNotFoundError, ReleaseStateError,
  resumeRelease, setReleasedOn, SYSTEM_AUTHOR, updateRelease,
} from "@/lib/releases/repo";
import type { ReleaseInput } from "@/lib/releases/validate";

const AUTHOR = { id: "u1", email: "admin@envisions.app" };

const input: ReleaseInput = {
  name: "2.1", startDate: null, targetDate: "2026-11-20",
  components: [{ sourceId: "11111111-1111-4111-8111-111111111111", tag: "master", rangeStart: 100, rangeEnd: 150 }],
};

function rpcDb(result: { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  return { db: { rpc } as never, rpc };
}

describe("perubahan target dengan alasan (save_release)", () => {
  it("alasan dan penulis ikut di header bila diberikan", async () => {
    const { db, rpc } = rpcDb({ data: "r1" });
    await updateRelease("r1", input, db, { reason: "Vendor delay", author: AUTHOR });
    expect(rpc.mock.calls[0][1].p_header).toEqual({
      name: "2.1", start_date: null, target_date: "2026-11-20",
      change_reason: "Vendor delay", author_id: "u1", author_email: "admin@envisions.app",
    });
  });

  it("tanpa audit atau alasan kosong: header tidak membawa kunci tambahan", async () => {
    const a = rpcDb({ data: "r1" });
    await updateRelease("r1", input, a.db);
    expect(a.rpc.mock.calls[0][1].p_header).toEqual({ name: "2.1", start_date: null, target_date: "2026-11-20" });
    const b = rpcDb({ data: "r1" });
    await updateRelease("r1", input, b.db, { reason: "", author: AUTHOR });
    expect(b.rpc.mock.calls[0][1].p_header).not.toHaveProperty("change_reason");
  });
});

describe("setReleasedOn (fungsi database set_release_released)", () => {
  it("memanggil fungsi dengan tanggal dan penulis; bawaan penulis sistem", async () => {
    const { db, rpc } = rpcDb({});
    await setReleasedOn("r1", "2026-11-20", db, AUTHOR);
    expect(rpc).toHaveBeenCalledWith("set_release_released", {
      p_id: "r1", p_released_on: "2026-11-20", p_author: "u1", p_email: "admin@envisions.app",
    });
    await setReleasedOn("r1", null, db);
    expect(rpc).toHaveBeenLastCalledWith("set_release_released", {
      p_id: "r1", p_released_on: null, p_author: null, p_email: SYSTEM_AUTHOR.email,
    });
  });

  it("tidak ada: ReleaseNotFoundError; galat lain dilaporkan", async () => {
    await expect(setReleasedOn("r1", null, rpcDb({ error: { code: "P0002", message: "release not found" } }).db))
      .rejects.toBeInstanceOf(ReleaseNotFoundError);
    await expect(setReleasedOn("r1", null, rpcDb({ error: { message: "boom" } }).db))
      .rejects.toThrow("Gagal mengubah status rilis: boom");
  });
});

describe("holdRelease dan resumeRelease", () => {
  it("hold: memanggil fungsi dan mengembalikan id entri", async () => {
    const { db, rpc } = rpcDb({ data: "n1" });
    expect(await holdRelease("r1", "Waiting for API", AUTHOR, db)).toEqual({ noteId: "n1" });
    expect(rpc).toHaveBeenCalledWith("hold_release", {
      p_id: "r1", p_reason: "Waiting for API", p_author: "u1", p_email: "admin@envisions.app",
    });
  });

  it("resume: alasan null dikirim sebagai teks kosong", async () => {
    const { db, rpc } = rpcDb({ data: "n2" });
    await resumeRelease("r1", null, AUTHOR, db);
    expect(rpc).toHaveBeenCalledWith("resume_release", {
      p_id: "r1", p_reason: "", p_author: "u1", p_email: "admin@envisions.app",
    });
  });

  it("keadaan tidak mengizinkan (55000) menjadi ReleaseStateError dengan kode dan pesan jelas", async () => {
    const cases = [
      ["already_released", "This release has already been released."],
      ["archived", "This release is archived. Restore it first."],
      ["already_on_hold", "This release is already on hold."],
      ["not_on_hold", "This release is not on hold."],
    ] as const;
    for (const [code, message] of cases) {
      const { db } = rpcDb({ error: { code: "55000", message: code } });
      const e = await holdRelease("r1", "x", AUTHOR, db).catch((x) => x);
      expect(e).toBeInstanceOf(ReleaseStateError);
      expect([e.code, e.message]).toEqual([code, message]);
    }
  });

  it("55000 dengan pesan tak dikenal bukan ReleaseStateError; tidak ada = ReleaseNotFoundError", async () => {
    const e = await holdRelease("r1", "x", AUTHOR, rpcDb({ error: { code: "55000", message: "aneh" } }).db).catch((x) => x);
    expect(e).not.toBeInstanceOf(ReleaseStateError);
    expect(e.message).toContain("Gagal menahan release: aneh");
    await expect(resumeRelease("r1", null, AUTHOR, rpcDb({ error: { code: "P0002", message: "release not found" } }).db))
      .rejects.toBeInstanceOf(ReleaseNotFoundError);
  });
});

describe("addReleaseNote dan editReleaseNote", () => {
  it("tambah: memanggil fungsi; release tidak ada = ReleaseNotFoundError", async () => {
    const { db, rpc } = rpcDb({ data: "n3" });
    expect(await addReleaseNote("r1", "Testing is slow", AUTHOR, db)).toEqual({ noteId: "n3" });
    expect(rpc).toHaveBeenCalledWith("add_release_note", {
      p_id: "r1", p_body: "Testing is slow", p_author: "u1", p_email: "admin@envisions.app",
    });
    await expect(addReleaseNote("x", "t", AUTHOR, rpcDb({ error: { code: "P0002", message: "release not found" } }).db))
      .rejects.toBeInstanceOf(ReleaseNotFoundError);
  });

  it("edit: mengirim id catatan, teks, dan email penyunting; tidak ada = NoteNotFoundError", async () => {
    const { db, rpc } = rpcDb({});
    await editReleaseNote("n1", "Fixed typo", "editor@envisions.app", db);
    expect(rpc).toHaveBeenCalledWith("edit_release_note", {
      p_note_id: "n1", p_body: "Fixed typo", p_email: "editor@envisions.app",
    });
    await expect(editReleaseNote("n1", "x", "e@envisions.app", rpcDb({ error: { code: "P0002", message: "note not found" } }).db))
      .rejects.toBeInstanceOf(NoteNotFoundError);
    await expect(editReleaseNote("n1", "x", "e@envisions.app", rpcDb({ error: { message: "boom" } }).db))
      .rejects.toThrow("Gagal mengubah catatan: boom");
  });
});

describe("deleteReleaseNote", () => {
  it("memanggil fungsi dan mengembalikan id release pemilik catatan", async () => {
    const { db, rpc } = rpcDb({ data: "r1" });
    expect(await deleteReleaseNote("n1", db)).toEqual({ releaseId: "r1" });
    expect(rpc).toHaveBeenCalledWith("delete_release_note", { p_note_id: "n1" });
  });

  it("entri sistem (55000 not_deletable): NoteNotDeletableError dengan pesan jelas", async () => {
    const { db } = rpcDb({ error: { code: "55000", message: "not_deletable" } });
    const e = await deleteReleaseNote("n1", db).catch((x) => x);
    expect(e).toBeInstanceOf(NoteNotDeletableError);
    expect(e.message).toContain("Only notes can be deleted");
  });

  it("tidak ada: NoteNotFoundError; 55000 dengan pesan lain dan galat lain: galat umum", async () => {
    await expect(deleteReleaseNote("n1", rpcDb({ error: { code: "P0002", message: "note not found" } }).db))
      .rejects.toBeInstanceOf(NoteNotFoundError);
    const odd = await deleteReleaseNote("n1", rpcDb({ error: { code: "55000", message: "aneh" } }).db).catch((x) => x);
    expect(odd).not.toBeInstanceOf(NoteNotDeletableError);
    await expect(deleteReleaseNote("n1", rpcDb({ error: { message: "boom" } }).db)).rejects.toThrow("Gagal menghapus catatan: boom");
  });
});
