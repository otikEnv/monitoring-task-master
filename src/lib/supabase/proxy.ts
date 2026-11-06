import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rute yang boleh diakses tanpa login.
const PUBLIC_PATHS = ["/login"];

/**
 * Menyegarkan sesi Supabase dan melakukan cek awal (optimistic) login.
 * Ini BUKAN otorisasi final: halaman dan route handler tetap memakai
 * requireUser()/requireAdmin() di src/lib/auth.ts.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims memverifikasi JWT; jangan jalankan kode lain di antara
  // createServerClient dan getClaims.
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims?.sub);
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.includes(pathname);

  // Redirect harus membawa cookie sesi yang baru disegarkan.
  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!loggedIn && !isPublic) {
    // API mengembalikan JSON, bukan HTML hasil redirect.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }
    return redirectTo("/login");
  }

  if (loggedIn && isPublic) {
    return redirectTo("/");
  }

  return response;
}
