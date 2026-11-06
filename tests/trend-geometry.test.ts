import { describe, expect, it } from "vitest";
import {
  columnWidth, formatTick, gapThresholdMs, linePaths, linearScale, nearestIndex, niceMax,
  roundedTopRect, timeTicks, yTicks,
} from "@/lib/trend/geometry";

const DAY = 24 * 60 * 60 * 1000;

describe("linearScale", () => {
  it("memetakan domain ke rentang, termasuk rentang terbalik (sumbu-Y)", () => {
    const x = linearScale([0, 10], [0, 100]);
    expect([x(0), x(5), x(10)]).toEqual([0, 50, 100]);
    const y = linearScale([0, 100], [200, 0]);
    expect([y(0), y(50), y(100)]).toEqual([200, 100, 0]);
  });
  it("domain yang runtuh dipusatkan (tidak NaN)", () => {
    expect(linearScale([5, 5], [0, 100])(5)).toBe(50);
  });
  it("tidak membatasi nilai di luar domain (batas ditangani pemanggil)", () => {
    expect(linearScale([0, 10], [0, 100])(20)).toBe(200);
  });
});

describe("niceMax", () => {
  it.each([
    [0, 1], [-5, 1], [1, 1], [1.1, 2], [2, 2], [2.1, 2.5], [3, 5], [5, 5], [5.1, 10], [9, 10],
    [11, 20], [23, 25], [26, 50], [173, 200], [201, 250], [999, 1000], [1000, 1000], [1001, 2000],
  ])("niceMax(%s) = %s", (v, expected) => {
    expect(niceMax(v)).toBe(expected);
  });
  it("selalu >= nilai masukan", () => {
    for (let v = 1; v < 5000; v += 37) expect(niceMax(v)).toBeGreaterThanOrEqual(v);
  });
});

describe("yTicks", () => {
  it("dimulai dari 0, berakhir di maks, naik, dan semuanya bilangan bulat", () => {
    for (const max of [1, 2, 3, 5, 10, 25, 173, 200, 1000]) {
      const t = yTicks(max);
      expect(t[0]).toBe(0);
      expect(t.at(-1)).toBe(max);
      expect(t.every((v) => Number.isInteger(v))).toBe(true);
      expect([...t].sort((a, b) => a - b)).toEqual(t);
      expect(new Set(t).size).toBe(t.length);
    }
  });
  it("maks 0 atau negatif tetap menghasilkan sumbu yang valid", () => {
    expect(yTicks(0)).toEqual([0, 1]);
  });
  it("jumlah tick wajar (tidak terlalu banyak)", () => {
    expect(yTicks(200).length).toBeLessThanOrEqual(6);
    expect(yTicks(1000).length).toBeLessThanOrEqual(6);
  });
});

describe("timeTicks", () => {
  it("tersebar rata dan memuat awal serta akhir", () => {
    const t = timeTicks(0, 100, 5);
    expect(t).toEqual([0, 25, 50, 75, 100]);
  });
  it("rentang kosong -> satu tick", () => {
    expect(timeTicks(5, 5)).toEqual([5]);
    expect(timeTicks(10, 5)).toEqual([10]);
  });
  it("jumlah minimal dua", () => {
    expect(timeTicks(0, 10, 1)).toEqual([0, 10]);
  });
});

describe("formatTick", () => {
  it("rentang panjang: hanya tanggal (WIB)", () => {
    const s = formatTick(Date.UTC(2026, 10, 7, 12), 30 * DAY);
    expect(s).toMatch(/07/);
    expect(s).not.toMatch(/\d{2}[.:]\d{2}/);
  });
  it("rentang pendek: tanggal dan jam (WIB, UTC+7)", () => {
    const s = formatTick(Date.UTC(2026, 10, 7, 12), 1 * DAY);
    expect(s).toMatch(/19[.:]00/); // 12:00 UTC = 19:00 WIB
  });
  it("hari mengikuti WIB, bukan UTC", () => {
    // 2026-11-07 20:00 UTC = 2026-11-08 03:00 WIB
    expect(formatTick(Date.UTC(2026, 10, 7, 20), 30 * DAY)).toMatch(/08/);
  });
});

describe("gapThresholdMs", () => {
  it("sepersepuluh rentang, dibatasi 2 sampai 7 hari", () => {
    expect(gapThresholdMs(0, 7 * DAY)).toBe(2 * DAY); // 16,8 jam -> dinaikkan ke batas bawah 2 hari
    expect(gapThresholdMs(0, 30 * DAY)).toBe(3 * DAY); // 3 hari tepat
    expect(gapThresholdMs(0, 60 * DAY)).toBe(6 * DAY);
    expect(gapThresholdMs(0, 90 * DAY)).toBe(7 * DAY); // 9 hari -> dibatasi 7 hari
    expect(gapThresholdMs(0, 365 * DAY)).toBe(7 * DAY);
    expect(gapThresholdMs(0, 1 * DAY)).toBe(2 * DAY);
  });
  it("REGRESI: sinkron harian (jarak 24 jam) tidak pernah dianggap celah pada rentang apa pun", () => {
    for (const days of [1, 7, 30, 90, 365]) expect(gapThresholdMs(0, days * DAY)).toBeGreaterThan(DAY);
  });
  it("selalu di antara 2 dan 7 hari", () => {
    for (const days of [0, 0.5, 3, 20, 45, 100, 1000]) {
      const g = gapThresholdMs(0, days * DAY);
      expect(g).toBeGreaterThanOrEqual(2 * DAY);
      expect(g).toBeLessThanOrEqual(7 * DAY);
    }
  });
});

describe("linePaths (celah tidak disiratkan sebagai data)", () => {
  const pts = [
    { x: 0, y: 10, t: 0 },
    { x: 10, y: 20, t: 1 * DAY },
    { x: 100, y: 30, t: 20 * DAY }, // celah 19 hari
    { x: 110, y: 40, t: 21 * DAY },
  ];
  it("segmen dengan jarak waktu > ambang masuk jalur putus-putus, sisanya jalur biasa", () => {
    const { solid, dashed } = linePaths(pts, 3 * DAY);
    expect(solid).toBe("M0 10L10 20M100 30L110 40");
    expect(dashed).toBe("M10 20L100 30");
  });
  it("tanpa celah: semuanya biasa", () => {
    const { solid, dashed } = linePaths(pts, 100 * DAY);
    expect(dashed).toBe("");
    expect(solid.split("M").length - 1).toBe(3);
  });
  it("satu titik atau kosong -> tidak ada garis", () => {
    expect(linePaths([], DAY)).toEqual({ solid: "", dashed: "" });
    expect(linePaths([pts[0]], DAY)).toEqual({ solid: "", dashed: "" });
  });
  it("jarak tepat sama dengan ambang bukan celah", () => {
    const { solid, dashed } = linePaths([{ x: 0, y: 0, t: 0 }, { x: 1, y: 1, t: 3 * DAY }], 3 * DAY);
    expect(dashed).toBe("");
    expect(solid).not.toBe("");
  });
  it("koordinat dibulatkan dua desimal", () => {
    const { solid } = linePaths([{ x: 0.123456, y: 1.987654, t: 0 }, { x: 5, y: 6, t: 1 }], DAY);
    expect(solid).toBe("M0.12 1.99L5 6");
  });
});

describe("nearestIndex", () => {
  it("memilih titik terdekat dengan x", () => {
    expect(nearestIndex([0, 10, 50], 4)).toBe(0);
    expect(nearestIndex([0, 10, 50], 6)).toBe(1);
    expect(nearestIndex([0, 10, 50], 100)).toBe(2);
    expect(nearestIndex([0, 10, 50], -100)).toBe(0);
  });
  it("tanpa titik -> -1; satu titik -> 0", () => {
    expect(nearestIndex([], 5)).toBe(-1);
    expect(nearestIndex([42], 5)).toBe(0);
  });
  it("jarak sama memilih yang pertama (deterministik)", () => {
    expect(nearestIndex([0, 10], 5)).toBe(0);
  });
});

describe("columnWidth", () => {
  it("dibatasi 24px dan tidak pernah memenuhi seluruh jatah", () => {
    expect(columnWidth(3, 600)).toBe(24);
    expect(columnWidth(1, 600)).toBe(24);
    expect(columnWidth(20, 600)).toBeLessThan(600 / 20);
  });
  it("minimal 2px walau titiknya sangat banyak; tanpa titik -> 0", () => {
    expect(columnWidth(1000, 600)).toBe(2);
    expect(columnWidth(0, 600)).toBe(0);
  });
});

describe("roundedTopRect", () => {
  it("bentuk tertutup dengan dasar rata dan sudut atas membulat", () => {
    const d = roundedTopRect(10, 20, 24, 50, 4);
    expect(d.startsWith("M10 70V24Q10 20 14 20")).toBe(true);
    expect(d.endsWith("V70Z")).toBe(true);
  });
  it("jari-jari dibatasi tinggi dan setengah lebar", () => {
    expect(roundedTopRect(0, 0, 24, 2, 4)).toContain("Q0 0 2 0"); // tinggi 2 -> r=2
    expect(roundedTopRect(0, 0, 4, 50, 4)).toContain("Q0 0 2 0"); // lebar 4 -> r=2
  });
  it("tinggi atau lebar 0 -> persegi biasa (tanpa NaN)", () => {
    const d = roundedTopRect(0, 0, 10, 0, 4);
    expect(d).not.toContain("NaN");
  });
});
