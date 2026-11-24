// Parameter halaman Notes (PRD-Note.md, Halaman Notes). Semua state di URL. Murni: aman dipakai di klien.
import { isValidDate, UUID } from "@/lib/releases/validate";
import { isNoteKind, type NoteKind } from "./model";

export const NOTES_PAGE_SIZE = 10;
export const MAX_QUERY = 100;

export type NoteListParams = {
  q: string;
  type: NoteKind | null;
  app: string | null;
  from: string | null;
  to: string | null;
  page: number;
};

type RawSearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Membaca searchParams dengan aman: nilai tidak valid diabaikan, tidak melempar galat. */
export function parseNoteListParams(sp: RawSearchParams): NoteListParams {
  const q = (first(sp.q) ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_QUERY);
  const type = first(sp.type);
  const app = first(sp.app)?.trim() ?? "";
  const from = first(sp.from)?.trim() ?? "";
  const to = first(sp.to)?.trim() ?? "";
  const page = first(sp.page);
  return {
    q,
    type: isNoteKind(type) ? type : null,
    app: UUID.test(app) ? app.toLowerCase() : null,
    from: isValidDate(from) ? from : null,
    to: isValidDate(to) ? to : null,
    page: page && /^[0-9]{1,6}$/.test(page) ? Math.max(1, Number(page)) : 1,
  };
}

/** URL pendek: nilai bawaan tidak ditulis. Mengubah filter kembali ke halaman 1 kecuali page diberikan. */
export function notesHref(p: Partial<NoteListParams> = {}): string {
  const s = new URLSearchParams();
  if (p.q) s.set("q", p.q);
  if (p.type) s.set("type", p.type);
  if (p.app) s.set("app", p.app);
  if (p.from) s.set("from", p.from);
  if (p.to) s.set("to", p.to);
  if (p.page && p.page > 1) s.set("page", String(p.page));
  const qs = s.toString();
  return qs ? `/notes?${qs}` : "/notes";
}

export const hasNoteFilters = (p: NoteListParams) => Boolean(p.q || p.type || p.app || p.from || p.to);

/**
 * Pola ILIKE yang mencari teks apa adanya: % _ dan \ di-escape; * dibuang (PostgREST memakai * sebagai wildcard).
 * Hasilnya dibungkus % agar cocok di posisi mana pun.
 */
export function likePattern(q: string): string {
  return `%${q.replace(/\*/g, "").replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Bulan (yyyy-mm) untuk tautan "View in calendar": awal rentang filter, atau tidak ada. */
export function calendarMonthFor(p: NoteListParams): string | null {
  return (p.from ?? p.to)?.slice(0, 7) ?? null;
}
