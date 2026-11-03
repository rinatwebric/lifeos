import type { SupabaseClient } from "@supabase/supabase-js";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseClient } from "@/lib/supabase/client";

import { SIGN_IN_COPY, SignInPage } from "./SignInPage";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));

const mockedGetClient = vi.mocked(getSupabaseClient);

function stubAuth(auth: Record<string, unknown>): void {
  mockedGetClient.mockReturnValue({ auth } as unknown as SupabaseClient);
}

function authError(message: string, extra: Record<string, unknown> = {}) {
  return { message, name: "AuthError", ...extra };
}

function renderSignIn(initialState?: Record<string, unknown>) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/sign-in", state: initialState }]}>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/" element={<div>Home</div>} />
        <Route path="/sign-up" element={<div>Sign up</div>} />
        <Route path="/reset-password" element={<div>Reset</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SignInPage", () => {
  it("shows validation errors for empty fields", async () => {
    stubAuth({ signInWithPassword: vi.fn() });
    const user = userEvent.setup();
    renderSignIn();

    await user.click(screen.getByRole("button", { name: SIGN_IN_COPY.submit }));

    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(screen.getByText("Email is required.")).toBeInTheDocument();
  });

  it("maps server failures by code, not by message", async () => {
    stubAuth({
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: {}, error: authError("Invalid login credentials") }),
    });
    const user = userEvent.setup();
    renderSignIn();

    await user.type(screen.getByLabelText(SIGN_IN_COPY.emailLabel), "ada@example.com");
    await user.type(screen.getByLabelText(SIGN_IN_COPY.passwordLabel), "wrong-password");
    await user.click(screen.getByRole("button", { name: SIGN_IN_COPY.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
  });

  it("disables submit while pending and guards double submit", async () => {
    let resolveSignIn!: (value: unknown) => void;
    const signInMock = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => (resolveSignIn = resolve)));
    stubAuth({ signInWithPassword: signInMock });
    const user = userEvent.setup();
    renderSignIn();

    await user.type(screen.getByLabelText(SIGN_IN_COPY.emailLabel), "ada@example.com");
    await user.type(screen.getByLabelText(SIGN_IN_COPY.passwordLabel), "secret123");

    const submit = screen.getByRole("button", { name: SIGN_IN_COPY.submit });
    await user.click(submit);
    // Second click while pending is a no-op: the button is disabled.
    await user.click(submit);

    expect(screen.getByRole("button", { name: SIGN_IN_COPY.submitting })).toBeDisabled();

    resolveSignIn({ data: { user: { id: "u1" }, session: { access_token: "t" } }, error: null });
    expect(await screen.findByText("Home")).toBeInTheDocument();
    expect(signInMock).toHaveBeenCalledTimes(1);
  });

  it("navigates home on success", async () => {
    stubAuth({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: { id: "u1" }, session: { access_token: "t" } },
        error: null,
      }),
    });
    const user = userEvent.setup();
    renderSignIn();

    await user.type(screen.getByLabelText(SIGN_IN_COPY.emailLabel), "ada@example.com");
    await user.type(screen.getByLabelText(SIGN_IN_COPY.passwordLabel), "secret123");
    await user.click(screen.getByRole("button", { name: SIGN_IN_COPY.submit }));

    expect(await screen.findByText("Home")).toBeInTheDocument();
  });

  it("offers resend for unconfirmed emails and confirms the resend", async () => {
    const resendMock = vi.fn().mockResolvedValue({ data: {}, error: null });
    stubAuth({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: {},
        error: authError("Email not confirmed"),
      }),
      resend: resendMock,
    });
    const user = userEvent.setup();
    renderSignIn();

    await user.type(screen.getByLabelText(SIGN_IN_COPY.emailLabel), "ada@example.com");
    await user.type(screen.getByLabelText(SIGN_IN_COPY.passwordLabel), "secret123");
    await user.click(screen.getByRole("button", { name: SIGN_IN_COPY.submit }));

    expect(await screen.findByText(SIGN_IN_COPY.emailNotConfirmed)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: SIGN_IN_COPY.resend }));
    expect(await screen.findByText(SIGN_IN_COPY.resendSent)).toBeInTheDocument();
    expect(resendMock).toHaveBeenCalledWith({
      type: "signup",
      email: "ada@example.com",
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
  });

  it("shows the password-reset success notice from location state", () => {
    stubAuth({ signInWithPassword: vi.fn() });
    renderSignIn({ passwordReset: true });

    expect(screen.getByRole("status")).toHaveTextContent(SIGN_IN_COPY.passwordResetSuccess);
  });

  it("links to sign-up and password reset", () => {
    stubAuth({ signInWithPassword: vi.fn() });
    renderSignIn();

    expect(screen.getByRole("link", { name: SIGN_IN_COPY.signUpLink })).toHaveAttribute(
      "href",
      "/sign-up",
    );
    expect(screen.getByRole("link", { name: SIGN_IN_COPY.resetLink })).toHaveAttribute(
      "href",
      "/reset-password",
    );
  });
});
