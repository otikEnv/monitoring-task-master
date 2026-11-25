import { beforeEach, describe, expect, it, vi } from "vitest";
import { describeEvent } from "@/lib/users/events";
import { parseNewUser, validatePassword } from "@/lib/users/validate";

const ME = { id: "11111111-1111-4111-8111-111111111111", email: "boss@envisions.app", role: "superadmin", menus: [] };
const TARGET = "22222222-2222-4222-8222-222222222222";

class Denied extends Error {}

const m = vi.hoisted(() => ({
  requireSuperadmin: vi.fn(),
  createUser: vi.fn(),
  setUserRole: vi.fn(),
  setUserActive: vi.fn(),
  resetPassword: vi.fn(),
  saveMenuAccess: vi.fn(),
  getUserById: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireSuperadmin: m.requireSuperadmin }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ auth: { admin: { getUserById: m.getUserById } } }) }));
vi.mock("@/lib/users/repo", () => {
  class UserAdminError extends Error {}
  return {
    UserAdminError, createUser: m.createUser, setUserRole: m.setUserRole, setUserActive: m.setUserActive,
    resetPassword: m.resetPassword, saveMenuAccess: m.saveMenuAccess,
  };
});

import {
  createUserAction, resetPasswordAction, saveMenuAccessAction, setActiveAction, setRoleAction,
} from "@/app/pengaturan/pengguna/actions";
import { UserAdminError } from "@/lib/users/repo";

beforeEach(() => {
  vi.resetAllMocks();
  m.requireSuperadmin.mockResolvedValue(ME);
  m.getUserById.mockResolvedValue({ data: { user: { id: TARGET, email: "dev@envisions.app" } }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("validasi", () => {
  it("password: minimal 8, maksimal 72 byte, bukan hanya spasi", () => {
    expect(validatePassword("1234567").ok).toBe(false);
    expect(validatePassword("12345678").ok).toBe(true);
    expect(validatePassword(" ".repeat(10)).ok).toBe(false);
    expect(validatePassword("é".repeat(40)).ok).toBe(false); // 80 byte
    expect(validatePassword(42).ok).toBe(false);
  });

  it("user baru: email @envisions.app (dirapikan), role valid", () => {
    expect(parseNewUser({ email: " Budi@ENVISIONS.app ", password: "rahasia123", role: "developer" }))
      .toEqual({ ok: true, value: { email: "budi@envisions.app", password: "rahasia123", role: "developer" } });
    const bad = parseNewUser({ email: "budi@gmail.com", password: "x", role: "root" });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && Object.keys(bad.errors).sort()).toEqual(["email", "password", "role"]);
    expect(!parseNewUser({ email: "", password: "rahasia123", role: "viewer" }).ok).toBe(true);
  });
});

describe("describeEvent", () => {
  it("teks per jenis perubahan", () => {
    expect(describeEvent({ action: "role_changed", targetEmail: "b@envisions.app", detail: { from: "viewer", to: "developer" } }))
      .toBe("changed b@envisions.app from Viewer to Developer");
    expect(describeEvent({ action: "user_created", targetEmail: "b@envisions.app", detail: { role: "admin" } })).toBe("added b@envisions.app as Admin");
    expect(describeEvent({ action: "user_disabled", targetEmail: null, detail: {} })).toBe("disabled a deleted user");
    expect(describeEvent({ action: "password_reset", targetEmail: "b@envisions.app", detail: {} })).toBe("reset the password of b@envisions.app");
    expect(describeEvent({ action: "menu_access_changed", targetEmail: null, detail: { role: "viewer", added: ["notes"], removed: ["trend"] } }))
      .toBe("updated menu access for Viewer: +Notes, −Trend");
  });
});

describe("action Settings", () => {
  it("semua action: bukan superadmin berhenti sebelum menyentuh data", async () => {
    m.requireSuperadmin.mockRejectedValue(new Denied());
    for (const call of [
      () => createUserAction({ email: "a@envisions.app", password: "rahasia123", role: "viewer" }),
      () => setRoleAction(TARGET, "admin"),
      () => setActiveAction(TARGET, false),
      () => resetPasswordAction(TARGET, "rahasia123"),
      () => saveMenuAccessAction({ viewer: ["calendar"] }),
    ]) await expect(call()).rejects.toBeInstanceOf(Denied);
    for (const fn of [m.createUser, m.setUserRole, m.setUserActive, m.resetPassword, m.saveMenuAccess, m.getUserById]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("pelaku dari sesi; email target dibaca ulang di server", async () => {
    expect(await setRoleAction(TARGET.toUpperCase(), "developer")).toEqual({ ok: true });
    expect(m.setUserRole).toHaveBeenCalledWith({ id: ME.id, email: ME.email }, { id: TARGET, email: "dev@envisions.app" }, "developer");
    expect(await setActiveAction(TARGET, false)).toEqual({ ok: true });
    expect(m.setUserActive).toHaveBeenCalledWith({ id: ME.id, email: ME.email }, { id: TARGET, email: "dev@envisions.app" }, false);
    expect(await resetPasswordAction(TARGET, "baru12345")).toEqual({ ok: true });
    expect(m.resetPassword).toHaveBeenCalledWith(expect.anything(), expect.anything(), "baru12345");
  });

  it("diri sendiri, id dan role tidak valid ditolak tanpa menyentuh data", async () => {
    expect(await setRoleAction(ME.id, "viewer")).toEqual({ ok: false, error: "You can't change your own account here." });
    expect(await setActiveAction(ME.id, false)).toEqual({ ok: false, error: "You can't change your own account here." });
    expect(await setRoleAction("x", "admin")).toEqual({ ok: false, error: "Invalid user ID." });
    expect(await setRoleAction(TARGET, "root")).toEqual({ ok: false, error: "Choose a role." });
    expect(await resetPasswordAction(TARGET, "short")).toMatchObject({ ok: false });
    expect(m.setUserRole).not.toHaveBeenCalled();
    expect(m.resetPassword).not.toHaveBeenCalled();
  });

  it("galat yang aman diteruskan; galat lain jadi pesan umum", async () => {
    m.setUserRole.mockRejectedValueOnce(new UserAdminError("At least one active superadmin is required."));
    expect(await setRoleAction(TARGET, "admin")).toEqual({ ok: false, error: "At least one active superadmin is required." });
    m.setUserRole.mockRejectedValueOnce(new Error("password authentication failed"));
    expect(await setRoleAction(TARGET, "admin")).toEqual({ ok: false, error: "Could not change the role." });
  });

  it("tambah user: galat form per kolom; email terdaftar di kolom email", async () => {
    const bad = await createUserAction({ email: "x@gmail.com", password: "1", role: "viewer" });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.fieldErrors?.email).toBeTruthy();
    m.createUser.mockRejectedValueOnce(new UserAdminError("This email is already registered."));
    expect(await createUserAction({ email: "a@envisions.app", password: "rahasia123", role: "admin" }))
      .toEqual({ ok: false, fieldErrors: { email: "This email is already registered." } });
    m.createUser.mockResolvedValueOnce({ id: TARGET, email: "a@envisions.app" });
    expect(await createUserAction({ email: "A@envisions.app", password: "rahasia123", role: "admin" })).toEqual({ ok: true, email: "a@envisions.app" });
    expect(m.createUser).toHaveBeenLastCalledWith({ id: ME.id, email: ME.email }, { email: "a@envisions.app", password: "rahasia123", role: "admin" });
  });

  it("akses menu: role dan menu asing ditolak; hanya role yang dikirim disimpan", async () => {
    expect(await saveMenuAccessAction({ superadmin: ["calendar"] })).toEqual({ ok: false, error: "Invalid menu access." });
    expect(await saveMenuAccessAction({ viewer: ["hack"] })).toEqual({ ok: false, error: "Invalid menu access." });
    expect(await saveMenuAccessAction({})).toEqual({ ok: false, error: "Invalid menu access." });
    expect(await saveMenuAccessAction({ viewer: ["calendar", "notes"] })).toEqual({ ok: true });
    expect(m.saveMenuAccess).toHaveBeenCalledTimes(1);
    expect(m.saveMenuAccess).toHaveBeenCalledWith({ id: ME.id, email: ME.email }, "viewer", ["calendar", "notes"]);
    expect(m.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});
