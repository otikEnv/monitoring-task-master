export const ARCHIVE_PAGE_SIZE = 10;

export const ARCHIVE_TABS = ["applications", "releases"] as const;
export type ArchiveTab = (typeof ARCHIVE_TABS)[number];

export type ArchiveParams = { tab: ArchiveTab; page: number };

export const DEFAULT_ARCHIVE_PARAMS: ArchiveParams = { tab: "applications", page: 1 };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const MAX_PAGE = 100_000;

/** Parameter URL /archive?tab=&page=; nilai tidak valid diabaikan (bukan galat). */
export function parseArchiveParams(
  raw: Record<string, string | string[] | undefined>,
): ArchiveParams {
  const tab = (ARCHIVE_TABS as readonly string[]).includes(first(raw.tab) ?? "")
    ? (first(raw.tab) as ArchiveTab)
    : DEFAULT_ARCHIVE_PARAMS.tab;
  const pageRaw = first(raw.page) ?? "";
  const page = /^[0-9]{1,6}$/.test(pageRaw) ? Number(pageRaw) : 1;
  return { tab, page: Math.min(Math.max(page, 1), MAX_PAGE) };
}

/** Tautan ke /archive; nilai bawaan tidak ikut dikirim agar URL tetap pendek. */
export function archiveHref(p: Partial<ArchiveParams> = {}): string {
  const q = new URLSearchParams();
  if (p.tab && p.tab !== DEFAULT_ARCHIVE_PARAMS.tab) q.set("tab", p.tab);
  if (p.page && p.page > 1) q.set("page", String(p.page));
  const s = q.toString();
  return s ? `/archive?${s}` : "/archive";
}
