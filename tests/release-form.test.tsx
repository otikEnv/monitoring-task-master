import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/release/actions", () => ({ saveRelease: vi.fn(), previewRange: vi.fn() }));

import { ReleaseForm, type FormInitial, type SourceChoice } from "@/app/release/release-form";

const SOURCES: SourceChoice[] = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Echo App", tags: ["master", "mobile"] },
  { id: "22222222-2222-4222-8222-222222222222", name: "Beta", tags: ["master"] },
];
const blank: FormInitial = { sourceId: "", tag: "", name: "", rangeStart: "", rangeEnd: "", startDate: "", targetDate: "" };
const html = (initial: FormInitial, sources = SOURCES) => renderToStaticMarkup(<ReleaseForm initial={initial} sources={sources} />);

describe("form release (tambah)", () => {
  it("memuat semua isian dengan label", () => {
    const out = html(blank);
    for (const label of ["Aplikasi", "Tag", "Nama/versi release", "Task awal", "Task akhir", "Tanggal mulai (opsional)", "Tanggal target"]) {
      expect(out).toContain(label);
    }
    for (const name of ["sourceId", "tag", "name", "rangeStart", "rangeEnd", "startDate", "targetDate"]) {
      expect(out).toContain(`name="${name}"`);
    }
    expect(out).toContain("Simpan release");
    expect(out).not.toContain('name="id"');
  });

  it("menawarkan semua aplikasi dan batal kembali ke daftar", () => {
    const out = html(blank);
    expect(out).toContain("Echo App");
    expect(out).toContain("Beta");
    expect(out).toContain("Pilih aplikasi dulu");
    expect(out).toContain('href="/release"');
  });

  it("petunjuk tanggal mulai bawaan dan batas rentang", () => {
    const out = html(blank);
    expect(out).toContain("memakai tanggal release dibuat");
    expect(out).toContain("Batas awal dan akhir ikut dihitung");
  });

  it("aplikasi terpilih menampilkan tag-nya saja", () => {
    const out = html({ ...blank, sourceId: SOURCES[0].id });
    expect(out).toContain('value="master"');
    expect(out).toContain('value="mobile"');
    expect(out).toContain("Pilih tag");
  });

  it("aplikasi tanpa tag memberi petunjuk menyegarkan data", () => {
    const out = html({ ...blank, sourceId: "33333333-3333-4333-8333-333333333333" }, [
      { id: "33333333-3333-4333-8333-333333333333", name: "Kosong", tags: [] },
    ]);
    expect(out).toContain("belum punya task");
  });
});

describe("form release (ubah)", () => {
  const initial: FormInitial = {
    id: "44444444-4444-4444-8444-444444444444", sourceId: SOURCES[0].id, tag: "master", name: "v2.1",
    rangeStart: "100", rangeEnd: "200", startDate: "2026-11-01", targetDate: "2026-11-20",
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
    expect(out).toContain("Simpan perubahan");
    expect(out).toContain('href="/release/44444444-4444-4444-8444-444444444444"');
  });

  it("tag lama yang sudah tidak ada pada data tetap tampil sebagai pilihan", () => {
    const out = html({ ...initial, tag: "lama" });
    expect(out).toContain('value="lama"');
  });
});
