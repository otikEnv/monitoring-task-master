import { beforeEach, describe, expect, it, vi } from "vitest";

const ID = "22222222-2222-4222-8222-222222222222";

class Denied extends Error {}

const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  setSourceArchived: vi.fn(),
  setReleaseArchived: vi.fn(),
  countOpenReleasesForSource: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: m.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("@/lib/sources/repo", () => {
  class SourceNotFoundError extends Error {}
  return { SourceNotFoundError, setSourceArchived: m.setSourceArchived };
});
vi.mock("@/lib/releases/repo", () => {
  class ReleaseNotFoundError extends Error {}
  return {
    ReleaseNotFoundError, setReleaseArchived: m.setReleaseArchived, countOpenReleasesForSource: m.countOpenReleasesForSource,
  };
});

import {
  archiveRelease, archiveSource, restoreRelease, restoreSource, sourceArchiveImpact,
} from "@/app/archive/actions";
import { ReleaseNotFoundError } from "@/lib/releases/repo";
import { SourceNotFoundError } from "@/lib/sources/repo";

const touching = () => [m.setSourceArchived, m.setReleaseArchived, m.countOpenReleasesForSource];

beforeEach(() => {
  vi.resetAllMocks();
  m.requireAdmin.mockResolvedValue({ id: "u1", email: "a@envisions.app", role: "admin" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("otorisasi: hanya admin", () => {
  const calls: Array<[string, () => Promise<unknown>]> = [
    ["archiveSource", () => archiveSource(ID)],
    ["restoreSource", () => restoreSource(ID)],
    ["archiveRelease", () => archiveRelease(ID)],
    ["restoreRelease", () => restoreRelease(ID)],
    ["sourceArchiveImpact", () => sourceArchiveImpact(ID)],
  ];

  it.each(calls)("%s: bukan admin -> ditolak sebelum menyentuh data", async (_name, call) => {
    m.requireAdmin.mockRejectedValue(new Denied());
    await expect(call()).rejects.toBeInstanceOf(Denied);
    for (const fn of touching()) expect(fn).not.toHaveBeenCalled();
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(calls)("%s: requireAdmin dipanggil sebelum apa pun", async (_name, call) => {
    await call();
    expect(m.requireAdmin).toHaveBeenCalledTimes(1);
  });
});

describe("aplikasi", () => {
  it("archive dan restore memakai id huruf kecil dan menyegarkan semua tampilan terkait", async () => {
    expect(await archiveSource(ID.toUpperCase())).toEqual({ ok: true });
    expect(m.setSourceArchived).toHaveBeenCalledWith(ID, true);
    expect(await restoreSource(ID)).toEqual({ ok: true });
    expect(m.setSourceArchived).toHaveBeenLastCalledWith(ID, false);
    for (const p of ["/", "/release", "/tasks", "/tren", "/archive", "/pengaturan/sumber"]) {
      expect(m.revalidatePath).toHaveBeenCalledWith(p);
    }
  });

  it("id tidak valid ditolak tanpa menyentuh data", async () => {
    for (const bad of ["", "x", "bukan-uuid", `${ID}; drop`]) {
      expect(await archiveSource(bad)).toEqual({ ok: false, error: "Invalid application ID." });
      expect(await restoreSource(bad)).toEqual({ ok: false, error: "Invalid application ID." });
    }
    expect(m.setSourceArchived).not.toHaveBeenCalled();
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("aplikasi tidak ditemukan: pesan jelas, tanpa menyegarkan tampilan", async () => {
    m.setSourceArchived.mockRejectedValue(new SourceNotFoundError());
    expect(await archiveSource(ID)).toEqual({ ok: false, error: "Application not found." });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("galat tak terduga tidak membocorkan pesan asli", async () => {
    m.setSourceArchived.mockRejectedValue(new Error("password authentication failed for user postgres"));
    const a = await archiveSource(ID);
    const r = await restoreSource(ID);
    expect(a).toEqual({ ok: false, error: "Could not archive the application." });
    expect(r).toEqual({ ok: false, error: "Could not restore the application." });
    expect(JSON.stringify([a, r])).not.toContain("password");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("password");
  });
});

describe("release", () => {
  it("archive dan restore menyegarkan daftar dan halaman detail release itu", async () => {
    expect(await archiveRelease(ID)).toEqual({ ok: true });
    expect(m.setReleaseArchived).toHaveBeenCalledWith(ID, true);
    expect(await restoreRelease(ID)).toEqual({ ok: true });
    expect(m.setReleaseArchived).toHaveBeenLastCalledWith(ID, false);
    for (const p of ["/", "/release", "/archive", `/release/${ID}`]) expect(m.revalidatePath).toHaveBeenCalledWith(p);
  });

  it("id tidak valid dan tidak ditemukan", async () => {
    expect(await archiveRelease("x")).toEqual({ ok: false, error: "Invalid release ID." });
    expect(await restoreRelease("x")).toEqual({ ok: false, error: "Invalid release ID." });
    expect(m.setReleaseArchived).not.toHaveBeenCalled();
    m.setReleaseArchived.mockRejectedValue(new ReleaseNotFoundError());
    expect(await archiveRelease(ID)).toEqual({ ok: false, error: "Release not found." });
  });

  it("galat tak terduga tidak membocorkan pesan asli", async () => {
    m.setReleaseArchived.mockRejectedValue(new Error("rahasia internal"));
    expect(await archiveRelease(ID)).toEqual({ ok: false, error: "Could not archive the release." });
    expect(await restoreRelease(ID)).toEqual({ ok: false, error: "Could not restore the release." });
  });
});

describe("sourceArchiveImpact", () => {
  it("mengembalikan jumlah release berjalan yang memakai aplikasi", async () => {
    m.countOpenReleasesForSource.mockResolvedValue(3);
    expect(await sourceArchiveImpact(ID)).toEqual({ ok: true, openReleases: 3 });
    expect(m.countOpenReleasesForSource).toHaveBeenCalledWith(ID);
  });

  it("id tidak valid dan galat database", async () => {
    expect(await sourceArchiveImpact("x")).toEqual({ ok: false, error: "Invalid application ID." });
    expect(m.countOpenReleasesForSource).not.toHaveBeenCalled();
    m.countOpenReleasesForSource.mockRejectedValue(new Error("detail internal"));
    const r = await sourceArchiveImpact(ID);
    expect(r).toEqual({ ok: false, error: "Could not check the releases that use this application." });
    expect(JSON.stringify(r)).not.toContain("internal");
  });
});
