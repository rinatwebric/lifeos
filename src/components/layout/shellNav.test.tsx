import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

    expect(screen.getByRole("link", { name: "Goals" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("keeps four primary links and puts the rest behind More", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <MobileNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plan" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AI" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Goals" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("link", { name: "Goals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Analytics" })).toBeInTheDocument();
  });
});
