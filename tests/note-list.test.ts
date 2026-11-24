import { describe, expect, it, vi } from "vitest";
import { commentCounts } from "@/lib/notes/list";
import { calendarMonthFor, hasNoteFilters, likePattern, notesHref, parseNoteListParams } from "@/lib/notes/list-params";

const APP = "11111111-1111-4111-8111-111111111111";

describe("parseNoteListParams", () => {
  it("nilai valid dibaca; nilai tidak valid diabaikan", () => {
    expect(parseNoteListParams({ q: "  api  ", type: "decision", app: APP.toUpperCase(), from: "2026-11-01", to: "2026-11-30", page: "3" }))
      .toEqual({ q: "api", type: "decision", app: APP, from: "2026-11-01", to: "2026-11-30", page: 3 });
    expect(parseNoteListParams({ type: "rapat", app: "x", from: "2026-02-30", to: "kemarin", page: "-1" }))
      .toEqual({ q: "", type: null, app: null, from: null, to: null, page: 1 });
  });

  it("kata kunci dipotong 100 karakter dan karakter kontrol dibuang", () => {
    const p = parseNoteListParams({ q: `a\u0000b${"x".repeat(200)}` });
    expect(p.q.startsWith("a b")).toBe(true);
    expect(p.q).toHaveLength(100);
  });

  it("array: nilai pertama", () => {
    expect(parseNoteListParams({ type: ["general", "meeting"] }).type).toBe("general");
  });
});

describe("notesHref dan bantuannya", () => {
  it("nilai bawaan tidak ditulis", () => {
    expect(notesHref()).toBe("/notes");
    expect(notesHref({ q: "a b", type: "meeting", page: 1 })).toBe("/notes?q=a+b&type=meeting");
    expect(notesHref({ app: APP, from: "2026-11-01", page: 2 })).toBe(`/notes?app=${APP}&from=2026-11-01&page=2`);
  });

  it("hasNoteFilters dan bulan untuk Calendar", () => {
    const p = parseNoteListParams({});
    expect(hasNoteFilters(p)).toBe(false);
    expect(hasNoteFilters({ ...p, q: "x" })).toBe(true);
    expect(calendarMonthFor(p)).toBeNull();
    expect(calendarMonthFor({ ...p, to: "2026-12-05" })).toBe("2026-12");
    expect(calendarMonthFor({ ...p, from: "2026-11-05", to: "2026-12-05" })).toBe("2026-11");
  });
});

describe("likePattern", () => {
  it("karakter khusus dicari apa adanya", () => {
    expect(likePattern("50%_off")).toBe("%50\\%\\_off%");
    expect(likePattern("a\\b")).toBe("%a\\\\b%");
    expect(likePattern("a*b")).toBe("%ab%");
    expect(likePattern("O'Brien, (x)")).toBe("%O'Brien, (x)%");
  });
});

describe("commentCounts", () => {
  function db(comments: unknown[], reads: unknown[]) {
    const make = (data: unknown[]) => {
      const q = { eq: vi.fn(() => q), in: vi.fn(() => Promise.resolve({ data, error: null })) };
      return q;
    };
    return {
      from: vi.fn((t: string) => ({ select: () => (t === "note_comments" ? make(comments) : make(reads)) })),
    } as never;
  }

  it("komentar orang lain setelah kunjungan terakhir dihitung baru; komentar sendiri tidak", async () => {
    const out = await commentCounts(db(
      [
        { note_id: "n1", author_id: "me", created_at: "2026-11-24T05:00:00Z" },
        { note_id: "n1", author_id: "u2", created_at: "2026-11-24T04:00:00Z" },
        { note_id: "n1", author_id: "u2", created_at: "2026-11-24T02:00:00Z" },
        { note_id: "n2", author_id: "u2", created_at: "2026-11-20T00:00:00Z" },
        { note_id: "n2", author_id: null, created_at: "2026-11-20T00:00:00Z" },
      ],
      [{ note_id: "n1", last_read_at: "2026-11-24T03:00:00Z" }],
    ), ["n1", "n2", "n3"], "me");
    expect(Object.fromEntries(out)).toEqual({
      n1: { total: 3, fresh: 1 },
      n2: { total: 2, fresh: 2 },
      n3: { total: 0, fresh: 0 },
    });
  });

  it("tanpa catatan: tidak ada kueri", async () => {
    const d = db([], []);
    expect((await commentCounts(d, [], "me")).size).toBe(0);
    expect((d as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });
});
