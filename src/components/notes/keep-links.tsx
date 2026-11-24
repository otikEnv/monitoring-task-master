import type { NoteLinkRow } from "@/lib/notes/load";
import { linkField } from "@/lib/notes/validate";

/** Tautan yang sudah ada dikirim ulang apa adanya (tautan yang tidak dikirim akan dihapus saat menyimpan). */
export function KeepLinks({ links }: { links: NoteLinkRow[] }) {
  return (
    <>
      {links.map((l, i) => (
        <span key={l.id} hidden>
          <input type="hidden" name={linkField(i, "kind")} value={l.kind} />
          {l.sourceId && <input type="hidden" name={linkField(i, "sourceId")} value={l.sourceId} />}
          {l.releaseId && <input type="hidden" name={linkField(i, "releaseId")} value={l.releaseId} />}
          {l.tag && <input type="hidden" name={linkField(i, "tag")} value={l.tag} />}
          {l.taskId && <input type="hidden" name={linkField(i, "taskId")} value={l.taskId} />}
        </span>
      ))}
    </>
  );
}
