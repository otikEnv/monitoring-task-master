import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/auth";
import { syncSource } from "@/lib/sync/sync-source";

// Satu permintaan = satu sumber, supaya tidak melewati batas waktu fungsi Vercel.
// "Segarkan semua" dilakukan klien dengan memanggil endpoint ini paralel per sumber.
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/sync/[sourceId]
 * Boleh dipanggil semua pengguna yang sudah login (tombol Segarkan di dashboard).
 * Respons 200 memuat hasil per sumber, termasuk status "failed" (kegagalan sumber bukan galat server).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const auth = await authorizeApi("viewer");
  if ("error" in auth) return auth.error;

  const { sourceId } = await params;
  if (!UUID.test(sourceId)) {
    return NextResponse.json({ error: "ID sumber tidak valid" }, { status: 400 });
  }

  try {
    const result = await syncSource(sourceId);
    const status = result.status === "not_found" ? 404 : result.status === "skipped" ? 409 : 200;
    return NextResponse.json(result, { status });
  } catch (e) {
    // Hanya terjadi bila penyimpanan tidak bisa dihubungi. Jangan bocorkan detail ke klien.
    console.error("[sync] route gagal", { sourceId, error: (e as Error)?.name });
    return NextResponse.json({ error: "Layanan penyimpanan tidak tersedia" }, { status: 503 });
  }
}
