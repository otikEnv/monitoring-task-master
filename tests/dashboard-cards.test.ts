import { describe, expect, it } from "vitest";
import { buildCards, summarize, type CountsRow, type SourceRow } from "@/lib/dashboard/cards";

const NOW = new Date("2026-11-07T00:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

const src = (over: Partial<SourceRow> = {}): SourceRow => ({
  id: "s1",
  name: "App",
  provider: "github",
  branch: "stg",
  is_active: true,
  last_sync_status: "success",
  last_attempt_at: "2026-11-06T10:00:00Z",
  last_synced_at: "2026-11-06T10:00:00Z",
  last_error: null,
  last_commit_at: "2026-11-06T03:52:39Z",
  token_expires_at: null,
  ...over,
});
const cnt = (over: Partial<CountsRow> = {}): CountsRow => ({
  source_id: "s1", total: 10, pending: 2, in_progress: 1, review: 1, blocked: 0,
  done: 5, deferred: 1, cancelled: 0, other: 0, tag_count: 1, ...over,
});

describe("buildCards", () => {
  it("menggabungkan sumber dengan hitungannya dan menghitung persentase", () => {
    const [c] = buildCards([src()], [cnt()], NOW);
    expect(c).toMatchObject({
      id: "s1", name: "App", branch: "stg", provider: "github", total: 10, tagCount: 1,
      percentDone: 50, hasData: true, lastSyncStatus: "success", isActive: true,
    });
    expect(c.counts).toEqual({ pending: 2, in_progress: 1, review: 1, blocked: 0, done: 5, deferred: 1, cancelled: 0, other: 0 });
  });

  it("persentase dibulatkan satu desimal", () => {
    expect(buildCards([src()], [cnt({ total: 173, done: 142 })], NOW)[0].percentDone).toBe(82.1);
    expect(buildCards([src()], [cnt({ total: 3, done: 1 })], NOW)[0].percentDone).toBe(33.3);
    expect(buildCards([src()], [cnt({ total: 7, done: 7 })], NOW)[0].percentDone).toBe(100);
  });

  it("sumber tanpa baris hitungan dianggap nol task (tanpa pembagian nol)", () => {
    const [c] = buildCards([src({ last_sync_status: "never" })], [], NOW);
    expect(c).toMatchObject({ total: 0, percentDone: 0, hasData: false, tagCount: 0 });
    expect(Object.values(c.counts).every((n) => n === 0)).toBe(true);
  });

  it("hitungan milik sumber lain tidak tercampur", () => {
    const cards = buildCards(
      [src({ id: "a", name: "A" }), src({ id: "b", name: "B" })],
      [cnt({ source_id: "a", total: 4, done: 4 }), cnt({ source_id: "b", total: 8, done: 2 })],
      NOW,
    );
    expect(cards.find((c) => c.id === "a")).toMatchObject({ total: 4, percentDone: 100 });
    expect(cards.find((c) => c.id === "b")).toMatchObject({ total: 8, percentDone: 25 });
  });

  it("status tak dikenal dan blocked ikut terbawa", () => {
    const [c] = buildCards([src()], [cnt({ blocked: 1, other: 2, total: 12 })], NOW);
    expect(c.counts.blocked).toBe(1);
    expect(c.counts.other).toBe(2);
  });

  it("menghitung kedaluwarsa token: none, ok, soon, expired", () => {
    const at = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString();
    const states = [null, at(60), at(5), at(-1)].map(
      (t) => buildCards([src({ token_expires_at: t })], [cnt()], NOW)[0].tokenExpiry,
    );
    expect(states).toEqual(["none", "ok", "soon", "expired"]);
  });

  it("membawa pesan galat dan waktu sinkron berhasil terakhir untuk sumber gagal", () => {
    const [c] = buildCards(
      [src({ last_sync_status: "failed", last_error: "Token ditolak (401)", last_synced_at: "2026-11-05T00:00:00Z" })],
      [cnt()],
      NOW,
    );
    expect(c).toMatchObject({ lastSyncStatus: "failed", lastError: "Token ditolak (401)", lastSyncedAt: "2026-11-05T00:00:00Z", hasData: true });
  });
});

describe("urutan kartu: yang perlu perhatian lebih dulu", () => {
  const names = (sources: SourceRow[], counts: CountsRow[]) => buildCards(sources, counts, NOW).map((c) => c.name);

  it("gagal sinkron > token kedaluwarsa > blocked > belum disinkronkan > token segera > normal > nonaktif", () => {
    const at = (d: number) => new Date(NOW + d * DAY).toISOString();
    const sources = [
      src({ id: "ok", name: "Normal" }),
      src({ id: "off", name: "Inactive", is_active: false, last_sync_status: "failed" }),
      src({ id: "soon", name: "TokenSegera", token_expires_at: at(3) }),
      src({ id: "never", name: "Belum", last_sync_status: "never" }),
      src({ id: "blk", name: "Blocked" }),
      src({ id: "exp", name: "TokenHabis", token_expires_at: at(-2) }),
      src({ id: "fail", name: "Gagal", last_sync_status: "failed" }),
    ];
    const counts = ["ok", "off", "soon", "blk", "exp", "fail"].map((id) =>
      cnt({ source_id: id, blocked: id === "blk" ? 2 : 0 }),
    );
    expect(names(sources, counts)).toEqual(["Gagal", "TokenHabis", "Blocked", "Belum", "TokenSegera", "Normal", "Inactive"]);
  });

  it("peringkat sama diurutkan menurut nama (bahasa Indonesia)", () => {
    expect(names([src({ id: "c", name: "Cakra" }), src({ id: "a", name: "Anta" }), src({ id: "b", name: "Bima" })], [])).toEqual(["Anta", "Bima", "Cakra"]);
  });

  it("sumber nonaktif selalu di akhir meski gagal sinkron", () => {
    const sources = [src({ id: "x", name: "A-nonaktif", is_active: false, last_sync_status: "failed" }), src({ id: "y", name: "Z-normal" })];
    expect(names(sources, [cnt({ source_id: "y" })])).toEqual(["Z-normal", "A-nonaktif"]);
  });
});

describe("summarize", () => {
  it("menghitung aplikasi bermasalah dan mengabaikan sumber nonaktif", () => {
    const at = (d: number) => new Date(NOW + d * DAY).toISOString();
    const sources = [
      src({ id: "1", name: "1" }),
      src({ id: "2", name: "2", last_sync_status: "failed" }),
      src({ id: "3", name: "3", token_expires_at: at(-1) }),
      src({ id: "4", name: "4", token_expires_at: at(2) }),
      src({ id: "5", name: "5", last_sync_status: "never" }),
      src({ id: "6", name: "6", is_active: false, last_sync_status: "failed" }),
    ];
    const counts = [cnt({ source_id: "1", blocked: 3 }), cnt({ source_id: "2" }), cnt({ source_id: "3" }), cnt({ source_id: "4" })];
    expect(summarize(buildCards(sources, counts, NOW))).toEqual({
      apps: 6, failed: 1, blocked: 1, tokenIssues: 2, neverSynced: 1,
    });
  });

  it("semua baik -> semua penghitung masalah nol", () => {
    const s = summarize(buildCards([src()], [cnt()], NOW));
    expect(s).toEqual({ apps: 1, failed: 0, blocked: 0, tokenIssues: 0, neverSynced: 0 });
  });

  it("tanpa sumber", () => {
    expect(summarize([])).toEqual({ apps: 0, failed: 0, blocked: 0, tokenIssues: 0, neverSynced: 0 });
  });
});
