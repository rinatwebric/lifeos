import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "@/App";

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
