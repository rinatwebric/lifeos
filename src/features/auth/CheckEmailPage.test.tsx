import type { SupabaseClient } from "@supabase/supabase-js";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseClient } from "@/lib/supabase/client";

import { CHECK_EMAIL_COPY, CheckEmailPage } from "./CheckEmailPage";
import { AUTH_ERROR_MESSAGES } from "./errors";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));

const mockedGetClient = vi.mocked(getSupabaseClient);

function stubAuth(auth: Record<string, unknown>): void {
  mockedGetClient.mockReturnValue({ auth } as unknown as SupabaseClient);
}

function renderCheckEmail(email: string | undefined, cooldownSeconds = 60) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: "/check-email", state: email ? { email } : undefined }]}
    >
      <Routes>
        <Route path="/check-email" element={<CheckEmailPage cooldownSeconds={cooldownSeconds} />} />
        <Route path="/sign-up" element={<div>Sign up</div>} />
        <Route path="/sign-in" element={<div>Sign in</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CheckEmailPage", () => {
  it("redirects to sign-up on direct access without state", async () => {
    stubAuth({ resend: vi.fn() });
    renderCheckEmail(undefined);

    expect(await screen.findByText("Sign up")).toBeInTheDocument();
  });

  it("shows the address, the spam hint and a back link", () => {
    stubAuth({ resend: vi.fn() });
    renderCheckEmail("ada@example.com");

    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText(CHECK_EMAIL_COPY.spamHint)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: CHECK_EMAIL_COPY.backLink })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  it("resends with a cooldown and shows identical copy for unknown addresses", async () => {
    const resendMock = vi.fn().mockResolvedValue({ data: {}, error: null });
    stubAuth({ resend: resendMock });
    const user = userEvent.setup();
    renderCheckEmail("ada@example.com", 2);

    await user.click(screen.getByRole("button", { name: CHECK_EMAIL_COPY.resend }));

    expect(await screen.findByText(CHECK_EMAIL_COPY.sent)).toBeInTheDocument();
    expect(resendMock).toHaveBeenCalledWith({
      type: "signup",
      email: "ada@example.com",
      options: { emailRedirectTo: `${window.location.origin}/` },
    });

    const cooldownButton = screen.getByRole("button", {
      name: new RegExp(CHECK_EMAIL_COPY.cooldownPrefix),
    });
    expect(cooldownButton).toBeDisabled();

    // Cooldown expires and the button is usable again.
    expect(
      await screen.findByRole("button", { name: CHECK_EMAIL_COPY.resend }, { timeout: 5000 }),
    ).toBeEnabled();
  });

  it("shows a distinct message when rate limited", async () => {
    stubAuth({
      resend: vi.fn().mockResolvedValue({
        data: {},
        error: { message: "Over request rate limit", name: "AuthError", status: 429 },
      }),
    });
    const user = userEvent.setup();
    renderCheckEmail("ada@example.com");

    await user.click(screen.getByRole("button", { name: CHECK_EMAIL_COPY.resend }));

    expect(await screen.findByRole("alert")).toHaveTextContent(AUTH_ERROR_MESSAGES.rate_limited);
  });

  it("maps unknown failures to the generic copy instead of leaking", async () => {
    stubAuth({
      resend: vi.fn().mockResolvedValue({
        data: {},
        error: { message: "Something odd happened", name: "AuthError" },
      }),
    });
    const user = userEvent.setup();
    renderCheckEmail("ada@example.com");

    await user.click(screen.getByRole("button", { name: CHECK_EMAIL_COPY.resend }));

    expect(await screen.findByRole("status")).toHaveTextContent(CHECK_EMAIL_COPY.sent);
  });
});
