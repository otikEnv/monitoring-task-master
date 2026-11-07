import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Enkripsi token repository (AES-256-GCM).
 *
 * Format tersimpan:  v1.<iv>.<ciphertext>.<tag>   (tiap bagian base64url)
 *
 * Kunci: env TOKEN_ENCRYPTION_KEY, 32 byte dalam base64.
 *   Buat: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Aturan pakai:
 *  - Hanya dipanggil dari kode server (sinkronisasi, uji koneksi, simpan sumber).
 *  - Hasil dekripsi tidak boleh dikirim ke browser atau dicatat di log.
 *  - Bila kunci hilang atau diganti, token lama tidak bisa dibuka dan harus diisi ulang.
 */

const VERSION = "v1";
const IV_BYTES = 12; // ukuran IV standar untuk GCM
const KEY_BYTES = 32; // AES-256
const TAG_BYTES = 16;

function loadKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("TOKEN_ENCRYPTION_KEY belum diisi.");
  }
  // Buffer.from(..., "base64") tidak melempar galat untuk input rusak,
  // jadi validasi bentuknya dulu.
  const compact = raw.trim();
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) {
    throw new Error("TOKEN_ENCRYPTION_KEY bukan base64 yang valid.");
  }
  const key = Buffer.from(compact, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY harus ${KEY_BYTES} byte (base64), saat ini ${key.length} byte.`,
    );
  }
  return key;
}

const b64 = (buf: Buffer) => buf.toString("base64url");

/** Mengenkripsi token. IV acak baru dipakai tiap panggilan. */
export function encryptToken(plaintext: string): string {
  if (!plaintext) {
    throw new Error("Token kosong tidak bisa dienkripsi.");
  }
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: TAG_BYTES,
  });
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [VERSION, b64(iv), b64(ciphertext), b64(tag)].join(".");
}

/**
 * Mendekripsi token. Melempar galat bila format salah, data diubah, atau kunci tidak cocok.
 * Pesan galat sengaja generik agar tidak membocorkan detail.
 */
export function decryptToken(stored: string): string {
  const key = loadKey();

  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Format token terenkripsi tidak dikenali.");
  }
  const [, ivB64, ctB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, "base64url");
  const ciphertext = Buffer.from(ctB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Format token terenkripsi tidak dikenali.");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "The token could not be decrypted (corrupted data or a different key). Re-enter the source token.",
    );
  }
}
