// Seeder akun awal (tanpa pendaftaran publik).
// Jalankan: npm run seed:users
// Baca dari .env.local:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD            (wajib)
//   SEED_VIEWER_EMAIL, SEED_VIEWER_PASSWORD          (opsional, keduanya atau tidak sama sekali)
// Idempoten: akun yang sudah ada tidak dibuat ulang dan passwordnya TIDAK diubah
// (kecuali memakai --reset-password). Peran selalu dipastikan sesuai.

import { loadEnv } from "./load-env.mjs";
import { createClient } from "@supabase/supabase-js";

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resetPassword = process.argv.includes("--reset-password");

if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi.");
  process.exit(1);
}

const accounts = [];
const {
  SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD,
  SEED_VIEWER_EMAIL, SEED_VIEWER_PASSWORD,
} = process.env;

if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
  console.error("SEED_ADMIN_EMAIL dan SEED_ADMIN_PASSWORD wajib diisi di .env.local.");
  process.exit(1);
}
accounts.push({ email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD, role: "admin" });

if (SEED_VIEWER_EMAIL || SEED_VIEWER_PASSWORD) {
  if (!SEED_VIEWER_EMAIL || !SEED_VIEWER_PASSWORD) {
    console.error("SEED_VIEWER_EMAIL dan SEED_VIEWER_PASSWORD harus diisi bersamaan.");
    process.exit(1);
  }
  accounts.push({ email: SEED_VIEWER_EMAIL, password: SEED_VIEWER_PASSWORD, role: "viewer" });
}

for (const a of accounts) {
  if (a.password.length < 8) {
    console.error(`Password untuk ${a.email} minimal 8 karakter.`);
    process.exit(1);
  }
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

for (const { email, password, role } of accounts) {
  let user = await findUserByEmail(email);
  let note;

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`Gagal membuat ${email}: ${error.message}`);
    user = data.user;
    note = "dibuat";
  } else if (resetPassword) {
    const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
    if (error) throw new Error(`Gagal reset password ${email}: ${error.message}`);
    note = "sudah ada, password direset";
  } else {
    note = "sudah ada, password tidak diubah";
  }

  // Trigger membuat profil viewer; di sini peran dipastikan sesuai.
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id, role }, { onConflict: "user_id" });
  if (profileError) throw new Error(`Gagal set peran ${email}: ${profileError.message}`);

  console.log(`${role.padEnd(6)} ${email} - ${note}`);
}
console.log("Selesai. Ganti password awal setelah login pertama (menu Ganti password).");
