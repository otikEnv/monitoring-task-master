import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addComment, saveNote, setActionItemDone, type Actor } from "@/lib/notes/repo";
import { listAssigneeOptions } from "@/lib/notes/users";
import {
  NoteNotAllowedError, addReleaseNote, createRelease, deleteReleaseNote, editReleaseNote,
} from "@/lib/releases/repo";

/**
 * RBAC (PRD-RBAC.md) terhadap Supabase asli: role developer dan viewer pada fungsi tulis yang dipakai server action,
 * role bawaan akun baru, dan bacaan klien. Hanya lewat `npm run test:live`. Butuh migrasi 20261125000000 dan
 * 20261125010000. Data uji berawalan TMP-RBAC- dan dihapus di akhir.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENABLED = Boolean(URL_ && ANON && SERVICE);

type Key = "adm" | "dev" | "view";

describe.skipIf(!ENABLED)("RBAC (Supabase asli)", () => {
  vi.setConfig({ testTimeout: 60_000 });
  const opt = { auth: { persistSession: false, autoRefreshToken: false } };
  const run = randomBytes(3).toString("hex");
  const nm = (k: string) => `TMP-RBAC-${run}-${k}`;
  let admin: SupabaseClient;
  const users = {} as Record<Key, Actor & { client: SupabaseClient }>;
  let sourceId = "";
  let releaseId = "";
  let noteId = "";
  const items: Record<string, string> = {};

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, opt);
    for (const [k, role] of [["adm", "admin"], ["dev", "developer"], ["view", null]] as const) {
      const email = `tmp-rbac-${run}-${k}@envisions.app`;
      const password = "Tmp!" + randomBytes(9).toString("base64url");
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      // Akun baru selalu viewer; role lain diberikan sesudahnya (seperti Settings > Add user).
      if (role) await admin.from("profiles").update({ role }).eq("user_id", data.user.id);
      const client = createClient(URL_!, ANON!, opt);
      const { error: se } = await client.auth.signInWithPassword({ email, password });
      if (se) throw se;
      users[k] = { id: data.user.id, email, client };
    }
    const { data: src, error: se } = await admin.from("sources").insert({
      name: nm("app"), provider: "github", repo_url: `https://github.com/tmp/rbac-${run}`, token_encrypted: "v1.RAHASIA.RAHASIA.RAHASIA",
    }).select("id").single();
    if (se) throw se;
    sourceId = src.id as string;
    releaseId = (await createRelease({
      name: nm("rel"), startDate: "2026-11-01", targetDate: "2026-12-31",
      components: [{ sourceId, tag: "master", rangeStart: 1, rangeEnd: 9 }],
    }, admin)).id;
    noteId = (await saveNote(null, {
      title: nm("note"), noteDate: "2026-11-25", kind: "meeting", body: "", followsUpId: null, links: [],
      items: [
        { id: null, body: "untuk dev", assigneeId: users.dev.id, dueDate: null, done: false, carriedFromId: null },
        { id: null, body: "untuk viewer", assigneeId: users.view.id, dueDate: null, done: false, carriedFromId: null },
      ],
    }, users.adm, { assigneeEmails: new Map([[users.dev.id, users.dev.email], [users.view.id, users.view.email]]) }, admin)).id;
    const { data: its } = await admin.from("note_action_items").select("id, body").eq("note_id", noteId);
    for (const it of its ?? []) items[it.body as string] = it.id as string;
  });

  afterAll(async () => {
    await admin.from("notes").delete().like("title", `TMP-RBAC-${run}-%`);
    await admin.from("releases").delete().like("name", `TMP-RBAC-${run}-%`);
    await admin.from("sources").delete().like("name", `TMP-RBAC-${run}-%`);
    await admin.from("user_admin_events").delete().like("target_email", `tmp-rbac-${run}-%`);
    for (const u of Object.values(users)) if (u?.id) await admin.auth.admin.deleteUser(u.id);
  });

  it("akun baru = viewer; role yang diberikan sesudahnya berlaku", async () => {
    const { data } = await admin.from("profiles").select("user_id, role").in("user_id", Object.values(users).map((u) => u.id));
    const role = new Map((data ?? []).map((r) => [r.user_id, r.role]));
    expect([role.get(users.adm.id), role.get(users.dev.id), role.get(users.view.id)]).toEqual(["admin", "developer", "viewer"]);
  });

  it("developer: berkomentar, mencentang action item miliknya", async () => {
    const { id } = await addComment(noteId, "dari developer", users.dev, admin);
    expect(id).toBeTruthy();
    await setActionItemDone(items["untuk dev"], true, users.dev, admin);
    const { data } = await users.dev.client.from("note_action_items").select("done").eq("id", items["untuk dev"]).single();
    expect(data?.done).toBe(true);
  });

  it("viewer: komentar dan centang action item ditolak, walau penanggung jawabnya", async () => {
    await expect(addComment(noteId, "dari viewer", users.view, admin)).rejects.toThrow();
    await expect(setActionItemDone(items["untuk viewer"], true, users.view, admin)).rejects.toThrow();
    const { count } = await admin.from("note_comments").select("id", { count: "exact", head: true }).eq("author_id", users.view.id);
    expect(count).toBe(0);
  });

  it("activity release: developer menambah dan mengubah Note miliknya; tidak untuk Note admin", async () => {
    const mine = (await addReleaseNote(releaseId, "progres developer", users.dev, admin)).noteId;
    const other = (await addReleaseNote(releaseId, "catatan admin", users.adm, admin)).noteId;
    await editReleaseNote(mine, "progres developer (ubah)", users.dev, admin);
    await expect(editReleaseNote(other, "x", users.dev, admin)).rejects.toBeInstanceOf(NoteNotAllowedError);
    await expect(deleteReleaseNote(other, users.dev, admin)).rejects.toBeInstanceOf(NoteNotAllowedError);
    await expect(addReleaseNote(releaseId, "x", users.view, admin)).rejects.toThrow();

    // admin tetap bisa mengubah Note siapa pun; developer menghapus Note miliknya
    await editReleaseNote(mine, "dirapikan admin", users.adm, admin);
    expect(await deleteReleaseNote(mine, users.dev, admin)).toEqual({ releaseId });
    expect(await deleteReleaseNote(other, users.adm, admin)).toEqual({ releaseId });
  });

  it("akun nonaktif kehilangan hak tulis", async () => {
    await admin.from("profiles").update({ disabled_at: new Date().toISOString() }).eq("user_id", users.dev.id);
    try {
      await expect(addComment(noteId, "setelah nonaktif", users.dev, admin)).rejects.toThrow();
    } finally {
      await admin.from("profiles").update({ disabled_at: null }).eq("user_id", users.dev.id);
    }
  });

  it("pilihan penanggung jawab: tanpa viewer, kecuali yang sudah ditugaskan", async () => {
    const ids = (await listAssigneeOptions([], admin)).map((u) => u.id);
    expect(ids).toContain(users.dev.id);
    expect(ids).toContain(users.adm.id);
    expect(ids).not.toContain(users.view.id);
    expect((await listAssigneeOptions([users.view.id], admin)).map((u) => u.id)).toContain(users.view.id);
  });

  it("klien: role_menu_access terbaca; user_admin_events tertutup untuk selain superadmin; profil tidak bisa diubah", async () => {
    const { data: menus } = await users.view.client.from("role_menu_access").select("role, menu").eq("role", "viewer");
    expect((menus ?? []).map((r) => r.menu)).toContain("dashboard");
    const { data: events } = await users.adm.client.from("user_admin_events").select("id");
    expect(events ?? []).toHaveLength(0);
    await users.view.client.from("profiles").update({ role: "superadmin" }).eq("user_id", users.view.id);
    const { data: p } = await admin.from("profiles").select("role").eq("user_id", users.view.id).single();
    expect(p?.role).toBe("viewer");
    const r = await users.dev.client.rpc("set_user_role", {
      p_actor: users.dev.id, p_actor_email: "x", p_target: users.dev.id, p_target_email: "x", p_role: "superadmin",
    });
    expect(r.error).toBeTruthy();
  });
});
