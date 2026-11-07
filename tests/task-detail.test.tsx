import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TaskDetailView } from "@/components/tasks/task-detail";
import type { TaskDetail } from "@/lib/tasks/detail-model";

const SRC = "11111111-1111-4111-8111-111111111111";
const detail = (over: Partial<TaskDetail> = {}): TaskDetail => ({
  sourceId: SRC, sourceName: "Echo App", tag: "master", taskId: "165",
  title: "Verifikasi aktif di staging", description: "Description **tebal**",
  status: "blocked", priority: "high",
  details: "**Scope**: contoh\n\n- butir satu\n- butir dua",
  testStrategy: "Jalankan uji penetrasi.",
  dependencies: [
    { id: "159", found: true, title: "Perbaikan A", status: "done" },
    { id: "160", found: true, title: "Perbaikan B", status: "pending" },
    { id: "999", found: false },
  ],
  subtasks: [
    { id: "1", title: "Siapkan alat", description: "Uraian subtask", status: "done", details: "Detail **subtask**", dependencies: [] },
    { id: "2", title: "Jalankan", description: null, status: "pending", details: null, dependencies: ["1"] },
    { id: "3", title: "Laporan", description: null, status: "blocked", details: null, dependencies: [] },
  ],
  updatedAt: "2026-11-06T10:00:00Z",
  ...over,
});
const render = (d: TaskDetail = detail()) => renderToStaticMarkup(<TaskDetailView detail={d} />);

describe("kepala halaman", () => {
  it("menampilkan judul dengan ID, status, prioritas, dan ringkasan subtask", () => {
    const html = render();
    expect(html).toMatch(/<h1[^>]*>[\s\S]*#165[\s\S]*Verifikasi aktif di staging/);
    expect(html).toContain("Blocked");
    expect(html).toContain("High");
    expect(html).toContain("1 of 3 subtasks done");
  });

  it("menampilkan aplikasi, tag, dan waktu data diperbarui", () => {
    const html = render();
    expect(html).toContain("Application: ");
    expect(html).toContain("Echo App");
    expect(html).toContain("Tag: ");
    expect(html).toContain("Data updated: ");
  });

  it("breadcrumb menaut ke daftar, aplikasi, dan tag", () => {
    const html = render();
    expect(html).toContain('href="/tasks"');
    expect(html).toContain(`href="/tasks?source=${SRC}"`);
    expect(html).toContain(`href="/tasks?source=${SRC}&amp;tag=master"`);
    expect(html).toContain('aria-current="page"');
  });

  it("judul task hanya satu <h1>", () => {
    expect((render().match(/<h1/g) ?? []).length).toBe(1);
  });
});

describe("dependensi", () => {
  it("yang ditemukan menjadi tautan ke task tersebut di aplikasi dan tag yang sama, dengan statusnya", () => {
    const html = render();
    expect(html).toContain(`href="/tasks/${SRC}/master/159"`);
    expect(html).toContain("#159 Perbaikan A");
    expect(html).toContain(`href="/tasks/${SRC}/master/160"`);
    expect(html).toContain("Done");
    expect(html).toContain("Pending");
  });

  it("status tiap dependensi tampil tepat di sebelah tautannya (bukan sekadar muncul di tempat lain)", () => {
    const html = render();
    expect(html).toMatch(/#159 Perbaikan A<\/a>\s*<span[^>]*>Done<\/span>/);
    expect(html).toMatch(/#160 Perbaikan B<\/a>\s*<span[^>]*>Pending<\/span>/);
  });

  it("yang tidak ditemukan tampil sebagai teks biasa, bukan tautan", () => {
    const html = render();
    expect(html).toContain("#999");
    expect(html).toContain("not found in this tag");
    expect(html).not.toContain('/master/999"');
  });

  it("tautan dependensi di-encode untuk tag dan ID yang mengandung karakter khusus", () => {
    const html = render(detail({ tag: "fitur x", dependencies: [{ id: "1/2", found: true, title: "T", status: "done" }] }));
    expect(html).toContain(`href="/tasks/${SRC}/fitur%20x/1%2F2"`);
  });

  it("tanpa dependensi: keterangan, bukan daftar kosong", () => {
    const html = render(detail({ dependencies: [] }));
    expect(html).toContain("Does not depend on other tasks.");
  });
});

describe("teks panjang", () => {
  it("detail implementasi dan strategi pengujian dirender sebagai markdown", () => {
    const html = render();
    expect(html).toContain("<strong>Scope</strong>");
    expect(html).toMatch(/<li[^>]*>butir satu<\/li>/);
    expect(html).toContain("Jalankan uji penetrasi.");
    expect(html).toContain("Description <strong>tebal</strong>");
  });

  it("strategi pengujian kosong -> keterangan (57 of 173 tasks asli begini)", () => {
    expect(render(detail({ testStrategy: null }))).toContain("No test strategy yet.");
  });

  it("detail kosong -> keterangan", () => {
    expect(render(detail({ details: null }))).toContain("No implementation details yet.");
  });

  it("deskripsi kosong -> bagian Description tidak ditampilkan", () => {
    expect(render(detail({ description: null }))).not.toContain(">Description<");
  });

  it("HTML berbahaya di seluruh field teks tidak dieksekusi", () => {
    const evil = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const html = render(detail({
      title: evil, description: evil, details: evil, testStrategy: evil, sourceName: evil, tag: evil,
      subtasks: [{ id: "1", title: evil, description: evil, status: "done", details: evil, dependencies: [evil] }],
      dependencies: [{ id: "1", found: true, title: evil, status: "done" }, { id: evil, found: false }],
    }));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    // Atribut pada elemen nyata dilarang; teks ter-escape (&lt;img ... onerror=...) aman.
    expect(html).not.toMatch(/<[a-z][^>]*\sonerror=/i);
  });
});

describe("subtask", () => {
  it("menampilkan nomor, judul, dan status tiap subtask", () => {
    const html = render();
    expect(html).toContain("165.1");
    expect(html).toContain("Siapkan alat");
    expect(html).toContain("165.2");
    expect(html).toContain("165.3");
    expect(html).toContain("1 of 3 done");
  });

  it("dependensi subtask ditampilkan sebagai teks", () => {
    expect(render()).toContain("Depends on: 1");
  });

  it("detail subtask dilipat (details/summary), tanpa JavaScript", () => {
    const html = render();
    expect(html).toContain("<details");
    expect(html).toContain("Show details");
    expect(html).toContain("Detail <strong>subtask</strong>");
  });

  it("subtask tanpa detail tidak memiliki lipatan", () => {
    const html = render(detail({ subtasks: [{ id: "1", title: "a", description: null, status: "done", details: null, dependencies: [] }] }));
    expect(html).not.toContain("<details");
  });

  it("tanpa subtask: keterangan dan tidak ada ringkasan progres", () => {
    const html = render(detail({ subtasks: [] }));
    expect(html).toContain("No subtasks.");
    expect(html).not.toContain("subtasks done");
  });

  it("subtask berurutan sebagai daftar bernomor", () => {
    expect(render()).toContain("<ol");
  });
});

describe("hanya-baca dan aksesibilitas", () => {
  it("tidak ada formulir, input, atau tombol yang mengubah task", () => {
    const html = render();
    expect(html).not.toMatch(/<form|<input|<button|<textarea|<select/);
  });

  it("setiap bagian memiliki judul dan aria-labelledby", () => {
    const html = render();
    for (const id of ["sec-dependensi", "sec-detail", "sec-uji", "sec-subtask"]) {
      expect(html).toContain(`aria-labelledby="${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("tautan kembali ke daftar membawa aplikasi dan tag", () => {
    expect(render()).toContain(`href="/tasks?source=${SRC}&amp;tag=master"`);
    expect(render()).toContain("← Back to task list");
  });
});
