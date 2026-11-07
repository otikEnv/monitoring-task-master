export type ReleaseInput = {
  sourceId: string;
  tag: string;
  name: string;
  rangeStart: number;
  rangeEnd: number;
  /** yyyy-mm-dd, atau null = pakai tanggal hari ini (WIB) di database. */
  startDate: string | null;
  /** yyyy-mm-dd */
  targetDate: string;
};

export type ReleaseFieldName =
  | "sourceId" | "tag" | "name" | "rangeStart" | "rangeEnd" | "startDate" | "targetDate";
export type ReleaseFieldErrors = Partial<Record<ReleaseFieldName, string>>;

export type ReleaseParseResult =
  | { ok: true; value: ReleaseInput }
  | { ok: false; fieldErrors: ReleaseFieldErrors };

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HAS_CONTROL = /[\u0000-\u001f\u007f]/;
const DIGITS = /^[0-9]{1,15}$/;

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

/** yyyy-mm-dd yang benar-benar ada di kalender (30 Feb ditolak). */
export function isValidDate(ymd: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() + 1 === Number(m[2]) && d.getUTCDate() === Number(m[3]);
}

/** Rentang task dari teks: bilangan bulat positif, maksimal 15 digit. */
export function parseRangeNumber(raw: string): number | null {
  const t = raw.trim();
  if (!DIGITS.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

/** Memvalidasi isian form release. Murni (tanpa jaringan/database). */
export function parseReleaseForm(fd: FormData): ReleaseParseResult {
  const errors: ReleaseFieldErrors = {};

  const sourceId = text(fd, "sourceId").trim().toLowerCase();
  if (!UUID.test(sourceId)) errors.sourceId = "Select an application.";

  const tag = text(fd, "tag").trim();
  if (!tag) errors.tag = "Select a tag.";
  else if (tag.length > 100) errors.tag = "Tag name is too long.";
  else if (HAS_CONTROL.test(tag)) errors.tag = "Tag name contains invalid characters.";

  const name = text(fd, "name").trim();
  if (!name) errors.name = "Release name is required.";
  else if (name.length > 100) errors.name = "Release name must be at most 100 characters.";
  else if (HAS_CONTROL.test(name)) errors.name = "Release name contains invalid characters.";

  const startRaw = text(fd, "rangeStart");
  const endRaw = text(fd, "rangeEnd");
  const rangeStart = parseRangeNumber(startRaw);
  const rangeEnd = parseRangeNumber(endRaw);
  if (rangeStart === null) {
    errors.rangeStart = startRaw.trim() === "" ? "Start task is required." : "Start task must be a positive whole number (at most 15 digits).";
  }
  if (rangeEnd === null) {
    errors.rangeEnd = endRaw.trim() === "" ? "End task is required." : "End task must be a positive whole number (at most 15 digits).";
  }
  if (rangeStart !== null && rangeEnd !== null && rangeStart > rangeEnd) {
    errors.rangeEnd = "End task cannot be smaller than the start task.";
  }

  const targetDate = text(fd, "targetDate").trim();
  if (!targetDate) errors.targetDate = "Target date is required.";
  else if (!isValidDate(targetDate)) errors.targetDate = "Target date is not valid.";

  const startDateRaw = text(fd, "startDate").trim();
  let startDate: string | null = null;
  if (startDateRaw) {
    if (!isValidDate(startDateRaw)) errors.startDate = "Start date is not valid.";
    else startDate = startDateRaw;
  }
  // yyyy-mm-dd dapat dibandingkan sebagai teks.
  if (startDate && targetDate && isValidDate(targetDate) && startDate > targetDate) {
    errors.startDate = "Start date cannot be after the target date.";
  }

  if (Object.keys(errors).length > 0 || rangeStart === null || rangeEnd === null) {
    return { ok: false, fieldErrors: errors };
  }
  return { ok: true, value: { sourceId, tag, name, rangeStart, rangeEnd, startDate, targetDate } };
}
