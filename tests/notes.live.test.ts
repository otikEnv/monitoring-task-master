import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadCalendar } from "@/lib/calendar/data";
import { loadNotesSummary } from "@/lib/dashboard/notes-summary";
import { buildFollowUp } from "@/lib/notes/follow-up";
import { loadHolidaysForYear } from "@/lib/notes/holidays";
import { checkLinks, loadRelatedNotes, releaseSnapshots } from "@/lib/notes/links";
import { loadNoteList } from "@/lib/notes/list";
import { getNoteDetail, loadActionItems, loadNoteLinks, loadRevisions } from "@/lib/notes/load";
import {
  DuplicateHolidayError, NotAllowedError, addComment, deleteComment, deleteHoliday, deleteNote, editComment, markNoteRead,
  saveHoliday, saveNote, setActionItemDone, type Actor,
} from "@/lib/notes/repo";
import type { NoteInput } from "@/lib/notes/validate";
import { createRelease } from "@/lib/releases/repo";
import { loadReleaseOverviews } from "@/lib/releases/load";

/**
 * Notes dan Calendar (PRD-Note.md) terhadap Supabase asli. Penulisan lewat fungsi repo (service role, seperti server
 * action); SEMUA pembacaan memakai SESI pengguna nyata (RLS berlaku). Hanya lewat `npm run test:live`. Butuh migrasi
 * 20261124000000. Data uji berawalan TMP-NOTE- (dan libur tahun 2099), dihapus di akhir.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENABLED = Boolean(URL_ && ANON && SERVICE);

describe.skipIf(!ENABLED)("notes dan calendar (Supabase asli)", () => {
  vi.setConfig({ testTimeout: 60_000 });
  const opt = { auth: { persistSession: false, autoRefreshToken: false } };
  const run = randomBytes(3).toString("hex");
  const nm = (k: string) => `TMP-NOTE-${run}-${k}`;
  let admin: SupabaseClient;
  const users: Record<"a1" | "a2" | "v", Actor & { password: string; client?: SupabaseClient }> = {} as never;
  let sourceId = "";
  let releaseId = "";
  const NOW = new Date("2026-11-24T03:00:00Z");

  const input = (title: string, extra: Partial<NoteInput> = {}): NoteInput => ({
    title: nm(title), noteDate: "2026-11-24", kind: "meeting", body: "isi", followsUpId: null, links: [], items: [], ...extra,
  });

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, opt);
    for (const [k, role] of [["a1", "admin"], ["a2", "admin"], ["v", "viewer"]] as const) {
      const email = `tmp-note-${run}-${k}@envisions.app`;
      const password = "Tmp!" + randomBytes(9).toString("base64url");
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      await admin.from("profiles").update({ role }).eq("user_id", data.user.id);
      const client = createClient(URL_!, ANON!, opt);
      const { error: se } = await client.auth.signInWithPassword({ email, password });
      if (se) throw se;
      users[k] = { id: data.user.id, email, password, client };
    }
    const { data: src, error: se } = await admin.from("sources").insert({
      name: nm("app"), provider: "github", repo_url: `https://github.com/tmp/note-${run}`, token_encrypted: "v1.RAHASIA.RAHASIA.RAHASIA",
    }).select("id").single();
    if (se) throw se;
    sourceId = src.id as string;
    const { error: te } = await admin.from("tasks").insert([
      { source_id: sourceId, tag: "master", task_id: "1", title: "A1", status: "done" },
      { source_id: sourceId, tag: "master", task_id: "2", title: "A2", status: "pending" },
    ]);
    if (te) throw te;
    releaseId = (await createRelease({
      name: nm("rel"), startDate: "2026-11-13", targetDate: "2026-12-24",
      components: [{ sourceId, tag: "master", rangeStart: 1, rangeEnd: 2 }],
    }, admin)).id;
  }, 120_000);

  afterAll(async () => {
    await admin.from("notes").delete().like("title", `%TMP-NOTE-${run}-%`);
    await admin.from("releases").delete().like("name", `TMP-NOTE-${run}-%`);
    await admin.from("sources").delete().like("name", `TMP-NOTE-${run}-%`);
    await admin.from("holidays").delete().gte("holiday_date", "2099-01-01");
    for (const u of Object.values(users)) if (u?.id) await admin.auth.admin.deleteUser(u.id);
  });

  const viewer = () => users.v.client!;
  const actor = (k: "a1" | "a2" | "v"): Actor => ({ id: users[k].id, email: users[k].email });

  it("buat catatan: tautan, rekaman release, action item; viewer membaca semuanya", async () => {
    const links: NoteInput["links"] = [
      { kind: "release", releaseId },
      { kind: "task", sourceId, tag: "master", taskId: "2" },
      { kind: "source", sourceId },
    ];
    expect((await checkLinks(viewer(), links, [0, 1, 2])).size).toBe(0);
    expect(await checkLinks(viewer(), [{ kind: "task", sourceId, tag: "master", taskId: "99" }], [0])).toEqual(
      new Map([[0, "Task #99 does not exist in tag master."]]),
    );
    const snapshots = await releaseSnapshots(admin, [releaseId], NOW);
    expect(snapshots.get(releaseId)).toMatchObject({ done: 1, total: 2, progressPercent: 50 });

    const { id } = await saveNote(null, input("main", {
      links,
      items: [
        { id: null, body: "Tugas viewer", assigneeId: users.v.id, dueDate: "2026-11-20", done: false, carriedFromId: null },
        { id: null, body: "Tugas lain", assigneeId: null, dueDate: "2026-11-30", done: false, carriedFromId: null },
      ],
    }), actor("a1"), { snapshots, assigneeEmails: new Map([[users.v.id, users.v.email]]) }, admin);

    const d = await getNoteDetail(viewer(), id);
    expect(d?.note).toMatchObject({ title: nm("main"), authorId: users.a1.id, authorEmail: users.a1.email });
    expect(d?.links).toHaveLength(3);
    expect(d?.links.find((l) => l.kind === "release")?.snapshot).toMatchObject({ done: 1, total: 2 });
    expect(d?.items.map((i) => [i.body, i.assigneeEmail])).toEqual([["Tugas viewer", users.v.email], ["Tugas lain", null]]);
    expect((await loadRelatedNotes(viewer(), { releaseId })).map((n) => n.id)).toEqual([id]);
    expect((await loadRelatedNotes(viewer(), { sourceId, tag: "master", taskId: "2" })).map((n) => n.id)).toEqual([id]);
  });

  it("hanya penulis yang bisa mengubah dan menghapus; edit menyimpan riwayat dan rekaman tetap", async () => {
    const { id } = await saveNote(null, input("edit", { links: [{ kind: "release", releaseId }] }), actor("a1"),
      { snapshots: await releaseSnapshots(admin, [releaseId], NOW) }, admin);
    await expect(saveNote(id, input("edit-dibajak"), actor("a2"), {}, admin)).rejects.toBeInstanceOf(NotAllowedError);
    await expect(deleteNote(id, actor("a2"), admin)).rejects.toBeInstanceOf(NotAllowedError);
    await expect(deleteNote(id, actor("v"), admin)).rejects.toBeInstanceOf(NotAllowedError);

    const before = (await loadNoteLinks(viewer(), id))[0].snapshot;
    await admin.from("tasks").update({ status: "done" }).eq("source_id", sourceId).eq("task_id", "2");
    await saveNote(id, input("edit", { body: "isi baru", links: [{ kind: "release", releaseId }] }), actor("a1"), {
      snapshots: await releaseSnapshots(admin, [releaseId], NOW),
    }, admin);
    await admin.from("tasks").update({ status: "pending" }).eq("source_id", sourceId).eq("task_id", "2");
    const after = (await loadNoteLinks(viewer(), id))[0].snapshot;
    expect(after).toEqual(before); // rekaman tidak berubah saat diedit

    const revs = await loadRevisions(viewer(), id);
    expect(revs.map((r) => [r.body, r.editedByEmail])).toEqual([["isi", users.a1.email]]);
  });

  it("Follow up: item terbuka dibawa, rujukan dua arah, item asal Carried over", async () => {
    const { id: origin } = await saveNote(null, input("asal", {
      links: [{ kind: "source", sourceId }],
      items: [
        { id: null, body: "terbuka", assigneeId: null, dueDate: "2026-11-01", done: false, carriedFromId: null },
        { id: null, body: "selesai", assigneeId: null, dueDate: null, done: true, carriedFromId: null },
      ],
    }), actor("a1"), {}, admin);
    const d = (await getNoteDetail(viewer(), origin))!;
    const fu = buildFollowUp(d.note, d.links, d.items, "2026-12-01");
    expect(fu.items.map((i) => i.body)).toEqual(["terbuka"]);
    const { id: next } = await saveNote(null, {
      ...input("lanjut"), title: fu.title, followsUpId: origin,
      links: [{ kind: "source", sourceId }],
      items: fu.items.map((i) => ({ id: null, body: i.body, assigneeId: null, dueDate: i.dueDate || null, done: false, carriedFromId: i.carriedFromId })),
    }, actor("a2"), {}, admin);
    const after = (await getNoteDetail(viewer(), origin))!;
    expect(after.followedUpIn.map((n) => n.id)).toEqual([next]);
    expect(after.items.find((i) => i.body === "terbuka")?.carriedToId).toBeTruthy();
    expect((await getNoteDetail(viewer(), next))!.followsUp?.id).toBe(origin);
  });

  it("action item: penanggung jawab (viewer) dan penulis boleh mencentang; orang lain tidak", async () => {
    const { id } = await saveNote(null, input("item", {
      items: [{ id: null, body: "milik viewer", assigneeId: users.v.id, dueDate: null, done: false, carriedFromId: null }],
    }), actor("a1"), { assigneeEmails: new Map([[users.v.id, users.v.email]]) }, admin);
    const [item] = await loadActionItems(viewer(), id);
    await setActionItemDone(item.id, true, actor("v"), admin);
    expect((await loadActionItems(viewer(), id))[0].done).toBe(true);
    await expect(setActionItemDone(item.id, false, actor("a2"), admin)).rejects.toBeInstanceOf(NotAllowedError);
    await setActionItemDone(item.id, false, actor("a1"), admin);
    expect((await loadActionItems(viewer(), id))[0].done).toBe(false);
  });

  it("komentar: semua pengguna; ubah/hapus hanya penulis komentar; penanda komentar baru", async () => {
    const { id } = await saveNote(null, input("komentar"), actor("a1"), {}, admin);
    const { id: c } = await addComment(id, "dari viewer", actor("v"), admin);
    await expect(editComment(c, "diubah", actor("a1"), admin)).rejects.toBeInstanceOf(NotAllowedError);
    await expect(deleteComment(c, actor("a1"), admin)).rejects.toBeInstanceOf(NotAllowedError);
    await editComment(c, "dari viewer (ubah)", actor("v"), admin);

    const list = await loadNoteList(users.a1.client!, { q: nm("komentar"), type: null, app: null, from: null, to: null, page: 1 }, users.a1.id);
    expect(list.rows[0]).toMatchObject({ commentCount: 1, newComments: 1 });
    await markNoteRead(id, actor("a1"), admin);
    const again = await loadNoteList(users.a1.client!, { q: nm("komentar"), type: null, app: null, from: null, to: null, page: 1 }, users.a1.id);
    expect(again.rows[0]).toMatchObject({ commentCount: 1, newComments: 0 });
    // Komentar sendiri tidak pernah "baru" bagi penulisnya.
    const mine = await loadNoteList(viewer(), { q: nm("komentar"), type: null, app: null, from: null, to: null, page: 1 }, users.v.id);
    expect(mine.rows[0].newComments).toBe(0);
    await deleteComment(c, actor("v"), admin);
  });

  it("viewer dan anon tidak bisa menulis langsung; anon tidak bisa membaca", async () => {
    const v = viewer();
    expect((await v.from("notes").insert({ title: "x", note_date: "2026-11-24", author_email: "x" })).error).toBeTruthy();
    expect((await v.from("note_comments").insert({ note_id: releaseId, body: "x", author_email: "x" })).error).toBeTruthy();
    expect((await v.from("holidays").insert({ holiday_date: "2099-02-02", name: "x", kind: "national" })).error).toBeTruthy();
    expect((await v.rpc("add_note_comment", { p_note: releaseId, p_actor: users.v.id, p_actor_email: "x", p_body: "x" })).error).toBeTruthy();
    expect((await v.rpc("save_note", { p_id: null, p_actor: users.v.id, p_actor_email: "x", p_note: {}, p_links: [], p_items: [] })).error).toBeTruthy();
    const { data: reads } = await v.from("note_reads").select("user_id");
    expect((reads ?? []).every((r) => r.user_id === users.v.id)).toBe(true);
    const anon = createClient(URL_!, ANON!, opt);
    expect((await anon.from("notes").select("id")).error).toBeTruthy();
    expect((await anon.from("holidays").select("id")).error).toBeTruthy();
  });

  it("libur: tanggal unik, terbaca viewer, tampil di Calendar dan kartu Dashboard", async () => {
    expect((await loadHolidaysForYear(viewer(), 2026)).length).toBe(25);
    const { id } = await saveHoliday(null, { date: "2099-01-01", name: nm("libur"), kind: "national" }, admin);
    await expect(saveHoliday(null, { date: "2099-01-01", name: "ganda", kind: "national" }, admin)).rejects.toBeInstanceOf(DuplicateHolidayError);
    const cal = await loadCalendar(viewer(), { show: ["holidays"], app: null, type: null }, "2098-12-28", "2099-01-31", NOW);
    expect(cal.holidays.map((h) => h.name)).toContain(nm("libur"));
    await deleteHoliday(id, admin);

    const nov = await loadCalendar(viewer(), { show: ["notes", "releases", "items", "holidays"], app: sourceId, type: null }, "2026-10-26", "2026-12-06", NOW);
    expect(nov.items.some((i) => i.kind === "release" && i.event === "start")).toBe(true);
    expect(nov.items.some((i) => i.kind === "note" && i.title === nm("main"))).toBe(true);
    expect(nov.items.some((i) => i.kind === "item" && i.body === "Tugas viewer" && i.overdue)).toBe(true);

    const s = await loadNotesSummary(viewer(), users.v.id, NOW);
    expect(s.overdue[0]).toMatchObject({ body: "Tugas viewer", mine: true });
  });

  it("hari kerja: release 13 Nov → 24 Des 2026 dihitung dengan libur", async () => {
    const [o] = await loadReleaseOverviews(viewer(), { id: releaseId }, NOW);
    expect(o.stats.workingDaysLeft).toBe(21);
    expect(o.stats.daysLeft).toBe(30);
    expect(Math.round(o.stats.elapsedPercent)).toBe(25);
  });

  it("menghapus catatan: semua data terkait ikut terhapus", async () => {
    const { id } = await saveNote(null, input("hapus", {
      links: [{ kind: "release", releaseId }],
      items: [{ id: null, body: "x", assigneeId: null, dueDate: null, done: false, carriedFromId: null }],
    }), actor("a1"), { snapshots: await releaseSnapshots(admin, [releaseId], NOW) }, admin);
    await addComment(id, "x", actor("v"), admin);
    await deleteNote(id, actor("a1"), admin);
    for (const t of ["note_links", "note_action_items", "note_comments", "note_reads", "note_revisions"]) {
      const { count } = await admin.from(t).select("note_id", { count: "exact", head: true }).eq("note_id", id);
      expect([t, count]).toEqual([t, 0]);
    }
  });
});
