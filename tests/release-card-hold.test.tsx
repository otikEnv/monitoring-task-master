import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/app/archive/actions", () => ({
  archiveSource: vi.fn(), restoreSource: vi.fn(), archiveRelease: vi.fn(), restoreRelease: vi.fn(), sourceArchiveImpact: vi.fn(),
}));
vi.mock("@/app/release/actions", () => ({ putOnHold: vi.fn(), resumeHold: vi.fn() }));

import { ReleaseCard } from "@/components/releases/release-card";
import type { ReleaseOverview } from "@/lib/releases/load";
import { overviewOf, task } from "./fixtures/release-overview";

const tasks = [task(100, "done"), task(101, "pending")];
const card = (o: ReleaseOverview, canArchive = false) => renderToStaticMarkup(<ReleaseCard overview={o} canArchive={canArchive} />);
const held = (over: Parameters<typeof overviewOf>[1] = {}) =>
  overviewOf([{ tasks }], { now: "2026-11-30", heldAt: "2026-11-25T03:00:00Z", holdReason: "Waiting for API", ...over });

describe("kartu release ditahan", () => {
  it("lencana On hold menggantikan risiko otomatis; alasan satu baris dengan title penuh", () => {
    const out = card(held());
    expect(out).toContain("On hold</span>");
    expect(out).not.toMatch(/>(?:<svg[^>]*>.*?<\/svg>)?Overdue</);
    expect(out).toContain("On hold: <span");
    expect(out).toContain("Waiting for API");
    expect(out).toContain('title="Waiting for API"');
    expect(out).toContain("truncate");
  });

  it("alasan panjang dan bertingkat: baris baru menjadi spasi di kartu, title tetap utuh", () => {
    const out = card(held({ holdReason: "Baris satu\n\n  baris dua   baris tiga" }));
    expect(out).toContain("Baris satu baris dua baris tiga");
    expect(out).toContain('title="Baris satu\n\n  baris dua   baris tiga"');
  });

  it("alasan di-escape", () => {
    const out = card(held({ holdReason: "<script>alert(1)</script>" }));
    expect(out).not.toContain("<script>alert(1)");
    expect(out).toContain("&lt;script&gt;");
  });

  it("angka progres dan target tetap tampil", () => {
    const out = card(held());
    expect(out).toContain("50%");
    expect(out).toContain("1 of 2 done");
    expect(out).toContain("21 Nov 2026");
  });

  it("keterlambatan tetap tertulis tetapi tidak berwarna peringatan; tanpa hold tetap merah", () => {
    const late = { now: "2026-11-30" } as const;
    const heldOut = card(held());
    expect(heldOut).toContain("days overdue");
    expect(heldOut).not.toMatch(/text-red-700[^>]*>[^<]*overdue/);
    const freeOut = card(overviewOf([{ tasks }], late));
    expect(freeOut).toMatch(/text-red-700[^>]*>[^<]*overdue/);
  });

  it("tanpa alasan: tidak ada baris alasan, lencana tetap On hold", () => {
    const out = card(held({ holdReason: null }));
    expect(out).not.toContain("On hold: <span");
    expect(out).toContain("On hold</span>");
  });

  it("release aktif: tanpa baris hold", () => {
    const out = card(overviewOf([{ tasks }], { now: "2026-11-11" }));
    expect(out).not.toContain("On hold");
  });
});

describe("baris catatan terbaru", () => {
  const note = (body: string) => ({ id: "n1", body, createdAt: "2026-11-13T03:00:00Z" });

  it("satu baris dengan tanggal; baris baru dirapikan; teks penuh di title", () => {
    const out = card(overviewOf([{ tasks }], { latestNote: note("Menunggu QA\nselesai Jumat") }));
    expect(out).toContain("Note (13 Nov 2026): Menunggu QA selesai Jumat");
    expect(out).toContain('title="Menunggu QA\nselesai Jumat"');
  });

  it("tanpa catatan: tidak ada baris", () => {
    expect(card(overviewOf([{ tasks }]))).not.toContain("Note (");
  });

  it("catatan kosong tidak menampilkan baris", () => {
    expect(card(overviewOf([{ tasks }], { latestNote: note("") }))).not.toContain("Note (");
  });

  it("catatan di-escape", () => {
    const out = card(overviewOf([{ tasks }], { latestNote: note("<img src=x onerror=alert(1)>") }));
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("ditahan dan ada catatan: kedua baris tampil, alasan dulu", () => {
    const out = card(held({ latestNote: note("Menunggu QA") }));
    expect(out.indexOf("On hold: <span")).toBeGreaterThan(-1);
    expect(out.indexOf("On hold: <span")).toBeLessThan(out.indexOf("Note ("));
  });

  it("release yang sudah rilis tetap menampilkan catatan terakhir", () => {
    const out = card(overviewOf([{ tasks }], { releasedOn: "2026-11-10", latestNote: note("Rilis mulus") }));
    expect(out).toContain("Note (13 Nov 2026): Rilis mulus");
    expect(out).not.toContain("On hold");
  });
});

describe("menu tiga titik kartu release", () => {
  it("tombol menu ada untuk admin dan bukan admin; isi menu baru muncul saat dibuka", () => {
    expect(card(held(), true)).toContain('aria-label="Actions for v2.1"');
    expect(card(held(), false)).toContain('aria-label="Actions for v2.1"');
  });

  it("dialog hold tidak dirender sebelum dibuka", () => {
    expect(card(held(), true)).not.toContain("Put release");
    expect(card(overviewOf([{ tasks }]), true)).not.toContain("on hold?");
  });
});
