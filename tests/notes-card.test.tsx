import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NotesCard } from "@/components/dashboard/notes-card";
import { loadNotesSummary, type NotesSummary } from "@/lib/dashboard/notes-summary";

const NOW = new Date("2026-11-24T03:00:00Z");

function fakeDb(tables: Record<string, unknown[]>) {
  const seen: Record<string, Record<string, unknown>> = {};
  const chain = (t: string) => {
    const filters: Record<string, unknown> = {};
    seen[t] = filters;
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "lt", "gte", "lte", "order"]) {
      q[k] = vi.fn((...args: unknown[]) => { if (k !== "select" && k !== "order") filters[`${k}:${String(args[0])}`] = args[1]; return q; });
    }
    q.then = (res: (v: unknown) => void) => res({ data: tables[t] ?? [], error: null });
    return q;
  };
  return { db: { from: vi.fn((t: string) => chain(t)) } as never, seen };
}

describe("loadNotesSummary", () => {
  it("catatan hari ini, overdue milik sendiri dulu (maks 5), libur 14 hari", async () => {
    const items = Array.from({ length: 7 }, (_, i) => ({
      id: `i${i}`, note_id: "n", body: `item ${i}`, due_date: `2026-11-0${i + 1}`,
      assignee_id: i === 5 ? "me" : "other", assignee_email: i === 5 ? "me@x" : "o@x", notes: { title: "Rapat" },
    }));
    const { db, seen } = fakeDb({
      notes: [{ id: "n1", title: "Hari ini", kind: "meeting" }],
      note_action_items: items,
      holidays: [{ id: "h1", holiday_date: "2026-12-24", name: "Christmas (collective leave)", kind: "collective_leave" }],
    });
    const s = await loadNotesSummary(db, "me", NOW);
    expect(s.today).toEqual([{ id: "n1", title: "Hari ini", kind: "meeting" }]);
    expect(s.overdueTotal).toBe(7);
    expect(s.overdue.map((i) => i.id)).toEqual(["i5", "i0", "i1", "i2", "i3"]);
    expect(s.overdue[0]).toMatchObject({ mine: true, noteTitle: "Rapat" });
    expect(s.oldestDue).toBe("2026-11-01");
    expect(s.holidays).toHaveLength(1);
    expect(seen.notes).toMatchObject({ "eq:note_date": "2026-11-24" });
    expect(seen.note_action_items).toMatchObject({ "eq:done": false, "is:carried_to_id": null, "lt:due_date": "2026-11-24" });
    expect(seen.holidays).toMatchObject({ "gte:holiday_date": "2026-11-24", "lte:holiday_date": "2026-12-08" });
  });
});

describe("NotesCard", () => {
  const empty: NotesSummary = { today: [], overdue: [], overdueTotal: 0, oldestDue: null, holidays: [] };

  it("keadaan kosong menampilkan teks singkat", () => {
    const html = renderToStaticMarkup(<NotesCard summary={empty} defaultOpen />);
    expect(html).toContain("No notes today");
    expect(html).toContain("Nothing overdue");
    expect(html).toContain("No holidays in the next 14 days");
    expect(html).toContain('aria-expanded="true"');
  });

  it("dilipat: hanya ringkasan jumlah", () => {
    const html = renderToStaticMarkup(<NotesCard summary={{ ...empty, overdueTotal: 2 }} defaultOpen={false} />);
    expect(html).toContain("0 today · 2 overdue · 0 upcoming holidays");
    expect(html).not.toContain("Nothing overdue");
    expect(html).toContain('aria-expanded="false"');
  });

  it("View all muncul bila lebih dari 5 overdue, menuju bulan tenggat terlama", () => {
    const item = { id: "i", noteId: "n", noteTitle: "Rapat", body: "x", dueDate: "2026-10-03", assigneeEmail: null, mine: true };
    const html = renderToStaticMarkup(
      <NotesCard summary={{ ...empty, overdue: [item], overdueTotal: 6, oldestDue: "2026-10-03" }} defaultOpen />,
    );
    expect(html).toContain('href="/calendar?month=2026-10&amp;show=items"');
    expect(html).toContain("View all (6)");
    expect(html).toContain("Yours");
  });
});
