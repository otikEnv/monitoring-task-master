import { UUID } from "./validate";

/** Parameter halaman Daftar release; semua state hidup di URL (bisa dibagikan, dan Dashboard menautkannya). */
export type ReleaseListParams = {
  source: string | null;
  /** Tampilkan juga release yang sudah rilis. */
  showReleased: boolean;
};

type RawSearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Membaca searchParams dengan aman: nilai tidak valid diabaikan, tidak melempar galat. */
export function parseReleaseListParams(sp: RawSearchParams): ReleaseListParams {
  const source = first(sp.source)?.trim() ?? "";
  return {
    source: UUID.test(source) ? source.toLowerCase() : null,
    showReleased: first(sp.rilis) === "1",
  };
}

/** URL pendek: nilai bawaan tidak ditulis. */
export function releaseListHref(p: Partial<ReleaseListParams> = {}): string {
  const q = new URLSearchParams();
  if (p.source) q.set("source", p.source);
  if (p.showReleased) q.set("rilis", "1");
  const qs = q.toString();
  return qs ? `/release?${qs}` : "/release";
}
