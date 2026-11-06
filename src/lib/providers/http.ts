import {
  ProviderError,
  type FetchDeps,
  type ProviderErrorKind,
} from "./types";

export const DEFAULT_TIMEOUT_MS = 25_000;
/** Batas ukuran file. File asli sekitar 660 KB; 20 MB sudah sangat longgar. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const LABEL = { github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket" } as const;
export type ProviderLabel = keyof typeof LABEL;

/** Permintaan HTTP dengan batas waktu; galat jaringan diubah menjadi ProviderError. */
export async function request(
  provider: ProviderLabel,
  url: string,
  init: RequestInit,
  deps?: FetchDeps,
): Promise<Response> {
  const doFetch = deps?.fetch ?? fetch;
  try {
    return await doFetch(url, {
      ...init,
      signal: AbortSignal.timeout(deps?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new ProviderError("timeout", `${LABEL[provider]} tidak menjawab dalam batas waktu.`);
    }
    // Pesan asli tidak diteruskan: bisa memuat URL, dan kita tidak ingin membocorkan detail.
    throw new ProviderError("network", `Tidak bisa menjangkau ${LABEL[provider]}.`);
  }
}

export function retryAfterSeconds(res: Response): number | undefined {
  const raw = res.headers.get("retry-after");
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.ceil(n) : undefined;
}

type ErrorContext = { branch: string; path: string };

/** Mengubah respons non-2xx menjadi ProviderError dengan pesan yang jelas. */
export function errorFromResponse(
  provider: ProviderLabel,
  res: Response,
  ctx: ErrorContext,
): ProviderError {
  const name = LABEL[provider];
  const retry = retryAfterSeconds(res);
  // GitHub memberi 403 saat kuota habis; ditandai x-ratelimit-remaining: 0 atau Retry-After.
  const quotaExhausted =
    res.headers.get("x-ratelimit-remaining") === "0" || retry !== undefined;

  const make = (kind: ProviderErrorKind, message: string) =>
    new ProviderError(kind, message, res.status, retry);

  if (res.status === 429 || (res.status === 403 && quotaExhausted)) {
    return make("rate_limited", `Batas permintaan ${name} tercapai; coba lagi nanti.`);
  }
  switch (res.status) {
    case 401:
      return make("unauthorized", "Token ditolak (401): salah, dicabut, atau kedaluwarsa.");
    case 403:
      return make(
        "forbidden",
        `Akses dilarang (403): token tidak punya izin baca ke repo ini di ${name}.`,
      );
    case 404:
      return make(
        "not_found",
        `Tidak ditemukan (404): periksa URL repo, branch "${ctx.branch}", dan path "${ctx.path}". ` +
          "Repo privat yang tidak boleh diakses token juga menghasilkan 404.",
      );
    default:
      if (res.status >= 500) {
        return make("server_error", `${name} sedang bermasalah (HTTP ${res.status}).`);
      }
      return make("unexpected", `${name} menjawab HTTP ${res.status}.`);
  }
}

/** Membaca isi respons dengan batas ukuran. */
export async function readText(provider: ProviderLabel, res: Response): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) {
    throw new ProviderError("too_large", `File terlalu besar (${declared} byte).`);
  }
  const text = await res.text();
  if (Buffer.byteLength(text) > MAX_FILE_BYTES) {
    throw new ProviderError("too_large", `File dari ${LABEL[provider]} terlalu besar.`);
  }
  return text;
}

/** Path di dalam repo: buang awalan "/" dan encode tiap segmen (spasi, "#", dll). */
export function encodePath(path: string): string {
  return path
    .replace(/^\/+/, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

export const cleanPath = (path: string) => path.replace(/^\/+/, "");
