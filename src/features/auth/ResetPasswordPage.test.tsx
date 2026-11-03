import type { SupabaseClient } from "@supabase/supabase-js";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseClient } from "@/lib/supabase/client";

import {
  RESET_PASSWORD_COPY,
  ResetPasswordPage,
  type ResetPasswordMode,
} from "./ResetPasswordPage";
import { SIGN_IN_COPY, SignInPage } from "./SignInPage";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));

const mockedGetClient = vi.mocked(getSupabaseClient);

function stubAuth(auth: Record<string, unknown>): void {
  mockedGetClient.mockReturnValue({ auth } as unknown as SupabaseClient);
}

function renderReset(mode: ResetPasswordMode = "request") {
  return render(
    <MemoryRouter initialEntries={["/reset-password"]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage initialMode={mode} />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResetPasswordPage request mode", () => {
  it("validates the email", async () => {
    stubAuth({ resetPasswordForEmail: vi.fn() });
    const user = userEvent.setup();
    renderReset();

    await user.click(screen.getByRole("button", { name: RESET_PASSWORD_COPY.requestSubmit }));

    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
  });

  it("shows generic success without leaking account existence", async () => {
    const resetMock = vi.fn().mockResolvedValue({ data: {}, error: null });
    stubAuth({ resetPasswordForEmail: resetMock });
    const user = userEvent.setup();
    renderReset();

    await user.type(screen.getByLabelText(RESET_PASSWORD_COPY.emailLabel), "ada@example.com");
    await user.click(screen.getByRole("button", { name: RESET_PASSWORD_COPY.requestSubmit }));

    expect(await screen.findByRole("status")).toHaveTextContent(RESET_PASSWORD_COPY.requestSent);
    expect(resetMock).toHaveBeenCalledWith(
      "ada@example.com",
      expect.objectContaining({ redirectTo: expect.stringContaining("/reset-password") }),
    );
  });

  it("shows a distinct message when rate limited", async () => {
    stubAuth({
      resetPasswordForEmail: vi.fn().mockResolvedValue({
        data: {},
        error: { message: "Over request rate limit", name: "AuthError", status: 429 },
      }),
    });
    const user = userEvent.setup();
    renderReset();

    await user.type(screen.getByLabelText(RESET_PASSWORD_COPY.emailLabel), "ada@example.com");
    await user.click(screen.getByRole("button", { name: RESET_PASSWORD_COPY.requestSubmit }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts.");
  });
});

describe("ResetPasswordPage update mode", () => {
  it("requires matching confirmation", async () => {
    stubAuth({ updateUser: vi.fn(), signOut: vi.fn() });
    const user = userEvent.setup();
    renderReset("update");

    await user.type(screen.getByLabelText(RESET_PASSWORD_COPY.passwordLabel), "new-secret-1");
    await user.type(screen.getByLabelText(RESET_PASSWORD_COPY.confirmLabel), "other-secret-2");
    await user.click(screen.getByRole("button", { name: RESET_PASSWORD_COPY.updateSubmit }));

    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
  });

  it("saves, signs out and returns to sign-in with a success notice", async () => {
    const updateMock = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const signOutMock = vi.fn().mockResolvedValue({ error: null });
    stubAuth({ updateUser: updateMock, signOut: signOutMock });
    const user = userEvent.setup();
    renderReset("update");

    await user.type(screen.getByLabelText(RESET_PASSWORD_COPY.passwordLabel), "new-secret-1");
    await user.type(screen.getByLabelText(RESET_PASSWORD_COPY.confirmLabel), "new-secret-1");
    await user.click(screen.getByRole("button", { name: RESET_PASSWORD_COPY.updateSubmit }));

    expect(await screen.findByText(SIGN_IN_COPY.passwordResetSuccess)).toBeInTheDocument();
    expect(updateMock).toHaveBeenCalledWith({ password: "new-secret-1" });
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the request form on an expired link", async () => {
    stubAuth({
      updateUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: "Auth session missing!", name: "AuthError" },
      }),
      signOut: vi.fn(),
    });
    const user = userEvent.setup();
    renderReset("update");

    await user.type(screen.getByLabelText(RESET_PASSWORD_COPY.passwordLabel), "new-secret-1");
    await user.type(screen.getByLabelText(RESET_PASSWORD_COPY.confirmLabel), "new-secret-1");
    await user.click(screen.getByRole("button", { name: RESET_PASSWORD_COPY.updateSubmit }));

    expect(await screen.findByText(RESET_PASSWORD_COPY.expiredLink)).toBeInTheDocument();
    expect(screen.getByLabelText(RESET_PASSWORD_COPY.emailLabel)).toBeInTheDocument();
  });

  it("maps update failures by code", async () => {
    stubAuth({
      updateUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: "Password should be at least 6 characters", name: "AuthError" },
      }),
      signOut: vi.fn(),
    });
    const user = userEvent.setup();
    renderReset("update");

    await user.type(screen.getByLabelText(RESET_PASSWORD_COPY.passwordLabel), "123456");
    await user.type(screen.getByLabelText(RESET_PASSWORD_COPY.confirmLabel), "123456");
    await user.click(screen.getByRole("button", { name: RESET_PASSWORD_COPY.updateSubmit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password does not meet the requirements.",
    );
  });
});
