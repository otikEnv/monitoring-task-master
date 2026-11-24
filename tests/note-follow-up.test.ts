import { describe, expect, it } from "vitest";
import { buildFollowUp, followUpTitle } from "@/lib/notes/follow-up";

describe("followUpTitle", () => {
  it("menambah awalan sekali saja dan tetap dalam 200 karakter", () => {
    expect(followUpTitle("Weekly sync")).toBe("Follow up: Weekly sync");
    expect(followUpTitle("Follow up: Weekly sync")).toBe("Follow up: Weekly sync");
    const long = followUpTitle("x".repeat(200));
    expect(long).toHaveLength(200);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("buildFollowUp", () => {
  const note = { id: "n1", title: "Weekly sync", kind: "decision" as const };
  const links = [
    { kind: "release" as const, sourceId: null, releaseId: "r1", tag: null, taskId: null },
    { kind: "task" as const, sourceId: "s1", tag: "master", taskId: "7", releaseId: null },
  ];
  const items = [
    { id: "i1", body: "Terbuka", assigneeId: "u1", dueDate: "2026-11-30", done: false, carriedToId: null },
    { id: "i2", body: "Selesai", assigneeId: null, dueDate: null, done: true, carriedToId: null },
    { id: "i3", body: "Sudah dibawa", assigneeId: null, dueDate: null, done: false, carriedToId: "x" },
    { id: "i4", body: "Tanpa tenggat", assigneeId: null, dueDate: null, done: false, carriedToId: null },
  ];

  it("jenis sama, tanggal hari ini, isi kosong, tautan sama, hanya item terbuka yang dibawa", () => {
    expect(buildFollowUp(note, links, items, "2026-12-01")).toEqual({
      title: "Follow up: Weekly sync",
      noteDate: "2026-12-01",
      kind: "decision",
      body: "",
      followsUpId: "n1",
      links: [
        { kind: "release", sourceId: "", releaseId: "r1", tag: "", taskId: "" },
        { kind: "task", sourceId: "s1", releaseId: "", tag: "master", taskId: "7" },
      ],
      items: [
        { id: "", body: "Terbuka", assigneeId: "u1", dueDate: "2026-11-30", done: false, carriedFromId: "i1" },
        { id: "", body: "Tanpa tenggat", assigneeId: "", dueDate: "", done: false, carriedFromId: "i4" },
      ],
    });
  });
});
