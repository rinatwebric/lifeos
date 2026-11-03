import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import App from "@/App";

// The developer machine has a filled `.env.local` (unit 1 fact), while CI
// does not. Mock the env as unconfigured so this test is deterministic in
// both cases: it verifies the no-config branch, never the local setup.
vi.mock("@/lib/env", () => ({
  isSupabaseConfigured: false,
  supabaseEnv: null,
  describeMissingEnv: () => "VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY",
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
