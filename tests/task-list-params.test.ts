import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMS, hasActiveFilters, hrefFor, nextSort, pageWindow, parseTaskListParams,
  taskHref, toQueryString, type TaskListParams,
} from "@/lib/tasks/list-params";

const ID = "11111111-1111-4111-8111-111111111111";
const P = (over: Partial<TaskListParams> = {}): TaskListParams => ({ ...DEFAULT_PARAMS, ...over });

describe("parseTaskListParams", () => {
  it("tanpa parameter -> nilai bawaan", () => {
    expect(parseTaskListParams({})).toEqual(DEFAULT_PARAMS);
  });

  it("membaca semua parameter yang valid", () => {
    expect(
      parseTaskListParams({ source: ID, tag: "master", status: "in-progress", priority: "high", sort: "status", dir: "desc", page: "3" }),
    ).toEqual({ source: ID, tag: "master", status: "in-progress", priority: "high", sort: "status", dir: "desc", page: 3 });
  });

  it("nilai tidak valid diabaikan, tidak melempar galat", () => {
    expect(
      parseTaskListParams({
        source: "bukan-uuid", status: "aneh", priority: "urgent", sort: "'; drop table tasks;--", dir: "sideways", page: "-5",
      }),
    ).toEqual(DEFAULT_PARAMS);
  });

  it("status 'other' dan semua tujuh status mentah diterima", () => {
    for (const s of ["pending", "in-progress", "review", "blocked", "done", "deferred", "cancelled", "other"]) {
      expect(parseTaskListParams({ status: s }).status).toBe(s);
    }
    expect(parseTaskListParams({ status: "in_progress" }).status).toBeNull(); // kunci internal bukan nilai URL
  });

  it("semua kolom urutan dikenali", () => {
    for (const k of ["app", "tag", "id", "title", "status", "priority", "subtasks"]) {
      expect(parseTaskListParams({ sort: k }).sort).toBe(k);
    }
  });

  it("halaman: harus bilangan bulat positif dan wajar", () => {
    for (const bad of ["0", "-1", "1.5", "abc", "", "100001", "NaN", "Infinity"]) {
      expect(parseTaskListParams({ page: bad }).page).toBe(1);
    }
    expect(parseTaskListParams({ page: "100000" }).page).toBe(100000);
  });

  it("tag: dipangkas, kosong atau terlalu panjang diabaikan", () => {
    expect(parseTaskListParams({ tag: "  fitur-x  " }).tag).toBe("fitur-x");
    expect(parseTaskListParams({ tag: "   " }).tag).toBeNull();
    expect(parseTaskListParams({ tag: "x".repeat(101) }).tag).toBeNull();
    expect(parseTaskListParams({ tag: "x".repeat(100) }).tag).toBe("x".repeat(100));
  });

  it("parameter ganda (array) memakai nilai pertama", () => {
    expect(parseTaskListParams({ status: ["done", "pending"], page: ["2", "9"] })).toMatchObject({ status: "done", page: 2 });
  });

  it("UUID huruf besar dinormalkan menjadi huruf kecil", () => {
    expect(parseTaskListParams({ source: ID.toUpperCase() }).source).toBe(ID);
  });

  it("tag boleh berisi karakter khusus (dipakai apa adanya karena query memakai eq)", () => {
    expect(parseTaskListParams({ tag: "a&b=c/d e" }).tag).toBe("a&b=c/d e");
  });
});

describe("toQueryString dan hrefFor", () => {
  it("nilai bawaan tidak ditulis (URL pendek)", () => {
    expect(toQueryString(DEFAULT_PARAMS)).toBe("");
    expect(hrefFor(DEFAULT_PARAMS)).toBe("/tasks");
  });

  it("round trip: parse(toQueryString(p)) == p", () => {
    const p = P({ source: ID, tag: "a&b c", status: "blocked", priority: "low", sort: "subtasks", dir: "desc", page: 7 });
    const qs = Object.fromEntries(new URLSearchParams(toQueryString(p)));
    expect(parseTaskListParams(qs)).toEqual(p);
  });

  it("urutan bawaan tidak ditulis, tetapi arah saja yang berbeda ditulis lengkap", () => {
    expect(toQueryString(P({ sort: "app", dir: "asc" }))).toBe("");
    expect(toQueryString(P({ sort: "app", dir: "desc" }))).toBe("sort=app&dir=desc");
    expect(toQueryString(P({ sort: "id", dir: "asc" }))).toBe("sort=id&dir=asc");
  });

  it("mengganti filter atau urutan kembali ke halaman 1", () => {
    const p = P({ page: 5, status: "done" });
    expect(hrefFor(p, { status: "pending" })).toBe("/tasks?status=pending");
    expect(hrefFor(p, { sort: "title", dir: "asc" })).toBe("/tasks?status=done&sort=title&dir=asc");
    expect(hrefFor(p, { source: ID })).toContain("source=");
    expect(hrefFor(p, { source: ID })).not.toContain("page=");
  });

  it("mengganti halaman mempertahankan filter dan urutan", () => {
    const p = P({ status: "done", sort: "id", dir: "desc" });
    expect(hrefFor(p, { page: 4 })).toBe("/tasks?status=done&sort=id&dir=desc&page=4");
    expect(hrefFor(p, { page: 1 })).toBe("/tasks?status=done&sort=id&dir=desc");
  });

  it("menghapus filter dengan null", () => {
    expect(hrefFor(P({ status: "done", tag: "x" }), { status: null })).toBe("/tasks?tag=x");
  });

  it("nilai di-encode dengan benar", () => {
    expect(hrefFor(P(), { tag: "a&b c" })).toBe("/tasks?tag=a%26b+c");
  });
});

describe("nextSort", () => {
  it("kolom yang sama membalik arah", () => {
    expect(nextSort(P({ sort: "title", dir: "asc" }), "title")).toEqual({ sort: "title", dir: "desc" });
    expect(nextSort(P({ sort: "title", dir: "desc" }), "title")).toEqual({ sort: "title", dir: "asc" });
  });
  it("kolom baru mulai dari naik", () => {
    expect(nextSort(P({ sort: "title", dir: "desc" }), "id")).toEqual({ sort: "id", dir: "asc" });
  });
});

describe("hasActiveFilters", () => {
  it("hanya filter yang dihitung, bukan urutan atau halaman", () => {
    expect(hasActiveFilters(P({ sort: "id", dir: "desc", page: 4 }))).toBe(false);
    expect(hasActiveFilters(P({ tag: "x" }))).toBe(true);
    expect(hasActiveFilters(P({ source: ID }))).toBe(true);
    expect(hasActiveFilters(P({ status: "done" }))).toBe(true);
    expect(hasActiveFilters(P({ priority: "high" }))).toBe(true);
  });
});

describe("taskHref", () => {
  it("meng-encode tiap bagian (tag dengan spasi, ID dengan garis miring)", () => {
    expect(taskHref(ID, "fitur x", "1/2")).toBe(`/tasks/${ID}/fitur%20x/1%2F2`);
  });
});

describe("pageWindow", () => {
  it("satu halaman", () => expect(pageWindow(1, 1)).toEqual([1]));
  it("sedikit halaman: semuanya", () => expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]));
  it("banyak halaman: jendela di sekitar halaman aktif dengan celah", () => {
    expect(pageWindow(10, 20)).toEqual([1, "gap", 8, 9, 10, 11, 12, "gap", 20]);
  });
  it("di awal dan di akhir", () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, "gap", 20]);
    expect(pageWindow(20, 20)).toEqual([1, "gap", 18, 19, 20]);
  });
  it("tanpa celah bila halaman berdekatan", () => {
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it("selalu memuat halaman aktif, pertama, dan terakhir", () => {
    for (const [p, n] of [[5, 100], [50, 100], [99, 100]] as const) {
      const w = pageWindow(p, n);
      expect(w).toContain(p);
      expect(w).toContain(1);
      expect(w).toContain(n);
    }
  });
});
