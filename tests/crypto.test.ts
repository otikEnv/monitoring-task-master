import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "@/lib/crypto";

const newKey = () => randomBytes(32).toString("base64");
const ORIGINAL = process.env.TOKEN_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = newKey();
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = ORIGINAL;
});

describe("encryptToken / decryptToken", () => {
  it("round trip mengembalikan token semula", () => {
    const token = "github_pat_11ABCDEF0_abc123XYZ";
    expect(decryptToken(encryptToken(token))).toBe(token);
  });

  it("mendukung karakter non-ASCII dan token panjang", () => {
    const token = "tökén-🔑-" + "x".repeat(5000);
    expect(decryptToken(encryptToken(token))).toBe(token);
  });

  it("tidak menyimpan token sebagai teks biasa", () => {
    const token = "ghp_rahasia_sekali";
    expect(encryptToken(token)).not.toContain(token);
  });

  it("memakai IV berbeda tiap enkripsi (hasil berbeda untuk token sama)", () => {
    const a = encryptToken("sama");
    const b = encryptToken("sama");
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe("sama");
    expect(decryptToken(b)).toBe("sama");
  });

  it("berformat v1.<iv>.<ciphertext>.<tag>", () => {
    expect(encryptToken("abc")).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it("menolak token kosong", () => {
    expect(() => encryptToken("")).toThrow(/kosong/i);
  });
});

describe("integritas data", () => {
  // Ubah satu karakter pada bagian tertentu (iv=1, ciphertext=2, tag=3).
  const tamper = (stored: string, index: number) => {
    const parts = stored.split(".");
    const chars = parts[index].split("");
    chars[0] = chars[0] === "A" ? "B" : "A";
    parts[index] = chars.join("");
    return parts.join(".");
  };

  it.each([
    ["iv", 1],
    ["ciphertext", 2],
    ["tag", 3],
  ])("menolak data yang %s-nya diubah", (_name, index) => {
    const stored = encryptToken("token-asli");
    expect(() => decryptToken(tamper(stored, index))).toThrow(
      /tidak bisa didekripsi|Format/,
    );
  });

  it("menolak format yang salah", () => {
    expect(() => decryptToken("bukan-format")).toThrow(/Format/);
    expect(() => decryptToken("v2.a.b.c")).toThrow(/Format/);
    expect(() => decryptToken("v1.a.b")).toThrow(/Format/);
    expect(() => decryptToken("")).toThrow(/Format/);
  });

  it("menolak bila panjang iv atau tag tidak sesuai", () => {
    const [v, , ct] = encryptToken("x").split(".");
    expect(() => decryptToken(`${v}.AAAA.${ct}.AAAA`)).toThrow(/Format/);
  });

  it("menolak bila dibuka dengan kunci yang berbeda", () => {
    const stored = encryptToken("rahasia");
    process.env.TOKEN_ENCRYPTION_KEY = newKey();
    expect(() => decryptToken(stored)).toThrow(/tidak bisa didekripsi/);
  });

  it("pesan galat tidak memuat isi token", () => {
    const stored = encryptToken("ghp_SANGAT_RAHASIA");
    process.env.TOKEN_ENCRYPTION_KEY = newKey();
    try {
      decryptToken(stored);
      throw new Error("seharusnya gagal");
    } catch (e) {
      expect((e as Error).message).not.toContain("SANGAT_RAHASIA");
    }
  });
});

describe("validasi kunci", () => {
  it("gagal jelas bila kunci tidak diisi", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encryptToken("x")).toThrow(/belum diisi/);
    expect(() => decryptToken("v1.a.b.c")).toThrow(/belum diisi/);
  });

  it("gagal bila kunci kosong", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "";
    expect(() => encryptToken("x")).toThrow(/belum diisi/);
  });

  it("gagal bila panjang kunci bukan 32 byte", () => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(() => encryptToken("x")).toThrow(/32 byte/);
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(48).toString("base64");
    expect(() => encryptToken("x")).toThrow(/32 byte/);
  });

  it("gagal bila kunci bukan base64", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "ini bukan base64 !!!";
    expect(() => encryptToken("x")).toThrow(/base64/);
  });

  it("pesan galat kunci tidak membocorkan nilai kunci", () => {
    const bad = randomBytes(16).toString("base64");
    process.env.TOKEN_ENCRYPTION_KEY = bad;
    try {
      encryptToken("x");
      throw new Error("seharusnya gagal");
    } catch (e) {
      expect((e as Error).message).not.toContain(bad);
    }
  });
});
