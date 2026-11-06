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

const API = "https://api.bitbucket.org/2.0";

export function parseBitbucketUrl(
  repoUrl: string,
): { workspace: string; repo: string } | null {
  const m = /^https?:\/\/(?:www\.)?bitbucket\.org\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i.exec(
    repoUrl.trim(),
  );
  return m ? { workspace: m[1], repo: m[2] } : null;
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

async function fetchFile(params: FetchFileParams, deps?: FetchDeps): Promise<FetchFileResult> {
  const ref = parseBitbucketUrl(params.repoUrl);
  if (!ref) {
    throw new ProviderError(
      "invalid_url",
      "URL repo Bitbucket tidak valid. Contoh: https://bitbucket.org/workspace/repo",
    );
  }
  const base = `${API}/repositories/${ref.workspace}/${ref.repo}`;
  const branch = encodeURIComponent(params.branch);
  const filePath = cleanPath(params.path);
  const ctx = { branch: params.branch, path: filePath };

  const res = await request(
    "bitbucket",
    `${base}/src/${branch}/${encodePath(params.path)}`,
    {
      headers: {
        ...authHeaders(params.token),
        ...(params.etag ? { "If-None-Match": params.etag } : {}),
      },
    },
    deps,
  );

  if (res.status === 304) {
    return { status: "not_modified", etag: params.etag ?? res.headers.get("etag") ?? "" };
  }
  if (!res.ok) throw errorFromResponse("bitbucket", res, ctx);

  const content = await readText("bitbucket", res);
  const etag = res.headers.get("etag");

  let lastCommitAt: string | null = null;
  try {
    const cres = await request(
      "bitbucket",
      `${base}/commits/${branch}?path=${encodeURIComponent(filePath)}&pagelen=1`,
      { headers: authHeaders(params.token) },
      deps,
    );
    if (cres.ok) {
      const data = (await cres.json()) as { values?: Array<{ date?: string }> };
      lastCommitAt = data?.values?.[0]?.date ?? null;
    }
  } catch {
    // diabaikan
  }

  return { status: "ok", content, etag, lastCommitAt, tokenExpiresAt: null };
}

export const bitbucketAdapter: ProviderAdapter = {
  provider: "bitbucket",
  validateRepoUrl: (url) =>
    parseBitbucketUrl(url)
      ? null
      : "URL repo Bitbucket tidak valid. Contoh: https://bitbucket.org/workspace/repo",
  fetchFile,
};
