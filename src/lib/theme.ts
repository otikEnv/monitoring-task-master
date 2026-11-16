/**
 * Tema tampilan: terang, gelap, atau mengikuti sistem. Murni (tanpa React). CSS (src/app/globals.css) sudah
 * memahami `data-theme` pada <html>: tanpa atribut = mengikuti sistem (prefers-color-scheme); "light" atau
 * "dark" memaksa tampilan itu.
 */
export type Theme = "light" | "dark" | "system";

export const THEMES: readonly Theme[] = ["light", "dark", "system"];

/** Kunci localStorage. Tidak ada nilai tersimpan = mengikuti sistem. */
export const THEME_KEY = "theme";

/** Nilai tersimpan yang tidak dikenal (atau rusak) diperlakukan sebagai "system". */
export function parseTheme(value: unknown): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

/** Memasang pilihan ke <html>: "system" menghapus atribut agar CSS mengikuti sistem. */
export function applyTheme(root: Pick<HTMLElement, "setAttribute" | "removeAttribute">, theme: Theme): void {
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

/**
 * Skrip yang dijalankan di <head> sebelum cat pertama, supaya pilihan tersimpan sudah berlaku saat halaman
 * tampil (tanpa kedip terang-ke-gelap). Harus berdiri sendiri: tidak boleh memakai apa pun dari bundel.
 */
export const THEME_INIT_SCRIPT =
  `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});` +
  `if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
