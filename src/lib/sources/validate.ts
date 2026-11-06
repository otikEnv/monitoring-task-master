import { getAdapter } from "@/lib/providers";
import { PROVIDERS, type Provider } from "@/lib/providers/types";

export type SourceInput = {
  name: string;
  provider: Provider;
  repoUrl: string;
  branch: string;
  filePath: string;
  /** Token baru dalam teks biasa; null = tidak diubah (hanya sah saat mengedit). */
  token: string | null;
  /** ISO 8601, atau null bila dikosongkan. */
  tokenExpiresAt: string | null;
};

export type FieldName =
  | "name" | "provider" | "repoUrl" | "branch" | "filePath" | "token" | "tokenExpiresAt";
export type FieldErrors = Partial<Record<FieldName, string>>;

export type ParseResult =
  | { ok: true; value: SourceInput }
  | { ok: false; fieldErrors: FieldErrors };

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

const HAS_CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * Memvalidasi isian form sumber. Murni (tanpa jaringan/database).
 * requireToken: true saat membuat sumber baru; false saat mengedit (kosong = token tidak diubah).
 */
export function parseSourceForm(fd: FormData, opts: { requireToken: boolean }): ParseResult {
  const errors: FieldErrors = {};

  const name = text(fd, "name").trim();
  if (!name) errors.name = "Nama aplikasi wajib diisi.";
  else if (name.length > 100) errors.name = "Nama aplikasi maksimal 100 karakter.";
  else if (HAS_CONTROL.test(name)) errors.name = "Nama aplikasi memuat karakter yang tidak valid.";

  const providerRaw = text(fd, "provider");
  const provider = (PROVIDERS as readonly string[]).includes(providerRaw)
    ? (providerRaw as Provider)
    : null;
  if (!provider) errors.provider = "Pilih penyedia repo.";

  const repoUrl = text(fd, "repoUrl").trim();
  if (!repoUrl) errors.repoUrl = "URL repo wajib diisi.";
  else if (repoUrl.length > 500) errors.repoUrl = "URL repo terlalu panjang.";
  else if (provider) {
    const problem = getAdapter(provider).validateRepoUrl(repoUrl);
    if (problem) errors.repoUrl = problem;
  }

  const branch = text(fd, "branch").trim();
  if (!branch) errors.branch = "Branch wajib diisi.";
  else if (branch.length > 255) errors.branch = "Nama branch terlalu panjang.";
  else if (/\s/.test(branch) || HAS_CONTROL.test(branch)) {
    errors.branch = "Nama branch tidak boleh memuat spasi atau karakter kontrol.";
  }

  const filePath = text(fd, "filePath").trim().replace(/^\/+/, "");
  if (!filePath) errors.filePath = "Path file wajib diisi.";
  else if (filePath.length > 500) errors.filePath = "Path file terlalu panjang.";
  else if (filePath.endsWith("/")) errors.filePath = "Path harus menunjuk ke file, bukan folder.";
  else if (filePath.includes("\\")) errors.filePath = "Gunakan garis miring (/) pada path.";
  else if (HAS_CONTROL.test(filePath)) errors.filePath = "Path memuat karakter yang tidak valid.";
  else if (filePath.split("/").some((s) => s === ".." || s === "." || s === "")) {
    errors.filePath = "Path tidak boleh memuat segmen kosong, '.' atau '..'.";
  }

  const tokenRaw = text(fd, "token").trim();
  let token: string | null = null;
  if (tokenRaw === "") {
    if (opts.requireToken) errors.token = "Token wajib diisi.";
  } else if (tokenRaw.length < 8) {
    errors.token = "Token terlalu pendek.";
  } else if (tokenRaw.length > 1000) {
    errors.token = "Token terlalu panjang.";
  } else if (/\s/.test(tokenRaw)) {
    errors.token = "Token tidak boleh memuat spasi atau baris baru.";
  } else {
    token = tokenRaw;
  }

  const expRaw = text(fd, "tokenExpiresAt").trim();
  let tokenExpiresAt: string | null = null;
  if (expRaw) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expRaw);
    // Akhir hari menurut WIB (UTC+7), zona yang dipakai di seluruh tampilan: tanggal yang diketik = tanggal yang terlihat.
    const d = m ? new Date(`${expRaw}T23:59:59+07:00`) : null;
    // Date menggeser tanggal tidak valid (30 Feb -> 2 Mar); tolak bila bulan/harinya berubah.
    if (!m || !d || Number.isNaN(d.getTime()) || d.getUTCMonth() + 1 !== Number(m[2]) || d.getUTCDate() !== Number(m[3])) {
      errors.tokenExpiresAt = "Tanggal tidak valid.";
    } else {
      tokenExpiresAt = d.toISOString();
    }
  }

  if (Object.keys(errors).length > 0 || !provider) return { ok: false, fieldErrors: errors };
  return { ok: true, value: { name, provider, repoUrl, branch, filePath, token, tokenExpiresAt } };
}
