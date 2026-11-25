// Teks satu baris untuk Settings > Activity. Murni (tanpa akses data).
import { MENUS, ROLE_LABEL, isRole } from "@/lib/access";
import type { UserEvent } from "./load";

const roleText = (v: unknown) => (isRole(v) ? ROLE_LABEL[v] : String(v ?? "?"));
const menuText = (v: unknown) => MENUS.find((m) => m.key === v)?.label ?? String(v);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(menuText) : []);

/** Mis. "changed budi@… from Viewer to Developer". Pelaku ditampilkan terpisah. */
export function describeEvent(e: Pick<UserEvent, "action" | "targetEmail" | "detail">): string {
  const who = e.targetEmail ?? "a deleted user";
  switch (e.action) {
    case "user_created":
      return `added ${who}${e.detail.role ? ` as ${roleText(e.detail.role)}` : ""}`;
    case "role_changed":
      return `changed ${who} from ${roleText(e.detail.from)} to ${roleText(e.detail.to)}`;
    case "user_disabled":
      return `disabled ${who}`;
    case "user_enabled":
      return `enabled ${who}`;
    case "password_reset":
      return `reset the password of ${who}`;
    case "menu_access_changed": {
      const parts = [...list(e.detail.added).map((m) => `+${m}`), ...list(e.detail.removed).map((m) => `−${m}`)];
      return `updated menu access for ${roleText(e.detail.role)}${parts.length ? `: ${parts.join(", ")}` : ""}`;
    }
    default:
      return "made a change";
  }
}
