import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import App from "@/App";

// The developer machine has a filled `.env.local` (unit 1 fact), while CI
// does not. Mock the env as unconfigured so this test is deterministic in
// both cases: it verifies the no-config branch, never the local setup.
vi.mock("@/lib/env", () => ({
  isSupabaseConfigured: false,
  supabaseEnv: null,
  describeMissingEnv: () => "VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY",
}));

// Shell test is about layout/banner, not auth: stub the provider so the suite
// stays independent of Supabase (real provider is covered in AuthProvider.test).
vi.mock("@/features/auth/AuthProvider", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({ status: "anonymous" as const, user: null, session: null }),
}));

describe("App shell", () => {
  it("renders the dashboard inside the application layout", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Goals" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "AI Assistant" }).length).toBeGreaterThan(0);
  });

  it("explains the missing Supabase configuration instead of failing", () => {
    render(<App />);

    expect(screen.getByRole("status")).toHaveTextContent(/Supabase is not connected/i);
  });
});
