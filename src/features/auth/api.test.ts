import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseClient } from "@/lib/supabase/client";

import {
  exchangeCodeFromUrl,
  getSession,
  onAuthStateChange,
  resendConfirmation,
  resetPassword,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from "./api";
import { AuthServiceError, toAuthError } from "./errors";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));

const mockedGetClient = vi.mocked(getSupabaseClient);

function stubClient(auth: Record<string, unknown>): void {
  mockedGetClient.mockReturnValue({ auth } as unknown as SupabaseClient);
}

function authError(message: string, extra: Record<string, unknown> = {}) {
  return { message, name: "AuthError", ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signUp", () => {
  it("reports needsConfirmation=false when confirmation is OFF (session returned)", async () => {
    const signUpMock = vi
      .fn()
      .mockResolvedValue({
        data: { user: { id: "u1" }, session: { access_token: "t" } },
        error: null,
      });
    stubClient({ signUp: signUpMock });

    const result = await signUp({ email: "a@example.com", password: "secret123" });

    expect(result.needsConfirmation).toBe(false);
    expect(signUpMock).toHaveBeenCalledOnce();
  });

  it("reports needsConfirmation=true when confirmation is ON (no session)", async () => {
    const signUpMock = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
    stubClient({ signUp: signUpMock });

    const result = await signUp({ email: "a@example.com", password: "secret123" });

    expect(result.needsConfirmation).toBe(true);
  });

  it("passes timezone and full_name metadata for the handle_new_user trigger", async () => {
    const signUpMock = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
    stubClient({ signUp: signUpMock });

    await signUp({
      email: "a@example.com",
      password: "secret123",
      fullName: "Ada",
      timezone: "Asia/Bishkek",
    });

    expect(signUpMock).toHaveBeenCalledWith({
      email: "a@example.com",
      password: "secret123",
      options: { data: { timezone: "Asia/Bishkek", full_name: "Ada" } },
    });
  });

  it("maps signup failures to AuthServiceError", async () => {
    stubClient({
      signUp: vi.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: authError("User already registered"),
      }),
    });

    await expect(signUp({ email: "a@example.com", password: "secret123" })).rejects.toMatchObject({
      code: "user_already_exists",
    });
  });
});

describe("signIn / signOut", () => {
  it("returns user and session on success", async () => {
    const signInMock = vi.fn().mockResolvedValue({
      data: { user: { id: "u1" }, session: { access_token: "t" } },
      error: null,
    });
    stubClient({ signInWithPassword: signInMock });

    const result = await signIn({ email: "a@example.com", password: "secret123" });

    expect(result.session).toEqual({ access_token: "t" });
    expect(signInMock).toHaveBeenCalledWith({ email: "a@example.com", password: "secret123" });
  });

  it("maps bad credentials without leaking details", async () => {
    stubClient({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: authError("Invalid login credentials", { status: 400 }),
      }),
    });

    await expect(signIn({ email: "a@example.com", password: "wrong" })).rejects.toMatchObject({
      code: "invalid_credentials",
    });
  });

  it("signOut resolves on success and throws a typed error on failure", async () => {
    stubClient({ signOut: vi.fn().mockResolvedValue({ error: null }) });
    await expect(signOut()).resolves.toBeUndefined();

    stubClient({ signOut: vi.fn().mockResolvedValue({ error: authError("boom") }) });
    await expect(signOut()).rejects.toBeInstanceOf(AuthServiceError);
  });
});

describe("recovery flow", () => {
  it("resetPassword forwards redirectTo", async () => {
    const resetMock = vi.fn().mockResolvedValue({ data: {}, error: null });
    stubClient({ resetPasswordForEmail: resetMock });

    await resetPassword("a@example.com", "https://app.example.com/reset");

    expect(resetMock).toHaveBeenCalledWith("a@example.com", {
      redirectTo: "https://app.example.com/reset",
    });
  });

  it("resetPassword defaults to <origin>/reset-password so callers cannot forget it", async () => {
    const resetMock = vi.fn().mockResolvedValue({ data: {}, error: null });
    stubClient({ resetPasswordForEmail: resetMock });

    await resetPassword("a@example.com");

    expect(resetMock).toHaveBeenCalledWith("a@example.com", {
      redirectTo: `${window.location.origin}/reset-password`,
    });
  });

  it("updatePassword sets the new password on the recovery session", async () => {
    const updateMock = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    stubClient({ updateUser: updateMock });

    const result = await updatePassword("new-secret-123");

    expect(updateMock).toHaveBeenCalledWith({ password: "new-secret-123" });
    expect(result.user).toEqual({ id: "u1" });
  });

  it("updatePassword maps a missing session to session_missing", async () => {
    stubClient({
      updateUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: authError("Auth session missing!"),
      }),
    });

    await expect(updatePassword("new-secret-123")).rejects.toMatchObject({
      code: "session_missing",
    });
  });
});

describe("resendConfirmation / getSession / onAuthStateChange", () => {
  it("resends with an explicit redirect", async () => {
    const resendMock = vi.fn().mockResolvedValue({ data: {}, error: null });
    stubClient({ resend: resendMock });

    await resendConfirmation("a@example.com", "https://app.example.com/welcome");

    expect(resendMock).toHaveBeenCalledWith({
      type: "signup",
      email: "a@example.com",
      options: { emailRedirectTo: "https://app.example.com/welcome" },
    });
  });

  it("defaults the confirmation redirect to <origin>/ (not the Site URL)", async () => {
    const resendMock = vi.fn().mockResolvedValue({ data: {}, error: null });
    stubClient({ resend: resendMock });

    await resendConfirmation("a@example.com");

    expect(resendMock).toHaveBeenCalledWith({
      type: "signup",
      email: "a@example.com",
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
  });

  it("getSession returns the session or null", async () => {
    stubClient({ getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) });
    await expect(getSession()).resolves.toBeNull();

    stubClient({
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "t" } },
        error: null,
      }),
    });
    await expect(getSession()).resolves.toEqual({ access_token: "t" });
  });

  it("onAuthStateChange returns an unsubscribe handle", () => {
    const unsubscribe = vi.fn();
    const onChange = vi.fn().mockReturnValue({ data: { subscription: { unsubscribe } } });
    stubClient({ onAuthStateChange: onChange });

    const callback = vi.fn();
    const handle = onAuthStateChange(callback);

    expect(onChange).toHaveBeenCalledWith(callback);
    handle.unsubscribe();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

describe("exchangeCodeFromUrl", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("returns null without calling Supabase when there is no code", async () => {
    const exchangeMock = vi.fn();
    stubClient({ exchangeCodeForSession: exchangeMock });
    window.history.replaceState(null, "", "/sign-in");

    await expect(exchangeCodeFromUrl()).resolves.toBeNull();
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("exchanges a PKCE code and removes it from the URL", async () => {
    const exchangeMock = vi.fn().mockResolvedValue({
      data: { session: { access_token: "t" }, user: { id: "u1" } },
      error: null,
    });
    stubClient({ exchangeCodeForSession: exchangeMock });
    window.history.replaceState(null, "", "/reset-password?code=pkce-code-123");

    const session = await exchangeCodeFromUrl();

    expect(exchangeMock).toHaveBeenCalledWith("pkce-code-123");
    expect(session).toEqual({ access_token: "t" });
    expect(new URL(window.location.href).searchParams.get("code")).toBeNull();
  });

  it("maps an expired/revoked code to session_missing even though status is 401", async () => {
    stubClient({
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        data: { session: null, user: null },
        error: authError("bad_jwt: token is expired", { status: 401 }),
      }),
    });
    window.history.replaceState(null, "", "/?code=stale");

    await expect(exchangeCodeFromUrl()).rejects.toMatchObject({ code: "session_missing" });
  });
});

describe("toAuthError", () => {
  it("passes AuthServiceError through untouched", () => {
    const original = new AuthServiceError("network", "down");
    expect(toAuthError(original)).toBe(original);
  });

  it("maps TypeError to network", () => {
    expect(toAuthError(new TypeError("Failed to fetch")).code).toBe("network");
  });

  it("maps email_not_confirmed, weak passwords, rate limits and unknown", () => {
    expect(toAuthError(authError("Email not confirmed")).code).toBe("email_not_confirmed");
    expect(toAuthError(authError("Password is weak_password")).code).toBe("weak_password");
    expect(toAuthError(authError("Password should be at least 6 characters")).code).toBe(
      "weak_password",
    );
    // A bare "password" must not hijack unrelated messages.
    expect(toAuthError(authError("Cannot update password for this user")).code).toBe("unknown");
    expect(toAuthError(authError("Over request rate limit", { status: 429 })).code).toBe(
      "rate_limited",
    );
    expect(toAuthError(authError("Something odd")).code).toBe("unknown");
    expect(toAuthError(null).code).toBe("unknown");
  });
});
