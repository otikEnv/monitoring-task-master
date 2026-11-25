import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Mengakhiri sesi yang tidak sah lagi (mis. akun dinonaktifkan) lalu ke /login. Dipakai requireUser(): halaman tidak
// bisa menghapus cookie sesi sendiri. Hanya ?reason=disabled yang diteruskan sebagai pesan.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const disabled = request.nextUrl.searchParams.get("reason") === "disabled";
  return NextResponse.redirect(new URL(disabled ? "/login?error=disabled" : "/login", request.nextUrl.origin));
}
