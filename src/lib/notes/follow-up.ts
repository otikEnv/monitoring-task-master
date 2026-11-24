// Isi awal form Follow up (PRD-Note.md, Follow up). Murni.
import { LIMITS, isOpenItem, type LinkKind, type NoteKind } from "./model";

type SourceNote = { id: string; title: string; kind: NoteKind };
type SourceLink = { kind: LinkKind; sourceId: string | null; releaseId: string | null; tag: string | null; taskId: string | null };
type SourceItem = { id: string; body: string; assigneeId: string | null; dueDate: string | null; done: boolean; carriedToId: string | null };

export type FollowUpInitial = {
  title: string;
  noteDate: string;
  kind: NoteKind;
  body: string;
  followsUpId: string;
  links: { kind: LinkKind; sourceId: string; releaseId: string; tag: string; taskId: string }[];
  items: { id: string; body: string; assigneeId: string; dueDate: string; done: boolean; carriedFromId: string }[];
};

/** Judul "Follow up: <judul asal>", dipotong agar tetap dalam batas 200 karakter. */
export function followUpTitle(title: string): string {
  const prefix = "Follow up: ";
  const base = title.startsWith(prefix) ? title.slice(prefix.length) : title;
  const full = `${prefix}${base}`;
  return full.length <= LIMITS.title ? full : `${full.slice(0, LIMITS.title - 1).trimEnd()}…`;
}

/**
 * Catatan lanjutan: jenis sama, tanggal hari ini, tautan sama, dan salinan action item yang masih terbuka
 * (belum selesai dan belum pernah dibawa) dengan penanggung jawab dan tenggat yang sama. Isi catatan asal
 * tidak disalin.
 */
export function buildFollowUp(note: SourceNote, links: SourceLink[], items: SourceItem[], today: string): FollowUpInitial {
  return {
    title: followUpTitle(note.title),
    noteDate: today,
    kind: note.kind,
    body: "",
    followsUpId: note.id,
    links: links.map((l) => ({
      kind: l.kind, sourceId: l.sourceId ?? "", releaseId: l.releaseId ?? "", tag: l.tag ?? "", taskId: l.taskId ?? "",
    })),
    items: items.filter(isOpenItem).map((it) => ({
      id: "", body: it.body, assigneeId: it.assigneeId ?? "", dueDate: it.dueDate ?? "", done: false, carriedFromId: it.id,
    })),
  };
}
