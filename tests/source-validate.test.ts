import { describe, expect, it } from "vitest";
import { parseSourceForm } from "@/lib/sources/validate";

const base = {
  name: "Echo App",
  provider: "github",
  repoUrl: "https://github.com/echoenvisions/echoapp",
  branch: "stg",
  filePath: ".taskmaster/tasks/tasks.json",
  token: "github_pat_abcdef123456",
  tokenExpiresAt: "",
};
const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...base, ...over })) fd.set(k, v);
  return fd;
};
const parse = (over: Record<string, string> = {}, requireToken = true) =>
  parseSourceForm(form(over), { requireToken });
const errorsOf = (over: Record<string, string>, requireToken = true) => {
  const r = parse(over, requireToken);
  if (r.ok) throw new Error("seharusnya tidak valid");
  return r.fieldErrors;
};

describe("isian valid", () => {
  it("menghasilkan nilai bersih", () => {
    const r = parse();
    expect(r).toEqual({
      ok: true,
      value: {
        name: "Echo App",
        provider: "github",
        repoUrl: "https://github.com/echoenvisions/echoapp",
        branch: "stg",
        filePath: ".taskmaster/tasks/tasks.json",
        token: "github_pat_abcdef123456",
        tokenExpiresAt: null,
      },
    });
  });

  it("memangkas spasi dan membuang '/' di awal path", () => {
    const r = parse({ name: "  Echo  ", branch: " stg ", filePath: " /dir/tasks.json " });
    expect(r.ok && r.value).toMatchObject({ name: "Echo", branch: "stg", filePath: "dir/tasks.json" });
  });

  it("mendukung ketiga penyedia dengan URL yang sesuai", () => {
    expect(parse({ provider: "gitlab", repoUrl: "https://gitlab.com/grup/sub/proyek" }).ok).toBe(true);
    expect(parse({ provider: "gitlab", repoUrl: "https://git.perusahaan.id/tim/app" }).ok).toBe(true);
    expect(parse({ provider: "bitbucket", repoUrl: "https://bitbucket.org/ws/repo" }).ok).toBe(true);
  });

  it("branch dengan garis miring valid", () => {
    expect(parse({ branch: "release/1.2" }).ok).toBe(true);
  });
});

describe("nama aplikasi", () => {
  it("wajib dan maksimal 100 karakter", () => {
    expect(errorsOf({ name: "   " }).name).toMatch(/wajib/i);
    expect(errorsOf({ name: "x".repeat(101) }).name).toMatch(/100/);
    expect(parse({ name: "x".repeat(100) }).ok).toBe(true);
  });
  it("menolak karakter kontrol", () => {
    expect(errorsOf({ name: "a\u0000b" }).name).toBeTruthy();
  });
});

describe("penyedia dan URL repo", () => {
  it("penyedia harus salah satu dari daftar", () => {
    expect(errorsOf({ provider: "gitea" }).provider).toBeTruthy();
    expect(errorsOf({ provider: "" }).provider).toBeTruthy();
  });
  it("URL harus cocok dengan penyedia yang dipilih", () => {
    expect(errorsOf({ provider: "github", repoUrl: "https://gitlab.com/a/b" }).repoUrl).toMatch(/GitHub/);
    expect(errorsOf({ provider: "bitbucket", repoUrl: "https://github.com/a/b" }).repoUrl).toMatch(/Bitbucket/);
    expect(errorsOf({ repoUrl: "bukan url" }).repoUrl).toBeTruthy();
    expect(errorsOf({ repoUrl: "https://github.com.evil.com/a/b" }).repoUrl).toBeTruthy();
  });
  it("wajib diisi dan dibatasi panjangnya", () => {
    expect(errorsOf({ repoUrl: "" }).repoUrl).toMatch(/wajib/i);
    expect(errorsOf({ repoUrl: "https://github.com/a/" + "b".repeat(600) }).repoUrl).toMatch(/panjang/i);
  });
});

describe("branch dan path", () => {
  it("branch tidak boleh kosong, berspasi, atau terlalu panjang", () => {
    expect(errorsOf({ branch: "" }).branch).toMatch(/wajib/i);
    expect(errorsOf({ branch: "feature x" }).branch).toMatch(/spasi/i);
    expect(errorsOf({ branch: "x".repeat(256) }).branch).toMatch(/panjang/i);
  });
  it("path tidak boleh menunjuk folder, berisi '..', atau memakai backslash", () => {
    expect(errorsOf({ filePath: "" }).filePath).toMatch(/wajib/i);
    expect(errorsOf({ filePath: "dir/" }).filePath).toMatch(/folder/i);
    expect(errorsOf({ filePath: "../rahasia.json" }).filePath).toBeTruthy();
    expect(errorsOf({ filePath: "a/../b.json" }).filePath).toBeTruthy();
    expect(errorsOf({ filePath: "a//b.json" }).filePath).toBeTruthy();
    expect(errorsOf({ filePath: "a\\b.json" }).filePath).toMatch(/garis miring/i);
  });
});

describe("token", () => {
  it("wajib saat membuat sumber baru", () => {
    expect(errorsOf({ token: "" }, true).token).toMatch(/wajib/i);
    expect(errorsOf({ token: "   " }, true).token).toMatch(/wajib/i);
  });
  it("boleh kosong saat mengedit (token tidak diubah -> null)", () => {
    const r = parse({ token: "" }, false);
    expect(r.ok && r.value.token).toBeNull();
  });
  it("menolak token terlalu pendek, terlalu panjang, atau berspasi", () => {
    expect(errorsOf({ token: "abc" }).token).toMatch(/pendek/i);
    expect(errorsOf({ token: "x".repeat(1001) }).token).toMatch(/panjang/i);
    expect(errorsOf({ token: "abcdefgh ijklmnop" }).token).toMatch(/spasi/i);
    expect(errorsOf({ token: "abcdefgh\nijklmnop" }).token).toMatch(/spasi|baris/i);
  });
  it("galat token tidak memuat isi token", () => {
    const secret = "rahasia berspasi 12345";
    expect(JSON.stringify(errorsOf({ token: secret }))).not.toContain("rahasia");
  });
  it("memangkas spasi di tepi token", () => {
    const r = parse({ token: "  github_pat_abcdef123456  " });
    expect(r.ok && r.value.token).toBe("github_pat_abcdef123456");
  });
});

describe("tanggal kedaluwarsa token", () => {
  it("kosong -> null; tanggal valid -> akhir hari UTC", () => {
    expect((parse({ tokenExpiresAt: "" }) as { ok: true; value: { tokenExpiresAt: string | null } }).value.tokenExpiresAt).toBeNull();
    const r = parse({ tokenExpiresAt: "2027-02-04" });
    expect(r.ok && r.value.tokenExpiresAt).toBe("2027-02-04T23:59:59.000Z");
  });
  it("menolak format salah dan tanggal yang tidak ada", () => {
    expect(errorsOf({ tokenExpiresAt: "04/02/2027" }).tokenExpiresAt).toBeTruthy();
    expect(errorsOf({ tokenExpiresAt: "2027-02-30" }).tokenExpiresAt).toBeTruthy();
    expect(errorsOf({ tokenExpiresAt: "2027-13-01" }).tokenExpiresAt).toBeTruthy();
    expect(errorsOf({ tokenExpiresAt: "bukan tanggal" }).tokenExpiresAt).toBeTruthy();
  });
  it("tahun kabisat diterima", () => {
    expect(parse({ tokenExpiresAt: "2028-02-29" }).ok).toBe(true);
    expect(errorsOf({ tokenExpiresAt: "2027-02-29" }).tokenExpiresAt).toBeTruthy();
  });
});

describe("banyak galat sekaligus", () => {
  it("melaporkan semua isian yang salah dalam satu hasil", () => {
    const e = errorsOf({ name: "", branch: "", filePath: "", token: "" });
    expect(Object.keys(e).sort()).toEqual(["branch", "filePath", "name", "token"]);
  });
});
