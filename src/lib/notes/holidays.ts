import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HolidayKind } from "./model";

/** Satu tanggal libur nasional atau cuti bersama. */
export type Holiday = { id: string; date: string; name: string; kind: HolidayKind };

type Row = { id: string; holiday_date: string; name: string; kind: HolidayKind };
const toHoliday = (r: Row): Holiday => ({ id: r.id, date: r.holiday_date, name: r.name, kind: r.kind });

/** Libur dalam rentang tanggal (inklusif), urut tanggal. Klien HARUS membawa sesi pengguna (RLS berlaku). */
export async function loadHolidays(db: SupabaseClient, from: string, to: string): Promise<Holiday[]> {
  const { data, error } = await db
    .from("holidays")
    .select("id, holiday_date, name, kind")
    .gte("holiday_date", from)
    .lte("holiday_date", to)
    .order("holiday_date", { ascending: true });
  if (error) throw new Error(`Gagal membaca libur: ${error.message}`);
  return (data as Row[]).map(toHoliday);
}

/** Libur satu tahun penuh. */
export function loadHolidaysForYear(db: SupabaseClient, year: number): Promise<Holiday[]> {
  return loadHolidays(db, `${year}-01-01`, `${year}-12-31`);
}

/** Tahun-tahun yang punya data libur (untuk pemberitahuan "belum diisi"), di antara tahun yang diminta. */
export async function yearsWithHolidays(db: SupabaseClient, years: number[]): Promise<Set<number>> {
  const uniq = [...new Set(years)].sort();
  if (uniq.length === 0) return new Set();
  const { data, error } = await db
    .from("holidays")
    .select("holiday_date")
    .gte("holiday_date", `${uniq[0]}-01-01`)
    .lte("holiday_date", `${uniq[uniq.length - 1]}-12-31`);
  if (error) throw new Error(`Gagal membaca libur: ${error.message}`);
  return new Set((data as { holiday_date: string }[]).map((r) => Number(r.holiday_date.slice(0, 4))));
}
