import type { SupabaseClient } from "@supabase/supabase-js";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseClient } from "@/lib/supabase/client";

import { SIGN_UP_COPY, SignUpPage } from "./SignUpPage";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));

const mockedGetClient = vi.mocked(getSupabaseClient);

function stubAuth(auth: Record<string, unknown>): void {
  mockedGetClient.mockReturnValue({ auth } as unknown as SupabaseClient);
}

function StateProbe() {
  const location = useLocation();
  return <div data-testid="check-email-state">{JSON.stringify(location.state)}</div>;
}

function renderSignUp() {
  return render(
    <MemoryRouter initialEntries={["/sign-up"]}>
      <Routes>
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/" element={<div>Home</div>} />
        <Route
          path="/check-email"
          element={
            <>
              <div>Check email</div>
              <StateProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SignUpPage", () => {
  it("shows validation errors for invalid input", async () => {
    stubAuth({ signUp: vi.fn() });
    const user = userEvent.setup();
    renderSignUp();

    await user.type(screen.getByLabelText(SIGN_UP_COPY.emailLabel), "not-an-email");
    await user.type(screen.getByLabelText(SIGN_UP_COPY.passwordLabel), "short");
    await user.click(screen.getByRole("button", { name: SIGN_UP_COPY.submit }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 6 characters.")).toBeInTheDocument();
  });

  it("maps failures by code without leaking registration state", async () => {
    stubAuth({
      signUp: vi.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "User already registered", name: "AuthError" },
      }),
    });
    const user = userEvent.setup();
    renderSignUp();

    await user.type(screen.getByLabelText(SIGN_UP_COPY.emailLabel), "ada@example.com");
    await user.type(screen.getByLabelText(SIGN_UP_COPY.passwordLabel), "secret123");
    await user.click(screen.getByRole("button", { name: SIGN_UP_COPY.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "If this email is registered, a confirmation message was sent.",
    );
  });

  it("disables submit while the request is pending", async () => {
    let resolveSignUp!: (value: unknown) => void;
    const signUpMock = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => (resolveSignUp = resolve)));
    stubAuth({ signUp: signUpMock });
    const user = userEvent.setup();
    renderSignUp();

    await user.type(screen.getByLabelText(SIGN_UP_COPY.emailLabel), "ada@example.com");
    await user.type(screen.getByLabelText(SIGN_UP_COPY.passwordLabel), "secret123");
    await user.click(screen.getByRole("button", { name: SIGN_UP_COPY.submit }));

    expect(screen.getByRole("button", { name: SIGN_UP_COPY.submitting })).toBeDisabled();

    resolveSignUp({ data: { user: { id: "u1" }, session: { access_token: "t" } }, error: null });
    expect(await screen.findByText("Home")).toBeInTheDocument();
    expect(signUpMock).toHaveBeenCalledTimes(1);
  });

  it("passes fullName and timezone, then follows the confirmation branch", async () => {
    const signUpMock = vi.fn().mockResolvedValue({
      data: { user: { id: "u1" }, session: null },
      error: null,
    });
    stubAuth({ signUp: signUpMock });
    const user = userEvent.setup();
    renderSignUp();

    await user.type(screen.getByLabelText(SIGN_UP_COPY.nameLabel), "Ada");
    await user.type(screen.getByLabelText(SIGN_UP_COPY.emailLabel), "ada@example.com");
    await user.type(screen.getByLabelText(SIGN_UP_COPY.passwordLabel), "secret123");
    await user.click(screen.getByRole("button", { name: SIGN_UP_COPY.submit }));

    expect(await screen.findByText("Check email")).toBeInTheDocument();
    expect(screen.getByTestId("check-email-state")).toHaveTextContent("ada@example.com");
    expect(signUpMock).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "secret123",
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { timezone: expect.any(String), full_name: "Ada" },
      },
    });
  });

  it("goes home directly when confirmation is off", async () => {
    stubAuth({
      signUp: vi.fn().mockResolvedValue({
        data: { user: { id: "u1" }, session: { access_token: "t" } },
        error: null,
      }),
    });
    const user = userEvent.setup();
    renderSignUp();

    await user.type(screen.getByLabelText(SIGN_UP_COPY.emailLabel), "ada@example.com");
    await user.type(screen.getByLabelText(SIGN_UP_COPY.passwordLabel), "secret123");
    await user.click(screen.getByRole("button", { name: SIGN_UP_COPY.submit }));

    expect(await screen.findByText("Home")).toBeInTheDocument();
  });
});
