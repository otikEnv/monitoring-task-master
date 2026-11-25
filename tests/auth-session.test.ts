import { beforeEach, describe, expect, it, vi } from "vitest";

// Sesi dan penjaga di src/lib/auth.ts dengan klien Supabase tiruan.
const m = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
  profile: null as null | { role: string; disabled_at: string | null },
  menus: [] as { menu: string }[],
  menuError: null as null | { message: string },
}));

vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(f: T) => f }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: m.user } }) },
    from: (table: string) => {
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: m.profile }) }) }) };
      }
      return { select: () => ({ eq: async () => ({ data: m.menuError ? null : m.menus, error: m.menuError }) }) };
    },
  }),
}));

import { authorizeApi, getSessionUser, requireAbility, requireAdmin, requireMenu, requireSuperadmin, requireUser } from "@/lib/auth";

const as = (role: string, disabled = false) => {
  m.user = { id: "u1", email: "u1@envisions.app" };
  m.profile = { role, disabled_at: disabled ? "2026-11-25T00:00:00Z" : null };
};

beforeEach(() => {
  m.user = null;
  m.profile = null;
  m.menus = [{ menu: "calendar" }, { menu: "dashboard" }, { menu: "notes" }];
  m.menuError = null;
});

describe("getSessionUser", () => {
  it("role dan menu dari database", async () => {
    as("developer");
    expect(await getSessionUser()).toEqual({ id: "u1", email: "u1@envisions.app", role: "developer", menus: ["calendar", "dashboard", "notes"] });
  });

  it("role asing atau tanpa profil = viewer", async () => {
    as("root");
    expect((await getSessionUser())?.role).toBe("viewer");
    m.profile = null;
    expect((await getSessionUser())?.role).toBe("viewer");
  });

  it("akun nonaktif = null; tanpa login = null", async () => {
    as("admin", true);
    expect(await getSessionUser()).toBeNull();
    m.user = null;
    expect(await getSessionUser()).toBeNull();
  });

  it("daftar menu gagal dibaca: pakai bawaan", async () => {
    as("viewer");
    m.menuError = { message: "boom" };
    expect((await getSessionUser())?.menus).not.toContain("sources");
    expect((await getSessionUser())?.menus).toContain("trend");
  });
});

describe("penjaga", () => {
  it("requireUser: tanpa sesi keluar lewat /auth/signout; nonaktif membawa alasan", async () => {
    await expect(requireUser()).rejects.toThrow("REDIRECT /auth/signout");
    as("admin", true);
    await expect(requireUser()).rejects.toThrow("REDIRECT /auth/signout?reason=disabled");
  });

  it("requireAdmin: admin dan superadmin lolos; developer dan viewer ke beranda", async () => {
    for (const role of ["admin", "superadmin"]) {
      as(role);
      await expect(requireAdmin()).resolves.toMatchObject({ role });
    }
    for (const role of ["developer", "viewer"]) {
      as(role);
      await expect(requireAdmin()).rejects.toThrow("REDIRECT /");
    }
  });

  it("requireSuperadmin hanya superadmin", async () => {
    as("admin");
    await expect(requireSuperadmin()).rejects.toThrow("REDIRECT /");
    as("superadmin");
    await expect(requireSuperadmin()).resolves.toMatchObject({ role: "superadmin" });
  });

  it("requireAbility dengan menu: menu dimatikan ditolak walau punya hak", async () => {
    as("developer");
    await expect(requireAbility("note.comment", "notes")).resolves.toMatchObject({ role: "developer" });
    await expect(requireAbility("release.activity", "release")).rejects.toThrow("REDIRECT /");
    await expect(requireAbility("note.create", "notes")).rejects.toThrow("REDIRECT /");
  });

  it("requireMenu: ke Dashboard dengan pesan; Dashboard dan superadmin selalu lolos", async () => {
    as("viewer");
    await expect(requireMenu("trend")).rejects.toThrow("REDIRECT /?notice=no-access");
    await expect(requireMenu("dashboard")).resolves.toBeTruthy();
    await expect(requireMenu("notes")).resolves.toBeTruthy();
    as("superadmin");
    m.menus = [];
    await expect(requireMenu("sources")).resolves.toBeTruthy();
  });

  it("authorizeApi: 401 tanpa sesi, 403 tanpa hak atau menu", async () => {
    const r1 = await authorizeApi("admin");
    expect("error" in r1 && r1.error?.status).toBe(401);
    as("viewer");
    const r2 = await authorizeApi("admin");
    expect("error" in r2 && r2.error?.status).toBe(403);
    as("admin");
    const r3 = await authorizeApi("admin", "trend");
    expect("error" in r3 && r3.error?.status).toBe(403);
    expect("user" in (await authorizeApi("admin", "notes"))).toBe(true);
  });
});
