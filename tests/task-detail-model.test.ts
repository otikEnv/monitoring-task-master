import { describe, expect, it } from "vitest";
import {
  LOOKUP_ID, buildDependencyViews, parseDependencyIds, parseDetailKey, parseSubtasks, subtaskProgress,
} from "@/lib/tasks/detail-model";
import { taskHref } from "@/lib/tasks/list-params";

describe("parseDependencyIds", () => {
  it("string dan angka menjadi string, urutan dipertahankan", () => {
    expect(parseDependencyIds(["159", 160, "161"])).toEqual(["159", "160", "161"]);
  });
  it("duplikat dan nilai tidak valid dibuang", () => {
    expect(parseDependencyIds(["1", "1", 1, null, undefined, {}, [], "", "  ", true])).toEqual(["1"]);
  });
  it("memangkas spasi", () => {
    expect(parseDependencyIds([" 5 "])).toEqual(["5"]);
  });
  it("bukan array -> daftar kosong", () => {
    for (const v of [null, undefined, "5", 5, {}, true]) expect(parseDependencyIds(v)).toEqual([]);
  });
  it("angka tak hingga atau NaN dibuang", () => {
    expect(parseDependencyIds([Infinity, NaN, 3])).toEqual(["3"]);
  });
});

describe("parseSubtasks", () => {
  it("membaca subtask normal (bentuk yang ditulis normalizer)", () => {
    const s = parseSubtasks([{ id: "1", title: "A", description: "d", status: "done", details: "x", dependencies: ["2"] }]);
    expect(s).toEqual([{ id: "1", title: "A", description: "d", status: "done", details: "x", dependencies: ["2"] }]);
  });
  it("ID angka dijadikan string; ID hilang diganti nomor urut", () => {
    expect(parseSubtasks([{ id: 3, title: "a" }, { title: "b" }]).map((s) => s.id)).toEqual(["3", "2"]);
  });
  it("field hilang diberi nilai aman", () => {
    expect(parseSubtasks([{}])[0]).toEqual({
      id: "1", title: "(tanpa judul)", description: null, status: "pending", details: null, dependencies: [],
    });
  });
  it("status dipangkas dan dihuruf-kecilkan", () => {
    expect(parseSubtasks([{ status: " DONE " }])[0].status).toBe("done");
  });
  it("teks kosong menjadi null", () => {
    const s = parseSubtasks([{ title: "a", description: "  ", details: "" }])[0];
    expect(s.description).toBeNull();
    expect(s.details).toBeNull();
  });
  it("elemen bukan objek dilewati; bukan array -> kosong", () => {
    expect(parseSubtasks(["x", 1, null, [], { title: "ok" }])).toHaveLength(1);
    for (const v of [null, undefined, "x", 5, {}]) expect(parseSubtasks(v)).toEqual([]);
  });
});

describe("buildDependencyViews", () => {
  const found = [
    { task_id: "160", title: "Enam puluh", status: "done" },
    { task_id: "159", title: "Seratus lima puluh sembilan", status: "pending" },
  ];
  it("urutan mengikuti daftar dependensi, bukan urutan hasil query", () => {
    expect(buildDependencyViews(["159", "160"], found).map((d) => d.id)).toEqual(["159", "160"]);
  });
  it("yang ditemukan membawa judul dan status", () => {
    expect(buildDependencyViews(["160"], found)).toEqual([{ id: "160", found: true, title: "Enam puluh", status: "done" }]);
  });
  it("yang tidak ditemukan tetap ada dengan found=false (ditampilkan sebagai teks biasa)", () => {
    expect(buildDependencyViews(["999"], found)).toEqual([{ id: "999", found: false }]);
  });
  it("campuran ditemukan dan tidak", () => {
    const v = buildDependencyViews(["159", "999", "160"], found);
    expect(v.map((d) => d.found)).toEqual([true, false, true]);
  });
  it("tanpa dependensi", () => {
    expect(buildDependencyViews([], found)).toEqual([]);
  });
});

describe("parseDetailKey (segmen URL halaman detail)", () => {
  const UUID = "11111111-1111-4111-8111-111111111111";
  const raw = (sourceId: string, tag: string, taskId: string) => ({ sourceId, tag, taskId });

  it("segmen polos dibaca apa adanya", () => {
    expect(parseDetailKey(raw(UUID, "master", "165"))).toEqual({ sourceId: UUID, tag: "master", taskId: "165" });
  });

  it("REGRESI: segmen ter-encode di-decode (halaman Next.js menerimanya masih ter-encode)", () => {
    // Bug asli: tag/ID dengan spasi atau karakter khusus dicari ke database dalam bentuk "a%20b" dan tidak ditemukan.
    expect(parseDetailKey(raw(UUID, "fitur%20x", "1%2F2"))).toEqual({ sourceId: UUID, tag: "fitur x", taskId: "1/2" });
    expect(parseDetailKey(raw(UUID, "%C3%A9", "a%26b%3Dc"))).toEqual({ sourceId: UUID, tag: "é", taskId: "a&b=c" });
  });

  it("tautan yang dibuat taskHref selalu bisa dibaca kembali menjadi kunci yang sama", () => {
    for (const v of ["plain", "a b", "a&b", "a#b", "a?b", "a%b", "a%41", "a/b", "<b>", "é", "a+b", "🚀"]) {
      const [, , s, t, i] = taskHref(UUID, v, v).split("/");
      expect(parseDetailKey(raw(s, t, i))).toEqual({ sourceId: UUID, tag: v, taskId: v });
    }
  });

  it("'%' asli didecode tepat satu kali (tidak jadi karakter lain)", () => {
    expect(parseDetailKey(raw(UUID, "a%2541", "1"))?.tag).toBe("a%41");
  });

  it("UUID huruf besar dinormalkan; UUID tidak valid ditolak", () => {
    // UUID contoh di atas hanya berisi angka; pakai yang memuat huruf agar normalisasi benar-benar teruji.
    const HEX = "abcdef01-2345-4678-89ab-cdef01234567";
    expect(HEX.toUpperCase()).not.toBe(HEX);
    expect(parseDetailKey(raw(HEX.toUpperCase(), "m", "1"))?.sourceId).toBe(HEX);
    for (const bad of ["xyz", "", "1111", `${UUID}0`, "%00", "../etc"]) expect(parseDetailKey(raw(bad, "m", "1"))).toBeNull();
  });

  it("segmen kosong atau terlalu panjang ditolak", () => {
    expect(parseDetailKey(raw(UUID, "", "1"))).toBeNull();
    expect(parseDetailKey(raw(UUID, "m", ""))).toBeNull();
    expect(parseDetailKey(raw(UUID, "x".repeat(201), "1"))).toBeNull();
    expect(parseDetailKey(raw(UUID, "m", "9".repeat(201)))).toBeNull();
    expect(parseDetailKey(raw(UUID, "x".repeat(200), "9".repeat(200)))).not.toBeNull();
  });

  it("urutan persen rusak ditolak (bukan URL valid)", () => {
    expect(parseDetailKey(raw(UUID, "%E0%A4%A", "1"))).toBeNull();
    expect(parseDetailKey(raw(UUID, "m", "%"))).toBeNull();
    expect(parseDetailKey(raw("%zz", "m", "1"))).toBeNull();
  });
});

describe("LOOKUP_ID (ID yang aman dicari di database)", () => {
  it.each(["1", "159", "abc", "a.b-c_d", "x".repeat(64)])("menerima %s", (id) => {
    expect(LOOKUP_ID.test(id)).toBe(true);
  });
  it.each(["", "a,b", 'a"b', "a(b)", "a b", "a/b", "x".repeat(65), "a\nb", "1);drop"])("menolak %j", (id) => {
    expect(LOOKUP_ID.test(id)).toBe(false);
  });
});

describe("subtaskProgress", () => {
  it("menghitung subtasks done dari total", () => {
    const subs = parseSubtasks([{ status: "done" }, { status: "pending" }, { status: "done" }, { status: "blocked" }]);
    expect(subtaskProgress(subs)).toEqual({ done: 2, total: 4 });
  });
  it("kosong", () => {
    expect(subtaskProgress([])).toEqual({ done: 0, total: 0 });
  });
});
