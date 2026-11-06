import { describe, expect, it, vi } from "vitest";
import { getAdapter, ProviderError, PROVIDERS, type Provider } from "@/lib/providers";
import { parseBitbucketUrl } from "@/lib/providers/bitbucket";
import { parseGithubUrl } from "@/lib/providers/github";
import { parseGitlabUrl } from "@/lib/providers/gitlab";

const TOKEN = "tok_SANGAT_RAHASIA_123";
const CONTENT = '{"master":{"tasks":[]}}';

type Call = { url: string; headers: Record<string, string> };
type Handler = (url: string, n: number) => Response | Promise<Response>;

/** fetch tiruan yang merekam setiap permintaan. */
function mockFetch(handler: Handler) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: { ...(init?.headers as Record<string, string>) } });
    return handler(url, calls.length);
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const res = (body: string | null, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers });

// Satu konfigurasi per penyedia: URL repo, penanda URL permintaan utama vs commit, bentuk balasan commit.
const CASES: Array<{
  provider: Provider;
  repoUrl: string;
  isCommitCall: (url: string) => boolean;
  commitBody: string;
  commitDate: string;
  authHeader: string;
  authValue: string;
}> = [
  {
    provider: "github",
    repoUrl: "https://github.com/echoenvisions/echoapp",
    isCommitCall: (u) => u.includes("/commits?"),
    commitBody: JSON.stringify([{ commit: { committer: { date: "2026-11-06T03:52:39Z" } } }]),
    commitDate: "2026-11-06T03:52:39Z",
    authHeader: "Authorization",
    authValue: `Bearer ${TOKEN}`,
  },
  {
    provider: "gitlab",
    repoUrl: "https://gitlab.com/grup/proyek",
    isCommitCall: (u) => u.includes("/repository/commits?"),
    commitBody: JSON.stringify([{ committed_date: "2026-11-05T10:00:00.000+07:00" }]),
    commitDate: "2026-11-05T10:00:00.000+07:00",
    authHeader: "PRIVATE-TOKEN",
    authValue: TOKEN,
  },
  {
    provider: "bitbucket",
    repoUrl: "https://bitbucket.org/ws/repo",
    isCommitCall: (u) => u.includes("/commits/"),
    commitBody: JSON.stringify({ values: [{ date: "2026-11-04T08:30:00+00:00" }] }),
    commitDate: "2026-11-04T08:30:00+00:00",
    authHeader: "Authorization",
    authValue: `Bearer ${TOKEN}`,
  },
];

const params = (repoUrl: string, extra: Record<string, unknown> = {}) => ({
  repoUrl,
  branch: "stg",
  path: ".taskmaster/tasks/tasks.json",
  token: TOKEN,
  ...extra,
});

async function failure(promise: Promise<unknown>): Promise<ProviderError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(ProviderError);
    return e as ProviderError;
  }
  throw new Error("seharusnya melempar ProviderError");
}

describe.each(CASES)("adapter $provider (kontrak yang sama)", (c) => {
  const adapter = getAdapter(c.provider);
  const run = (handler: Handler, extra: Record<string, unknown> = {}) => {
    const m = mockFetch(handler);
    return { m, promise: adapter.fetchFile(params(c.repoUrl, extra), { fetch: m.fetch }) };
  };
  const okHandler =
    (headers: Record<string, string> = {}): Handler =>
    (url) =>
      c.isCommitCall(url) ? res(c.commitBody) : res(CONTENT, 200, { etag: '"abc123"', ...headers });

  it("200: mengembalikan isi, ETag, dan waktu commit terakhir", async () => {
    const { promise } = run(okHandler());
    expect(await promise).toMatchObject({
      status: "ok",
      content: CONTENT,
      etag: '"abc123"',
      lastCommitAt: c.commitDate,
    });
  });

  it("mengirim token lewat header yang benar", async () => {
    const { m, promise } = run(okHandler());
    await promise;
    expect(m.calls[0].headers[c.authHeader]).toBe(c.authValue);
  });

  it("meminta isi file dari alamat yang benar untuk branch dan path tersebut", async () => {
    const { m, promise } = run(okHandler());
    await promise;
    const main = m.calls[0].url;
    expect(main).toContain(".taskmaster");
    expect(main).toContain("stg");
  });

  it("mengirim If-None-Match bila ada ETag; 304 menjadi not_modified tanpa unduhan", async () => {
    const { m, promise } = run(() => res(null, 304), { etag: '"abc123"' });
    expect(await promise).toEqual({ status: "not_modified", etag: '"abc123"' });
    expect(m.calls).toHaveLength(1); // tidak ada permintaan commit saat tidak berubah
    expect(m.calls[0].headers["If-None-Match"]).toBe('"abc123"');
  });

  it("tidak mengirim If-None-Match bila tidak ada ETag", async () => {
    const { m, promise } = run(okHandler());
    await promise;
    expect(m.calls[0].headers["If-None-Match"]).toBeUndefined();
  });

  it("gagal mengambil waktu commit tidak menggagalkan pengambilan file", async () => {
    const { promise } = run((url) => (c.isCommitCall(url) ? res("rusak", 500) : res(CONTENT)));
    expect(await promise).toMatchObject({ status: "ok", content: CONTENT, lastCommitAt: null });
  });

  it("permintaan commit yang melempar galat juga diabaikan", async () => {
    const { promise } = run((url) => {
      if (c.isCommitCall(url)) throw new Error("jaringan putus");
      return res(CONTENT);
    });
    expect(await promise).toMatchObject({ status: "ok", lastCommitAt: null });
  });

  describe("pemetaan galat", () => {
    const cases: Array<[string, Response, string]> = [
      ["401 -> unauthorized", res("{}", 401), "unauthorized"],
      ["403 -> forbidden", res("{}", 403), "forbidden"],
      ["404 -> not_found", res("{}", 404), "not_found"],
      ["429 -> rate_limited", res("{}", 429, { "retry-after": "30" }), "rate_limited"],
      ["403 + x-ratelimit-remaining:0 -> rate_limited", res("{}", 403, { "x-ratelimit-remaining": "0" }), "rate_limited"],
      ["500 -> server_error", res("{}", 500), "server_error"],
      ["503 -> server_error", res("{}", 503), "server_error"],
      ["418 -> unexpected", res("{}", 418), "unexpected"],
    ];
    it.each(cases)("%s", async (_name, response, kind) => {
      const { promise } = run(() => response.clone());
      const err = await failure(promise);
      expect(err.kind).toBe(kind);
      expect(err.message).not.toContain(TOKEN);
    });

    it("429 membawa Retry-After dalam detik", async () => {
      const { promise } = run(() => res("{}", 429, { "retry-after": "30" }));
      expect((await failure(promise)).retryAfterSeconds).toBe(30);
    });

    it("404 menyebut branch dan path agar mudah diperbaiki", async () => {
      const { promise } = run(() => res("{}", 404));
      const err = await failure(promise);
      expect(err.message).toContain('"stg"');
      expect(err.message).toContain(".taskmaster/tasks/tasks.json");
    });

    it("jaringan putus -> network, pesan tidak membocorkan token atau detail asli", async () => {
      const { promise } = run(() => {
        throw new Error(`connect ECONNREFUSED dengan ${TOKEN}`);
      });
      const err = await failure(promise);
      expect(err.kind).toBe("network");
      expect(err.message).not.toContain(TOKEN);
      expect(err.message).not.toContain("ECONNREFUSED");
    });

    it("melewati batas waktu -> timeout", async () => {
      const { promise } = run(() => {
        throw new DOMException("The operation timed out", "TimeoutError");
      });
      expect((await failure(promise)).kind).toBe("timeout");
    });

    it("file terlalu besar (content-length) -> too_large", async () => {
      const { promise } = run(() => res(CONTENT, 200, { "content-length": String(50 * 1024 * 1024) }));
      expect((await failure(promise)).kind).toBe("too_large");
    });
  });

  it("URL repo tidak valid -> invalid_url tanpa memanggil jaringan", async () => {
    const m = mockFetch(() => res(CONTENT));
    const err = await failure(adapter.fetchFile(params("bukan-url"), { fetch: m.fetch }));
    expect(err.kind).toBe("invalid_url");
    expect(m.calls).toHaveLength(0);
    expect(adapter.validateRepoUrl("bukan-url")).toMatch(/tidak valid/i);
    expect(adapter.validateRepoUrl(c.repoUrl)).toBeNull();
  });
});

describe("GitHub", () => {
  const adapter = getAdapter("github");

  it("memakai contents API dengan header Accept raw dan ref=branch", async () => {
    const m = mockFetch((url) => (url.includes("/commits?") ? res("[]") : res(CONTENT)));
    await adapter.fetchFile(params("https://github.com/echoenvisions/echoapp"), { fetch: m.fetch });
    expect(m.calls[0].url).toBe(
      "https://api.github.com/repos/echoenvisions/echoapp/contents/.taskmaster/tasks/tasks.json?ref=stg",
    );
    expect(m.calls[0].headers.Accept).toBe("application/vnd.github.raw+json");
  });

  it("meng-encode path dan branch yang mengandung spasi atau garis miring", async () => {
    const m = mockFetch(() => res(CONTENT));
    await adapter.fetchFile(
      { ...params("https://github.com/o/r"), branch: "feature/x y", path: "/dir satu/tasks #1.json" },
      { fetch: m.fetch },
    );
    expect(m.calls[0].url).toBe(
      "https://api.github.com/repos/o/r/contents/dir%20satu/tasks%20%231.json?ref=feature%2Fx%20y",
    );
  });

  it("membaca tanggal kedaluwarsa token dari header GitHub", async () => {
    const m = mockFetch((url) =>
      url.includes("/commits?")
        ? res("[]")
        : res(CONTENT, 200, { "github-authentication-token-expiration": "2026-12-06 03:52:39 UTC" }),
    );
    const r = await adapter.fetchFile(params("https://github.com/o/r"), { fetch: m.fetch });
    expect(r).toMatchObject({ tokenExpiresAt: "2026-12-06T03:52:39.000Z" });
  });

  it("tokenExpiresAt null bila header tidak ada atau tidak valid", async () => {
    const headerSets: Array<Record<string, string>> = [
      {},
      { "github-authentication-token-expiration": "bukan tanggal" },
    ];
    for (const h of headerSets) {
      const m = mockFetch((url) => (url.includes("/commits?") ? res("[]") : res(CONTENT, 200, h)));
      const r = await adapter.fetchFile(params("https://github.com/o/r"), { fetch: m.fetch });
      expect(r).toMatchObject({ tokenExpiresAt: null });
    }
  });
});

describe("GitLab", () => {
  const adapter = getAdapter("gitlab");

  it("path file di-encode sebagai satu segmen (%2F) dan proyek memakai path penuh", async () => {
    const m = mockFetch((url) => (url.includes("/commits?") ? res("[]") : res(CONTENT)));
    await adapter.fetchFile(params("https://gitlab.com/grup/subgrup/proyek.git"), { fetch: m.fetch });
    expect(m.calls[0].url).toBe(
      "https://gitlab.com/api/v4/projects/grup%2Fsubgrup%2Fproyek/repository/files/.taskmaster%2Ftasks%2Ftasks.json/raw?ref=stg",
    );
  });

  it("mendukung GitLab self-hosted: alamat API diturunkan dari host", async () => {
    const m = mockFetch(() => res(CONTENT));
    await adapter.fetchFile(params("https://git.perusahaan.id/tim/app"), { fetch: m.fetch });
    expect(m.calls[0].url.startsWith("https://git.perusahaan.id/api/v4/projects/tim%2Fapp/")).toBe(true);
  });
});

describe("Bitbucket", () => {
  const adapter = getAdapter("bitbucket");

  it("memakai endpoint src dengan branch dan path ter-encode", async () => {
    const m = mockFetch(() => res(CONTENT));
    await adapter.fetchFile(
      { ...params("https://bitbucket.org/ws/repo"), branch: "feature/x" },
      { fetch: m.fetch },
    );
    expect(m.calls[0].url).toBe(
      "https://api.bitbucket.org/2.0/repositories/ws/repo/src/feature%2Fx/.taskmaster/tasks/tasks.json",
    );
  });
});

describe("parser URL repo", () => {
  it("GitHub: variasi yang valid", () => {
    for (const u of [
      "https://github.com/o/r",
      "https://github.com/o/r/",
      "https://github.com/o/r.git",
      "http://github.com/o/r",
      "https://www.github.com/o/r",
      "  https://github.com/o/r  ",
    ]) {
      expect(parseGithubUrl(u)).toEqual({ owner: "o", repo: "r" });
    }
  });

  it("GitHub: yang tidak valid", () => {
    for (const u of [
      "", "o/r", "https://github.com/o", "https://github.com/o/r/tree/main",
      "https://gitlab.com/o/r", "https://github.com.evil.com/o/r", "git@github.com:o/r.git",
    ]) {
      expect(parseGithubUrl(u)).toBeNull();
    }
  });

  it("GitLab: grup bersarang, .git, dan bagian /-/ dibuang", () => {
    expect(parseGitlabUrl("https://gitlab.com/a/b")).toEqual({ apiBase: "https://gitlab.com/api/v4", projectPath: "a/b" });
    expect(parseGitlabUrl("https://gitlab.com/a/b/c/d.git")).toEqual({ apiBase: "https://gitlab.com/api/v4", projectPath: "a/b/c/d" });
    expect(parseGitlabUrl("https://gitlab.com/a/b/-/tree/main/x")).toEqual({ apiBase: "https://gitlab.com/api/v4", projectPath: "a/b" });
  });

  it("GitLab: yang tidak valid", () => {
    for (const u of ["", "bukan url", "https://gitlab.com/hanya-satu", "ftp://gitlab.com/a/b"]) {
      expect(parseGitlabUrl(u)).toBeNull();
    }
  });

  it("Bitbucket: valid dan tidak valid", () => {
    expect(parseBitbucketUrl("https://bitbucket.org/ws/repo.git")).toEqual({ workspace: "ws", repo: "repo" });
    expect(parseBitbucketUrl("https://bitbucket.org/ws")).toBeNull();
    expect(parseBitbucketUrl("https://github.com/ws/repo")).toBeNull();
  });
});

describe("registry", () => {
  it("setiap penyedia di PROVIDERS punya adapter dengan kontrak yang sama", () => {
    for (const p of PROVIDERS) {
      const a = getAdapter(p);
      expect(a.provider).toBe(p);
      expect(typeof a.fetchFile).toBe("function");
      expect(typeof a.validateRepoUrl).toBe("function");
    }
  });

  it("penyedia yang tidak dikenal melempar galat", () => {
    expect(() => getAdapter("gitea" as Provider)).toThrow(/tidak didukung/);
  });
});
