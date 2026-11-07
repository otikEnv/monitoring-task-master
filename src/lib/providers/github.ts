import "server-only";
import {
  cleanPath,
  encodePath,
  errorFromResponse,
  readText,
  request,
} from "./http";
import {
  ProviderError,
  type FetchDeps,
  type FetchFileParams,
  type FetchFileResult,
  type ProviderAdapter,
} from "./types";

const API = "https://api.github.com";

export function parseGithubUrl(repoUrl: string): { owner: string; repo: string } | null {
  const m = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i.exec(
    repoUrl.trim(),
  );
  return m ? { owner: m[1], repo: m[2] } : null;
}

/** "2026-12-06 03:52:39 UTC" (format header GitHub) -> ISO 8601. */
function parseTokenExpiry(res: Response): string | null {
  const raw = res.headers.get("github-authentication-token-expiration");
  if (!raw) return null;
  const d = new Date(raw.replace(" UTC", "Z").replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const headers = (token: string, accept: string) => ({
  Accept: accept,
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "monitoring-task-master",
});

async function fetchFile(params: FetchFileParams, deps?: FetchDeps): Promise<FetchFileResult> {
  const ref = parseGithubUrl(params.repoUrl);
  if (!ref) {
    throw new ProviderError("invalid_url", "Invalid GitHub repo URL. Example: https://github.com/owner/repo");
  }
  const { owner, repo } = ref;
  const branch = encodeURIComponent(params.branch);
  const ctx = { branch: params.branch, path: cleanPath(params.path) };

  const res = await request(
    "github",
    `${API}/repos/${owner}/${repo}/contents/${encodePath(params.path)}?ref=${branch}`,
    {
      headers: {
        ...headers(params.token, "application/vnd.github.raw+json"),
        ...(params.etag ? { "If-None-Match": params.etag } : {}),
      },
    },
    deps,
  );

  if (res.status === 304) {
    return { status: "not_modified", etag: params.etag ?? res.headers.get("etag") ?? "" };
  }
  if (!res.ok) throw errorFromResponse("github", res, ctx);

  const content = await readText("github", res);
  const etag = res.headers.get("etag");
  const tokenExpiresAt = parseTokenExpiry(res);

  // Waktu commit terakhir file: best-effort. Kegagalannya tidak menggagalkan pengambilan file.
  let lastCommitAt: string | null = null;
  try {
    const cres = await request(
      "github",
      `${API}/repos/${owner}/${repo}/commits?path=${encodeURIComponent(ctx.path)}&sha=${branch}&per_page=1`,
      { headers: headers(params.token, "application/vnd.github+json") },
      deps,
    );
    if (cres.ok) {
      const list = (await cres.json()) as Array<{ commit?: { committer?: { date?: string } } }>;
      lastCommitAt = list?.[0]?.commit?.committer?.date ?? null;
    }
  } catch {
    // diabaikan
  }

  return { status: "ok", content, etag, lastCommitAt, tokenExpiresAt };
}

export const githubAdapter: ProviderAdapter = {
  provider: "github",
  validateRepoUrl: (url) =>
    parseGithubUrl(url) ? null : "Invalid GitHub repo URL. Example: https://github.com/owner/repo",
  fetchFile,
};
