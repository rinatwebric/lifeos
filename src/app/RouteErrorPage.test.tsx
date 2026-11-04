import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { RouteErrorPage } from "./RouteErrorPage";

/** Throws during render, like a broken component would. */
function Boom(): ReactElement {
  throw new Error("insertBefore exploded");
}

describe("RouteErrorPage", () => {
  it("shows human copy and actions instead of a stack trace", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const router = createMemoryRouter(
      [{ path: "/", element: <Boom />, errorElement: <RouteErrorPage /> }],
      { initialEntries: ["/"] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("Something broke on this screen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload page/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to dashboard/i })).toBeInTheDocument();
    expect(screen.queryByText(/unexpected application error/i)).not.toBeInTheDocument();

    consoleError.mockRestore();
  });
});