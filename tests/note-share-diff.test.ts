import { describe, expect, it } from "vitest";
import { changedFields, diffLines } from "@/lib/notes/diff";
import { buildShareText, markdownToChat } from "@/lib/notes/share";

describe("markdownToChat", () => {
  it("tebal, judul, daftar, tautan, dan centang dipertahankan dalam bentuk chat", () => {
    const md = [
      "# Hasil rapat",
      "Keputusan **penting** dan ~~batal~~.",
      "* satu",
      "+ dua",
      "  - anak",
      "- [x] sudah",
      "- [ ] belum",
      "Lihat [dokumen](https://example.com/doc) dan https://example.com",
      "![diagram](https://x/y.png)",
    ].join("\n");
    expect(markdownToChat(md)).toBe([
      "*Hasil rapat*",
      "Keputusan *penting* dan ~batal~.",
      "- satu",
      "- dua",
      "  - anak",
      "☑ sudah",
      "☐ belum",
      "Lihat dokumen (https://example.com/doc) dan https://example.com",
      "[image: diagram]",
    ].join("\n"));
  });

  it("blok kode apa adanya; baris kosong berlebih dirapikan", () => {
    expect(markdownToChat("a\n\n\n\n```\n**tidak diubah**\n```\nb")).toBe("a\n\n**tidak diubah**\nb");
  });
});

describe("buildShareText", () => {
  it("judul, jenis, tanggal, isi, action item, dan tautan; tanpa komentar", () => {
    const text = buildShareText({
      title: "Weekly sync",
      kind: "meeting",
      noteDate: "2026-11-24",
      body: "Bahas **API**",
      items: [
        { body: "Siapkan API", done: false, assigneeEmail: "dev@envisions.app", dueDate: "2026-11-30" },
        { body: "Kirim notulen", done: true, assigneeEmail: null, dueDate: null },
      ],
      url: "https://app.example/notes/n1",
    });
    expect(text).toBe([
      "*Weekly sync*",
      "Meeting · 24 Nov 2026",
      "Bahas *API*",
      "*Action items*\n☐ Siapkan API (dev@envisions.app, due 30 Nov 2026)\n☑ Kirim notulen",
      "https://app.example/notes/n1",
    ].join("\n\n"));
  });

  it("tanpa isi dan tanpa action item: bagiannya tidak muncul", () => {
    expect(buildShareText({ title: "T", kind: "general", noteDate: "2026-01-02", body: "  ", items: [], url: "u" }))
      .toBe("*T*\n\nGeneral · 02 Jan 2026\n\nu");
  });
});

describe("diffLines", () => {
  it("baris sama, dihapus, dan ditambah; urutan stabil", () => {
    expect(diffLines("a\nb\nc\nd", "a\nB\nc\nd\ne")).toEqual([
      { type: "same", text: "a" },
      { type: "removed", text: "b" },
      { type: "added", text: "B" },
      { type: "same", text: "c" },
      { type: "same", text: "d" },
      { type: "added", text: "e" },
    ]);
  });

  it("isi kosong ke isi baru, dan sebaliknya", () => {
    expect(diffLines("", "x\ny")).toEqual([{ type: "added", text: "x" }, { type: "added", text: "y" }]);
    expect(diffLines("x", "")).toEqual([{ type: "removed", text: "x" }]);
    expect(diffLines("", "")).toEqual([]);
  });

  it("CRLF dianggap sama dengan LF", () => {
    expect(diffLines("a\r\nb", "a\nb").every((l) => l.type === "same")).toBe(true);
  });

  it("isi sangat besar tetap selesai (disederhanakan)", () => {
    const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join("\n");
    const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join("\n");
    const out = diffLines(a, b);
    expect(out).toHaveLength(6000);
    expect(out[0]).toEqual({ type: "removed", text: "a0" });
    expect(out[5999]).toEqual({ type: "added", text: "b2999" });
  });
});

describe("changedFields", () => {
  it("menyebut kolom yang berubah", () => {
    const base = { title: "a", noteDate: "2026-11-24", kind: "meeting", body: "x" };
    expect(changedFields(base, base)).toEqual([]);
    expect(changedFields(base, { ...base, title: "b", body: "y" })).toEqual(["title", "content"]);
    expect(changedFields(base, { ...base, noteDate: "2026-11-25", kind: "decision" })).toEqual(["date", "type"]);
  });
});
