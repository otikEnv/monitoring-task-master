import "server-only";
import {
  cleanPath,
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

/**
 * GitLab.com maupun self-hosted: alamat API diturunkan dari host pada URL repo.
 * Mendukung grup bersarang: https://gitlab.example.com/grup/subgrup/proyek
 */
export function parseGitlabUrl(
  repoUrl: string,
): { apiBase: string; projectPath: string } | null {
  let url: URL;
  try {
    url = new URL(repoUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  // Buang bagian setelah "/-/" (mis. /-/tree/main) dan akhiran .git.
  let p = url.pathname.split("/-/")[0].replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  const segments = p.split("/").filter(Boolean);
  if (segments.length < 2) return null; // minimal grup/proyek
  p = segments.join("/");
  return { apiBase: `${url.origin}/api/v4`, projectPath: p };
}

const authHeaders = (token: string) => ({ "PRIVATE-TOKEN": token });

async function fetchFile(params: FetchFileParams, deps?: FetchDeps): Promise<FetchFileResult> {
  const ref = parseGitlabUrl(params.repoUrl);
  if (!ref) {
    throw new ProviderError(
      "invalid_url",
      "URL repo GitLab tidak valid. Contoh: https://gitlab.com/grup/proyek",
    );
  }
  const project = encodeURIComponent(ref.projectPath);
  const filePath = cleanPath(params.path);
  const ctx = { branch: params.branch, path: filePath };

  const res = await request(
    "gitlab",
    `${ref.apiBase}/projects/${project}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${encodeURIComponent(params.branch)}`,
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
  if (!res.ok) throw errorFromResponse("gitlab", res, ctx);

  const content = await readText("gitlab", res);
  const etag = res.headers.get("etag");

  let lastCommitAt: string | null = null;
  try {
    const cres = await request(
      "gitlab",
      `${ref.apiBase}/projects/${project}/repository/commits?path=${encodeURIComponent(filePath)}&ref_name=${encodeURIComponent(params.branch)}&per_page=1`,
      { headers: authHeaders(params.token) },
      deps,
    );
    if (cres.ok) {
      const list = (await cres.json()) as Array<{ committed_date?: string }>;
      lastCommitAt = list?.[0]?.committed_date ?? null;
    }
  } catch {
    // diabaikan
  }

  // GitLab tidak melaporkan kedaluwarsa token pada respons file.
  return { status: "ok", content, etag, lastCommitAt, tokenExpiresAt: null };
}

export const gitlabAdapter: ProviderAdapter = {
  provider: "gitlab",
  validateRepoUrl: (url) =>
    parseGitlabUrl(url) ? null : "URL repo GitLab tidak valid. Contoh: https://gitlab.com/grup/proyek",
  fetchFile,
};
