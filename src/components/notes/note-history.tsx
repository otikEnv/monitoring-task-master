import Link from "next/link";
import { EmptyState } from "@/components/layout/notices";
import { formatDateTime } from "@/lib/format";
import { changedFields, diffLines } from "@/lib/notes/diff";
import { NOTE_KIND_LABEL } from "@/lib/notes/model";
import type { NoteRow, RevisionRow } from "@/lib/notes/load";
import { formatYmd } from "@/lib/releases/format";
import { cn } from "@/lib/utils";

type Version = { title: string; noteDate: string; kind: NoteRow["kind"]; body: string };

/**
 * Riwayat edit: setiap baris riwayat adalah versi SEBELUM satu kali edit (waktu dan penyunting = edit itu).
 * Memilih satu baris menampilkan perbedaan versi itu dengan versi sesudahnya (versi lebih baru atau isi sekarang).
 */
export function NoteHistory({
  note, revisions, selected,
}: { note: NoteRow; revisions: RevisionRow[]; selected: number | null }) {
  if (revisions.length === 0) {
    return <EmptyState title="No edits yet">This note has not been changed since it was created.</EmptyState>;
  }

  // revisions terbaru di atas; versi "sesudah" revisions[i] adalah revisions[i-1], atau isi sekarang untuk i = 0.
  const after = (i: number): Version => (i === 0 ? note : revisions[i - 1]);
  const index = Math.max(0, revisions.findIndex((r) => r.id === selected));
  const before = revisions[index];
  const next = after(index);
  const fields = changedFields(before, next);
  const lines = diffLines(before.body, next.body);

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <nav aria-label="Versions">
        <ol className="space-y-1">
          {revisions.map((r, i) => {
            const changed = changedFields(r, after(i));
            const active = i === index;
            return (
              <li key={r.id}>
                <Link
                  href={`/notes/${note.id}/history?v=${r.id}`}
                  aria-current={active ? "true" : undefined}
                  className={cn("block rounded-lg border p-3 text-sm hover:bg-muted", active && "border-primary bg-muted")}
                >
                  <span className="block font-medium">{formatDateTime(r.createdAt)}</span>
                  <span className="block break-all text-xs text-muted-foreground">{r.editedByEmail}</span>
                  <span className="block text-xs text-muted-foreground">
                    Changed {changed.length > 0 ? changed.join(", ") : "nothing"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      <section aria-label="Changes" className="min-w-0 space-y-4 rounded-xl border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          Edited {formatDateTime(before.createdAt)} by <span className="break-all">{before.editedByEmail}</span>.
          Showing what changed in this edit.
        </p>

        {fields.includes("title") && <Change label="Title" from={before.title} to={next.title} />}
        {fields.includes("date") && <Change label="Date" from={formatYmd(before.noteDate)} to={formatYmd(next.noteDate)} />}
        {fields.includes("type") && <Change label="Type" from={NOTE_KIND_LABEL[before.kind]} to={NOTE_KIND_LABEL[next.kind]} />}

        {fields.includes("content") ? (
          <div className="space-y-1.5">
            <h2 className="text-sm font-medium">Content</h2>
            <pre className="max-h-[32rem] overflow-auto rounded-lg border text-xs leading-relaxed">
              {lines.map((l, k) => (
                <div
                  key={k}
                  className={cn(
                    "whitespace-pre-wrap break-words px-3",
                    l.type === "added" && "bg-green-100 text-green-950 dark:bg-green-950 dark:text-green-100",
                    l.type === "removed" && "bg-red-100 text-red-950 line-through decoration-red-400 dark:bg-red-950 dark:text-red-100",
                  )}
                >
                  <span aria-hidden="true" className="select-none pr-2 text-muted-foreground">
                    {l.type === "added" ? "+" : l.type === "removed" ? "-" : " "}
                  </span>
                  <span className="sr-only">{l.type === "added" ? "Added: " : l.type === "removed" ? "Removed: " : ""}</span>
                  {l.text || " "}
                </div>
              ))}
            </pre>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">The content did not change in this edit.</p>
        )}
      </section>
    </div>
  );
}

function Change({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <div className="space-y-1 text-sm">
      <h2 className="font-medium">{label}</h2>
      <p className="break-words">
        <del className="text-muted-foreground">{from}</del> <span aria-label="changed to">→</span> <ins className="no-underline">{to}</ins>
      </p>
    </div>
  );
}
