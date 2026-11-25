import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatrixRole, MenuKey, Role } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NewUserInput } from "./validate";

/** Pelaku perubahan: selalu superadmin dari sesi di server. */
export type Actor = { id: string; email: string };
export type Target = { id: string; email: string };

/** Galat yang pesannya aman ditampilkan ke superadmin. */
export class UserAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserAdminError";
  }
}

// Durasi ban "selamanya" untuk akun nonaktif (Supabase Auth); dibuka dengan "none".
const BAN_FOREVER = "876000h";

type RpcError = { code?: string; message?: string };

function rpcError(what: string, e: RpcError): Error {
  if (e.code === "P0002") return new UserAdminError("User not found.");
  if (e.message === "self_change") return new UserAdminError("You can't change your own account here.");
  if (e.message === "not_superadmin") return new UserAdminError("Only a superadmin can do this.");
  if (e.message === "last_superadmin") return new UserAdminError("At least one active superadmin is required.");
  if (e.message === "locked_menu") return new UserAdminError("That menu can't be changed for this role.");
  return new Error(`Gagal ${what}: ${e.message}`);
}

async function log(db: SupabaseClient, actor: Actor, target: Target, action: "user_created" | "password_reset", role?: Role) {
  const { error } = await db.rpc("log_user_event", {
    p_actor: actor.id, p_actor_email: actor.email, p_target: target.id, p_target_email: target.email, p_action: action,
    p_role: role ?? null,
  });
  // Log gagal tidak membatalkan perubahan yang sudah terjadi; dicatat di server.
  if (error) console.error("[users] gagal mencatat activity", { action, code: error.code });
}

export async function setUserRole(actor: Actor, target: Target, role: Role, db: SupabaseClient = createAdminClient()) {
  const { error } = await db.rpc("set_user_role", {
    p_actor: actor.id, p_actor_email: actor.email, p_target: target.id, p_target_email: target.email, p_role: role,
  });
  if (error) throw rpcError("mengganti role", error);
}

/**
 * Menonaktifkan atau mengaktifkan akun: database lebih dulu (aturan superadmin terakhir dan diri sendiri), lalu ban
 * atau unban di Supabase Auth. Bila langkah kedua gagal, langkah pertama dikembalikan.
 */
export async function setUserActive(actor: Actor, target: Target, active: boolean, db: SupabaseClient = createAdminClient()) {
  const call = (value: boolean) =>
    db.rpc("set_user_active", {
      p_actor: actor.id, p_actor_email: actor.email, p_target: target.id, p_target_email: target.email, p_active: value,
    });
  const { error } = await call(active);
  if (error) throw rpcError("mengubah status", error);
  const { error: authError } = await db.auth.admin.updateUserById(target.id, { ban_duration: active ? "none" : BAN_FOREVER });
  if (authError) {
    await call(!active);
    throw new Error(`Gagal mengubah status login: ${authError.message}`);
  }
}

/**
 * Membuat user dengan password awal. Akun baru selalu viewer (trigger database); role lain diberikan sesudahnya
 * lewat set_user_role sehingga tercatat dan diperiksa seperti perubahan role biasa.
 */
export async function createUser(actor: Actor, input: NewUserInput, db: SupabaseClient = createAdminClient()): Promise<Target> {
  const { data, error } = await db.auth.admin.createUser({ email: input.email, password: input.password, email_confirm: true });
  if (error || !data.user) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "email_exists" || /already (been )?registered|already exists/i.test(error?.message ?? "")) {
      throw new UserAdminError("This email is already registered.");
    }
    if (code === "weak_password") throw new UserAdminError("That password is too weak. Use a longer one.");
    throw new Error(`Gagal membuat user: ${error?.message ?? "tanpa data"}`);
  }
  const target = { id: data.user.id, email: input.email };
  await log(db, actor, target, "user_created", input.role);
  if (input.role !== "viewer") {
    try {
      await setUserRole(actor, target, input.role, db);
    } catch {
      throw new UserAdminError("The user was created as Viewer, but the role could not be set. Change it in the list.");
    }
  }
  return target;
}

export async function resetPassword(actor: Actor, target: Target, password: string, db: SupabaseClient = createAdminClient()) {
  if (actor.id === target.id) throw new UserAdminError("Use Change password for your own account.");
  const { data: prof } = await db.from("profiles").select("user_id").eq("user_id", target.id).maybeSingle();
  if (!prof) throw new UserAdminError("User not found.");
  const { error } = await db.auth.admin.updateUserById(target.id, { password });
  if (error) {
    if ((error as { code?: string }).code === "weak_password") throw new UserAdminError("That password is too weak. Use a longer one.");
    throw new Error(`Gagal mereset password: ${error.message}`);
  }
  await log(db, actor, target, "password_reset");
}

export async function saveMenuAccess(actor: Actor, role: MatrixRole, menus: MenuKey[], db: SupabaseClient = createAdminClient()) {
  const { error } = await db.rpc("set_menu_access", {
    p_actor: actor.id, p_actor_email: actor.email, p_role: role, p_menus: menus,
  });
  if (error) throw rpcError("mengubah akses menu", error);
}
