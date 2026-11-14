import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  createClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: m.createClient }));

import { GET } from "@/app/auth/callback/route";
import { isAllowedEmail } from "@/lib/auth-domain";

const BASE = "http://localhost:3000";

async function call(query: string) {
  const res = await GET(new NextRequest(`${BASE}/auth/callback${query}`));
  return new URL(res.headers.get("location")!);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.createClient.mockResolvedValue({
      auth: { exchangeCodeForSession: m.exchangeCodeForSession, getUser: m.getUser, signOut: m.signOut },
    });
    m.exchangeCodeForSession.mockResolvedValue({ error: null });
    m.signOut.mockResolvedValue({ error: null });
    m.getUser.mockResolvedValue({ data: { user: { email: "dev@envisions.app", email_confirmed_at: "2026-11-14T00:00:00Z" } } });
  });

  it("sukses: menukar kode lalu ke /", async () => {
    const to = await call("?code=abc");
    expect(m.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(to.origin + to.pathname + to.search).toBe(`${BASE}/`);
    expect(m.signOut).not.toHaveBeenCalled();
  });

  it("tanpa code: /login?error=oauth tanpa menyentuh Supabase", async () => {
    const to = await call("");
    expect(to.pathname + to.search).toBe("/login?error=oauth");
    expect(m.createClient).not.toHaveBeenCalled();
  });

  it("gagal menukar kode: /login?error=oauth", async () => {
    m.exchangeCodeForSession.mockResolvedValue({ error: new Error("bad code") });
    const to = await call("?code=abc");
    expect(to.pathname + to.search).toBe("/login?error=oauth");
    expect(m.signOut).not.toHaveBeenCalled();
  });

  it("domain salah: keluar dan /login?error=domain", async () => {
    m.getUser.mockResolvedValue({ data: { user: { email: "orang@gmail.com", email_confirmed_at: "2026-11-14T00:00:00Z" } } });
    const to = await call("?code=abc");
    expect(m.signOut).toHaveBeenCalled();
    expect(to.pathname + to.search).toBe("/login?error=domain");
  });

  it("email belum terverifikasi: keluar dan /login?error=domain", async () => {
    m.getUser.mockResolvedValue({ data: { user: { email: "dev@envisions.app", email_confirmed_at: null } } });
    const to = await call("?code=abc");
    expect(m.signOut).toHaveBeenCalled();
    expect(to.pathname + to.search).toBe("/login?error=domain");
  });

  it("tanpa user setelah pertukaran: keluar dan /login?error=domain", async () => {
    m.getUser.mockResolvedValue({ data: { user: null } });
    const to = await call("?code=abc");
    expect(to.pathname + to.search).toBe("/login?error=domain");
  });

  it("trigger database menolak akun baru: /login?error=domain", async () => {
    const to = await call("?error=server_error&error_description=Database+error+saving+new+user");
    expect(to.pathname + to.search).toBe("/login?error=domain");
    expect(m.createClient).not.toHaveBeenCalled();
  });

  it("galat OAuth lain (mis. akses ditolak): /login?error=oauth", async () => {
    const to = await call("?error=access_denied&error_description=User+denied+access");
    expect(to.pathname + to.search).toBe("/login?error=oauth");
  });

  it("tidak pernah mengarahkan ke host lain", async () => {
    const to = await call("?code=abc&next=https://evil.example");
    expect(to.origin).toBe(BASE);
  });
});

describe("isAllowedEmail", () => {
  it.each([
    ["dev@envisions.app", true],
    ["Dev@ENVISIONS.APP", true],
    ["a.b+c@envisions.app", true],
    ["dev@gmail.com", false],
    ["dev@envisions.app.evil.com", false],
    ["dev@evil-envisions.app", false],
    ["dev@sub.envisions.app", false],
    ["a@b@envisions.app", false],
    [" @envisions.app", false],
    ["@envisions.app", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("%s -> %s", (email, expected) => {
    expect(isAllowedEmail(email as string | null | undefined)).toBe(expected);
  });
});
