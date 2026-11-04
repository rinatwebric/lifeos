import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { THEME_STORAGE_KEY, ThemeProvider, useTheme } from "./theme";

const mocks = vi.hoisted(() => ({
  authState: { status: "authenticated" as const, user: { id: "u1" } as { id: string } | null },
  profile: {
    id: "u1",
    fullName: "Ada",
    avatarUrl: null,
    timezone: "Asia/Bishkek",
    language: "en",
    theme: "light",
    onboardedAt: null,
    createdAt: "",
    updatedAt: "",
  },
  updateCalls: [] as Array<{ theme: string }>,
  updateImpl: null as null | ((input: { theme: string }) => Promise<unknown>),
}));

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => ({
    status: mocks.authState.status,
    user: mocks.authState.user ? { id: mocks.authState.user.id, email: "a@x.y" } : null,
    session: null,
  }),
}));

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: true }));

vi.mock("@/features/settings/api", () => ({
  profileQueryKey: ["profile"],
  getProfile: vi.fn(async () => ({ ...mocks.profile })),
  updateProfile: vi.fn(async (input: { theme: string }) => {
    mocks.updateCalls.push(input);
    if (mocks.updateImpl) return mocks.updateImpl(input);
    return { ...mocks.profile, ...input };
  }),
}));

function Status() {
  const { theme, setTheme, syncStatus } = useTheme();
  return (
    <div>
      <p data-testid="theme">{theme}</p>
      <p data-testid="status">{syncStatus}</p>
      <button type="button" onClick={() => setTheme("dark")}>
        to-dark
      </button>
      <button type="button" onClick={() => setTheme("light")}>
        to-light
      </button>
    </div>
  );
}

function renderStatus(client?: QueryClient) {
  const qc = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <Status />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
  mocks.authState.status = "authenticated";
  mocks.authState.user = { id: "u1" };
  mocks.profile.id = "u1";
  mocks.profile.theme = "light";
  mocks.updateCalls.length = 0;
  mocks.updateImpl = null;
});

describe("theme sync", () => {
  it("applies instantly with a single-field PATCH and toggles the dark class", async () => {
    const user = userEvent.setup();
    renderStatus();
    await screen.findByText("light");

    await user.click(screen.getByRole("button", { name: "to-dark" }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await waitFor(() => expect(mocks.updateCalls.at(-1)).toStrictEqual({ theme: "dark" }));
    expect(mocks.updateCalls.every((c) => Object.keys(c).length === 1)).toBe(true);
  });

  it("reload: same-user device copy wins and syncs up", async () => {
    window.localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ value: "dark", userId: "u1", updatedAt: "2026-11-04T00:00:00.000Z" }),
    );
    mocks.profile.theme = "light";

    renderStatus();

    expect(await screen.findByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await waitFor(() =>
      expect(mocks.updateCalls.some((c) => c.theme === "dark")).toBe(true),
    );
  });

  it("sends a choice that arrives while the previous PATCH is in flight", async () => {
    // Same queue contract as language sync: dark→light with dark held must
    // still deliver light and settle on saved, never strand on saving.
    let releaseDark!: (v: unknown) => void;
    mocks.updateImpl = (input) =>
      input.theme === "dark"
        ? new Promise((resolve) => (releaseDark = resolve as (v: unknown) => void))
        : Promise.resolve({ ...mocks.profile, ...input });

    const user = userEvent.setup();
    renderStatus();
    await screen.findByText("light");

    await user.click(screen.getByRole("button", { name: "to-dark" }));
    await waitFor(() => expect(mocks.updateCalls.length).toBe(1));

    await user.click(screen.getByRole("button", { name: "to-light" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(mocks.updateCalls.length).toBe(1);

    releaseDark({ ...mocks.profile, theme: "dark" });

    await waitFor(() => expect(mocks.updateCalls.length).toBe(2));
    expect(mocks.updateCalls.at(-1)).toStrictEqual({ theme: "light" });
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("saved"));
  });

  it("account switch never leaks the previous device choice", async () => {
    const { unmount } = renderStatus();
    await screen.findByText("light");
    const callsBefore = mocks.updateCalls.length;

    unmount();
    window.localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ value: "dark", userId: "u1", updatedAt: "2026-11-04T00:00:00.000Z" }),
    );
    mocks.authState.user = { id: "u2" };
    mocks.profile = { ...mocks.profile, id: "u2", theme: "light" };

    renderStatus();

    expect(await screen.findByTestId("theme")).toHaveTextContent("light");
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.updateCalls.length).toBe(callsBefore);
  });
});
