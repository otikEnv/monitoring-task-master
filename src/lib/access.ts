// Role, hak per aksi, dan menu (PRD-RBAC.md). Murni: aman dipakai di klien dan server.
// Hak menulis mengikuti role (tetap di kode); menu yang bisa dibuka diatur superadmin (role_menu_access).

export const ROLES = ["superadmin", "admin", "developer", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "Superadmin", admin: "Admin", developer: "Developer", viewer: "Viewer",
};

export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as readonly string[]).includes(v);

/**
 * Aksi tulis. Satu tempat untuk seluruh app: menambah role cukup mengubah tabel ini.
 *   settings          Settings: user, role, akses menu, activity
 *   release.manage    release, hold/resume, released, archive, source, sync, libur
 *   note.create       membuat catatan (ubah/hapus tetap hanya penulisnya)
 *   note.comment      berkomentar dan membalas; ubah/hapus komentar miliknya
 *   action.check      mencentang action item yang ditugaskan kepadanya
 *   release.activity  menambah Note di activity release; ubah/hapus Note miliknya
 */
export type Ability = "settings" | "release.manage" | "note.create" | "note.comment" | "action.check" | "release.activity";

const ABILITY_ROLES: Record<Ability, readonly Role[]> = {
  settings: ["superadmin"],
  "release.manage": ["superadmin", "admin"],
  "note.create": ["superadmin", "admin"],
  "note.comment": ["superadmin", "admin", "developer"],
  "action.check": ["superadmin", "admin", "developer"],
  "release.activity": ["superadmin", "admin", "developer"],
};

export const can = (role: Role | null | undefined, ability: Ability): boolean =>
  role != null && ABILITY_ROLES[ability].includes(role);

/** Admin dan superadmin: boleh mengubah semua entri activity release (developer hanya Note miliknya). */
export const canChangeAnyActivity = (role: Role | null | undefined) => can(role, "release.manage");

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

/** Kunci menu; sama dengan public.menu_keys() di database. */
export const MENU_KEYS = ["calendar", "dashboard", "tasks", "release", "trend", "notes", "archive", "sources"] as const;
export type MenuKey = (typeof MENU_KEYS)[number];

export type Menu = { key: MenuKey; label: string; href: string; group: "monitor" | "manage"; exact?: boolean };

/** Urutan sama dengan sidebar. Settings tidak termasuk (selalu hanya superadmin). */
export const MENUS: readonly Menu[] = [
  { key: "calendar", label: "Calendar", href: "/calendar", group: "monitor" },
  { key: "dashboard", label: "Dashboard", href: "/", group: "monitor", exact: true },
  { key: "tasks", label: "Task list", href: "/tasks", group: "monitor" },
  { key: "release", label: "Release", href: "/release", group: "monitor" },
  { key: "trend", label: "Trend", href: "/tren", group: "monitor" },
  { key: "notes", label: "Notes", href: "/notes", group: "monitor" },
  { key: "archive", label: "Archive", href: "/archive", group: "manage" },
  { key: "sources", label: "Source settings", href: "/pengaturan/sumber", group: "manage" },
];

/** Role yang aksesnya diatur di matriks (superadmin selalu semua menu). */
export const MATRIX_ROLES = ["admin", "developer", "viewer"] as const satisfies readonly Role[];
export type MatrixRole = (typeof MATRIX_ROLES)[number];

export type MenuLock = { state: boolean; reason: string };

/** Sel matriks yang tidak bisa diubah, atau null. Sama dengan aturan set_menu_access di database. */
export function menuLock(role: MatrixRole, menu: MenuKey): MenuLock | null {
  if (menu === "dashboard") return { state: true, reason: "Always on: users are sent here when a page is not allowed." };
  if (menu === "sources" && role !== "admin") return { state: false, reason: "Contains write forms, so only admins can open it." };
  return null;
}

/** Bawaan bila daftar menu tidak bisa dibaca: sama dengan seed migrasi. */
export function defaultMenus(role: Role): MenuKey[] {
  return MENU_KEYS.filter((m) => m !== "sources" || role === "admin" || role === "superadmin");
}

export type MenuSubject = { role: Role; menus: readonly string[] };

/** Superadmin selalu semua menu; Dashboard selalu; lainnya mengikuti role_menu_access. */
export function menuAllowed(user: MenuSubject, menu: MenuKey): boolean {
  if (user.role === "superadmin" || menu === "dashboard") return true;
  if (menu === "sources" && user.role !== "admin") return false;
  return user.menus.includes(menu);
}

export const allowedMenus = (user: MenuSubject): Menu[] => MENUS.filter((m) => menuAllowed(user, m.key));
