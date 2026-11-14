export type ComponentInput = {
  sourceId: string;
  tag: string;
  rangeStart: number;
  rangeEnd: number;
};

export type ReleaseInput = {
  name: string;
  /** yyyy-mm-dd, atau null = pakai tanggal hari ini (WIB) di database. */
  startDate: string | null;
  /** yyyy-mm-dd */
  targetDate: string;
  /** 1..MAX_COMPONENTS, urut seperti di form. */
  components: ComponentInput[];
};

export const MAX_COMPONENTS = 10;

export type ComponentFieldName = "sourceId" | "tag" | "rangeStart" | "rangeEnd";
export type ComponentFieldErrors = Partial<Record<ComponentFieldName, string>>;

export type ReleaseFieldErrors = {
  name?: string;
  startDate?: string;
  targetDate?: string;
  /** Galat umum daftar komponen (kosong atau terlalu banyak). */
  components?: string;
  /** Galat per baris komponen; kunci = nomor baris pada form (components[N].…). */
  items?: Record<number, ComponentFieldErrors>;
};

export type ReleaseParseResult =
  | { ok: true; value: ReleaseInput }
  | { ok: false; fieldErrors: ReleaseFieldErrors };

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HAS_CONTROL = /[\u0000-\u001f\u007f]/;
const DIGITS = /^[0-9]{1,15}$/;
const COMPONENT_KEY = /^components\[(\d{1,3})\]\.(sourceId|tag|rangeStart|rangeEnd)$/;

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

/** Nama field form untuk satu isian komponen. */
export const componentField = (index: number, name: ComponentFieldName) => `components[${index}].${name}`;

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

/** Nomor baris komponen yang ada pada form, urut naik. */
function componentIndexes(fd: FormData): number[] {
  const set = new Set<number>();
  for (const key of fd.keys()) {
    const m = COMPONENT_KEY.exec(key);
    if (m) set.add(Number(m[1]));
  }
  return [...set].sort((a, b) => a - b);
}

/** Memvalidasi isian form release beserta komponennya. Murni (tanpa jaringan/database). */
export function parseReleaseForm(fd: FormData): ReleaseParseResult {
  const errors: ReleaseFieldErrors = {};
  const items: Record<number, ComponentFieldErrors> = {};
  const itemError = (i: number, field: ComponentFieldName, message: string) => {
    (items[i] ??= {})[field] = message;
  };

  const name = text(fd, "name").trim();
  if (!name) errors.name = "Release name is required.";
  else if (name.length > 100) errors.name = "Release name must be at most 100 characters.";
  else if (HAS_CONTROL.test(name)) errors.name = "Release name contains invalid characters.";

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

  const indexes = componentIndexes(fd);
  const components: ComponentInput[] = [];
  if (indexes.length === 0) {
    errors.components = "Add at least one component.";
  } else if (indexes.length > MAX_COMPONENTS) {
    errors.components = `A release can have at most ${MAX_COMPONENTS} components.`;
  } else {
    const seen = new Map<string, number>();
    for (const i of indexes) {
      const sourceId = text(fd, componentField(i, "sourceId")).trim().toLowerCase();
      if (!UUID.test(sourceId)) itemError(i, "sourceId", "Select an application.");

      const tag = text(fd, componentField(i, "tag")).trim();
      if (!tag) itemError(i, "tag", "Select a tag.");
      else if (tag.length > 100) itemError(i, "tag", "Tag name is too long.");
      else if (HAS_CONTROL.test(tag)) itemError(i, "tag", "Tag name contains invalid characters.");

      const startRaw = text(fd, componentField(i, "rangeStart"));
      const endRaw = text(fd, componentField(i, "rangeEnd"));
      const rangeStart = parseRangeNumber(startRaw);
      const rangeEnd = parseRangeNumber(endRaw);
      if (rangeStart === null) {
        itemError(i, "rangeStart", startRaw.trim() === "" ? "Start task is required." : "Start task must be a positive whole number (at most 15 digits).");
      }
      if (rangeEnd === null) {
        itemError(i, "rangeEnd", endRaw.trim() === "" ? "End task is required." : "End task must be a positive whole number (at most 15 digits).");
      }
      if (rangeStart !== null && rangeEnd !== null && rangeStart > rangeEnd) {
        itemError(i, "rangeEnd", "End task cannot be smaller than the start task.");
      }

      // Pasangan (aplikasi, tag) yang sama tidak boleh dipakai dua kali; baris berikutnya yang ditandai.
      if (UUID.test(sourceId) && tag && !items[i]?.sourceId && !items[i]?.tag) {
        const key = `${sourceId}\u0000${tag}`;
        if (seen.has(key)) itemError(i, "tag", "This application and tag are already used in another component.");
        else seen.set(key, i);
      }

      if (rangeStart !== null && rangeEnd !== null) components.push({ sourceId, tag, rangeStart, rangeEnd });
    }
  }

  if (Object.keys(items).length > 0) errors.items = items;
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return { ok: true, value: { name, startDate, targetDate, components } };
}
