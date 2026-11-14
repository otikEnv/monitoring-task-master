import { beforeEach, describe, expect, it, vi } from "vitest";

class Redirected extends Error {
  constructor(public to: string) { super(`redirect:${to}`); }
}

const m = vi.hoisted(() => ({
  createClient: vi.fn(),
  signInWithOAuth: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw new Redirected(to); },
}));
vi.mock("next/headers", () => ({ headers: m.headers }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.createClient }));

import { loginWithGoogle } from "@/app/login/actions";

function hdrs(values: Record<string, string>) {
  return { get: (k: string) => values[k.toLowerCase()] ?? null };
}

async function run() {
  try {
    await loginWithGoogle();
  } catch (e) {
    if (e instanceof Redirected) return e.to;
    throw e;
  }
  throw new Error("tidak redirect");
}

describe("loginWithGoogle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.createClient.mockResolvedValue({ auth: { signInWithOAuth: m.signInWithOAuth } });
    m.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com/o/oauth2/v2/auth?x=1" }, error: null });
  });

  it("memulai OAuth Google dengan callback dan petunjuk domain", async () => {
    m.headers.mockResolvedValue(hdrs({ host: "localhost:3000" }));
    expect(await run()).toBe("https://accounts.google.com/o/oauth2/v2/auth?x=1");
    expect(m.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "http://localhost:3000/auth/callback", queryParams: { hd: "envisions.app" } },
    });
  });

  it("memakai header forwarded (Vercel) dan https", async () => {
    m.headers.mockResolvedValue(hdrs({ host: "internal", "x-forwarded-host": "monitoring-task-master.vercel.app", "x-forwarded-proto": "https" }));
    await run();
    expect(m.signInWithOAuth.mock.calls[0][0].options.redirectTo).toBe("https://monitoring-task-master.vercel.app/auth/callback");
  });

  it("host non-lokal tanpa x-forwarded-proto memakai https", async () => {
    m.headers.mockResolvedValue(hdrs({ host: "app.example.com" }));
    await run();
    expect(m.signInWithOAuth.mock.calls[0][0].options.redirectTo).toBe("https://app.example.com/auth/callback");
  });

  it("galat dari Supabase kembali ke /login?error=oauth", async () => {
    m.headers.mockResolvedValue(hdrs({ host: "localhost:3000" }));
    m.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: new Error("provider disabled") });
    expect(await run()).toBe("/login?error=oauth");
  });

  it("tanpa url dari Supabase juga kembali ke /login?error=oauth", async () => {
    m.headers.mockResolvedValue(hdrs({ host: "localhost:3000" }));
    m.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });
    expect(await run()).toBe("/login?error=oauth");
  });
});
