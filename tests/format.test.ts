import { describe, expect, it } from "vitest";
import {
  formatBytes, formatDate, formatDateInput, formatDateTime, tokenExpiryState,
} from "@/lib/format";

const DAY = 24 * 60 * 60 * 1000;

describe("formatDate (WIB)", () => {
  it("menampilkan tanggal menurut WIB", () => {
    expect(formatDate("2026-11-07T09:30:29Z")).toBe("07 Nov 2026");
  });
  it("melewati tengah malam WIB: 20.00 UTC sudah hari berikutnya di WIB", () => {
    expect(formatDate("2026-11-07T20:00:00Z")).toBe("08 Nov 2026");
    expect(formatDate("2026-11-07T16:59:59Z")).toBe("07 Nov 2026");
    expect(formatDate("2026-11-07T17:00:00Z")).toBe("08 Nov 2026"); // tepat 00.00 WIB
  });
  it("kosong atau tidak valid -> '-'", () => {
    for (const v of [null, undefined, "", "bukan tanggal"]) expect(formatDate(v)).toBe("-");
  });
});

describe("formatDateTime (WIB)", () => {
  it("tanggal dan jam menurut WIB", () => {
    const s = formatDateTime("2026-11-06T03:52:39Z");
    expect(s).toContain("06 Nov 2026");
    expect(s).toMatch(/10[.:]52/);
  });
  it("kosong atau tidak valid -> '-'", () => {
    for (const v of [null, undefined, "", "x"]) expect(formatDateTime(v)).toBe("-");
  });
});

describe("formatDateInput (nilai awal <input type=date>, WIB)", () => {
  it("yyyy-mm-dd menurut WIB, sama dengan tanggal pada formatDate", () => {
    expect(formatDateInput("2026-11-07T09:30:29Z")).toBe("2026-11-07");
    expect(formatDateInput("2026-11-07T16:59:59Z")).toBe("2026-11-07");
    expect(formatDateInput("2026-11-07T17:00:00Z")).toBe("2026-11-08"); // beda dengan potongan ISO (yang akan "2026-11-07")
  });
  it("tahun baru dan kabisat", () => {
    expect(formatDateInput("2026-12-31T18:00:00Z")).toBe("2027-01-01");
    expect(formatDateInput("2028-02-29T10:00:00Z")).toBe("2028-02-29");
  });
  it("kosong atau tidak valid -> string kosong (bukan 'Invalid Date')", () => {
    for (const v of [null, undefined, "", "bukan tanggal"]) expect(formatDateInput(v)).toBe("");
  });
});

describe("formatBytes", () => {
  it("satuan B, KB, MB", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(672923)).toBe("657.2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("tokenExpiryState", () => {
  const now = Date.UTC(2026, 10, 7, 12);
  const at = (ms: number) => new Date(now + ms).toISOString();

  it("tanpa tanggal atau tidak valid -> none", () => {
    expect(tokenExpiryState(null, now)).toBe("none");
    expect(tokenExpiryState(undefined, now)).toBe("none");
    expect(tokenExpiryState("", now)).toBe("none");
    expect(tokenExpiryState("bukan tanggal", now)).toBe("none");
  });
  it("sudah lewat atau tepat sekarang -> expired", () => {
    expect(tokenExpiryState(at(-1), now)).toBe("expired");
    expect(tokenExpiryState(at(0), now)).toBe("expired");
    expect(tokenExpiryState(at(-30 * DAY), now)).toBe("expired");
  });
  it("kurang dari 14 hari -> soon; tepat 14 hari atau lebih -> ok", () => {
    expect(tokenExpiryState(at(1), now)).toBe("soon");
    expect(tokenExpiryState(at(13 * DAY), now)).toBe("soon");
    expect(tokenExpiryState(at(14 * DAY - 1), now)).toBe("soon");
    expect(tokenExpiryState(at(14 * DAY), now)).toBe("ok");
    expect(tokenExpiryState(at(200 * DAY), now)).toBe("ok");
  });
});
