"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { applyTheme, parseTheme, THEME_KEY, type Theme } from "@/lib/theme";

type ThemeContextValue = {
  /** Pilihan pengguna: light, dark, atau system. */
  theme: Theme;
  /** Tampilan yang berlaku sekarang (system sudah diterjemahkan menurut sistem). */
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue>({ theme: "system", resolved: "light", setTheme: () => {} });

const CHANGE_EVENT = "themechange";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "system"; // penyimpanan diblokir (mode privat, dll): tetap berfungsi tanpa menyimpan
  }
}

function subscribeTheme(onChange: () => void) {
  // Tab lain mengubah pilihan: tab ini ikut memasangnya ke <html> (bukan hanya membaca ulang state).
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== THEME_KEY) return;
    applyTheme(document.documentElement, readTheme());
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function subscribeSystem(onChange: () => void) {
  const mql = window.matchMedia(DARK_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * Pilihan tema (disimpan di localStorage) dan tampilan yang berlaku. Server dan hidrasi awal memakai
 * "system"/terang; klien membaca nilai sebenarnya tanpa setState di effect. Penerapan awal ke <html> dilakukan
 * oleh THEME_INIT_SCRIPT di <head> sebelum cat pertama; di sini hanya perubahan sesudahnya.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "system" as Theme);
  const systemDark = useSyncExternalStore(subscribeSystem, () => window.matchMedia(DARK_QUERY).matches, () => false);

  const setTheme = useCallback((next: Theme) => {
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      /* tidak tersimpan, tetapi tetap berlaku untuk sesi ini */
    }
    applyTheme(document.documentElement, next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolved: theme === "system" ? (systemDark ? "dark" : "light") : theme, setTheme }),
    [theme, systemDark, setTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
