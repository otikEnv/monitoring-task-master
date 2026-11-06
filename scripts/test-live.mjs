// Menjalankan uji langsung ke penyedia repo (jaringan nyata) dengan token dari .env.local.
// Dipakai lewat: npm run test:live
import { spawnSync } from "node:child_process";
import path from "node:path";
import { loadEnv } from "./load-env.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (!loadEnv()) console.error("Tidak ada .env.local atau .env; uji langsung dilewati.");

const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const r = spawnSync(process.execPath, [vitest, "run", "tests/providers.live.test.ts"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
