import { describe, expect, it } from "vitest";
import { getAdapter, ProviderError } from "@/lib/providers";
import { countByStatus, parseTasksFile } from "@/lib/tasks/normalize";

/**
 * Uji langsung ke GitHub (jaringan nyata). Hanya jalan lewat `npm run test:live`, yang memuat
 * .env.local. `npm test` biasa melewatinya karena token tidak ada di environment.
 * Memakai repo echoapp (branch stg) yang sama dengan script agregator.
 */
const TOKEN = process.env.AGG_TOKEN_ECHOAPP;
const REPO = "https://github.com/echoenvisions/echoapp";
const PATH = ".taskmaster/tasks/tasks.json";

describe.skipIf(!TOKEN)("GitHub nyata (echoapp, branch stg)", () => {
  const adapter = getAdapter("github");
  const base = { repoUrl: REPO, branch: "stg", path: PATH, token: TOKEN ?? "" };

  it("mengambil file, ETag, dan waktu commit; hasilnya bisa dinormalisasi", async () => {
    const r = await adapter.fetchFile(base);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;

    expect(r.etag).toBeTruthy();
    expect(r.lastCommitAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    console.log("[live] ukuran", r.content.length, "| ETag", r.etag, "| commit", r.lastCommitAt, "| token kedaluwarsa", r.tokenExpiresAt);

    const parsed = parseTasksFile(r.content);
    const total = parsed.tags.reduce((n, t) => n + countByStatus(t.tasks).total, 0);
    expect(total).toBeGreaterThan(100);
  });

  it("permintaan bersyarat dengan ETag yang sama -> not_modified", async () => {
    const first = await adapter.fetchFile(base);
    if (first.status !== "ok" || !first.etag) throw new Error("ETag tidak tersedia");
    const second = await adapter.fetchFile({ ...base, etag: first.etag });
    expect(second.status).toBe("not_modified");
  });

  it("path salah -> not_found", async () => {
    const err = await adapter.fetchFile({ ...base, path: ".taskmaster/tasks/tidak-ada.json" }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe("not_found");
  });

  it("branch salah -> not_found", async () => {
    const err = await adapter.fetchFile({ ...base, branch: "branch-tidak-ada" }).catch((e) => e);
    expect(err.kind).toBe("not_found");
  });

  it("token palsu -> unauthorized, dan pesan tidak memuat token", async () => {
    const fake = "ghp_palsu1234567890";
    const err = await adapter.fetchFile({ ...base, token: fake }).catch((e) => e);
    expect(err.kind).toBe("unauthorized");
    expect(err.message).not.toContain(fake);
  });
});
