/** Teks sisa hari menuju target (daysLeft negatif = sudah lewat). */
export function formatDaysLeft(daysLeft: number): string {
  if (daysLeft > 1) return `${daysLeft} days left`;
  if (daysLeft === 1) return "tomorrow";
  if (daysLeft === 0) return "today";
  return `${-daysLeft} ${-daysLeft === 1 ? "day" : "days"} overdue`;
}

/** Rentang task untuk tampilan: "#100–#200". */
export function formatRange(start: number, end: number): string {
  return start === end ? `#${start}` : `#${start}–#${end}`;
}

/** yyyy-mm-dd -> "20 Nov 2026" (tanggal kalender; tidak ada pergeseran zona waktu). */
export function formatYmd(ymd: string | null | undefined): string {
  if (!ymd) return "-";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return "-";
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString("en-GB", {
    timeZone: "UTC", day: "2-digit", month: "short", year: "numeric",
  });
}
