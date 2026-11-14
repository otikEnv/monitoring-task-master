import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import {
  assertComponents, createRelease, DuplicateReleaseError, ReleaseNotFoundError, saveRelease, SourceTagError,
  toComponent, toRelease, updateRelease,
} from "@/lib/releases/repo";
import type { ReleaseInput } from "@/lib/releases/validate";

const SRC = "11111111-1111-4111-8111-111111111111";
const SRC2 = "22222222-2222-4222-8222-222222222222";

const input: ReleaseInput = {
  name: "2.1", startDate: null, targetDate: "2026-11-20",
  components: [
    { sourceId: SRC, tag: "master", rangeStart: 100, rangeEnd: 150 },
    { sourceId: SRC2, tag: "main", rangeStart: 20, rangeEnd: 45 },
  ],
};

function rpcDb(result: { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  return { db: { rpc } as never, rpc };
}

describe("saveRelease (fungsi database save_release)", () => {
  it("membuat: id null, header dan komponen dalam format database", async () => {
    const { db, rpc } = rpcDb({ data: "new-id" });
    expect(await createRelease(input, db)).toEqual({ id: "new-id" });
    expect(rpc).toHaveBeenCalledWith("save_release", {
      p_id: null,
      p_header: { name: "2.1", start_date: null, target_date: "2026-11-20" },
      p_components: [
        { source_id: SRC, tag: "master", range_start: 100, range_end: 150 },
        { source_id: SRC2, tag: "main", range_start: 20, range_end: 45 },
      ],
    });
  });

  it("mengubah: id diteruskan dan tanggal mulai dikirim bila diisi", async () => {
    const { db, rpc } = rpcDb({ data: "r1" });
    await updateRelease("r1", { ...input, startDate: "2026-11-01" }, db);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_id: "r1", p_header: { start_date: "2026-11-01" } });
  });

  it("nama ganda menjadi DuplicateReleaseError", async () => {
    const { db } = rpcDb({ error: { code: "23505", message: 'duplicate key value violates unique constraint "releases_unique_name"' } });
    await expect(saveRelease(null, input, db)).rejects.toBeInstanceOf(DuplicateReleaseError);
  });

  it("unique_violation lain (bukan nama) tetap galat umum", async () => {
    const { db } = rpcDb({ error: { code: "23505", message: 'duplicate key value violates unique constraint "release_components_unique"' } });
    const e = await saveRelease(null, input, db).catch((x) => x);
    expect(e).not.toBeInstanceOf(DuplicateReleaseError);
    expect(e.message).toContain("Gagal menyimpan release");
  });

  it("release tidak ada (P0002) menjadi ReleaseNotFoundError", async () => {
    const { db } = rpcDb({ error: { code: "P0002", message: "release not found" } });
    await expect(updateRelease("x", input, db)).rejects.toBeInstanceOf(ReleaseNotFoundError);
  });

  it("galat lain dilaporkan", async () => {
    const { db } = rpcDb({ error: { code: "XX000", message: "boom" } });
    await expect(saveRelease(null, input, db)).rejects.toThrow("Gagal menyimpan release: boom");
  });
});

describe("assertComponents", () => {
  /** Klien palsu: aplikasi ada bila id di `sources`, tag ada bila "id:tag" di `tags`. */
  function db(sources: string[], tags: string[]) {
    return {
      from(table: string) {
        const f: Record<string, string> = {};
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = (c: string, v: string) => { f[c] = v; return chain; };
        chain.limit = () => chain;
        chain.maybeSingle = async () => ({ data: sources.includes(f.id) ? { id: f.id } : null, error: null });
        chain.then = (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: tags.includes(`${f.source_id}:${f.tag}`) ? [{ tag: f.tag }] : [], error: null }).then(res);
        void table;
        return chain;
      },
    } as never;
  }

  it("semua komponen valid: lolos", async () => {
    await expect(assertComponents(input.components, db([SRC, SRC2], [`${SRC}:master`, `${SRC2}:main`]))).resolves.toBeUndefined();
  });

  it("tag tidak ada pada komponen ke-2: SourceTagError membawa indeksnya", async () => {
    const e = await assertComponents(input.components, db([SRC, SRC2], [`${SRC}:master`])).catch((x) => x);
    expect(e).toBeInstanceOf(SourceTagError);
    expect([e.field, e.index]).toEqual(["tag", 1]);
  });

  it("aplikasi tidak ada pada komponen pertama", async () => {
    const e = await assertComponents(input.components, db([SRC2], [])).catch((x) => x);
    expect([e.field, e.index]).toEqual(["sourceId", 0]);
  });
});

describe("pemetaan baris database", () => {
  it("toComponent dan toRelease mengubah angka dan menamai ulang kolom", () => {
    const c = toComponent({ id: "c1", release_id: "r1", source_id: SRC, tag: "master", range_start: "100" as unknown as number, range_end: 150 });
    expect(c).toEqual({ id: "c1", releaseId: "r1", sourceId: SRC, tag: "master", rangeStart: 100, rangeEnd: 150 });
    const r = toRelease(
      { id: "r1", name: "2.1", start_date: "2026-11-01", target_date: "2026-11-20", released_on: null, created_at: "t", archived_at: null },
      [c],
    );
    expect(r).toMatchObject({ id: "r1", name: "2.1", startDate: "2026-11-01", targetDate: "2026-11-20", releasedOn: null });
    expect(r.components).toEqual([c]);
    expect(toRelease({ id: "r", name: "n", start_date: "a", target_date: "b", released_on: null, created_at: "t", archived_at: null }).components).toEqual([]);
  });
});
