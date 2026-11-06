import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilterBar } from "@/components/tasks/filter-bar";
import { Pagination } from "@/components/tasks/pagination";
import { PriorityBadge, StatusBadge, TaskTable } from "@/components/tasks/task-table";
import { DEFAULT_PARAMS, type TaskListParams } from "@/lib/tasks/list-params";
import type { TaskListRow } from "@/lib/tasks/list";

const SRC = "11111111-1111-4111-8111-111111111111";
const P = (over: Partial<TaskListParams> = {}): TaskListParams => ({ ...DEFAULT_PARAMS, ...over });
const row = (over: Partial<TaskListRow> = {}): TaskListRow => ({
  sourceId: SRC, sourceName: "Echo App", tag: "master", taskId: "7", title: "Judul task",
  status: "in-progress", priority: "high", subtasksTotal: 5, subtasksDone: 3, ...over,
});
const table = (rows: TaskListRow[], p = P()) => renderToStaticMarkup(<TaskTable rows={rows} params={p} />);

describe("tabel task", () => {
  it("menampilkan aplikasi, tag, ID, judul, status, prioritas, dan subtask selesai dari total", () => {
    const html = table([row()]);
    expect(html).toContain("Echo App");
    expect(html).toContain(">master<");
    expect(html).toContain(">7<");
    expect(html).toContain("Judul task");
    expect(html).toContain("Dikerjakan");
    expect(html).toContain("Tinggi");
    expect(html).toContain("3/5");
  });

  it("judul task menautkan ke halaman detail dengan semua bagian ter-encode", () => {
    const html = table([row({ tag: "fitur x", taskId: "1/2" })]);
    expect(html).toContain(`href="/tasks/${SRC}/fitur%20x/1%2F2"`);
  });

  it("nama aplikasi menautkan ke filter aplikasi tersebut", () => {
    expect(table([row()])).toContain(`href="/tasks?source=${SRC}"`);
  });

  it("task tanpa subtask menampilkan '-' (bukan 0/0)", () => {
    const html = table([row({ subtasksTotal: 0, subtasksDone: 0 })]);
    expect(html).not.toContain("0/0");
  });

  it("prioritas kosong menampilkan '-'", () => {
    expect(renderToStaticMarkup(<PriorityBadge priority={null} />)).toContain("-");
  });

  it("prioritas tak dikenal ditampilkan apa adanya", () => {
    expect(renderToStaticMarkup(<PriorityBadge priority="urgent" />)).toContain("urgent");
  });

  it("status tak dikenal ditampilkan sebagai 'Lainnya (nilai asli)'", () => {
    expect(renderToStaticMarkup(<StatusBadge status="aneh" />)).toContain("Lainnya (aneh)");
  });

  it("tujuh status punya label sendiri", () => {
    const labels = ["pending", "in-progress", "review", "blocked", "done", "deferred", "cancelled"].map((s) =>
      renderToStaticMarkup(<StatusBadge status={s} />).replace(/<[^>]+>/g, ""),
    );
    expect(labels).toEqual(["Menunggu", "Dikerjakan", "Ditinjau", "Terhambat", "Selesai", "Ditunda", "Dibatalkan"]);
  });

  it("teks dari data di-escape (judul, nama aplikasi, tag, status)", () => {
    const html = table([row({ title: "<script>x</script>", sourceName: "<b>A</b>", tag: "<i>t</i>", status: "<img src=x>" })]);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>A</b>");
    expect(html).not.toContain("<i>t</i>");
    expect(html).not.toContain("<img");
  });

  it("satu baris per task, dengan kunci unik bila ID sama di tag atau aplikasi berbeda", () => {
    const html = table([row({ tag: "a" }), row({ tag: "b" }), row({ sourceId: "22222222-2222-4222-8222-222222222222", tag: "a" })]);
    expect((html.match(/<tbody[\s\S]*<\/tbody>/)![0].match(/<tr/g) ?? []).length).toBe(3);
  });
});

describe("urutan kolom", () => {
  it("semua tujuh kolom adalah tautan pengurut", () => {
    const html = table([row()]);
    // Urutan bawaan (Aplikasi, naik) sedang aktif, jadi tautannya membalik ke menurun.
    expect(html).toContain("sort=app&amp;dir=desc");
    for (const k of ["tag", "id", "title", "status", "priority", "subtasks"]) {
      expect(html).toContain(`sort=${k}&amp;dir=asc`);
    }
  });

  it("kolom aktif menandai arah dengan aria-sort dan tautannya membalik arah", () => {
    const html = table([row()], P({ sort: "title", dir: "asc" }));
    expect(html).toMatch(/aria-sort="ascending"[^>]*><a[^>]*href="\/tasks\?sort=title&amp;dir=desc"/);
    expect(html).toContain('aria-sort="none"');
    expect(html.match(/aria-sort="ascending"/g)).toHaveLength(1);
  });

  it("urutan menurun", () => {
    expect(table([row()], P({ sort: "id", dir: "desc" }))).toContain('aria-sort="descending"');
  });

  it("filter dipertahankan pada tautan pengurut", () => {
    expect(table([row()], P({ status: "done" }))).toContain("status=done&amp;sort=title&amp;dir=asc");
  });

  it("memiliki caption untuk pembaca layar dan scope pada judul kolom", () => {
    const html = table([row()]);
    expect(html).toContain("<caption");
    expect(html.match(/scope="col"/g)).toHaveLength(7);
  });
});

describe("paginasi", () => {
  const nav = (page: number, count: number, p = P()) =>
    renderToStaticMarkup(<Pagination params={p} page={page} pageCount={count} />);

  it("satu halaman: tidak menampilkan apa pun", () => {
    expect(nav(1, 1)).toBe("");
  });

  it("halaman pertama: Sebelumnya nonaktif, Berikutnya menaut ke halaman 2", () => {
    const html = nav(1, 5);
    expect(html).toMatch(/aria-disabled="true"[^>]*>‹ Sebelumnya/);
    expect(html).toContain('href="/tasks?page=2"');
    expect(html).toContain('rel="next"');
  });

  it("halaman terakhir: Berikutnya nonaktif", () => {
    const html = nav(5, 5);
    expect(html).toMatch(/aria-disabled="true"[^>]*>Berikutnya ›/);
    expect(html).toContain('rel="prev"');
  });

  it("halaman aktif ditandai aria-current dan bukan tautan", () => {
    const html = nav(3, 5);
    expect(html).toMatch(/<span aria-current="page"[^>]*>3<\/span>/);
    expect(html).not.toContain('href="/tasks?page=3"');
  });

  it("filter dan urutan dipertahankan di SEMUA tautan, termasuk Sebelumnya dan Berikutnya", () => {
    const html = nav(3, 5, P({ status: "done", sort: "id", dir: "desc" }));
    // Urutan atribut di HTML hasil render tidak dijamin: ambil tag <a> ber-rel lalu baca href-nya.
    const hrefOf = (rel: string) => {
      const tag = new RegExp(`<a [^>]*rel="${rel}"[^>]*>`).exec(html)?.[0];
      return tag ? /href="([^"]+)"/.exec(tag)?.[1] : undefined;
    };
    expect(hrefOf("next")).toBe("/tasks?status=done&amp;sort=id&amp;dir=desc&amp;page=4");
    expect(hrefOf("prev")).toBe("/tasks?status=done&amp;sort=id&amp;dir=desc&amp;page=2");
    // setiap tautan di navigasi membawa filter dan urutan yang sama
    for (const m of html.matchAll(/href="([^"]+)"/g)) {
      expect(m[1]).toContain("status=done&amp;sort=id&amp;dir=desc");
    }
  });

  it("halaman 1 tidak memuat page= sama sekali", () => {
    const html = nav(2, 5, P({ status: "done" }));
    expect(html).toContain('href="/tasks?status=done"');
  });
});

describe("filter", () => {
  const sources = [{ id: SRC, name: "Echo App" }, { id: "22222222-2222-4222-8222-222222222222", name: "Beta" }];
  const bar = (p = P(), tags = ["master", "fitur"]) => renderToStaticMarkup(<FilterBar params={p} sources={sources} tags={tags} />);

  it("memuat pilihan aplikasi, tag, status, dan prioritas", () => {
    const html = bar();
    expect(html).toContain('name="source"');
    expect(html).toContain("Echo App");
    expect(html).toContain('name="tag"');
    expect(html).toContain(">fitur<");
    expect(html).toContain('name="status"');
    for (const l of ["Menunggu", "Dikerjakan", "Ditinjau", "Terhambat", "Selesai", "Ditunda", "Dibatalkan", "Lainnya"]) expect(html).toContain(`>${l}<`);
    expect(html).toContain('name="priority"');
    for (const l of ["Tinggi", "Sedang", "Rendah"]) expect(html).toContain(`>${l}<`);
  });

  it("bekerja tanpa JavaScript: <form method=get> dengan tombol Terapkan", () => {
    const html = bar();
    expect(html).toContain('method="get"');
    expect(html).toContain('action="/tasks"');
    expect(html).toContain(">Terapkan<");
  });

  it("pilihan saat ini terpilih", () => {
    const html = bar(P({ source: SRC, status: "blocked", priority: "low", tag: "fitur" }));
    expect(html).toMatch(new RegExp(`<option value="${SRC}" selected`));
    expect(html).toMatch(/<option value="blocked" selected/);
    expect(html).toMatch(/<option value="low" selected/);
    expect(html).toMatch(/<option value="fitur" selected/);
  });

  it("tag dari URL yang tidak ada di daftar tetap tampil (tidak diam-diam hilang)", () => {
    expect(bar(P({ tag: "lama" }), ["master"])).toMatch(/<option value="lama" selected/);
  });

  it("urutan non-bawaan dipertahankan lewat input tersembunyi; urutan bawaan tidak", () => {
    expect(bar(P({ sort: "title", dir: "desc" }))).toContain('name="sort" value="title"');
    expect(bar(P({ sort: "title", dir: "desc" }))).toContain('name="dir" value="desc"');
    expect(bar()).not.toContain('type="hidden"');
  });

  it("halaman tidak ikut dikirim (filter baru selalu mulai dari halaman 1)", () => {
    expect(bar(P({ page: 4 }))).not.toContain('name="page"');
  });

  it("'Hapus semua filter' hanya muncul bila ada filter aktif", () => {
    expect(bar()).not.toContain("Hapus semua filter");
    expect(bar(P({ status: "done" }))).toContain("Hapus semua filter");
    expect(bar(P({ sort: "id", page: 3 }))).not.toContain("Hapus semua filter");
  });

  it("nama aplikasi dan tag di-escape", () => {
    const html = renderToStaticMarkup(<FilterBar params={P()} sources={[{ id: SRC, name: "<script>x</script>" }]} tags={["<b>t</b>"]} />);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>t</b>");
  });
});
