import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/markdown";

const render = (md: string) => renderToStaticMarkup(<Markdown>{md}</Markdown>);

describe("keamanan: konten dari repo tidak tepercaya", () => {
  it("HTML mentah tidak dieksekusi: tampil sebagai teks", () => {
    const html = render('<script>alert(1)</script> halo');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it.each([
    ['<img src=x onerror=alert(1)>', "<img"],
    ['<iframe src="https://evil.example"></iframe>', "<iframe"],
    ['<a href="javascript:alert(1)">klik</a>', "<a "],
    ['<svg onload=alert(1)>', "<svg"],
    ['<style>body{display:none}</style>', "<style"],
    ['<form action="https://evil.example"><input name=x></form>', "<form"],
    ['<object data="x"></object>', "<object"],
    ['<meta http-equiv="refresh" content="0;url=https://evil.example">', "<meta"],
    ['<link rel="stylesheet" href="https://evil.example/x.css">', "<link"],
    ['<base href="https://evil.example/">', "<base"],
  ])("HTML berbahaya %s tidak menjadi elemen", (input, tag) => {
    expect(render(input)).not.toContain(tag);
  });

  it("atribut event handler tidak pernah menjadi atribut elemen", () => {
    const html = render('<div onclick="x()">a</div> teks `<b onmouseover=1>`');
    expect(html).not.toMatch(/<[a-z]+[^>]*\sonclick=/i);
    expect(html).not.toMatch(/<[a-z]+[^>]*\sonmouseover=/i);
  });

  it("potongan kode dari data asli tampil apa adanya, tidak hilang dan tidak jadi elemen", () => {
    const html = render('fungsi Promise<string | null> dan <Link href="/dashboard/billing">Update</Link> selesai');
    expect(html).toContain("Promise&lt;string | null&gt;");
    expect(html).toContain("&lt;Link href=&quot;/dashboard/billing&quot;&gt;Update&lt;/Link&gt;");
    expect(html).not.toContain("<Link");
  });

  it("SVG mentah (seperti task 39 pada data asli) tampil sebagai teks", () => {
    const html = render('  <svg viewBox="0 0 24 24" width="20">\n    <path fill="#4285F4" d="M22.56z"/>\n  </svg>');
    expect(html).not.toMatch(/<svg|<path/);
    expect(html).toContain("&lt;svg");
  });

  describe("tautan", () => {
    it("https diizinkan, dibuka di tab baru dengan rel aman", () => {
      const html = render("[ok](https://example.com/x?a=1&b=2)");
      expect(html).toContain('href="https://example.com/x?a=1&amp;b=2"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer nofollow"');
    });

    it("http dan mailto diizinkan; anchor internal tidak membuka tab baru", () => {
      expect(render("[a](http://example.com)")).toContain('href="http://example.com"');
      expect(render("[a](mailto:a@b.c)")).toContain('href="mailto:a@b.c"');
      const anchor = render("[a](#bagian)");
      expect(anchor).toContain('href="#bagian"');
      expect(anchor).not.toContain("_blank");
    });

    it.each([
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "ftp://example.com/x",
      "//evil.example/x",
      "/path/relatif",
    ])("skema/tautan tidak aman %s tampil sebagai teks tanpa href", (href) => {
      const html = render(`[klik saya](${href})`);
      expect(html).not.toContain("<a");
      expect(html).not.toMatch(/href=/);
      expect(html).toContain("klik saya");
    });

    it("URL telanjang diubah menjadi tautan aman (autolink GFM)", () => {
      const html = render("lihat https://example.com sekarang");
      expect(html).toContain('href="https://example.com"');
      expect(html).toContain('rel="noopener noreferrer nofollow"');
    });
  });

  describe("gambar", () => {
    it("tidak pernah dimuat: tanpa <img> dan tanpa pra-muat", () => {
      const html = render("![logo](https://tracker.example/pixel.png)");
      expect(html).not.toContain("<img");
      expect(html).not.toContain("tracker.example");
      expect(html).not.toContain('rel="preload"');
      expect(html).toContain("[gambar: logo]");
    });

    it("tanpa teks alternatif tetap aman", () => {
      const html = render("![](https://tracker.example/pixel.png)");
      expect(html).not.toContain("<img");
      expect(html).toContain("[gambar]");
    });

    it("tautan berisi gambar tidak memuat gambarnya", () => {
      const html = render("[![alt](https://tracker.example/p.png)](https://example.com)");
      expect(html).not.toContain("<img");
      expect(html).not.toContain("tracker.example");
    });
  });
});

describe("format yang didukung", () => {
  it("teks tebal, miring, kode inline", () => {
    const html = render("**Scope**: *penting* dan `kode()`");
    expect(html).toContain("<strong>Scope</strong>");
    expect(html).toContain("<em>penting</em>");
    expect(html).toMatch(/<code[^>]*>kode\(\)<\/code>/);
  });

  it("daftar berpoin dan bernomor", () => {
    expect(render("- satu\n- dua")).toMatch(/<ul[^>]*>\s*<li[^>]*>satu<\/li>\s*<li[^>]*>dua<\/li>\s*<\/ul>/);
    expect(render("1. a\n2. b")).toContain("<ol");
  });

  it("blok kode berpagar dengan isi di-escape", () => {
    const html = render("```ts\nconst x = <T,>(a: T) => a;\n```");
    expect(html).toContain("<pre");
    expect(html).toContain("&lt;T,&gt;");
  });

  it("tabel GFM", () => {
    const html = render("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("overflow-x-auto"); // dibungkus agar tidak merusak tata letak ponsel
  });

  it("judul diturunkan: tidak ada <h1> atau <h2> di dalam konten", () => {
    const html = render("# A\n## B\n### C\n#### D");
    expect(html).not.toMatch(/<h1|<h2/);
    expect(html).toContain("<h3");
  });

  it("baris baru tunggal tetap terlihat (whitespace-pre-line)", () => {
    expect(render("baris satu\nbaris dua")).toContain("whitespace-pre-line");
  });

  it("kutipan dan garis pemisah", () => {
    expect(render("> kutipan")).toContain("<blockquote");
    expect(render("a\n\n---\n\nb")).toContain("<hr");
  });

  it("teks kosong menghasilkan wadah kosong tanpa galat", () => {
    expect(() => render("")).not.toThrow();
  });

  it("konten panjang (3000+ karakter seperti data asli) tidak bermasalah", () => {
    const long = Array.from({ length: 60 }, (_, i) => `- butir ke-${i} dengan **tebal** dan \`kode\``).join("\n");
    const html = render(long);
    expect((html.match(/<li/g) ?? []).length).toBe(60);
  });

  it("karakter khusus HTML di teks biasa di-escape", () => {
    const html = render('a & b < c > d "e"');
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;");
    expect(html).toContain("&gt;");
  });
});
