import { describe, expect, it } from "vitest";
import { isOverdueItem, todayWib } from "@/lib/notes/model";
import { itemField, linkField, parseHolidayForm, parseNoteForm, validateComment } from "@/lib/notes/validate";

const SRC = "11111111-1111-4111-8111-111111111111";
const REL = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

describe("parseNoteForm", () => {
  it("tanggal kosong = hari ini menurut Asia/Jakarta; jenis bawaan Meeting", () => {
    // 23:30 UTC 23 Nov = 06:30 WIB 24 Nov
    const r = parseNoteForm(form({ title: "  Rapat mingguan  " }), new Date("2026-11-23T23:30:00Z"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ title: "Rapat mingguan", noteDate: "2026-11-24", kind: "meeting", body: "" });
    expect(todayWib(new Date("2026-11-23T23:30:00Z"))).toBe("2026-11-24");
  });

  it("judul wajib dan dibatasi 200; tanggal dan jenis divalidasi", () => {
    const r = parseNoteForm(form({ title: "", noteDate: "2026-02-30", kind: "rapat" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors.title).toBe("Enter a title.");
    expect(r.fieldErrors.noteDate).toBe("Enter a valid date.");
    expect(r.fieldErrors.kind).toMatch(/Meeting/);
    const long = parseNoteForm(form({ title: "x".repeat(201) }));
    expect(long.ok).toBe(false);
  });

  it("isi Markdown sampai 20.000 karakter, baris baru boleh", () => {
    expect(parseNoteForm(form({ title: "a", body: "# Judul\r\n\n- satu\n\t- dua" })).ok).toBe(true);
    const r = parseNoteForm(form({ title: "a", body: "x".repeat(20_001) }));
    expect(r.ok).toBe(false);
  });

  it("tautan aplikasi, release, dan task; tautan ganda dan tidak lengkap ditolak per baris", () => {
    const ok = parseNoteForm(form({
      title: "a",
      [linkField(0, "kind")]: "source", [linkField(0, "sourceId")]: SRC,
      [linkField(1, "kind")]: "release", [linkField(1, "releaseId")]: REL.toUpperCase(),
      [linkField(3, "kind")]: "task", [linkField(3, "sourceId")]: SRC, [linkField(3, "tag")]: "mobile-v2", [linkField(3, "taskId")]: "12",
    }));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.value.links).toEqual([
      { kind: "source", sourceId: SRC },
      { kind: "release", releaseId: REL },
      { kind: "task", sourceId: SRC, tag: "mobile-v2", taskId: "12" },
    ]);

    const bad = parseNoteForm(form({
      title: "a",
      [linkField(0, "kind")]: "release", [linkField(0, "releaseId")]: REL,
      [linkField(1, "kind")]: "release", [linkField(1, "releaseId")]: REL,
      [linkField(2, "kind")]: "task", [linkField(2, "sourceId")]: SRC, [linkField(2, "tag")]: "master",
      [linkField(4, "kind")]: "apa", [linkField(4, "sourceId")]: SRC,
    }));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.fieldErrors.linkItems).toEqual({
      1: "This link is already in the list.",
      2: "Choose a task.",
      4: "Choose what to link.",
    });
  });

  it("action item: isi wajib, penanggung jawab uuid, tenggat valid, centang", () => {
    const ok = parseNoteForm(form({
      title: "a",
      [itemField(0, "body")]: " Siapkan API ", [itemField(0, "assigneeId")]: USER, [itemField(0, "dueDate")]: "2026-11-30",
      [itemField(2, "body")]: "Beres", [itemField(2, "done")]: "on", [itemField(2, "id")]: REL,
    }));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.value.items).toEqual([
      { id: null, body: "Siapkan API", assigneeId: USER, dueDate: "2026-11-30", done: false, carriedFromId: null },
      { id: REL, body: "Beres", assigneeId: null, dueDate: null, done: true, carriedFromId: null },
    ]);

    const bad = parseNoteForm(form({
      title: "a",
      [itemField(0, "body")]: "", [itemField(1, "body")]: "x", [itemField(1, "assigneeId")]: "bukan-uuid",
      [itemField(1, "dueDate")]: "2026-13-01", [itemField(2, "body")]: "x".repeat(501),
    }));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.fieldErrors.itemRows).toEqual({
      0: { body: "Describe the action item." },
      1: { assigneeId: "Choose a person from the list.", dueDate: "Enter a valid date." },
      2: { body: "An action item can be at most 500 characters." },
    });
  });

  it("followsUpId harus uuid", () => {
    const ok = parseNoteForm(form({ title: "a", followsUpId: REL }));
    expect(ok.ok && ok.value.followsUpId).toBe(REL);
    expect(parseNoteForm(form({ title: "a", followsUpId: "x" })).ok).toBe(false);
  });
});

describe("validateComment", () => {
  it("1..2000 karakter, dirapikan", () => {
    expect(validateComment("  Setuju \r\n lanjut ")).toEqual({ ok: true, value: "Setuju \n lanjut" });
    expect(validateComment("   ")).toEqual({ ok: false, error: "Write a comment." });
    expect(validateComment("x".repeat(2001)).ok).toBe(false);
    expect(validateComment(undefined).ok).toBe(false);
  });
});

describe("parseHolidayForm", () => {
  it("tanggal, nama, dan jenis wajib", () => {
    expect(parseHolidayForm(form({ date: "2028-01-01", name: " New Year ", kind: "national" })))
      .toEqual({ ok: true, value: { date: "2028-01-01", name: "New Year", kind: "national" } });
    const bad = parseHolidayForm(form({ date: "2028-02-30", name: "", kind: "cuti" }));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(Object.keys(bad.fieldErrors).sort()).toEqual(["date", "kind", "name"]);
  });
});

describe("isOverdueItem", () => {
  it("hanya item terbuka dengan tenggat sebelum hari ini; Carried over tidak dihitung", () => {
    const base = { done: false, carriedToId: null, dueDate: "2026-11-23" };
    expect(isOverdueItem(base, "2026-11-24")).toBe(true);
    expect(isOverdueItem({ ...base, dueDate: "2026-11-24" }, "2026-11-24")).toBe(false);
    expect(isOverdueItem({ ...base, done: true }, "2026-11-24")).toBe(false);
    expect(isOverdueItem({ ...base, carriedToId: "x" }, "2026-11-24")).toBe(false);
    expect(isOverdueItem({ ...base, dueDate: null }, "2026-11-24")).toBe(false);
  });
});
