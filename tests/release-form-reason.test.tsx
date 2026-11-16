import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/release/actions", () => ({ saveRelease: vi.fn(), previewRange: vi.fn() }));

import { ReleaseForm, type FormInitial } from "@/app/release/release-form";
import { targetDateChanged } from "@/lib/releases/validate";

const SOURCES = [{ id: "11111111-1111-4111-8111-111111111111", name: "Echo App", tags: ["master"] }];
const row = { sourceId: SOURCES[0].id, tag: "master", rangeStart: "100", rangeEnd: "150" };
const editing: FormInitial = { id: "22222222-2222-4222-8222-222222222222", name: "2.1", startDate: "2026-11-01", targetDate: "2026-11-20", components: [row] };
const creating: FormInitial = { name: "", startDate: "", targetDate: "", components: [row] };
const html = (i: FormInitial) => renderToStaticMarkup(<ReleaseForm initial={i} sources={SOURCES} />);

describe("targetDateChanged", () => {
  it("hanya pada mode ubah, dan hanya bila tanggal berbeda dan tidak kosong", () => {
    expect(targetDateChanged(true, "2026-11-20", "2026-11-20")).toBe(false);
    expect(targetDateChanged(true, "2026-11-20", "2026-12-05")).toBe(true);
    expect(targetDateChanged(true, "2026-11-20", "")).toBe(false); // sedang mengetik / dikosongkan
    expect(targetDateChanged(false, "", "2026-12-05")).toBe(false); // release baru tidak butuh alasan
    expect(targetDateChanged(false, "2026-11-20", "2026-12-05")).toBe(false);
  });
});

describe("kotak 'Reason for change' pada form", () => {
  it("tidak tampil saat awal (tanggal belum diubah), baik ubah maupun tambah", () => {
    expect(html(editing)).not.toContain("changeReason");
    expect(html(editing)).not.toContain("Reason for change");
    expect(html(creating)).not.toContain("changeReason");
  });

  it("tanggal target dikendalikan form (nilai awal terbawa) dan tombol Save aktif saat belum ada perubahan", () => {
    const out = html(editing);
    expect(out).toMatch(/id="targetDate"[^>]*value="2026-11-20"/);
    const save = /<button[^>]*type="submit"[^>]*>Save changes/.exec(out)?.[0];
    expect(save).toBeTruthy();
    expect(save).not.toContain('disabled=""'); // (kelas CSS memuat "disabled:", jadi periksa atributnya)
  });
});
