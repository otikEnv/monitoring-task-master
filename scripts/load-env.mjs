// Memuat variabel environment untuk skrip lokal: .env.local dulu, lalu .env.
// Variabel yang sudah ada di environment tidak ditimpa.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

export function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(ROOT, name);
    if (fs.existsSync(file)) {
      process.loadEnvFile(file);
      return name;
    }
  }
  return null;
}
