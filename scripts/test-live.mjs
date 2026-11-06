// Menjalankan uji langsung ke penyedia repo dan Supabase (jaringan nyata) dengan token dari .env.local.
// Dipakai lewat:
//   npm run test:live                 semua berkas *.live.test.ts
//   npm run test:live -- trend        hanya berkas yang namanya memuat "trend"
//
// Berkas dijalankan SATU PER SATU (bukan paralel): beberapa uji menghitung data di seluruh database
// (mis. gabungan lintas aplikasi pada halaman Tren), sehingga data uji berkas lain tidak boleh muncul bersamaan.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { loadEnv } from "./load-env.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (!loadEnv()) console.error("Tidak ada .env.local atau .env; uji langsung dilewati.");

const filters = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const r = spawnSync(
  process.execPath,
  [vitest, "run", "--no-file-parallelism", ...(filters.length ? filters.map((f) => `${f}.live`) : [".live.test"])],
  { cwd: root, stdio: "inherit", env: process.env },
);
process.exit(r.status ?? 1);
