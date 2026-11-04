import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider, useLanguageSync } from "./I18nContext";
import { LANGUAGE_STORAGE_KEY } from "./storage";

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
  updateCalls: [] as Array<{ language: string }>,
  updateImpl: null as null | ((input: { language: string }) => Promise<unknown>),
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
  updateProfile: vi.fn(async (input: { language: string }) => {
    mocks.updateCalls.push(input);

    if (mocks.updateImpl) {
      return mocks.updateImpl(input);
    }

    return { ...mocks.profile, ...input };
  }),
}));

void 0;

function Status() {
  const { locale, setLocale, syncStatus, syncError, retrySync } = useLanguageSync();

  return (
    <div>
      <p data-testid="locale">{locale}</p>
      <p data-testid="status">{syncStatus}</p>
      {syncError ? <p role="alert">{syncError}</p> : null}
      <button type="button" onClick={() => setLocale("ru")}>
        to-ru
      </button>
      <button type="button" onClick={() => setLocale("en")}>
        to-en
      </button>
      <button type="button" onClick={retrySync}>
        retry
      </button>
    </div>
  );
}

function renderStatus() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <Status />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.lang = "en";
  mocks.authState.status = "authenticated";
  mocks.authState.user = { id: "u1" };
  mocks.profile.language = "en";
  mocks.updateCalls.length = 0;
  mocks.updateImpl = null;
});

describe("language sync", () => {
  it("PATCHes only the language field", async () => {
    const user = userEvent.setup();
    renderStatus();

    await screen.findByText("en");
    await user.click(screen.getByRole("button", { name: "to-ru" }));

    await waitFor(() => expect(mocks.updateCalls.length).toBeGreaterThan(0));
    expect(mocks.updateCalls.at(-1)).toStrictEqual({ language: "ru" });
    expect(mocks.updateCalls.every((c) => Object.keys(c).length === 1)).toBe(true);
  });

  it("last choice wins across rapid ru→en→ru", async () => {
    const resolvers: Array<(v: unknown) => void> = [];
    mocks.updateImpl = (input) =>
      new Promise((resolve) => {
        resolvers.push(() => resolve({ ...mocks.profile, ...input }));
      });

    const user = userEvent.setup();
    renderStatus();
    await screen.findByText("en");

    await user.click(screen.getByRole("button", { name: "to-ru" }));
    await user.click(screen.getByRole("button", { name: "to-en" }));
    await user.click(screen.getByRole("button", { name: "to-ru" }));

    // Flush all three in reverse (out-of-order network).
    while (resolvers.length > 0) {
      resolvers.pop()?.({});
      await new Promise((r) => setTimeout(r, 0));
    }

    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("ru"));
    await waitFor(() => expect(mocks.updateCalls.at(-1)).toStrictEqual({ language: "ru" }));
  });

  it("keeps the device choice on failure and retries", async () => {
    mocks.updateImpl = async () => {
      throw new Error("profiles down");
    };

    const user = userEvent.setup();
    renderStatus();
    await screen.findByText("en");

    await user.click(screen.getByRole("button", { name: "to-ru" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("profiles down");
    expect(screen.getByTestId("locale")).toHaveTextContent("ru");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toContain("ru");

    mocks.updateImpl = null;
    await user.click(screen.getByRole("button", { name: "retry" }));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("saved"));
    expect(mocks.updateCalls.at(-1)).toStrictEqual({ language: "ru" });
  });
});
