import { describe, expect, it } from "vitest";
import type { ReleaseOverview } from "@/lib/releases/load";
import { summarizeReleases } from "@/lib/releases/summary";

type Comp = { sourceId: string; total: number; done: number };
const ov = (
  id: string, name: string, releasedOn: string | null, comps: Comp[], over: { daysLeft?: number; risk?: string } = {},
): ReleaseOverview =>
  ({
    release: { id, name, releasedOn },
    components: comps.map((c) => ({ component: { sourceId: c.sourceId }, stats: { total: c.total, done: c.done } })),
    stats: { daysLeft: over.daysLeft ?? 5, risk: over.risk ?? "on_track" },
  }) as unknown as ReleaseOverview;

describe("summarizeReleases", () => {
  it("memilih release belum rilis pertama (terdekat) per aplikasi dan menghitung sisanya", () => {
    const m = summarizeReleases([
      ov("r1", "v2.1", null, [{ sourceId: "A", total: 10, done: 5 }]),
      ov("r2", "v2.2", null, [{ sourceId: "A", total: 10, done: 0 }]),
      ov("r3", "v2.3", null, [{ sourceId: "A", total: 10, done: 0 }]),
      ov("r4", "v1.0", null, [{ sourceId: "B", total: 0, done: 0 }]),
    ]);
    expect(m.get("A")).toMatchObject({ releaseId: "r1", name: "v2.1", extra: 2, percent: 50, total: 10, daysLeft: 5, risk: "on_track", componentCount: 1 });
    expect(m.get("B")).toMatchObject({ releaseId: "r4", percent: null, total: 0, extra: 0 });
  });

  it("release yang sudah rilis diabaikan; aplikasi tanpa release aktif tidak muncul", () => {
    const m = summarizeReleases([
      ov("r1", "v1", "2026-10-01", [{ sourceId: "A", total: 1, done: 1 }]),
      ov("r2", "v2", null, [{ sourceId: "B", total: 1, done: 0 }]),
    ]);
    expect(m.has("A")).toBe(false);
    expect(m.get("B")?.releaseId).toBe("r2");
  });

  it("release lintas aplikasi muncul pada tiap aplikasi dengan progres komponennya dan risiko release", () => {
    const m = summarizeReleases([
      ov("r1", "2.1", null, [{ sourceId: "WEB", total: 80, done: 60 }, { sourceId: "API", total: 20, done: 10 }], { risk: "at_risk", daysLeft: 3 }),
    ]);
    expect(m.get("WEB")).toMatchObject({ releaseId: "r1", percent: 75, total: 80, risk: "at_risk", daysLeft: 3, componentCount: 2, extra: 0 });
    expect(m.get("API")).toMatchObject({ releaseId: "r1", percent: 50, total: 20, risk: "at_risk", componentCount: 2, extra: 0 });
  });

  it("dua tag pada aplikasi yang sama dijumlahkan menjadi satu baris", () => {
    const m = summarizeReleases([
      ov("r1", "2.1", null, [{ sourceId: "WEB", total: 10, done: 10 }, { sourceId: "WEB", total: 30, done: 0 }]),
    ]);
    expect(m.get("WEB")).toMatchObject({ total: 40, percent: 25, extra: 0, componentCount: 2 });
  });

  it("release lintas aplikasi dan release satu aplikasi dihitung sebagai 'extra' per aplikasi", () => {
    const m = summarizeReleases([
      ov("r1", "2.1", null, [{ sourceId: "WEB", total: 1, done: 0 }, { sourceId: "API", total: 1, done: 0 }]),
      ov("r2", "2.2", null, [{ sourceId: "WEB", total: 1, done: 0 }]),
    ]);
    expect(m.get("WEB")).toMatchObject({ releaseId: "r1", extra: 1 });
    expect(m.get("API")).toMatchObject({ releaseId: "r1", extra: 0 });
  });

  it("release tanpa komponen tidak menghasilkan baris", () => {
    expect(summarizeReleases([ov("r1", "kosong", null, [])]).size).toBe(0);
  });

  it("tanpa masukan: kosong", () => {
    expect(summarizeReleases([]).size).toBe(0);
  });
});
