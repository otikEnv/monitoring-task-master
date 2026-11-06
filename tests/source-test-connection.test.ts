import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ProviderError, type FetchFileResult, type ProviderAdapter } from "@/lib/providers/types";
import { runConnectionTest } from "@/lib/sources/test-connection";

const TOKEN = "ghp_TOKEN_UJI_RAHASIA";
const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "echoapp.sanitized.json"), "utf8");
const input = {
  provider: "github" as const,
  repoUrl: "https://github.com/o/r",
  branch: "stg",
  filePath: ".taskmaster/tasks/tasks.json",
  token: TOKEN,
};

function deps(impl: () => Promise<FetchFileResult>) {
  const fetchFile = vi.fn(impl);
  const adapter: ProviderAdapter = { provider: "github", validateRepoUrl: () => null, fetchFile };
  return { fetchFile, deps: { getAdapter: () => adapter } };
}

describe("uji koneksi", () => {
  it("berhasil: melaporkan ukuran, jumlah task per tag, waktu commit, dan kedaluwarsa token", async () => {
    const t = deps(async () => ({
      status: "ok", content: fixture, etag: '"e"',
      lastCommitAt: "2026-11-06T03:52:39Z", tokenExpiresAt: "2027-02-04T09:30:29.000Z",
    }));
    const r = await runConnectionTest(input, t.deps);
    expect(r).toMatchObject({
      ok: true, taskCount: 6, tags: [{ tag: "master", total: 6 }],
      lastCommitAt: "2026-11-06T03:52:39Z", tokenExpiresAt: "2027-02-04T09:30:29.000Z",
    });
    expect(r.ok && r.bytes).toBe(Buffer.byteLength(fixture));
    expect(r.ok && r.warnings).toBeGreaterThan(0); // fixture memuat ID subtask ganda
  });

  it("mengirim isian apa adanya dan TANPA ETag (selalu mengunduh isi)", async () => {
    const t = deps(async () => ({ status: "ok", content: fixture, etag: null, lastCommitAt: null, tokenExpiresAt: null }));
    await runConnectionTest(input, t.deps);
    expect(t.fetchFile).toHaveBeenCalledWith({
      repoUrl: input.repoUrl, branch: "stg", path: ".taskmaster/tasks/tasks.json", token: TOKEN,
    });
  });

  it("file dengan 0 task tetap berhasil dan dilaporkan 0 task (bukan galat)", async () => {
    const t = deps(async () => ({ status: "ok", content: '{"tasks":[]}', etag: null, lastCommitAt: null, tokenExpiresAt: null }));
    expect(await runConnectionTest(input, t.deps)).toMatchObject({ ok: true, taskCount: 0 });
  });

  const kinds = ["unauthorized", "forbidden", "not_found", "rate_limited", "timeout", "network", "server_error", "invalid_url"] as const;
  it.each(kinds)("galat penyedia '%s' diteruskan dengan pesan yang jelas", async (kind) => {
    const t = deps(async () => { throw new ProviderError(kind, `pesan ${kind}`); });
    expect(await runConnectionTest(input, t.deps)).toEqual({ ok: false, kind, message: `pesan ${kind}` });
  });

  it("file ditemukan tetapi bukan tasks.json -> invalid_file dengan penjelasan", async () => {
    const t = deps(async () => ({ status: "ok", content: '{"name":"x"}', etag: null, lastCommitAt: null, tokenExpiresAt: null }));
    const r = await runConnectionTest(input, t.deps);
    expect(r).toMatchObject({ ok: false, kind: "invalid_file" });
    expect(!r.ok && r.message).toMatch(/bukan tasks\.json Taskmaster/);
  });

  it("JSON rusak -> invalid_file", async () => {
    const t = deps(async () => ({ status: "ok", content: "{ rusak", etag: null, lastCommitAt: null, tokenExpiresAt: null }));
    expect(await runConnectionTest(input, t.deps)).toMatchObject({ ok: false, kind: "invalid_file" });
  });

  it("not_modified yang tidak seharusnya terjadi tanpa ETag -> galat, bukan sukses palsu", async () => {
    const t = deps(async () => ({ status: "not_modified", etag: '"e"' }));
    expect(await runConnectionTest(input, t.deps)).toMatchObject({ ok: false });
  });

  it("galat tak terduga: pesan generik, token tidak bocor ke hasil maupun log", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = deps(async () => { throw new Error(`boom ${TOKEN}`); });
    const r = await runConnectionTest(input, t.deps);
    expect(r).toMatchObject({ ok: false, kind: "internal" });
    expect(JSON.stringify(r)).not.toContain(TOKEN);
    expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
    spy.mockRestore();
  });

  it("hasil sukses maupun gagal tidak pernah memuat token", async () => {
    const ok = await runConnectionTest(input, deps(async () => ({ status: "ok", content: fixture, etag: null, lastCommitAt: null, tokenExpiresAt: null })).deps);
    const bad = await runConnectionTest(input, deps(async () => { throw new ProviderError("unauthorized", "Token ditolak (401)."); }).deps);
    expect(JSON.stringify(ok)).not.toContain(TOKEN);
    expect(JSON.stringify(bad)).not.toContain(TOKEN);
  });
});
