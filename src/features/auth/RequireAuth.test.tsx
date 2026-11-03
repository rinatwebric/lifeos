import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { RedirectIfAuthed, RequireAuth } from "./RequireAuth";
import { AuthContext, type AuthStatus } from "./useAuth";

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: true }));

function renderWithAuth(status: AuthStatus, initialPath = "/secret") {
  const value =
    status === "authenticated"
      ? {
          status,
          user: { id: "u1", email: "ada@example.com" },
          session: { user: { id: "u1" } },
        }
      : { status, user: null, session: null };

  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={value as never}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route
              path="/secret"
              element={
                <RequireAuth>
                  <div>Secret content</div>
                </RequireAuth>
              }
            />
            <Route path="/sign-in" element={<SignInProbe />} />
            <Route
              path="/public"
              element={
                <RedirectIfAuthed>
                  <div>Public content</div>
                </RedirectIfAuthed>
              }
            />
            <Route path="/" element={<div>Home</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

function SignInProbe() {
  const location = useLocation();
  const state = (location.state ?? null) as { from?: { pathname?: string } } | null;

  return <div>Sign in from:{state?.from?.pathname ?? "none"}</div>;
}

function renderPublicWithAuth(status: AuthStatus) {
  const value =
    status === "authenticated"
      ? {
          status,
          user: { id: "u1", email: "ada@example.com" },
          session: { user: { id: "u1" } },
        }
      : { status, user: null, session: null };

  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={value as never}>
        <MemoryRouter initialEntries={["/public"]}>
          <Routes>
            <Route
              path="/public"
              element={
                <RedirectIfAuthed>
                  <div>Public content</div>
                </RedirectIfAuthed>
              }
            />
            <Route path="/" element={<div>Home</div>} />
            <Route path="/sign-in" element={<div>Sign in</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

function GuardProbe({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

describe("RequireAuth", () => {
  it("renders a loading placeholder without redirecting", () => {
    renderWithAuth("loading");

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
    expect(screen.queryByText(/Sign in from:/)).not.toBeInTheDocument();
    expect(GuardProbe).toBeDefined();
  });

  it("redirects anonymous users to sign-in with the origin location", () => {
    renderWithAuth("anonymous");

    expect(screen.getByText("Sign in from:/secret")).toBeInTheDocument();
    expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
  });

  it("renders children for authenticated users", () => {
    renderWithAuth("authenticated");

    expect(screen.getByText("Secret content")).toBeInTheDocument();
  });
});

describe("RedirectIfAuthed", () => {
  it("renders a loading placeholder without redirecting", () => {
    renderPublicWithAuth("loading");

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Public content")).not.toBeInTheDocument();
    expect(screen.queryByText("Home")).not.toBeInTheDocument();
  });

  it("sends authenticated users home", () => {
    renderPublicWithAuth("authenticated");

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.queryByText("Public content")).not.toBeInTheDocument();
  });

  it("renders children for anonymous users", () => {
    renderPublicWithAuth("anonymous");

    expect(screen.getByText("Public content")).toBeInTheDocument();
  });
});
