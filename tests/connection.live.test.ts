import { describe, expect, it } from "vitest";
import { runConnectionTest } from "@/lib/sources/test-connection";

/**
 * Uji koneksi terhadap GitHub asli (repo echoapp, branch stg). Hanya lewat `npm run test:live`.
 */
const TOKEN = process.env.AGG_TOKEN_ECHOAPP;
const base = {
  provider: "github" as const,
  repoUrl: "https://github.com/echoenvisions/echoapp",
  branch: "stg",
  filePath: ".taskmaster/tasks/tasks.json",
  token: TOKEN ?? "",
};

describe.skipIf(!TOKEN)("uji koneksi nyata (echoapp)", () => {
  it("berhasil: file ditemukan, jumlah task terbaca, waktu commit dan kedaluwarsa token ada", async () => {
    const r = await runConnectionTest(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.taskCount).toBeGreaterThan(100);
    expect(r.tags[0].tag).toBe("master");
    expect(r.bytes).toBeGreaterThan(100_000);
    expect(r.lastCommitAt).toMatch(/^\d{4}-/);
    expect(r.tokenExpiresAt).toBeTruthy();
    expect(JSON.stringify(r)).not.toContain(TOKEN!);
  });

  it("path salah -> not_found dengan pesan yang menyebut branch dan path", async () => {
    const r = await runConnectionTest({ ...base, filePath: ".taskmaster/tasks/tidak-ada.json" });
    expect(r).toMatchObject({ ok: false, kind: "not_found" });
    expect(!r.ok && r.message).toContain("tidak-ada.json");
  });

  it("branch salah -> not_found", async () => {
    expect(await runConnectionTest({ ...base, branch: "branch-tidak-ada" })).toMatchObject({ ok: false, kind: "not_found" });
  });

  it("repo salah -> not_found", async () => {
    expect(await runConnectionTest({ ...base, repoUrl: "https://github.com/echoenvisions/repo-tidak-ada" })).toMatchObject({ ok: false, kind: "not_found" });
  });

  it("token palsu -> unauthorized, pesan tidak memuat token", async () => {
    const fake = "ghp_palsu1234567890";
    const r = await runConnectionTest({ ...base, token: fake });
    expect(r).toMatchObject({ ok: false, kind: "unauthorized" });
    expect(JSON.stringify(r)).not.toContain(fake);
  });

  it("file yang bukan tasks.json (package.json) -> invalid_file, bukan 0 task", async () => {
    const r = await runConnectionTest({ ...base, filePath: "package.json" });
    expect(r).toMatchObject({ ok: false, kind: "invalid_file" });
  });
});
