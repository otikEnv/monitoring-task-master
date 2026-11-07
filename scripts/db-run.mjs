// Menjalankan satu berkas SQL ke database Supabase (migrasi atau uji SQL).
//   npm run db:run -- supabase/migrations/20261107040000_releases.sql
//   npm run db:run -- supabase/tests/releases_test.sql
//
// Koneksi: POSTGRES_URL_NON_POOLING (atau SUPABASE_DB_URL) dari .env.local. Berkas dijalankan
// sebagai satu skrip; NOTICE dari server (mis. 'UJI ... LOLOS') dicetak. Migrasi TIDAK idempoten
// dan tidak dicatat di mana pun: jalankan setiap migrasi sekali saja.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { loadEnv } from "./load-env.mjs";

loadEnv();
const file = process.argv[2];
if (!file) {
  console.error("Pemakaian: npm run db:run -- <berkas.sql>");
  process.exit(2);
}
const url = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL_NON_POOLING;
if (!url) {
  console.error("Isi POSTGRES_URL_NON_POOLING (atau SUPABASE_DB_URL) di .env.local.");
  process.exit(2);
}

const sql = fs.readFileSync(path.resolve(file), "utf8");
// Hapus parameter sslmode dari URL; SSL diatur eksplisit di bawah (sertifikat Supabase ditandatangani CA sendiri).
const conn = new URL(url);
conn.searchParams.delete("sslmode");
const client = new pg.Client({ connectionString: conn.toString(), ssl: { rejectUnauthorized: false } });
client.on("notice", (n) => console.log(`NOTICE: ${n.message}`));

try {
  await client.connect();
  await client.query(sql);
  console.log(`OK: ${file}`);
} catch (e) {
  console.error(`GAGAL: ${file}\n${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
