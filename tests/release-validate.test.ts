import { describe, expect, it } from "vitest";
import {
  componentField, isValidDate, MAX_COMPONENTS, parseRangeNumber, parseReleaseForm, type ComponentFieldName,
} from "@/lib/releases/validate";

const SRC = "11111111-1111-4111-8111-111111111111";
const SRC2 = "22222222-2222-4222-8222-222222222222";

type Comp = Partial<Record<ComponentFieldName, string>>;
const baseHeader: Record<string, string> = { name: "v2.1", startDate: "2026-11-01", targetDate: "2026-11-20" };
const baseComp: Record<ComponentFieldName, string> = { sourceId: SRC, tag: "master", rangeStart: "100", rangeEnd: "200" };

/** Form dengan header dan komponen (bawaan: satu komponen). Nomor baris dapat diatur lewat `at`. */
function form(header: Record<string, string> = {}, comps: Comp[] = [{}], at?: number[]) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...baseHeader, ...header })) fd.set(k, v);
  comps.forEach((c, i) => {
    for (const [k, v] of Object.entries({ ...baseComp, ...c })) fd.set(componentField(at?.[i] ?? i, k as ComponentFieldName), v);
  });
  return fd;
}
const parse = (header: Record<string, string> = {}, comps: Comp[] = [{}], at?: number[]) => parseReleaseForm(form(header, comps, at));
const errorsOf = (header: Record<string, string> = {}, comps: Comp[] = [{}], at?: number[]) => {
  const r = parse(header, comps, at);
  if (r.ok) throw new Error("seharusnya tidak valid");
  return r.fieldErrors;
};
const itemOf = (c: Comp, i = 0) => errorsOf({}, [c]).items?.[i] ?? {};

describe("isian valid", () => {
  it("satu komponen: nilai bersih dengan angka", () => {
    expect(parse({ name: "  v2.1  " }, [{ tag: " master " }])).toEqual({
      ok: true,
      value: {
        name: "v2.1", startDate: "2026-11-01", targetDate: "2026-11-20",
        components: [{ sourceId: SRC, tag: "master", rangeStart: 100, rangeEnd: 200 }],
      },
    });
  });

  it("dua komponen dari aplikasi berbeda, urut menurut nomor baris", () => {
    const r = parse({}, [{}, { sourceId: SRC2, tag: "main", rangeStart: "20", rangeEnd: "45" }]);
    expect(r.ok && r.value.components).toEqual([
      { sourceId: SRC, tag: "master", rangeStart: 100, rangeEnd: 200 },
      { sourceId: SRC2, tag: "main", rangeStart: 20, rangeEnd: 45 },
    ]);
  });

  it("nomor baris tidak harus berurutan (baris dihapus di form); urut tetap naik", () => {
    const r = parse({}, [{ tag: "b" }, { tag: "a" }], [7, 3]);
    expect(r.ok && r.value.components.map((c) => c.tag)).toEqual(["a", "b"]);
  });

  it("tanggal mulai opsional (null)", () => {
    const r = parse({ startDate: "" });
    expect(r.ok && r.value.startDate).toBeNull();
  });

  it("awal = akhir, mulai = target, dan UUID huruf besar diterima", () => {
    const r = parse({ startDate: "2026-11-20" }, [{ rangeStart: "7", rangeEnd: "7", sourceId: SRC.toUpperCase() }]);
    expect(r.ok && [r.value.components[0].rangeStart, r.value.components[0].rangeEnd, r.value.components[0].sourceId]).toEqual([7, 7, SRC]);
  });

  it("aplikasi yang sama dengan tag berbeda boleh jadi komponen terpisah", () => {
    expect(parse({}, [{ tag: "master" }, { tag: "mobile" }]).ok).toBe(true);
  });

  it("maksimal 10 komponen diterima", () => {
    const comps = Array.from({ length: MAX_COMPONENTS }, (_, i) => ({ tag: `t${i}` }));
    expect(parse({}, comps).ok).toBe(true);
  });
});

describe("nama release", () => {
  it("wajib, maksimal 100 karakter, tanpa karakter kontrol", () => {
    expect(errorsOf({ name: "   " }).name).toBeTruthy();
    expect(errorsOf({ name: "a".repeat(101) }).name).toBeTruthy();
    expect(errorsOf({ name: "v2\u0000" }).name).toBeTruthy();
    expect(parse({ name: "a".repeat(100) }).ok).toBe(true);
  });
});

describe("daftar komponen", () => {
  it("minimal satu komponen", () => {
    expect(errorsOf({}, []).components).toContain("at least one");
  });

  it("lebih dari 10 komponen ditolak", () => {
    const comps = Array.from({ length: MAX_COMPONENTS + 1 }, (_, i) => ({ tag: `t${i}` }));
    expect(errorsOf({}, comps).components).toContain("at most 10");
  });

  it("field komponen yang tidak dikenal atau berformat salah diabaikan", () => {
    const fd = form();
    fd.set("components[0].lain", "x");
    fd.set("components[abc].tag", "x");
    fd.set("components[].tag", "x");
    fd.set("components[1000].tag", "x");
    expect(parseReleaseForm(fd).ok).toBe(true);
  });
});

describe("aplikasi dan tag per komponen", () => {
  it("aplikasi harus UUID", () => {
    expect(itemOf({ sourceId: "" }).sourceId).toBeTruthy();
    expect(itemOf({ sourceId: "bukan-uuid" }).sourceId).toBeTruthy();
  });

  it("tag wajib, maksimal 100 karakter, tanpa karakter kontrol", () => {
    expect(itemOf({ tag: "  " }).tag).toBeTruthy();
    expect(itemOf({ tag: "a".repeat(101) }).tag).toBeTruthy();
    expect(itemOf({ tag: "ma\nster" }).tag).toBeTruthy();
    expect(parse({}, [{ tag: "a".repeat(100) }]).ok).toBe(true);
  });

  it("pasangan (aplikasi, tag) ganda: baris berikutnya yang ditandai", () => {
    const e = errorsOf({}, [{}, { sourceId: SRC2 }, {}]);
    expect(e.items?.[2]?.tag).toContain("already used");
    expect(e.items?.[0]).toBeUndefined();
    expect(e.items?.[1]).toBeUndefined();
  });

  it("pasangan ganda dibandingkan tanpa memandang huruf besar UUID dan spasi tag", () => {
    const e = errorsOf({}, [{}, { sourceId: SRC.toUpperCase(), tag: " master " }]);
    expect(e.items?.[1]?.tag).toContain("already used");
  });
});

describe("rentang task per komponen", () => {
  it("harus bilangan bulat positif", () => {
    for (const bad of ["", "abc", "1.5", "-3", "0", "1e3", "12 3"]) {
      expect(itemOf({ rangeStart: bad }).rangeStart, `awal "${bad}"`).toBeTruthy();
      expect(itemOf({ rangeEnd: bad }).rangeEnd, `akhir "${bad}"`).toBeTruthy();
    }
  });

  it("maksimal 15 digit", () => {
    expect(parseRangeNumber("999999999999999")).toBe(999_999_999_999_999);
    expect(parseRangeNumber("1000000000000000")).toBeNull();
    expect(itemOf({ rangeEnd: "1000000000000000" }).rangeEnd).toBeTruthy();
  });

  it("awal tidak boleh lebih besar dari akhir", () => {
    expect(itemOf({ rangeStart: "201", rangeEnd: "200" }).rangeEnd).toContain("cannot be smaller");
  });

  it("galat dilaporkan pada baris yang tepat (nomor baris form)", () => {
    const e = errorsOf({}, [{}, { rangeStart: "x" }], [4, 9]);
    expect(e.items?.[9]?.rangeStart).toBeTruthy();
    expect(e.items?.[4]).toBeUndefined();
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
    expect(errorsOf({ startDate: "2026-11-21" }).startDate).toContain("after the target date");
  });

  it("target yang sudah lewat tetap diterima (pencatatan mundur)", () => {
    expect(parse({ startDate: "2020-01-01", targetDate: "2020-02-01" }).ok).toBe(true);
  });
});

it("beberapa galat dilaporkan sekaligus (header dan komponen)", () => {
  const e = errorsOf({ name: "", targetDate: "" }, [{ tag: "", rangeStart: "x" }]);
  expect(Object.keys(e).sort()).toEqual(["items", "name", "targetDate"]);
  expect(Object.keys(e.items![0]).sort()).toEqual(["rangeStart", "tag"]);
});
