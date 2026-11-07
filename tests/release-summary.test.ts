import { describe, expect, it } from "vitest";
import type { ReleaseOverview } from "@/lib/releases/load";
import { summarizeReleases } from "@/lib/releases/summary";

const ov = (id: string, sourceId: string, name: string, releasedOn: string | null, percent: number | null = 50): ReleaseOverview =>
  ({
    release: { id, sourceId, name, releasedOn },
    stats: { percentDone: percent, total: 10, daysLeft: 5, risk: "on_track" },
  }) as unknown as ReleaseOverview;

describe("summarizeReleases", () => {
  it("memilih release belum rilis pertama (terdekat) per aplikasi dan menghitung sisanya", () => {
    const m = summarizeReleases([
      ov("r1", "A", "v2.1", null),
      ov("r2", "A", "v2.2", null),
      ov("r3", "A", "v2.3", null),
      ov("r4", "B", "v1.0", null, null),
    ]);
    expect(m.get("A")).toMatchObject({ releaseId: "r1", name: "v2.1", extra: 2, percent: 50, daysLeft: 5, risk: "on_track" });
    expect(m.get("B")).toMatchObject({ releaseId: "r4", percent: null, extra: 0 });
  });

  it("release yang sudah rilis diabaikan; aplikasi tanpa release aktif tidak muncul", () => {
    const m = summarizeReleases([ov("r1", "A", "v1", "2026-10-01"), ov("r2", "B", "v2", null)]);
    expect(m.has("A")).toBe(false);
    expect(m.get("B")?.releaseId).toBe("r2");
  });

  it("tanpa masukan: kosong", () => {
    expect(summarizeReleases([]).size).toBe(0);
  });
});
