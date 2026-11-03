import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import App from "@/App";

// Only the env is mocked: the real AuthProvider must survive without config
// (regression: onAuthStateChange() outside try/catch threw via
// getSupabaseClient()). App.test.tsx mocks the provider; this file must not.
vi.mock("@/lib/env", () => ({
  isSupabaseConfigured: false,
  supabaseEnv: null,
  describeMissingEnv: () => "VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY",
}));

describe("AuthProvider without Supabase config", () => {
  it("renders the setup banner instead of crashing", async () => {
    render(<App />);

    // The dashboard renders its own loading statuses underneath, so the
    // banner is pinned by its copy instead of the bare `status` role.
    expect(await screen.findByText(/Supabase is not connected/i)).toBeInTheDocument();
  });
});
