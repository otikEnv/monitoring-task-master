import { describe, expect, it } from "vitest";
import { decodeSegment } from "@/lib/url";
import { taskHref } from "@/lib/tasks/list-params";

describe("decodeSegment", () => {
  it("teks polos tidak berubah", () => {
    expect(decodeSegment("master")).toBe("master");
    expect(decodeSegment("123")).toBe("123");
  });

  it.each([
    ["a%20b", "a b"], ["a%26b", "a&b"], ["a%23b", "a#b"], ["a%3Fb", "a?b"], ["a%2Fb", "a/b"],
    ["a%5Cb", "a\\b"], ["%3Cb%3E", "<b>"], ["%C3%A9", "é"], ["a%2Bb", "a+b"], ["a%3Db", "a=b"],
  ])("men-decode %s menjadi %j", (raw, expected) => {
    expect(decodeSegment(raw)).toBe(expected);
  });

  it("'%' asli (dikirim sebagai %25) kembali menjadi '%', dan hanya didecode satu kali", () => {
    expect(decodeSegment("a%25b")).toBe("a%b");
    expect(decodeSegment("a%2541")).toBe("a%41"); // bukan "aA": tidak boleh decode dua kali
  });

  it("urutan persen yang rusak -> null (bukan URL valid)", () => {
    for (const bad of ["%E0%A4%A", "%", "%zz", "a%", "%C3"]) expect(decodeSegment(bad)).toBeNull();
  });

  it("string kosong", () => {
    expect(decodeSegment("")).toBe("");
  });

  it("karakter unicode panjang dan emoji", () => {
    expect(decodeSegment(encodeURIComponent("tugas 🚀 ü"))).toBe("tugas 🚀 ü");
  });

  it("round trip dengan taskHref untuk berbagai karakter khusus (tautan yang dibuat bisa dibaca kembali)", () => {
    const UUID = "11111111-1111-4111-8111-111111111111";
    for (const value of ["plain", "a b", "a&b=c", "a#b", "a?b", "a%b", "a%41", "a/b", "a\\b", "<b>x</b>", "é", "a+b", "🚀", "'; drop"]) {
      const [, , source, tag, id] = taskHref(UUID, value, value).split("/");
      expect(decodeSegment(source)).toBe(UUID);
      expect(decodeSegment(tag)).toBe(value);
      expect(decodeSegment(id)).toBe(value);
      // setiap segmen tepat satu bagian URL (tidak bocor ke segmen lain)
      expect(taskHref(UUID, value, value).split("/")).toHaveLength(5);
    }
  });
});
