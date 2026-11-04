import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signIn } from "./api";
import { DEMO_SIGN_IN_COPY, DemoSignInButton } from "./DemoSignInButton";

vi.mock("./api", () => ({ signIn: vi.fn() }));

const mockedSignIn = vi.mocked(signIn);

function renderDemo(onError: (code: unknown) => void = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={["/sign-in"]}>
      <Routes>
        <Route path="/sign-in" element={<DemoSignInButton onError={onError} />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("DemoSignInButton", () => {
  it("renders nothing without demo env", () => {
    vi.stubEnv("VITE_DEMO_EMAIL", "");
    vi.stubEnv("VITE_DEMO_PASSWORD", "");

    const { container } = renderDemo();

    expect(container).toBeEmptyDOMElement();
    expect(mockedSignIn).not.toHaveBeenCalled();
  });

  it("renders nothing when only one credential is set", () => {
    vi.stubEnv("VITE_DEMO_EMAIL", "demo@example.com");
    vi.stubEnv("VITE_DEMO_PASSWORD", "");

    const { container } = renderDemo();

    expect(container).toBeEmptyDOMElement();
  });

  it("signs in with the demo credentials and navigates home", async () => {
    vi.stubEnv("VITE_DEMO_EMAIL", "demo@example.com");
    vi.stubEnv("VITE_DEMO_PASSWORD", "demo-secret");
    mockedSignIn.mockResolvedValue({
      user: { id: "demo-id" },
      session: { access_token: "t" },
    } as never);
    const user = userEvent.setup();
    renderDemo();

    await user.click(screen.getByRole("button", { name: DEMO_SIGN_IN_COPY.button }));
    expect(await screen.findByText("Home")).toBeInTheDocument();
    expect(mockedSignIn).toHaveBeenCalledTimes(1);
    expect(mockedSignIn).toHaveBeenCalledWith({
      email: "demo@example.com",
      password: "demo-secret",
    });
  });

  it("forwards sign-in failures to onError without navigating", async () => {
    vi.stubEnv("VITE_DEMO_EMAIL", "demo@example.com");
    vi.stubEnv("VITE_DEMO_PASSWORD", "demo-secret");
    mockedSignIn.mockRejectedValue(new Error("Invalid login credentials"));
    const onError = vi.fn();
    const user = userEvent.setup();
    renderDemo(onError);

    await user.click(screen.getByRole("button", { name: DEMO_SIGN_IN_COPY.button }));

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith("invalid_credentials");
    expect(screen.queryByText("Home")).not.toBeInTheDocument();
  });

  it("is disabled while the request is in flight", async () => {
    vi.stubEnv("VITE_DEMO_EMAIL", "demo@example.com");
    vi.stubEnv("VITE_DEMO_PASSWORD", "demo-secret");
    let resolveSignIn!: (value: never) => void;
    mockedSignIn.mockImplementation(
      () => new Promise<never>((resolve) => (resolveSignIn = resolve)),
    );
    const user = userEvent.setup();
    renderDemo();

    await user.click(screen.getByRole("button", { name: DEMO_SIGN_IN_COPY.button }));

    const pendingButton = await screen.findByRole("button", {
      name: DEMO_SIGN_IN_COPY.pending,
    });
    expect(pendingButton).toBeDisabled();
    expect(mockedSignIn).toHaveBeenCalledTimes(1);

    resolveSignIn({ user: { id: "demo-id" }, session: {} } as never);
    expect(await screen.findByText("Home")).toBeInTheDocument();
  });
});
