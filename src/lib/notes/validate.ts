// Validasi masukan Notes (PRD-Note.md). Murni: tanpa jaringan/database.
import { isValidDate, UUID } from "@/lib/releases/validate";
import {
  LIMITS, isHolidayKind, isNoteKind, todayWib, type HolidayKind, type LinkKind, type NoteKind,
} from "./model";

export type LinkInput =
  | { kind: "source"; sourceId: string }
  | { kind: "release"; releaseId: string }
  | { kind: "task"; sourceId: string; tag: string; taskId: string };

export type ItemInput = {
  /** Item lama yang diubah; null = item baru. */
  id: string | null;
  body: string;
  assigneeId: string | null;
  dueDate: string | null;
  done: boolean;
  /** Hanya untuk Follow up: item belum selesai di catatan asal. */
  carriedFromId: string | null;
};

export type NoteInput = {
  title: string;
  noteDate: string;
  kind: NoteKind;
  body: string;
  /** Hanya dipakai saat membuat (Follow up). */
  followsUpId: string | null;
  links: LinkInput[];
  items: ItemInput[];
};

export type ItemFieldName = "body" | "assigneeId" | "dueDate";
export type NoteFieldErrors = {
  title?: string;
  noteDate?: string;
  kind?: string;
  body?: string;
  links?: string;
  /** Galat per baris tautan; kunci = nomor baris pada form (links[N].…). */
  linkItems?: Record<number, string>;
  items?: string;
  /** Galat per baris action item; kunci = nomor baris pada form (items[N].…). */
  itemRows?: Record<number, Partial<Record<ItemFieldName, string>>>;
};

export type NoteParseResult = { ok: true; value: NoteInput } | { ok: false; fieldErrors: NoteFieldErrors };
export type TextResult = { ok: true; value: string } | { ok: false; error: string };

const HAS_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/; // tab dan baris baru boleh
const HAS_LINE_CONTROL = /[\u0000-\u001f\u007f]/;
const LINK_KEY = /^links\[(\d{1,3})\]\.(kind|sourceId|releaseId|tag|taskId)$/;
const ITEM_KEY = /^items\[(\d{1,3})\]\.(id|body|assigneeId|dueDate|done|carriedFromId)$/;

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

/** Nama field form untuk satu baris tautan atau action item. */
export const linkField = (i: number, name: "kind" | "sourceId" | "releaseId" | "tag" | "taskId") => `links[${i}].${name}`;
export const itemField = (i: number, name: "id" | "body" | "assigneeId" | "dueDate" | "done" | "carriedFromId") =>
  `items[${i}].${name}`;

function indexes(fd: FormData, re: RegExp): number[] {
  const set = new Set<number>();
  for (const key of fd.keys()) {
    const m = re.exec(key);
    if (m) set.add(Number(m[1]));
  }
  return [...set].sort((a, b) => a - b);
}

/** Nomor baris tautan dan action item yang ada pada form, urut naik. */
export const linkIndexes = (fd: FormData) => indexes(fd, LINK_KEY);
export const itemIndexes = (fd: FormData) => indexes(fd, ITEM_KEY);

const optionalUuid = (raw: string): string | null | false => {
  const t = raw.trim();
  if (!t) return null;
  return UUID.test(t) ? t.toLowerCase() : false;
};

/** Kunci identitas tautan, untuk menolak tautan ganda. */
export const linkKey = (l: LinkInput): string =>
  l.kind === "source" ? `s:${l.sourceId}` : l.kind === "release" ? `r:${l.releaseId}` : `t:${l.sourceId}:${l.tag}:${l.taskId}`;

/**
 * Memvalidasi form catatan beserta tautan dan action item. Tanggal kosong = hari ini (Asia/Jakarta).
 * Keberadaan aplikasi, release, task, dan pengguna diperiksa terpisah di server.
 */
export function parseNoteForm(fd: FormData, now: Date = new Date()): NoteParseResult {
  const errors: NoteFieldErrors = {};

  const title = text(fd, "title").trim();
  if (!title) errors.title = "Enter a title.";
  else if (title.length > LIMITS.title) errors.title = `The title can be at most ${LIMITS.title} characters.`;
  else if (HAS_LINE_CONTROL.test(title)) errors.title = "The title contains characters that are not allowed.";

  const rawDate = text(fd, "noteDate").trim();
  const noteDate = rawDate || todayWib(now);
  if (!isValidDate(noteDate)) errors.noteDate = "Enter a valid date.";

  const rawKind = text(fd, "kind").trim() || "meeting";
  if (!isNoteKind(rawKind)) errors.kind = "Choose Meeting, Decision, or General.";

  const body = text(fd, "body").replace(/\r\n/g, "\n");
  if (body.length > LIMITS.body) errors.body = `The note can be at most ${LIMITS.body.toLocaleString("en")} characters.`;
  else if (HAS_CONTROL.test(body)) errors.body = "The note contains characters that are not allowed.";

  const follow = optionalUuid(text(fd, "followsUpId"));
  if (follow === false) errors.title ??= "The note to follow up is not valid.";

  // Tautan
  const links: LinkInput[] = [];
  const linkRows = linkIndexes(fd);
  const seen = new Set<string>();
  if (linkRows.length > LIMITS.links) errors.links = `A note can have at most ${LIMITS.links} links.`;
  for (const i of linkRows) {
    const kind = text(fd, linkField(i, "kind")).trim() as LinkKind;
    const sourceId = optionalUuid(text(fd, linkField(i, "sourceId")));
    const releaseId = optionalUuid(text(fd, linkField(i, "releaseId")));
    const tag = text(fd, linkField(i, "tag")).trim();
    const taskId = text(fd, linkField(i, "taskId")).trim();
    let link: LinkInput | null = null;
    let err: string | undefined;
    if (kind === "source") {
      if (!sourceId) err = "Choose an application.";
      else link = { kind, sourceId };
    } else if (kind === "release") {
      if (!releaseId) err = "Choose a release.";
      else link = { kind, releaseId };
    } else if (kind === "task") {
      if (!sourceId) err = "Choose an application.";
      else if (!tag || tag.length > LIMITS.tag || HAS_LINE_CONTROL.test(tag)) err = "Choose a tag.";
      else if (!taskId || taskId.length > LIMITS.taskId || HAS_LINE_CONTROL.test(taskId)) err = "Choose a task.";
      else link = { kind, sourceId, tag, taskId };
    } else {
      err = "Choose what to link.";
    }
    if (link) {
      const key = linkKey(link);
      if (seen.has(key)) err = "This link is already in the list.";
      seen.add(key);
    }
    if (err) (errors.linkItems ??= {})[i] = err;
    else if (link) links.push(link);
  }

  // Action item
  const items: ItemInput[] = [];
  const rows = itemIndexes(fd);
  if (rows.length > LIMITS.items) errors.items = `A note can have at most ${LIMITS.items} action items.`;
  for (const i of rows) {
    const rowErr: Partial<Record<ItemFieldName, string>> = {};
    const id = optionalUuid(text(fd, itemField(i, "id")));
    const itemBody = text(fd, itemField(i, "body")).trim();
    const assigneeId = optionalUuid(text(fd, itemField(i, "assigneeId")));
    const rawDue = text(fd, itemField(i, "dueDate")).trim();
    const carriedFromId = optionalUuid(text(fd, itemField(i, "carriedFromId")));
    const done = ["on", "true", "1"].includes(text(fd, itemField(i, "done")));

    if (!itemBody) rowErr.body = "Describe the action item.";
    else if (itemBody.length > LIMITS.item) rowErr.body = `An action item can be at most ${LIMITS.item} characters.`;
    else if (HAS_LINE_CONTROL.test(itemBody)) rowErr.body = "The action item contains characters that are not allowed.";
    if (assigneeId === false) rowErr.assigneeId = "Choose a person from the list.";
    if (rawDue && !isValidDate(rawDue)) rowErr.dueDate = "Enter a valid date.";

    if (Object.keys(rowErr).length > 0 || id === false || carriedFromId === false) {
      if (Object.keys(rowErr).length === 0) rowErr.body = "This action item is not valid. Reload the page.";
      (errors.itemRows ??= {})[i] = rowErr;
      continue;
    }
    items.push({
      id: id || null,
      body: itemBody,
      assigneeId: assigneeId || null,
      dueDate: rawDue || null,
      done,
      carriedFromId: carriedFromId || null,
    });
  }

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: {
      title,
      noteDate,
      kind: rawKind as NoteKind,
      body,
      followsUpId: follow || null,
      links,
      items,
    },
  };
}

/** Komentar: 1..2000 karakter, teks biasa (baris baru boleh). */
export function validateComment(raw: unknown): TextResult {
  const t = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (!t) return { ok: false, error: "Write a comment." };
  if (t.length > LIMITS.comment) return { ok: false, error: `A comment can be at most ${LIMITS.comment.toLocaleString("en")} characters.` };
  if (HAS_CONTROL.test(t)) return { ok: false, error: "The comment contains characters that are not allowed." };
  return { ok: true, value: t };
}

export type HolidayInput = { date: string; name: string; kind: HolidayKind };
export type HolidayFieldErrors = Partial<Record<"date" | "name" | "kind", string>>;

/** Form libur (admin): tanggal, nama, jenis. */
export function parseHolidayForm(
  fd: FormData,
): { ok: true; value: HolidayInput } | { ok: false; fieldErrors: HolidayFieldErrors } {
  const errors: HolidayFieldErrors = {};
  const date = text(fd, "date").trim();
  if (!isValidDate(date)) errors.date = "Enter a valid date.";
  const name = text(fd, "name").trim();
  if (!name) errors.name = "Enter a name.";
  else if (name.length > LIMITS.holidayName) errors.name = `The name can be at most ${LIMITS.holidayName} characters.`;
  else if (HAS_LINE_CONTROL.test(name)) errors.name = "The name contains characters that are not allowed.";
  const kind = text(fd, "kind").trim();
  if (!isHolidayKind(kind)) errors.kind = "Choose National holiday or Collective leave.";
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return { ok: true, value: { date, name, kind: kind as HolidayKind } };
}
