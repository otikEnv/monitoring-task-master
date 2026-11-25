import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/app/release/actions", () => ({
  addNote: vi.fn(), editNote: vi.fn(), deleteNote: vi.fn(), putOnHold: vi.fn(), resumeHold: vi.fn(),
  markReleased: vi.fn(), removeRelease: vi.fn(),
}));
vi.mock("@/app/archive/actions", () => ({ restoreRelease: vi.fn() }));

import { ReleaseActions } from "@/app/release/release-actions";
import { ReleaseActivity, activityHref, canChangeEntry, type ActivityAccess } from "@/components/releases/release-activity";
import { ReleaseDetailView } from "@/components/releases/release-detail";
import { formatRelative } from "@/lib/releases/format";
import type { NotesPage, ReleaseNoteRow } from "@/lib/releases/notes";
import { overviewOf, REL_ID, task } from "./fixtures/release-overview";

const NOW = new Date("2026-11-11T05:00:00Z");

const note = (over: Partial<ReleaseNoteRow> = {}): ReleaseNoteRow => ({
  id: "n1", releaseId: REL_ID, kind: "note", body: "Waiting for the API", oldTargetDate: null, newTargetDate: null,
  authorId: "admin-id", authorEmail: "admin@envisions.app", createdAt: "2026-11-09T03:00:00Z", editedAt: null, editedByEmail: null, ...over,
});
const page = (rows: ReleaseNoteRow[], over: Partial<NotesPage> = {}): NotesPage => ({
  rows, total: rows.length, page: 1, pageCount: 1, pageSize: 20, ...over,
});
const ADMIN: ActivityAccess = { userId: "admin-id", canAdd: true, canChangeAll: true };
const VIEWER: ActivityAccess = { userId: "viewer-id", canAdd: false, canChangeAll: false };
const DEV: ActivityAccess = { userId: "dev-id", canAdd: true, canChangeAll: false };
const render = (activity: NotesPage | null, isAdmin: boolean | ActivityAccess = true) =>
  renderToStaticMarkup(
    <ReleaseActivity
      releaseId={REL_ID} activity={activity} now={NOW}
      access={typeof isAdmin === "boolean" ? (isAdmin ? ADMIN : VIEWER) : isAdmin}
    />,
  );

describe("formatRelative", () => {
  it("menit, jam, hari, lalu tanggal", () => {
    const at = (iso: string) => formatRelative(iso, NOW);
    expect(at("2026-11-11T04:59:40Z")).toBe("just now");
    expect(at("2026-11-11T05:30:00Z")).toBe("just now"); // masa depan
    expect(at("2026-11-11T04:59:00Z")).toBe("1 minute ago");
    expect(at("2026-11-11T04:15:00Z")).toBe("45 minutes ago");
    expect(at("2026-11-11T04:00:00Z")).toBe("1 hour ago");
    expect(at("2026-11-11T00:00:00Z")).toBe("5 hours ago");
    expect(at("2026-11-10T05:00:00Z")).toBe("1 day ago");
    expect(at("2026-11-02T05:00:00Z")).toBe("9 days ago");
    expect(at("2026-09-01T05:00:00Z")).toMatch(/^01 Sep/);
    expect(at("bukan tanggal")).toBe("-");
  });
});

describe("bagian Activity", () => {
  it("entri: jenis, teks, penulis, waktu relatif dengan tanggal lengkap di title", () => {
    const out = render(page([note()]));
    expect(out).toContain('id="activity"');
    expect(out).toContain(">Activity (1)<");
    expect(out).toContain('aria-label="Note entry"');
    expect(out).toContain("Waiting for the API");
    expect(out).toContain("admin@envisions.app");
    expect(out).toContain("2 days ago");
    expect(out).toMatch(/<time dateTime="2026-11-09T03:00:00Z" title="09 Nov 2026, 10:00">/);
  });

  it("kelima jenis entri punya label sendiri", () => {
    const out = render(page([
      note({ id: "1", kind: "note" }), note({ id: "2", kind: "hold" }), note({ id: "3", kind: "resume", body: "" }),
      note({ id: "4", kind: "target_change", oldTargetDate: "2026-12-01", newTargetDate: "2026-12-15" }),
      note({ id: "5", kind: "released", body: "" }),
    ]));
    for (const l of ["Note entry", "On hold entry", "Resumed entry", "Target changed entry", "Released entry"]) {
      expect(out).toContain(`aria-label="${l}"`);
    }
  });

  it("entri Target change menampilkan tanggal lama dan baru beserta alasannya", () => {
    const out = render(page([note({ kind: "target_change", body: "Vendor delay", oldTargetDate: "2026-12-01", newTargetDate: "2026-12-15" })]));
    expect(out).toContain("01 Dec 2026");
    expect(out).toContain("15 Dec 2026");
    expect(out).toContain("Vendor delay");
  });

  it("entri tanpa teks (resume tanpa alasan) tidak menampilkan paragraf kosong", () => {
    const out = render(page([note({ kind: "resume", body: "" })]));
    expect(out).not.toContain('<p class="whitespace-pre-wrap');
  });

  it("entri yang diedit ditandai (edited) dengan siapa dan kapan di title", () => {
    const out = render(page([note({ editedAt: "2026-11-10T02:00:00Z", editedByEmail: "ed@envisions.app" })]));
    expect(out).toContain("(edited)");
    expect(out).toContain('title="Edited by ed@envisions.app on 10 Nov 2026, 09:00"');
    expect(render(page([note()]))).not.toContain("(edited)");
  });

  it("teks di-escape dan baris barunya dipertahankan lewat CSS", () => {
    const out = render(page([note({ body: "<img src=x onerror=alert(1)>\nbaris dua" })]));
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
    expect(out).toContain("whitespace-pre-wrap");
  });

  it("email penulis dan penyunting di-escape juga", () => {
    const out = render(page([note({ authorEmail: "<b>x</b>@envisions.app" })]));
    expect(out).not.toContain("<b>x</b>");
  });

  it("admin: form Add note dan menu Edit tiap entri; viewer: tidak ada keduanya", () => {
    const admin = render(page([note()]), true);
    expect(admin).toContain("Add note");
    expect(admin).toContain("Add a note");
    expect(admin).toMatch(/aria-label="Actions for the note entry from [^"]+"/);
    const viewer = render(page([note()]), false);
    expect(viewer).not.toContain("Add note");
    expect(viewer).not.toContain("Actions for the");
    expect(viewer).toContain("Waiting for the API"); // viewer tetap melihat log
  });

  it("developer: form Add note; menu hanya pada Note miliknya (bukan Note orang lain atau entri sistem)", () => {
    const rows = [
      note({ id: "mine", authorId: "dev-id", authorEmail: "dev@envisions.app", body: "Catatan dev" }),
      note({ id: "other", body: "Catatan admin" }),
      note({ id: "hold", kind: "hold", authorId: "dev-id", body: "Hold" }),
    ];
    const out = render(page(rows), DEV);
    expect(out).toContain("Add note");
    expect(out.match(/aria-label="Actions for the note entry from/g)).toHaveLength(1);
    expect(out).not.toContain("Actions for the hold entry");
    expect(canChangeEntry(DEV, rows[0])).toBe(true);
    expect(canChangeEntry(DEV, rows[1])).toBe(false);
    expect(canChangeEntry(DEV, rows[2])).toBe(false);
    expect(canChangeEntry(DEV, note({ authorId: null }))).toBe(false);
    expect(canChangeEntry(ADMIN, rows[2])).toBe(true);
    expect(canChangeEntry({ ...VIEWER, userId: "admin-id" }, rows[1])).toBe(false); // viewer: walau penulisnya
  });

  it("kosong: pesan; ajakan menambah catatan hanya untuk admin", () => {
    expect(render(page([]), true)).toContain("No activity yet. Add a note to explain delays or decisions.");
    const viewer = render(page([]), false);
    expect(viewer).toContain("No activity yet.");
    expect(viewer).not.toContain("Add a note");
  });

  it("log gagal dimuat: pesan, form tetap ada untuk admin", () => {
    const out = render(null, true);
    expect(out).toContain("The activity log could not be loaded.");
    expect(out).not.toContain("<ul");
  });

  it("satu halaman: tanpa pager; banyak halaman: tautan kembali ke #activity dan ringkasan rentang", () => {
    expect(render(page([note()]))).not.toContain('aria-label="Pagination"');
    const many = render(page([note()], { total: 45, page: 2, pageCount: 3 }));
    expect(many).toContain('aria-label="Pagination"');
    expect(many).toContain(`href="/release/${REL_ID}#activity"`); // halaman 1 tanpa parameter
    expect(many).toContain(`href="/release/${REL_ID}?page=3#activity"`);
    expect(many).toContain("Showing 21–21 of 45 entries");
  });

  it("activityHref", () => {
    expect(activityHref("x", 1)).toBe("/release/x#activity");
    expect(activityHref("x", 4)).toBe("/release/x?page=4#activity");
  });
});

const held = (over: Parameters<typeof overviewOf>[1] = {}) =>
  overviewOf([{ tasks: [task(100, "done"), task(101, "pending")], rangeStart: 100, rangeEnd: 109 }], {
    now: "2026-11-30", heldAt: "2026-11-25T03:00:00Z", holdReason: "Waiting for the business decision", ...over,
  });
const detail = (o: ReturnType<typeof held>, heldBy: string | null = "admin@envisions.app") =>
  renderToStaticMarkup(
    <ReleaseDetailView overview={o} heldBy={heldBy} now={new Date("2026-11-30T05:00:00Z")} activity={<p>ACTIVITY-SLOT</p>} />,
  );

describe("detail release ditahan", () => {
  it("banner: sejak kapan, lama, alasan, penahan, dan status otomatis sebagai informasi sekunder", () => {
    const out = detail(held());
    expect(out).toContain('aria-label="On hold"');
    expect(out).toContain("On hold since 25 Nov 2026");
    expect(out).toContain("(5 days)");
    expect(out).toContain("Waiting for the business decision");
    expect(out).toContain("Put on hold by admin@envisions.app.");
    expect(out).toContain("the automatic status would be <strong>Overdue</strong>");
  });

  it("lencana On hold menggantikan lencana risiko di header; progres tetap ditampilkan", () => {
    const out = detail(held());
    const header = out.split("</header>")[0];
    expect(header).toContain("On hold");
    expect(header).not.toContain("Overdue");
    expect(out).toContain("1 of 2 done");
  });

  it("hari yang sama: 'today'; satu hari: '1 day'", () => {
    expect(detail(held({ heldAt: "2026-11-30T01:00:00Z" }))).toContain("(today)");
    expect(detail(held({ heldAt: "2026-11-29T01:00:00Z" }))).toContain("(1 day)");
  });

  it("penahan tidak diketahui: kalimat penahan dihilangkan", () => {
    expect(detail(held(), null)).not.toContain("Put on hold by");
  });

  it("alasan di-escape", () => {
    const out = detail(held({ holdReason: "<script>alert(1)</script>" }));
    expect(out).not.toContain("<script>alert(1)");
  });

  it("tanpa hold: tidak ada banner; slot Activity tampil", () => {
    const o = overviewOf([{ tasks: [task(100, "done")], rangeStart: 100, rangeEnd: 109 }]);
    const out = renderToStaticMarkup(<ReleaseDetailView overview={o} activity={<p>ACTIVITY-SLOT</p>} />);
    expect(out).not.toContain('aria-label="On hold"');
    expect(out).toContain("ACTIVITY-SLOT");
  });

  it("slot Activity tampil juga untuk release tanpa komponen", () => {
    const o = overviewOf([]);
    const out = renderToStaticMarkup(<ReleaseDetailView overview={o} activity={<p>ACTIVITY-SLOT</p>} />);
    expect(out).toContain("ACTIVITY-SLOT");
    expect(out).toContain("has no components");
  });
});

describe("tombol admin: Put on hold dan Resume", () => {
  const actions = (props: Partial<Parameters<typeof ReleaseActions>[0]> = {}) =>
    renderToStaticMarkup(<ReleaseActions id={REL_ID} name="v2.1" released={false} {...props} />);

  it("release berjalan: Put on hold", () => {
    const out = actions();
    expect(out).toContain("Put on hold");
    expect(out).not.toContain(">Resume<");
  });

  it("release ditahan: Resume menggantikan Put on hold", () => {
    const out = actions({ held: true });
    expect(out).toContain(">Resume<");
    expect(out).not.toContain("Put on hold");
  });

  it("sudah rilis atau terarsip: tidak ada tombol hold", () => {
    expect(actions({ released: true })).not.toContain("Put on hold");
    expect(actions({ archived: true })).not.toContain("Put on hold");
  });

  it("ditahan lalu diarsipkan: Resume tetap tersedia (hold terbawa saat arsip)", () => {
    expect(actions({ held: true, archived: true })).toContain(">Resume<");
  });
});
