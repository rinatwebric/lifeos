import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AUTH_LAYOUT_COPY, AuthLayout } from "./AuthLayout";

describe("AuthLayout", () => {
  it("centers auth content with the brand and no app navigation", () => {
    render(
      <MemoryRouter initialEntries={["/sign-in"]}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/sign-in" element={<div>Sign-in form</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "LifeOS home" })).toBeInTheDocument();
    expect(screen.getByText(AUTH_LAYOUT_COPY.tagline)).toBeInTheDocument();
    expect(screen.getByText("Sign-in form")).toBeInTheDocument();
    // App shell navigation must not leak into auth screens.
    expect(screen.queryByRole("link", { name: "Goals" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "AI Assistant" })).not.toBeInTheDocument();
  });
});
