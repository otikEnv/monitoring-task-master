import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { checkLinks, newLinks } from "@/lib/notes/links";
import type { NoteLinkRow } from "@/lib/notes/load";
import type { LinkInput } from "@/lib/notes/validate";

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const R1 = "33333333-3333-4333-8333-333333333333";
const R2 = "44444444-4444-4444-8444-444444444444";

const row = (l: Partial<NoteLinkRow> & Pick<NoteLinkRow, "kind">): NoteLinkRow => ({
  id: "x", sourceId: null, releaseId: null, tag: null, taskId: null, snapshot: null, ...l,
});

describe("newLinks", () => {
  it("hanya tautan yang belum tersimpan", () => {
    const links: LinkInput[] = [
      { kind: "release", releaseId: R1 },
      { kind: "task", sourceId: S1, tag: "master", taskId: "7" },
      { kind: "task", sourceId: S1, tag: "master", taskId: "8" },
      { kind: "source", sourceId: S2 },
    ];
    const existing = [row({ kind: "release", releaseId: R1 }), row({ kind: "task", sourceId: S1, tag: "master", taskId: "7" })];
    expect(newLinks(links, existing)).toEqual([2, 3]);
    expect(newLinks(links, [])).toEqual([0, 1, 2, 3]);
  });
});

describe("checkLinks", () => {
  function fakeDb(data: { sources: unknown[]; releases: unknown[]; tasks: unknown[] }) {
    const calls: string[] = [];
    const chain = (rows: unknown[]) => {
      const q: Record<string, unknown> = {};
      for (const k of ["select", "eq", "in"]) q[k] = vi.fn(() => q);
      q.then = (res: (v: unknown) => void) => res({ data: rows, error: null });
      return q;
    };
    return {
      calls,
      db: { from: vi.fn((t: string) => { calls.push(t); return chain(data[t as keyof typeof data] ?? []); }) } as never,
    };
  }

  it("aplikasi/release tidak ada atau terarsip, dan task yang tidak ada, ditolak per posisi", async () => {
    const { db } = fakeDb({
      sources: [{ id: S1, archived_at: null }, { id: S2, archived_at: "2026-11-01T00:00:00Z" }],
      releases: [{ id: R1, archived_at: null }, { id: R2, archived_at: "2026-11-01T00:00:00Z" }],
      tasks: [{ task_id: "7" }],
    });
    const links: LinkInput[] = [
      { kind: "source", sourceId: S1 },
      { kind: "source", sourceId: S2 },
      { kind: "release", releaseId: R1 },
      { kind: "release", releaseId: R2 },
      { kind: "release", releaseId: "55555555-5555-4555-8555-555555555555" },
      { kind: "task", sourceId: S1, tag: "master", taskId: "7" },
      { kind: "task", sourceId: S1, tag: "master", taskId: "99" },
      { kind: "source", sourceId: "66666666-6666-4666-8666-666666666666" },
    ];
    const errors = await checkLinks(db, links, [0, 1, 2, 3, 4, 5, 6, 7]);
    expect(Object.fromEntries(errors)).toEqual({
      1: "This application is archived. Restore it first.",
      3: "This release is archived. Restore it first.",
      4: "This release does not exist.",
      6: "Task #99 does not exist in tag master.",
      7: "This application does not exist.",
    });
  });

  it("tanpa tautan baru: tidak ada kueri", async () => {
    const { db, calls } = fakeDb({ sources: [], releases: [], tasks: [] });
    expect((await checkLinks(db, [{ kind: "source", sourceId: S1 }], [])).size).toBe(0);
    expect(calls).toEqual([]);
  });
});
