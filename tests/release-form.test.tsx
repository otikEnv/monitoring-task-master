import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/release/actions", () => ({ saveRelease: vi.fn(), previewRange: vi.fn() }));

import { ReleaseForm, type FormInitial, type SourceChoice } from "@/app/release/release-form";

const SOURCES: SourceChoice[] = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Echo App", tags: ["master", "mobile"] },
  { id: "22222222-2222-4222-8222-222222222222", name: "Beta", tags: ["master"] },
];
const blankRow = { sourceId: "", tag: "", rangeStart: "", rangeEnd: "" };
const blank: FormInitial = { name: "", startDate: "", targetDate: "", components: [blankRow] };
const html = (initial: FormInitial, sources = SOURCES) => renderToStaticMarkup(<ReleaseForm initial={initial} sources={sources} />);

describe("form release (tambah)", () => {
  it("memuat isian release dan satu komponen dengan label", () => {
    const out = html(blank);
    for (const label of ["Release name/version", "Start date (optional)", "Target date", "Components", "Component 1", "Application", "Tag", "Start task", "End task"]) {
      expect(out).toContain(label);
    }
    for (const name of ["name", "startDate", "targetDate"]) expect(out).toContain(`name="${name}"`);
    for (const name of ["sourceId", "tag", "rangeStart", "rangeEnd"]) expect(out).toContain(`name="components[0].${name}"`);
    expect(out).toContain("Save release");
    expect(out).toContain("Add component");
    expect(out).not.toContain('name="id"');
  });

  it("satu komponen saja: tidak ada tombol hapus", () => {
    expect(html(blank)).not.toContain("Remove");
  });

  it("daftar komponen kosong diperlakukan sebagai satu baris kosong", () => {
    const out = html({ ...blank, components: [] });
    expect(out).toContain('name="components[0].sourceId"');
    expect(out).not.toContain("Component 2");
  });

  it("menawarkan semua aplikasi dan batal kembali ke daftar", () => {
    const out = html(blank);
    expect(out).toContain("Echo App");
    expect(out).toContain("Beta");
    expect(out).toContain("Select an application first");
    expect(out).toContain('href="/release"');
  });

  it("petunjuk tanggal mulai bawaan dan batas rentang", () => {
    const out = html(blank);
    expect(out).toContain("the date the release is created is used");
    expect(out).toContain("The start and end tasks are included");
  });

  it("aplikasi terpilih menampilkan tag-nya saja", () => {
    const out = html({ ...blank, components: [{ ...blankRow, sourceId: SOURCES[0].id }] });
    expect(out).toContain('value="master"');
    expect(out).toContain('value="mobile"');
    expect(out).toContain("Select a tag");
  });

  it("aplikasi tanpa tag memberi petunjuk menyegarkan data", () => {
    const out = html({ ...blank, components: [{ ...blankRow, sourceId: "33333333-3333-4333-8333-333333333333" }] }, [
      { id: "33333333-3333-4333-8333-333333333333", name: "Kosong", tags: [] },
    ]);
    expect(out).toContain("has no tasks yet");
  });
});

/** Tag pembuka tombol "Add component". Atribut disabled="" dicari, bukan kelas disabled:… yang ada pada semua tombol. */
const addButton = (out: string) => {
  const piece = out.split("<button").find((b) => b.includes("Add component"));
  if (!piece) throw new Error("tombol Add component tidak ada");
  return piece.slice(0, piece.indexOf(">"));
};

describe("form release (dua komponen)", () => {
  const two: FormInitial = {
    name: "2.1", startDate: "", targetDate: "2026-11-20",
    components: [
      { sourceId: SOURCES[0].id, tag: "master", rangeStart: "100", rangeEnd: "150" },
      { sourceId: SOURCES[1].id, tag: "master", rangeStart: "20", rangeEnd: "45" },
    ],
  };

  it("menampilkan dua baris dengan nomor baris pada nama field dan tombol hapus", () => {
    const out = html(two);
    expect(out).toContain("Component 1");
    expect(out).toContain("Component 2");
    expect(out).not.toContain("Component 3");
    for (const n of [0, 1]) {
      for (const name of ["sourceId", "tag", "rangeStart", "rangeEnd"]) expect(out).toContain(`name="components[${n}].${name}"`);
    }
    expect(out).toContain('aria-label="Remove component 1"');
    expect(out).toContain('aria-label="Remove component 2"');
  });

  it("mengisi nilai tiap baris", () => {
    const out = html(two);
    for (const v of ["100", "150", "20", "45"]) expect(out).toContain(`value="${v}"`);
  });

  it("sampai 10 komponen: tombol tambah nonaktif dan ada penjelasan batas", () => {
    const ten = { ...two, components: Array.from({ length: 10 }, (_, i) => ({ ...blankRow, tag: `t${i}` })) };
    const out = html(ten);
    expect(out).toContain("Component 10");
    expect(addButton(out)).toContain(' disabled=""');
    expect(out).toContain("at most 10 components");
  });

  it("kurang dari 10: tombol tambah aktif", () => {
    expect(addButton(html(two))).not.toContain(' disabled=""');
  });
});

describe("form release (ubah)", () => {
  const initial: FormInitial = {
    id: "44444444-4444-4444-8444-444444444444", name: "v2.1", startDate: "2026-11-01", targetDate: "2026-11-20",
    components: [{ sourceId: SOURCES[0].id, tag: "master", rangeStart: "100", rangeEnd: "200" }],
  };

  it("mengisi nilai awal, menyertakan id tersembunyi, dan batal kembali ke detail", () => {
    const out = html(initial);
    expect(out).toContain('name="id"');
    expect(out).toContain('value="44444444-4444-4444-8444-444444444444"');
    expect(out).toContain('value="v2.1"');
    expect(out).toContain('value="100"');
    expect(out).toContain('value="200"');
    expect(out).toContain('value="2026-11-01"');
    expect(out).toContain('value="2026-11-20"');
    expect(out).toContain("Save changes");
    expect(out).toContain('href="/release/44444444-4444-4444-8444-444444444444"');
  });

  it("tag lama yang sudah tidak ada pada data tetap tampil sebagai pilihan", () => {
    const out = html({ ...initial, components: [{ ...initial.components[0], tag: "lama" }] });
    expect(out).toContain('value="lama"');
  });
});
