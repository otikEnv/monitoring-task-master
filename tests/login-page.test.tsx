import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/login/actions", () => ({ login: vi.fn(), loginWithGoogle: vi.fn() }));

import { GoogleButton } from "@/app/login/google-button";
import { LoginDivider, LoginForm } from "@/app/login/login-form";
import { LoginNotice, loginNoticeMessage } from "@/app/login/login-notice";

describe("halaman login", () => {
  it("form password tetap ada", () => {
    const out = renderToStaticMarkup(<LoginForm />);
    expect(out).toContain('name="email"');
    expect(out).toContain('name="password"');
    expect(out).toContain("Sign in");
  });

  it("tombol Google dan pembatas 'or'", () => {
    const out = renderToStaticMarkup(<GoogleButton />) + renderToStaticMarkup(<LoginDivider />);
    expect(out).toContain("Continue with Google");
    expect(out).toContain('role="separator"');
    expect(out).toMatch(/>or</);
    expect(out).toContain('aria-hidden="true"'); // logo dekoratif
  });
});

describe("pesan galat dari ?error", () => {
  it("oauth dan domain", () => {
    expect(loginNoticeMessage("oauth")).toBe("Google sign-in failed. Try again.");
    expect(loginNoticeMessage("domain")).toBe("Only verified @envisions.app Google accounts can sign in.");
    expect(renderToStaticMarkup(<LoginNotice code="domain" />)).toContain('role="alert"');
  });

  it("nilai lain diabaikan (termasuk kunci prototipe dan array)", () => {
    for (const v of [undefined, "", "foo", "constructor", "__proto__", "toString", ["oauth"]]) {
      expect(loginNoticeMessage(v as string | string[] | undefined)).toBeNull();
    }
    expect(renderToStaticMarkup(<LoginNotice code="foo" />)).toBe("");
  });
});
