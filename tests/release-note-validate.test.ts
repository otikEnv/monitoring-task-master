import { describe, expect, it } from "vitest";
import {
  NOTE_LIMITS, validateHoldReason, validateNoteBody, validateResumeReason, validateTargetReason,
} from "@/lib/releases/validate";

describe("validateNoteText dan turunannya (catatan, hold, alasan target)", () => {
  it("merapikan teks: spasi tepi dibuang, CRLF menjadi baris baru, baris baru di tengah dipertahankan", () => {
    expect(validateNoteBody("  halo\r\ndunia\r\n ")).toEqual({ ok: true, value: "halo\ndunia" });
    expect(validateHoldReason("\tMenunggu API  ")).toEqual({ ok: true, value: "Menunggu API" });
  });

  it("wajib diisi untuk note, hold, dan target_change; kosong atau hanya spasi ditolak dengan pesan jelas", () => {
    expect(validateNoteBody("")).toEqual({ ok: false, error: "Note is required." });
    expect(validateNoteBody("   \n ")).toEqual({ ok: false, error: "Note is required." });
    expect(validateHoldReason(undefined)).toEqual({ ok: false, error: "Hold reason is required." });
    expect(validateTargetReason(null)).toEqual({ ok: false, error: "Reason for change is required." });
  });

  it("alasan resume boleh kosong", () => {
    expect(validateResumeReason("")).toEqual({ ok: true, value: "" });
    expect(validateResumeReason("  Siap  ")).toEqual({ ok: true, value: "Siap" });
  });

  it("batas panjang: note 2000, hold dan alasan target 500, resume 500", () => {
    expect(validateNoteBody("x".repeat(2000)).ok).toBe(true);
    expect(validateNoteBody("x".repeat(2001))).toEqual({ ok: false, error: "Note must be at most 2000 characters." });
    expect(validateHoldReason("x".repeat(500)).ok).toBe(true);
    expect(validateHoldReason("x".repeat(501))).toEqual({ ok: false, error: "Hold reason must be at most 500 characters." });
    expect(validateTargetReason("x".repeat(501)).ok).toBe(false);
    expect(validateResumeReason("x".repeat(501)).ok).toBe(false);
  });

  it("panjang dihitung setelah dirapikan (spasi tepi tidak dihitung)", () => {
    expect(validateHoldReason(`  ${"x".repeat(500)}  `).ok).toBe(true);
  });

  it("karakter kontrol ditolak, tab dan baris baru boleh", () => {
    expect(validateNoteBody("a\u0000b")).toEqual({ ok: false, error: "Note contains invalid characters." });
    expect(validateNoteBody("a\u001bb").ok).toBe(false);
    expect(validateNoteBody("a\u007fb").ok).toBe(false);
    expect(validateNoteBody("a\tb\nc")).toEqual({ ok: true, value: "a\tb\nc" });
  });

  it("bukan teks (angka, objek) diperlakukan sebagai kosong", () => {
    expect(validateNoteBody(123)).toEqual({ ok: false, error: "Note is required." });
    expect(validateNoteBody({}).ok).toBe(false);
  });

  it("HTML dan simbol dibiarkan apa adanya (di-escape saat ditampilkan, bukan saat disimpan)", () => {
    expect(validateNoteBody("<b>x</b> & y")).toEqual({ ok: true, value: "<b>x</b> & y" });
  });

  it("batas sama dengan constraint database", () => {
    expect(NOTE_LIMITS).toMatchObject({
      note: { min: 1, max: 2000 }, hold: { min: 1, max: 500 }, target_change: { min: 1, max: 500 },
      resume: { min: 0, max: 500 }, released: { min: 0, max: 500 },
    });
  });
});
