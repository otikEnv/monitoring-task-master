// Teks "Copy" catatan untuk ditempel di WhatsApp atau Slack (PRD-Note.md, Salin untuk dibagikan). Murni.
import { formatYmd } from "@/lib/releases/format";
import { NOTE_KIND_LABEL, type NoteKind } from "./model";

export type ShareItem = { body: string; done: boolean; assigneeEmail: string | null; dueDate: string | null };

/**
 * Markdown -> teks biasa yang tetap enak dibaca di chat: tebal menjadi *tebal*, judul menjadi baris tebal,
 * daftar dipertahankan, tautan menjadi "teks (url)", gambar menjadi keterangan, blok kode dan kutipan apa adanya.
 */
export function markdownToChat(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let inCode = false;
  const out: string[] = [];
  for (const raw of lines) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(raw);
      continue;
    }
    let line = raw;
    const heading = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) line = heading[1] ? `*${heading[1].replace(/\*\*|__/g, "")}*` : "";
    line = line
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, alt: string) => (alt ? `[image: ${alt}]` : "[image]"))
      .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, t: string, u: string) => (t === u ? u : `${t} (${u})`))
      .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "*$2*")
      .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "~$1~")
      .replace(/^(\s*)[*+]\s+/, "$1- ")
      .replace(/^(\s*)- \[( |x|X)\]\s+/, (_m, sp: string, c: string) => `${sp}${c === " " ? "☐" : "☑"} `);
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Teks lengkap untuk clipboard: judul, jenis, tanggal, isi, action item, tautan. Komentar tidak ikut. */
export function buildShareText(input: {
  title: string;
  kind: NoteKind;
  noteDate: string;
  body: string;
  items: ShareItem[];
  url: string;
}): string {
  const parts = [`*${input.title}*`, `${NOTE_KIND_LABEL[input.kind]} · ${formatYmd(input.noteDate)}`];
  const body = markdownToChat(input.body);
  if (body) parts.push(body);
  if (input.items.length > 0) {
    const rows = input.items.map((it) => {
      const meta = [it.assigneeEmail, it.dueDate ? `due ${formatYmd(it.dueDate)}` : null].filter(Boolean).join(", ");
      return `${it.done ? "☑" : "☐"} ${it.body}${meta ? ` (${meta})` : ""}`;
    });
    parts.push(["*Action items*", ...rows].join("\n"));
  }
  parts.push(input.url);
  return parts.join("\n\n");
}
