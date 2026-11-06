import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service role: melewati RLS. HANYA untuk kode server (sinkronisasi, baca token).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
