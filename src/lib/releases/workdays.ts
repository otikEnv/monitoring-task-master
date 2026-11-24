// Hari kerja untuk perhitungan waktu release (PRD-Note.md, Hari kerja pada release). Murni.
//
// Hari kerja = Senin sampai Jumat yang bukan libur nasional dan bukan cuti bersama. Semua tanggal adalah
// tanggal kalender (yyyy-mm-dd) menurut Asia/Jakarta; tidak ada pengaruh zona waktu di sini.

/** Kalender kerja: tanggal libur (libur nasional dan cuti bersama). */
export type WorkCalendar = { holidays: ReadonlySet<string> };

/** Tanpa data libur: hanya Sabtu dan Minggu yang bukan hari kerja. */
export const WEEKENDS_ONLY: WorkCalendar = { holidays: new Set() };

const MS_DAY = 86_400_000;
const toNum = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_DAY);
};
const toYmd = (n: number) => new Date(n * MS_DAY).toISOString().slice(0, 10);

/** 0 = Minggu … 6 = Sabtu (getUTCDay), dari nomor hari sejak epoch (1970-01-01 = Kamis). */
const weekday = (n: number) => ((n % 7) + 7 + 4) % 7;

export function isWorkingDay(ymd: string, cal: WorkCalendar): boolean {
  const wd = weekday(toNum(ymd));
  return wd !== 0 && wd !== 6 && !cal.holidays.has(ymd);
}

/** Jumlah hari kerja dalam (from, to]: setelah `from` sampai dan termasuk `to`. 0 bila to <= from. */
export function workingDaysBetween(from: string, to: string, cal: WorkCalendar): number {
  const a = toNum(from);
  const b = toNum(to);
  if (b <= a) return 0;
  // Minggu penuh: 5 hari kerja per 7 hari, dikurangi libur pada hari kerja di rentang; sisanya dihitung satu per satu.
  const days = b - a;
  const full = Math.floor(days / 7);
  let count = full * 5;
  for (let n = a + full * 7 + 1; n <= b; n++) {
    const wd = weekday(n);
    if (wd !== 0 && wd !== 6) count++;
  }
  for (const h of cal.holidays) {
    const n = toNum(h);
    const wd = weekday(n);
    if (n > a && n <= b && wd !== 0 && wd !== 6) count--;
  }
  return count;
}

/**
 * Waktu release dalam hari kerja.
 *  - elapsedPercent: hari kerja yang lewat sejak tanggal mulai sampai hari ini, dibagi hari kerja dari mulai sampai
 *    target. Rentang tanpa hari kerja memakai aturan rentang nol hari: 100% bila hari ini >= target, selain itu 0%.
 *  - daysLeft: selisih hari KALENDER sampai target (negatif = lewat). Dipakai untuk Overdue, yang tetap
 *    berdasarkan tanggal kalender.
 *  - workingDaysLeft: hari kerja dari besok sampai target (0 bila target sudah lewat atau hari ini).
 */
export function workTimeProgress(
  startDate: string,
  targetDate: string,
  today: string,
  cal: WorkCalendar,
): { elapsedPercent: number; daysLeft: number; workingDaysLeft: number } {
  const total = workingDaysBetween(startDate, targetDate, cal);
  const t = toNum(today);
  const target = toNum(targetDate);
  const start = toNum(startDate);
  let elapsedPercent: number;
  if (total === 0) {
    elapsedPercent = t >= target ? 100 : 0;
  } else if (t <= start) {
    elapsedPercent = 0;
  } else {
    const upto = toYmd(Math.min(t, target));
    elapsedPercent = Math.min(100, (workingDaysBetween(startDate, upto, cal) / total) * 100);
  }
  return {
    elapsedPercent,
    daysLeft: target - t,
    workingDaysLeft: workingDaysBetween(today, targetDate, cal),
  };
}

/** Tahun-tahun yang dicakup rentang tanggal (untuk memeriksa apakah data liburnya sudah diisi). */
export function yearsInRange(from: string, to: string): number[] {
  const out: number[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) out.push(y);
  return out;
}
