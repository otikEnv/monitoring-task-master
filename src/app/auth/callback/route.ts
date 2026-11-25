import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail } from "@/lib/auth-domain";
import { createClient } from "@/lib/supabase/server";

// Tujuan Google/Supabase setelah login. Selalu berakhir di "/" atau "/login" (tanpa parameter next,
// agar tidak ada open redirect).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const to = (path: string) => NextResponse.redirect(new URL(path, origin));

  // Supabase mengembalikan ?error=... bila pembuatan akun gagal (mis. trigger domain menolak email).
  if (searchParams.get("error")) {
    const description = searchParams.get("error_description") ?? "";
    return to(/database error saving new user/i.test(description) ? "/login?error=domain" : "/login?error=oauth");
  }

  const code = searchParams.get("code");
  if (!code) return to("/login?error=oauth");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return to("/login?error=oauth");

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user || !isAllowedEmail(user.email) || !user.email_confirmed_at) {
    await supabase.auth.signOut();
    return to("/login?error=domain");
  }

  // Akun yang dinonaktifkan superadmin (RLS: pengguna membaca profilnya sendiri).
  const { data: profile } = await supabase.from("profiles").select("disabled_at").eq("user_id", user.id).maybeSingle();
  if (profile?.disabled_at) {
    await supabase.auth.signOut();
    return to("/login?error=disabled");
  }

  return to("/");
}
