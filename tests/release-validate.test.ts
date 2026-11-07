import { describe, expect, it } from "vitest";
import { isValidDate, parseRangeNumber, parseReleaseForm } from "@/lib/releases/validate";

const SRC = "11111111-1111-4111-8111-111111111111";
const base: Record<string, string> = {
  sourceId: SRC, tag: "master", name: "v2.1", rangeStart: "100", rangeEnd: "200",
  startDate: "2026-11-01", targetDate: "2026-11-20",
};
const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...base, ...over })) fd.set(k, v);
  return fd;
};
const errorsOf = (over: Record<string, string>) => {
  const r = parseReleaseForm(form(over));
  if (r.ok) throw new Error("seharusnya tidak valid");
  return r.fieldErrors;
};

describe("isian valid", () => {
  it("menghasilkan nilai bersih dengan angka", () => {
    expect(parseReleaseForm(form({ name: "  v2.1  ", tag: " master " }))).toEqual({
      ok: true,
      value: {
        sourceId: SRC, tag: "master", name: "v2.1", rangeStart: 100, rangeEnd: 200,
        startDate: "2026-11-01", targetDate: "2026-11-20",
      },
    });
  });

  it("tanggal mulai opsional (null)", () => {
    const r = parseReleaseForm(form({ startDate: "" }));
    expect(r.ok && r.value.startDate).toBeNull();
  });

  it("awal = akhir, mulai = target, dan UUID huruf besar diterima", () => {
    const r = parseReleaseForm(form({ rangeStart: "7", rangeEnd: "7", startDate: "2026-11-20", sourceId: SRC.toUpperCase() }));
    expect(r.ok && [r.value.rangeStart, r.value.rangeEnd, r.value.sourceId]).toEqual([7, 7, SRC]);
  });
});

describe("aplikasi, tag, dan nama", () => {
  it("aplikasi harus UUID", () => {
    expect(errorsOf({ sourceId: "" }).sourceId).toBeTruthy();
    expect(errorsOf({ sourceId: "bukan-uuid" }).sourceId).toBeTruthy();
  });

  it("tag wajib, maksimal 100 karakter, tanpa karakter kontrol", () => {
    expect(errorsOf({ tag: "  " }).tag).toBeTruthy();
    expect(errorsOf({ tag: "a".repeat(101) }).tag).toBeTruthy();
    expect(errorsOf({ tag: "ma\nster" }).tag).toBeTruthy();
    expect(parseReleaseForm(form({ tag: "a".repeat(100) })).ok).toBe(true);
  });

  it("nama wajib, maksimal 100 karakter, tanpa karakter kontrol", () => {
    expect(errorsOf({ name: "   " }).name).toBeTruthy();
    expect(errorsOf({ name: "a".repeat(101) }).name).toBeTruthy();
    expect(errorsOf({ name: "v2\u0000" }).name).toBeTruthy();
    expect(parseReleaseForm(form({ name: "a".repeat(100) })).ok).toBe(true);
  });
});

describe("rentang task", () => {
  it("harus bilangan bulat positif", () => {
    for (const bad of ["", "abc", "1.5", "-3", "0", "1e3", "12 3"]) {
      expect(errorsOf({ rangeStart: bad }).rangeStart, `awal "${bad}"`).toBeTruthy();
      expect(errorsOf({ rangeEnd: bad }).rangeEnd, `akhir "${bad}"`).toBeTruthy();
    }
  });

  it("maksimal 15 digit", () => {
    expect(parseRangeNumber("999999999999999")).toBe(999_999_999_999_999);
    expect(parseRangeNumber("1000000000000000")).toBeNull();
    expect(errorsOf({ rangeEnd: "1000000000000000" }).rangeEnd).toBeTruthy();
  });

  it("awal tidak boleh lebih besar dari akhir", () => {
    expect(errorsOf({ rangeStart: "201", rangeEnd: "200" }).rangeEnd).toContain("tidak boleh lebih kecil");
  });
});

describe("tanggal", () => {
  it("tanggal target wajib dan harus tanggal kalender yang ada", () => {
    expect(errorsOf({ targetDate: "" }).targetDate).toBeTruthy();
    expect(errorsOf({ targetDate: "2026-02-30" }).targetDate).toBeTruthy();
    expect(errorsOf({ targetDate: "20-11-2026" }).targetDate).toBeTruthy();
    expect(errorsOf({ targetDate: "2026-13-01" }).targetDate).toBeTruthy();
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false);
  });

  it("tanggal mulai harus valid dan tidak setelah target", () => {
    expect(errorsOf({ startDate: "2026-02-30" }).startDate).toBeTruthy();
    expect(errorsOf({ startDate: "2026-11-21" }).startDate).toContain("setelah tanggal target");
  });

  it("target yang sudah lewat tetap diterima (pencatatan mundur)", () => {
    expect(parseReleaseForm(form({ startDate: "2020-01-01", targetDate: "2020-02-01" })).ok).toBe(true);
  });
});

it("beberapa galat dilaporkan sekaligus", () => {
  const e = errorsOf({ name: "", tag: "", rangeStart: "x", targetDate: "" });
  expect(Object.keys(e).sort()).toEqual(["name", "rangeStart", "tag", "targetDate"]);
});
