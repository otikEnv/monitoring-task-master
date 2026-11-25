import { describe, expect, it } from "vitest";
import {
  MATRIX_ROLES, MENU_KEYS, MENUS, ROLES, allowedMenus, can, canChangeAnyActivity, defaultMenus, isRole, menuAllowed, menuLock,
  type Ability, type Role,
} from "@/lib/access";

// Matriks hak di PRD-RBAC.md, bagian "Matriks hak".
const EXPECTED: Record<Ability, Role[]> = {
  settings: ["superadmin"],
  "release.manage": ["superadmin", "admin"],
  "note.create": ["superadmin", "admin"],
  "note.comment": ["superadmin", "admin", "developer"],
  "action.check": ["superadmin", "admin", "developer"],
  "release.activity": ["superadmin", "admin", "developer"],
};

describe("can", () => {
  it("sesuai matriks hak PRD untuk semua role", () => {
    for (const [ability, roles] of Object.entries(EXPECTED) as [Ability, Role[]][]) {
      for (const role of ROLES) expect(can(role, ability), `${role} ${ability}`).toBe(roles.includes(role));
    }
  });

  it("viewer tidak punya hak tulis apa pun; tanpa role juga tidak", () => {
    for (const ability of Object.keys(EXPECTED) as Ability[]) {
      expect(can("viewer", ability)).toBe(false);
      expect(can(null, ability)).toBe(false);
      expect(can(undefined, ability)).toBe(false);
    }
  });

  it("hanya admin dan superadmin mengubah semua entri activity", () => {
    expect(ROLES.filter(canChangeAnyActivity)).toEqual(["superadmin", "admin"]);
  });

  it("isRole", () => {
    expect(ROLES.every(isRole)).toBe(true);
    for (const v of ["root", "", null, undefined, 1, "Admin"]) expect(isRole(v)).toBe(false);
  });
});

describe("menu", () => {
  it("MENUS memuat semua kunci menu sekali, urut sidebar", () => {
    expect(MENUS.map((m) => m.key)).toEqual([...MENU_KEYS]);
  });

  it("superadmin selalu semua menu walau daftarnya kosong", () => {
    expect(allowedMenus({ role: "superadmin", menus: [] }).map((m) => m.key)).toEqual([...MENU_KEYS]);
  });

  it("Dashboard selalu; Source settings tidak pernah untuk developer dan viewer", () => {
    for (const role of ["admin", "developer", "viewer"] as const) {
      expect(menuAllowed({ role, menus: [] }, "dashboard")).toBe(true);
    }
    expect(menuAllowed({ role: "developer", menus: ["sources"] }, "sources")).toBe(false);
    expect(menuAllowed({ role: "viewer", menus: ["sources"] }, "sources")).toBe(false);
    expect(menuAllowed({ role: "admin", menus: ["sources"] }, "sources")).toBe(true);
  });

  it("menu lain mengikuti daftar", () => {
    const v = { role: "viewer" as const, menus: ["calendar", "notes"] };
    expect(allowedMenus(v).map((m) => m.key)).toEqual(["calendar", "dashboard", "notes"]);
    expect(menuAllowed(v, "trend")).toBe(false);
  });

  it("kunci matriks sama dengan aturan database", () => {
    for (const role of MATRIX_ROLES) {
      expect(menuLock(role, "dashboard")?.state).toBe(true);
      expect(menuLock(role, "calendar")).toBeNull();
    }
    expect(menuLock("admin", "sources")).toBeNull();
    expect(menuLock("developer", "sources")?.state).toBe(false);
    expect(menuLock("viewer", "sources")?.state).toBe(false);
  });

  it("bawaan sama dengan seed migrasi", () => {
    expect(defaultMenus("admin")).toEqual([...MENU_KEYS]);
    expect(defaultMenus("viewer")).toEqual(MENU_KEYS.filter((m) => m !== "sources"));
    expect(defaultMenus("developer")).not.toContain("sources");
  });
});
