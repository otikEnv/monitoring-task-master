import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadReleaseOverviews } from "@/lib/releases/load";
import { loadCurrentHold, loadLatestNotes, loadReleaseActivity } from "@/lib/releases/notes";
import {
  addReleaseNote, createRelease, deleteReleaseNote, editReleaseNote, holdRelease, NoteNotDeletableError,
  NoteNotFoundError, ReleaseNotFoundError, ReleaseStateError, resumeRelease, setReleaseArchived, setReleasedOn,
  updateRelease,
} from "@/lib/releases/repo";

/**
 * Hold dan Catatan release (PRD-Release-Hold-Catatan.md) terhadap Supabase asli, dengan SESI VIEWER NYATA untuk
 * semua pembacaan. Hanya lewat `npm run test:live`. Butuh migrasi 20261116000000, 20261116010000, dan
 * 20261116020000. Data uji berawalan TMP-HOLD- dan dihapus di akhir.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENABLED = Boolean(URL_ && ANON && SERVICE);

describe.skipIf(!ENABLED)("hold dan catatan release (Supabase asli, sesi viewer)", () => {
  // Banyak tes memakai belasan permintaan ke Supabase asli berturut-turut; batas bawaan 5 dtk bisa terlampaui.
  vi.setConfig({ testTimeout: 60_000 });
  const opt = { auth: { persistSession: false, autoRefreshToken: false } };
  const run = randomBytes(3).toString("hex");
  const email = `tmp-hold-${run}@envisions.app`;
  const password = "Tmp!" + randomBytes(9).toString("base64url");
  let admin: SupabaseClient;
  let viewer: SupabaseClient;
  let userId: string;
  const ids: Record<string, string> = {};
  const rel: Record<string, string> = {};
  const nm = (k: string) => `TMP-HOLD-${run}-${k}`;
  const author = () => ({ id: userId, email });

  const addSource = async (key: string) => {
    const { data, error } = await admin.from("sources").insert({
      name: nm(key), provider: "github", repo_url: `https://github.com/tmp/hold-${run}-${key}`,
      token_encrypted: "v1.RAHASIA.RAHASIA.RAHASIA",
    }).select("id").single();
    if (error) throw error;
    ids[key] = data.id as string;
  };
  const row = async (id: string) =>
    (await admin.from("releases").select("held_at, hold_reason, released_on, archived_at, target_date").eq("id", id).single()).data!;
  const notes = async (id: string) =>
    (await admin.from("release_notes").select("*").eq("release_id", id).order("created_at", { ascending: true })).data ?? [];
  const overview = async (id: string) => (await loadReleaseOverviews(viewer, { id }))[0];

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, opt);
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;

    await addSource("a");
    await addSource("b");
    const { error: te } = await admin.from("tasks").insert([
      { source_id: ids.a, tag: "master", task_id: "1", title: "A1", status: "done" },
      { source_id: ids.a, tag: "master", task_id: "2", title: "A2", status: "pending" },
      { source_id: ids.b, tag: "master", task_id: "1", title: "B1", status: "done" },
      { source_id: ids.b, tag: "master", task_id: "2", title: "B2", status: "in-progress" },
    ]);
    if (te) throw te;

    viewer = createClient(URL_!, ANON!, opt);
    const { error: se } = await viewer.auth.signInWithPassword({ email, password });
    if (se) throw se;

    // Tanggal di masa lalu: tanpa hold, status otomatis selalu Overdue (tugas belum selesai semua).
    const mk = async (key: string, sources: string[]) => {
      rel[key] = (await createRelease({
        name: nm(key), startDate: "2026-01-01", targetDate: "2026-01-10",
        components: sources.map((s) => ({ sourceId: ids[s], tag: "master", rangeStart: 1, rangeEnd: 9 })),
      }, admin)).id;
    };
    await mk("main", ["a", "b"]); // lintas aplikasi
    await mk("state", ["a"]);
    await mk("rilis", ["b"]);
    await mk("edit", ["a"]);
    await mk("target", ["a"]);
    await mk("arsip", ["b"]);
    await mk("page", ["a"]);
    await mk("cascade", ["a"]);
  }, 120_000);

  afterAll(async () => {
    await admin.from("releases").delete().like("name", `TMP-HOLD-${run}-%`);
    await admin.from("sources").delete().like("name", `TMP-HOLD-${run}-%`);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("hold: kolom terisi, entri hold dengan penulis, viewer melihat On hold; angka progres tidak berubah", async () => {
    const before = await overview(rel.main);
    expect(before.stats.risk).toBe("overdue");
    expect(before.stats.heldAt).toBeNull();

    const { noteId } = await holdRelease(rel.main, "Waiting for the vendor API", author(), admin);
    const r = await row(rel.main);
    expect(r.held_at).toBeTruthy();
    expect(r.hold_reason).toBe("Waiting for the vendor API");
    expect(r.target_date).toBe("2026-01-10"); // tanggal target tidak berubah

    const [entry] = await notes(rel.main);
    expect([entry.id, entry.kind, entry.body, entry.author_id, entry.author_email]).toEqual([noteId, "hold", "Waiting for the vendor API", userId, email]);

    const after = await overview(rel.main);
    expect(after.stats.risk).toBe("on_hold");
    expect(after.stats.wouldBeRisk).toBe("overdue"); // risiko otomatis tetap dihitung sebagai informasi sekunder
    expect([after.stats.heldAt, after.stats.holdReason]).toEqual([r.held_at, "Waiting for the vendor API"]);
    for (const k of ["total", "done", "percentDone", "daysLeft", "gap", "attentionCount"] as const) {
      expect(after.stats[k], k).toEqual(before.stats[k]);
    }
    expect(after.components.map((c) => c.stats.total)).toEqual(before.components.map((c) => c.stats.total));

    const hold = await loadCurrentHold(viewer, rel.main);
    expect(hold?.authorEmail).toBe(email);
  });

  it("keadaan yang tidak mengizinkan: hold ganda, sudah rilis, terarsip, tidak ada; alasan tidak valid", async () => {
    await holdRelease(rel.state, "first", author(), admin);
    const dup = await holdRelease(rel.state, "again", author(), admin).catch((e) => e);
    expect(dup).toBeInstanceOf(ReleaseStateError);
    expect(dup.code).toBe("already_on_hold");

    await setReleasedOn(rel.rilis, "2026-01-12", admin, author());
    const released = await holdRelease(rel.rilis, "x", author(), admin).catch((e) => e);
    expect(released).toBeInstanceOf(ReleaseStateError);
    expect(released.code).toBe("already_released");

    await setReleaseArchived(rel.arsip, true, admin);
    const archived = await holdRelease(rel.arsip, "x", author(), admin).catch((e) => e);
    expect(archived).toBeInstanceOf(ReleaseStateError);
    expect(archived.code).toBe("archived");

    await expect(holdRelease("00000000-0000-4000-8000-000000000000", "x", author(), admin)).rejects.toBeInstanceOf(ReleaseNotFoundError);
    await expect(holdRelease(rel.edit, "   ", author(), admin)).rejects.toThrow();
    await expect(holdRelease(rel.edit, "x".repeat(501), author(), admin)).rejects.toThrow();
    expect((await row(rel.edit)).held_at).toBeNull(); // penolakan tidak meninggalkan hold setengah jadi
    expect(await notes(rel.edit)).toHaveLength(0);
  });

  it("resume: hold dibersihkan, entri resume (alasan opsional); resume tanpa hold ditolak", async () => {
    await resumeRelease(rel.state, null, author(), admin);
    const r = await row(rel.state);
    expect([r.held_at, r.hold_reason]).toEqual([null, null]);
    expect((await notes(rel.state)).map((n) => [n.kind, n.body])).toEqual([["hold", "first"], ["resume", ""]]);
    expect((await overview(rel.state)).stats.risk).toBe("overdue"); // status otomatis kembali

    const again = await resumeRelease(rel.state, "x", author(), admin).catch((e) => e);
    expect(again).toBeInstanceOf(ReleaseStateError);
    expect(again.code).toBe("not_on_hold");

    await holdRelease(rel.state, "second", author(), admin);
    await resumeRelease(rel.state, "API is ready", author(), admin);
    expect((await notes(rel.state)).at(-1)).toMatchObject({ kind: "resume", body: "API is ready" });
  });

  it("menandai rilis saat hold mengakhiri hold dan mencatatnya; batal rilis tidak membuat entri", async () => {
    await setReleasedOn(rel.rilis, null, admin, author()); // batalkan rilis (dari tes sebelumnya) supaya bisa ditahan
    await holdRelease(rel.rilis, "Hold before release", author(), admin);
    await setReleasedOn(rel.rilis, "2026-01-15", admin, author());
    const r = await row(rel.rilis);
    expect([r.held_at, r.hold_reason, r.released_on]).toEqual([null, null, "2026-01-15"]);
    const list = await notes(rel.rilis);
    expect(list.at(-1)).toMatchObject({ kind: "released", body: "The hold ended because the release was marked as released." });
    expect((await overview(rel.rilis)).stats.risk).toBe("released");

    const n = list.length;
    await setReleasedOn(rel.rilis, "2026-01-16", admin, author()); // tandai ulang: tidak menggandakan entri
    expect(await notes(rel.rilis)).toHaveLength(n);
    await setReleasedOn(rel.rilis, null, admin, author());
    expect(await notes(rel.rilis)).toHaveLength(n); // batal rilis tidak membuat entri
  });

  it("catatan: tambah, terbaca viewer, catatan terbaru per release hanya jenis note", async () => {
    await expect(addReleaseNote("00000000-0000-4000-8000-000000000000", "x", author(), admin)).rejects.toBeInstanceOf(ReleaseNotFoundError);
    await addReleaseNote(rel.edit, "First note", author(), admin);
    await new Promise((r) => setTimeout(r, 20));
    await addReleaseNote(rel.edit, "Second note", author(), admin);
    await holdRelease(rel.edit, "Hold is newer than the notes", author(), admin); // entri sistem tidak menggeser catatan terbaru

    const latest = await loadLatestNotes(viewer, [rel.edit, rel.main]);
    expect(latest.get(rel.edit)?.body).toBe("Second note");
    expect(latest.has(rel.main)).toBe(false); // hanya entri sistem: tidak ada catatan bebas
    expect((await overview(rel.edit)).latestNote?.body).toBe("Second note");
    expect((await overview(rel.main)).latestNote).toBeNull();
    await resumeRelease(rel.edit, null, author(), admin);
  });

  it("edit catatan: hanya teks berubah, versi sebelumnya tersimpan, teks sama tidak ditandai edited", async () => {
    const [first] = (await notes(rel.edit)).filter((n) => n.kind === "note");
    await editReleaseNote(first.id, "First note (fixed)", "editor@envisions.app", admin);
    const [after] = (await notes(rel.edit)).filter((n) => n.id === first.id);
    expect([after.body, after.previous_body, after.edited_by_email]).toEqual(["First note (fixed)", "First note", "editor@envisions.app"]);
    expect(after.edited_at).toBeTruthy();
    expect([after.kind, after.author_email, after.created_at]).toEqual([first.kind, first.author_email, first.created_at]);

    await editReleaseNote(first.id, "First note (fixed)", "other@envisions.app", admin);
    expect((await notes(rel.edit)).find((n) => n.id === first.id)?.edited_by_email).toBe("editor@envisions.app");

    await expect(editReleaseNote(first.id, "  ", "editor@envisions.app", admin)).rejects.toThrow(); // note tidak boleh kosong
    await expect(editReleaseNote("00000000-0000-4000-8000-000000000000", "x", "e@envisions.app", admin)).rejects.toBeInstanceOf(NoteNotFoundError);

    // fakta terkunci: bahkan service role tidak bisa mengubahnya langsung
    for (const patch of [{ kind: "hold" }, { author_email: "palsu@envisions.app" }, { created_at: "2020-01-01T00:00:00Z" }]) {
      const res = await admin.from("release_notes").update(patch).eq("id", first.id);
      expect(res.error, JSON.stringify(patch)).toBeTruthy();
    }
  });

  it("mengedit entri hold terbaru dari release yang masih ditahan memperbarui alasan hold", async () => {
    await holdRelease(rel.edit, "Reason with a typpo", author(), admin);
    const holdEntry = (await notes(rel.edit)).filter((n) => n.kind === "hold").at(-1)!;
    await editReleaseNote(holdEntry.id, "Reason without a typo", email, admin);
    expect((await row(rel.edit)).hold_reason).toBe("Reason without a typo");
    expect((await overview(rel.edit)).stats.holdReason).toBe("Reason without a typo");

    const older = (await notes(rel.edit)).filter((n) => n.kind === "hold")[0];
    await editReleaseNote(older.id, "Older reason, edited", email, admin);
    expect((await row(rel.edit)).hold_reason).toBe("Reason without a typo"); // entri lama tidak menyentuh hold berjalan
    await resumeRelease(rel.edit, null, author(), admin);
  });

  it("perubahan target dengan alasan membuat entri; tanpa alasan atau tanpa perubahan tidak; hold tetap", async () => {
    const input = (targetDate: string) => ({
      name: nm("target"), startDate: "2026-01-01", targetDate,
      components: [{ sourceId: ids.a, tag: "master", rangeStart: 1, rangeEnd: 9 }],
    });
    await holdRelease(rel.target, "Held while the date moves", author(), admin);

    await updateRelease(rel.target, input("2026-01-20"), admin, { reason: "  Vendor delay  ", author: author() });
    const changes = (await notes(rel.target)).filter((n) => n.kind === "target_change");
    expect(changes).toHaveLength(1);
    expect([changes[0].old_target_date, changes[0].new_target_date, changes[0].body, changes[0].author_email])
      .toEqual(["2026-01-10", "2026-01-20", "Vendor delay", email]);
    expect((await row(rel.target)).held_at).toBeTruthy(); // hold tidak terpengaruh

    await updateRelease(rel.target, input("2026-01-25"), admin); // pemanggil lama tanpa alasan: tidak ada entri
    await updateRelease(rel.target, input("2026-01-25"), admin, { reason: "no date change", author: author() }); // tanggal sama
    expect((await notes(rel.target)).filter((n) => n.kind === "target_change")).toHaveLength(1);
    expect((await row(rel.target)).target_date).toBe("2026-01-25");
  });

  it("hold terbawa saat arsip dan restore", async () => {
    await resumeRelease(rel.target, null, author(), admin);
    await holdRelease(rel.target, "Hold survives archive", author(), admin);
    await setReleaseArchived(rel.target, true, admin);
    expect((await row(rel.target)).held_at).toBeTruthy();
    await setReleaseArchived(rel.target, false, admin);
    const r = await row(rel.target);
    expect([Boolean(r.held_at), r.hold_reason, r.archived_at]).toEqual([true, "Hold survives archive", null]);
    await resumeRelease(rel.target, null, author(), admin);
  });

  it("log berhalaman 20 per halaman, terbaru di atas, halaman di luar rentang dipotong (sesi viewer)", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      release_id: rel.page, kind: "note", body: `Bulk ${String(i + 1).padStart(2, "0")}`, author_email: email,
      created_at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(),
    }));
    const ins = await admin.from("release_notes").insert(rows);
    expect(ins.error).toBeNull();

    const p1 = await loadReleaseActivity(viewer, rel.page, 1);
    expect([p1.total, p1.page, p1.pageCount, p1.rows.length]).toEqual([25, 1, 2, 20]);
    expect(p1.rows[0].body).toBe("Bulk 25"); // terbaru dulu
    const p2 = await loadReleaseActivity(viewer, rel.page, 2);
    expect(p2.rows.map((r) => r.body)).toEqual(["Bulk 05", "Bulk 04", "Bulk 03", "Bulk 02", "Bulk 01"]);
    const clamped = await loadReleaseActivity(viewer, rel.page, 99);
    expect(clamped.page).toBe(2);
    expect((await loadReleaseActivity(viewer, rel.cascade, 1)).rows).toEqual([]);
    // isi versi sebelumnya tidak ikut dibaca oleh pemuat
    expect(JSON.stringify(p1.rows[0])).not.toContain("previous");
  });

  it("viewer: membaca log, hold, dan catatan terbaru; tidak bisa menulis atau memanggil fungsi", async () => {
    const readable = await viewer.from("release_notes").select("id").eq("release_id", rel.main);
    expect(readable.error).toBeNull();
    expect(readable.data!.length).toBeGreaterThan(0);
    const h = await viewer.from("releases").select("held_at, hold_reason").eq("id", rel.main).single();
    expect(h.error).toBeNull();
    expect(h.data?.hold_reason).toBe("Waiting for the vendor API");

    const [any] = await notes(rel.main);
    expect((await viewer.from("release_notes").insert({ release_id: rel.main, kind: "note", body: "x", author_email: email })).error).toBeTruthy();
    expect((await viewer.from("release_notes").update({ body: "diubah viewer" }).eq("id", any.id)).error).toBeTruthy();
    expect((await viewer.from("release_notes").delete().eq("id", any.id)).error).toBeTruthy();
    expect((await viewer.from("releases").update({ held_at: new Date().toISOString(), hold_reason: "x" }).eq("id", rel.target)).error).toBeTruthy();
    expect((await notes(rel.main)).find((n) => n.id === any.id)?.body).toBe(any.body); // tidak berubah

    for (const [fn, args] of [
      ["hold_release", { p_id: rel.target, p_reason: "x", p_author: userId, p_email: email }],
      ["resume_release", { p_id: rel.main, p_reason: "", p_author: userId, p_email: email }],
      ["add_release_note", { p_id: rel.main, p_body: "x", p_author: userId, p_email: email }],
      ["edit_release_note", { p_note_id: any.id, p_body: "x", p_email: email }],
      ["set_release_released", { p_id: rel.main, p_released_on: "2026-01-01", p_author: userId, p_email: email }],
    ] as const) {
      const res = await viewer.rpc(fn, args);
      expect(res.error, fn).toBeTruthy();
    }
    expect((await row(rel.main)).held_at).toBeTruthy(); // masih ditahan: tidak ada panggilan viewer yang berhasil
  });

  it("hapus catatan: hanya Note; catatan terbaru menyesuaikan; entri sistem ditolak; viewer tidak bisa", async () => {
    const { noteId } = await addReleaseNote(rel.edit, "Sent by mistake", author(), admin);
    expect((await loadLatestNotes(viewer, [rel.edit])).get(rel.edit)?.body).toBe("Sent by mistake");
    const heldBefore = (await row(rel.edit)).held_at;

    // viewer tidak bisa menghapus, lewat fungsi maupun langsung ke tabel
    expect((await viewer.rpc("delete_release_note", { p_note_id: noteId })).error).toBeTruthy();
    expect((await viewer.from("release_notes").delete().eq("id", noteId)).error).toBeTruthy();
    expect((await notes(rel.edit)).some((n) => n.id === noteId)).toBe(true);

    expect(await deleteReleaseNote(noteId, admin)).toEqual({ releaseId: rel.edit });
    expect((await notes(rel.edit)).some((n) => n.id === noteId)).toBe(false);
    expect((await loadLatestNotes(viewer, [rel.edit])).get(rel.edit)?.body).toBe("Second note"); // kembali ke yang sebelumnya
    expect((await row(rel.edit)).held_at).toBe(heldBefore); // menghapus catatan tidak menyentuh hold

    // entri sistem tidak bisa dihapus dan tetap ada
    const system = (await notes(rel.edit)).filter((n) => n.kind !== "note");
    expect(system.length).toBeGreaterThan(0);
    for (const n of system) {
      await expect(deleteReleaseNote(n.id, admin), n.kind).rejects.toBeInstanceOf(NoteNotDeletableError);
    }
    expect((await notes(rel.edit)).filter((n) => n.kind !== "note")).toHaveLength(system.length);

    await expect(deleteReleaseNote(noteId, admin)).rejects.toBeInstanceOf(NoteNotFoundError); // sudah terhapus
  });

  it("menghapus release menghapus log-nya", async () => {
    await addReleaseNote(rel.cascade, "Will be deleted", author(), admin);
    await holdRelease(rel.cascade, "x", author(), admin);
    expect((await notes(rel.cascade)).length).toBe(2);
    const del = await admin.from("releases").delete().eq("id", rel.cascade);
    expect(del.error).toBeNull();
    expect(await notes(rel.cascade)).toHaveLength(0);
  });
});
