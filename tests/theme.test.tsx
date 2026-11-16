import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { ThemeProvider } from "@/components/theme/theme-provider";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { applyTheme, parseTheme, THEME_INIT_SCRIPT, THEME_KEY, THEMES } from "@/lib/theme";

describe("parseTheme", () => {
  it("light dan dark dikenali; selain itu (kosong, rusak, null) = system", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    for (const v of [null, undefined, "", "system", "Dark", "LIGHT", "blue", 1, {}, ["dark"]]) {
      expect(parseTheme(v), String(v)).toBe("system");
    }
    expect(THEMES).toEqual(["light", "dark", "system"]);
  });
});

describe("applyTheme", () => {
  const fakeRoot = () => {
    const attrs = new Map<string, string>();
    return {
      attrs,
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      removeAttribute: (k: string) => void attrs.delete(k),
    };
  };

  it("light dan dark memasang data-theme; system menghapusnya (mengikuti sistem)", () => {
    const root = fakeRoot();
    applyTheme(root, "dark");
    expect(root.attrs.get("data-theme")).toBe("dark");
    applyTheme(root, "light");
    expect(root.attrs.get("data-theme")).toBe("light");
    applyTheme(root, "system");
    expect(root.attrs.has("data-theme")).toBe(false);
  });
});

describe("THEME_INIT_SCRIPT (dijalankan di <head> sebelum cat pertama)", () => {
  /** Menjalankan skrip dengan localStorage dan document palsu; mengembalikan atribut yang terpasang. */
  const run = (stored: string | null | "THROW") => {
    const attrs = new Map<string, string>();
    const localStorage = {
      getItem: (k: string) => {
        if (stored === "THROW") throw new Error("diblokir");
        return k === THEME_KEY ? stored : null;
      },
    };
    const document = { documentElement: { setAttribute: (k: string, v: string) => void attrs.set(k, v) } };
    new Function("localStorage", "document", THEME_INIT_SCRIPT)(localStorage, document);
    return attrs.get("data-theme");
  };

  it("pilihan tersimpan light atau dark langsung dipasang", () => {
    expect(run("dark")).toBe("dark");
    expect(run("light")).toBe("light");
  });

  it("tanpa pilihan, system, atau nilai asing: tidak memasang apa pun (mengikuti sistem)", () => {
    for (const v of [null, "system", "", "Dark", "<script>"]) expect(run(v), String(v)).toBeUndefined();
  });

  it("penyimpanan diblokir: tidak melempar galat", () => {
    expect(() => run("THROW")).not.toThrow();
    expect(run("THROW")).toBeUndefined();
  });

  it("skrip berdiri sendiri: tanpa import, tanpa karakter penutup tag, satu baris", () => {
    expect(THEME_INIT_SCRIPT).not.toMatch(/import|require|<\/script/i);
    expect(THEME_INIT_SCRIPT).not.toContain("\n");
  });
});

describe("ThemeToggle (render server)", () => {
  const html = (className?: string) =>
    renderToStaticMarkup(<ThemeProvider><ThemeToggle className={className} /></ThemeProvider>);

  it("tombol berlabel aksesibel, tipe button, ikon dekoratif", () => {
    const out = html();
    expect(out).toContain('aria-label="Change theme"');
    expect(out).toContain('type="button"');
    expect(out).toContain('aria-hidden="true"');
  });

  it("render server memakai tampilan terang (ikon matahari) dan menerima className", () => {
    const out = html("ml-auto");
    expect(out).toContain("lucide-sun");
    expect(out).not.toContain("lucide-moon");
    expect(out).toContain("ml-auto");
  });

  it("isi menu baru muncul saat dibuka (tidak dirender sebelum itu)", () => {
    expect(html()).not.toContain("System");
  });
});
