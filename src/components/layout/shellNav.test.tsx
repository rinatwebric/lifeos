import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";

/** Active nav state must be exposed to assistive tech, not carried by color alone. */
describe("shell navigation", () => {
  it("marks the active sidebar entry with aria-current", () => {
    render(
      <MemoryRouter initialEntries={["/goals"]}>
        <Sidebar />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Goals" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks the active mobile entry with aria-current", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <MobileNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Tasks" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
