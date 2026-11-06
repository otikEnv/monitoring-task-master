/**
 * Segmen dinamis pada halaman (page.tsx) Next.js diberikan dalam bentuk MASIH ter-encode
 * (mis. "a%20b", "1%2F2"), berbeda dengan Route Handler yang sudah ter-decode. Fungsi ini
 * mendecode tepat satu kali.
 *
 * Mengembalikan null bila urutan persen rusak (mis. "%E0%A4%A"): itu bukan URL yang valid
 * (nilai asli yang memuat "%" selalu dikirim sebagai "%25"), jadi pemanggil sebaiknya
 * menampilkan "tidak ditemukan" dan bukan menebak.
 */
export function decodeSegment(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}
