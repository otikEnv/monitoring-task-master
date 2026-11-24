import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/notes/actions", () => ({
  toggleActionItemAction: vi.fn(), addCommentAction: vi.fn(), editCommentAction: vi.fn(), removeCommentAction: vi.fn(),
  removeNoteAction: vi.fn(),
}));

import { NoteDetailView } from "@/components/notes/note-detail";
import { NoteHistory } from "@/components/notes/note-history";
import type { NoteDetail, NoteRow, RevisionRow } from "@/lib/notes/load";

const AUTHOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = new Date("2026-11-24T05:00:00Z");

const note: NoteRow = {
  id: "n1", title: "Weekly sync", noteDate: "2026-11-24", kind: "decision", body: "Isi **tebal** <script>alert(1)</script>",
  authorId: AUTHOR, authorEmail: "author@envisions.app", followsUpId: null, createdAt: "2026-11-24T02:00:00Z", editedAt: null,
};

function detail(extra: Partial<NoteDetail> = {}): NoteDetail {
  return {
    note,
    links: [],
    items: [
      { id: "i1", noteId: "n1", position: 0, body: "Siapkan API", assigneeId: OTHER, assigneeEmail: "dev@envisions.app",
        dueDate: "2026-11-20", done: false, doneAt: null, carriedToId: null },
      { id: "i2", noteId: "n1", position: 1, body: "Dibawa", assigneeId: null, assigneeEmail: null,
        dueDate: "2026-11-01", done: false, doneAt: null, carriedToId: "x" },
    ],
    comments: [
      { id: "c1", noteId: "n1", body: "Komentar saya", authorId: OTHER, authorEmail: "dev@envisions.app",
        createdAt: "2026-11-24T04:00:00Z", editedAt: "2026-11-24T04:30:00Z" },
    ],
    revisionCount: 2,
    followsUp: { id: "n0", title: "Rapat lalu", noteDate: "2026-11-17" },
    followedUpIn: [],
    ...extra,
  };
}

const render = (d: NoteDetail, user: { id: string; role: "admin" | "viewer" }) =>
  renderToStaticMarkup(<NoteDetailView detail={d} user={user} now={NOW} />);

describe("NoteDetailView", () => {
  it("judul, jenis, tanggal, penulis, Markdown aman, riwayat, dan Follows up", () => {
    const out = render(detail(), { id: AUTHOR, role: "admin" });
    expect(out).toContain("Weekly sync");
    expect(out).toContain("Decision");
    expect(out).toContain("24 Nov 2026");
    expect(out).toContain("author@envisions.app");
    expect(out).toContain("<strong>tebal</strong>");
    expect(out).not.toContain("<script>");
    expect(out).toContain('href="/notes/n1/history"');
    expect(out).toContain("Edited 2 times");
    expect(out).toContain('href="/notes/n0"');
  });

  it("penulis melihat Edit dan Delete; admin lain dan viewer tidak", () => {
    expect(render(detail(), { id: AUTHOR, role: "admin" })).toContain('href="/notes/n1/edit"');
    expect(render(detail(), { id: OTHER, role: "admin" })).not.toContain('href="/notes/n1/edit"');
    expect(render(detail(), { id: OTHER, role: "viewer" })).not.toContain(">Delete<");
    // Penulis yang turun menjadi viewer tidak bisa lagi mengedit.
    expect(render(detail(), { id: AUTHOR, role: "viewer" })).not.toContain('href="/notes/n1/edit"');
  });

  it("action item: Overdue, Carried over (tidak Overdue), dan hak centang", () => {
    const viewerOwner = render(detail(), { id: OTHER, role: "viewer" });
    expect(viewerOwner).toContain("Overdue");
    expect(viewerOwner).toContain("Carried over");
    expect(viewerOwner.match(/Overdue/g)).toHaveLength(1);
    // Penanggung jawab i1 bisa mencentang i1; i2 (tanpa penanggung jawab) terkunci.
    expect(viewerOwner).toMatch(/id="ai-i1" type="checkbox"(?![^>]*disabled="")/);
    expect(viewerOwner).toMatch(/id="ai-i2" type="checkbox"[^>]*disabled=""/);
    const stranger = render(detail(), { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", role: "viewer" });
    expect(stranger).toMatch(/id="ai-i1" type="checkbox"[^>]*disabled=""/);
  });

  it("komentar: penanda edited, menu hanya untuk komentar sendiri, kotak komentar untuk semua", () => {
    const own = render(detail(), { id: OTHER, role: "viewer" });
    expect(own).toContain("Komentar saya");
    expect(own).toContain("(edited)");
    expect(own).toContain("Actions for your comment");
    expect(own).toContain("Add a comment");
    expect(render(detail(), { id: AUTHOR, role: "admin" })).not.toContain("Actions for your comment");
  });
});

describe("NoteHistory", () => {
  const rev = (id: number, body: string, title = "Weekly sync"): RevisionRow => ({
    id, title, noteDate: "2026-11-24", kind: "decision", body, editedByEmail: "author@envisions.app",
    createdAt: "2026-11-24T03:00:00Z",
  });

  it("tanpa riwayat: keadaan kosong", () => {
    expect(renderToStaticMarkup(<NoteHistory note={note} revisions={[]} selected={null} />)).toContain("No edits yet");
  });

  it("versi terbaru dipilih bawaan; diff dibandingkan dengan isi sekarang", () => {
    const out = renderToStaticMarkup(
      <NoteHistory note={{ ...note, body: "baris baru" }} revisions={[rev(2, "baris lama", "Judul lama"), rev(1, "awal")]} selected={null} />,
    );
    expect(out).toContain('aria-current="true"');
    expect(out).toContain("Removed: ");
    expect(out).toContain("baris lama");
    expect(out).toContain("Added: ");
    expect(out).toContain("baris baru");
    expect(out).toContain("Judul lama");
    expect(out).toContain("Changed title, content");
  });

  it("memilih versi lama membandingkan dengan versi sesudahnya", () => {
    const out = renderToStaticMarkup(
      <NoteHistory note={note} revisions={[rev(2, "tengah"), rev(1, "awal")]} selected={1} />,
    );
    expect(out).toMatch(/Removed: <\/span>awal/);
    expect(out).toMatch(/Added: <\/span>tengah/);
  });
});
