import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider, useLanguageSync } from "./I18nContext";
import { LANGUAGE_STORAGE_KEY } from "./storage";

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => ({ status: "anonymous" as const, user: null, session: null }),
}));

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: false }));

function Probe() {
  const { locale, setLocale } = useLanguageSync();

  return (
    <div>
      <p data-testid="locale">{locale}</p>
      <button type="button" onClick={() => setLocale("ru")}>
        to-ru
      </button>
      <button type="button" onClick={() => setLocale("en")}>
        to-en
      </button>
    </div>
  );
}

function renderProbe() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <Probe />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = "en";
});

describe("LocaleProvider", () => {
  it("applies the choice instantly without reload and sets html lang", async () => {
    const user = userEvent.setup();
    renderProbe();

    expect(screen.getByTestId("locale")).toHaveTextContent("en");

    await user.click(screen.getByRole("button", { name: "to-ru" }));

    expect(screen.getByTestId("locale")).toHaveTextContent("ru");
    expect(document.documentElement.lang).toBe("ru");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toContain("ru");

    await user.click(screen.getByRole("button", { name: "to-en" }));

    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("initializes from device storage", () => {
    window.localStorage.setItem(
      LANGUAGE_STORAGE_KEY,
      JSON.stringify({ value: "ru", userId: null, updatedAt: "" }),
    );

    renderProbe();

    expect(screen.getByTestId("locale")).toHaveTextContent("ru");
  });
});
