import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPreferences, getProfile, updatePreferences, updateProfile } from "./api";
import { signOut } from "@/features/auth/api";
import type { Profile, UserPreferences } from "@/types/domain";
import { SETTINGS_COPY, SettingsPage } from "./SettingsPage";
import { ThemeProvider } from "@/app/theme";
import { LocaleProvider } from "@/lib/i18n/I18nContext";
import { en } from "@/lib/i18n/dictionaries/en";
import { ru } from "@/lib/i18n/dictionaries/ru";

vi.mock("@/features/auth/api", () => ({ signOut: vi.fn() }));

vi.mock("./api", () => ({
  getProfile: vi.fn(),
  getPreferences: vi.fn(),
  updateProfile: vi.fn(),
  updatePreferences: vi.fn(),
  markOnboarded: vi.fn(),
  profileQueryKey: ["profile"],
  preferencesQueryKey: ["preferences"],
}));

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => ({
    status: "authenticated" as const,
    user: { id: "u1", email: "ada@example.com" },
    session: { user: { id: "u1" } },
  }),
}));

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: true }));

const mockedGetProfile = vi.mocked(getProfile);
const mockedGetPreferences = vi.mocked(getPreferences);
const mockedUpdateProfile = vi.mocked(updateProfile);
const mockedUpdatePreferences = vi.mocked(updatePreferences);

const mockedSignOut = vi.mocked(signOut);

const PROFILE: Profile = {
  id: "u1",
  fullName: "Ada",
  avatarUrl: null,
  timezone: "Asia/Bishkek",
  language: "en",
  theme: "light",
  onboardedAt: "2026-11-03T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const PREFERENCES: UserPreferences = {
  id: "p1",
  userId: "u1",
  wakeUpTime: "07:00",
  sleepTime: "23:00",
  workingHours: {},
  studyHours: {},
  preferredWorkPeriods: {},
  notificationPreferences: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");

  const view = render(
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <ThemeProvider>
          <SettingsPage />
        </ThemeProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );

  return { invalidateSpy, ...view };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
  document.documentElement.lang = "en";
  mockedSignOut.mockResolvedValue(undefined);
  mockedGetProfile.mockResolvedValue({ ...PROFILE });
  mockedGetPreferences.mockResolvedValue({ ...PREFERENCES });
  mockedUpdateProfile.mockImplementation(async (input) => ({ ...PROFILE, ...input }) as never);
  mockedUpdatePreferences.mockImplementation(
    async (input) =>
      ({
        ...PREFERENCES,
        wakeUpTime: input.wakeUpTime ?? PREFERENCES.wakeUpTime,
        sleepTime: input.sleepTime ?? PREFERENCES.sleepTime,
      }) as never,
  );
});

describe("SettingsPage", () => {
  it("shows a loading placeholder while the profile loads", () => {
    mockedGetProfile.mockReturnValue(new Promise(() => {}) as never);
    mockedGetPreferences.mockReturnValue(new Promise(() => {}) as never);
    renderSettings();

    expect(screen.getByRole("status")).toHaveTextContent(en.settings.loading);
  });

  it("renders the email read-only with profile and day-setup values", async () => {
    renderSettings();

    const email = (await screen.findByLabelText(en.settings.emailLabel)) as HTMLInputElement;
    expect(email).toHaveValue("ada@example.com");
    expect(email).toHaveAttribute("readonly");

    expect(screen.getByLabelText(en.settings.nameLabel)).toHaveValue("Ada");
    expect(screen.getByLabelText(en.preferences.timezoneLabel)).toHaveValue("Asia/Bishkek");
    expect(screen.getByLabelText(en.preferences.wakeLabel)).toHaveValue("07:00");
    expect(screen.getByLabelText(en.preferences.sleepLabel)).toHaveValue("23:00");
  });

  it("saves only the name with its own button", async () => {
    const user = userEvent.setup();
    const { invalidateSpy } = renderSettings();

    await screen.findByLabelText(en.settings.nameLabel);

    await user.clear(screen.getByLabelText(en.settings.nameLabel));
    await user.type(screen.getByLabelText(en.settings.nameLabel), "Ada Lovelace");
    await user.click(screen.getByRole("button", { name: en.settings.nameSubmit }));

    await waitFor(() =>
      expect(mockedUpdateProfile).toHaveBeenCalledWith({ fullName: "Ada Lovelace" }),
    );
    expect(mockedUpdateProfile).not.toHaveBeenCalledWith(
      expect.objectContaining({ language: expect.anything() }),
    );
    expect(mockedUpdateProfile).not.toHaveBeenCalledWith(
      expect.objectContaining({ theme: expect.anything() }),
    );
    expect(await screen.findByText(en.settings.nameSaved)).toBeInTheDocument();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["profile"] });
  });

  it("applies language instantly without submitting the name form", async () => {
    const user = userEvent.setup();
    renderSettings();

    const nameInput = (await screen.findByLabelText(en.settings.nameLabel)) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Draft");

    // Draft is untouched before the language change.
    expect(mockedUpdateProfile).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText(en.settings.languageLabel), "ru");

    // Current screen + nav translate at once, no reload.
    expect(await screen.findByText(en.settings.languageLabel === "Language" ? "Язык" : "Language")).toBeInTheDocument();
    // Partial payload: only the changed field.
    await waitFor(() => expect(mockedUpdateProfile).toHaveBeenCalledWith({ language: "ru" }));
    expect(mockedUpdateProfile).not.toHaveBeenCalledWith(
      expect.objectContaining({ fullName: expect.anything() }),
    );
    // Name draft is preserved (no remount, no wipe).
    expect(screen.getByLabelText("Имя")).toHaveValue("Draft");
  });

  it("applies theme instantly and toggles the dark class", async () => {
    const user = userEvent.setup();
    renderSettings();

    await screen.findByLabelText(en.settings.nameLabel);
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await user.selectOptions(screen.getByLabelText(en.settings.themeLabel), "dark");

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await waitFor(() => expect(mockedUpdateProfile).toHaveBeenCalledWith({ theme: "dark" }));
  });

  it("keeps the name draft focused while the language syncs", async () => {
    const user = userEvent.setup();
    renderSettings();

    const nameInput = (await screen.findByLabelText(en.settings.nameLabel)) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Draft");
    const nameNode = screen.getByLabelText(en.settings.nameLabel);

    await user.selectOptions(screen.getByLabelText(en.settings.languageLabel), "ru");

    // No remount: the same input node keeps the draft, focus stays in the
    // form (on the select the user just touched), never dropped to <body>.
    expect(screen.getByLabelText("Имя")).toBe(nameNode);
    expect(screen.getByLabelText("Имя")).toHaveValue("Draft");
    expect(document.activeElement).not.toBe(document.body);
  });

  it("shows a retry notice when the instant sync fails and recovers on retry", async () => {
    const user = userEvent.setup();
    mockedUpdateProfile.mockRejectedValueOnce(new Error("profiles down"));
    renderSettings();

    await screen.findByLabelText(en.settings.nameLabel);
    await user.selectOptions(screen.getByLabelText(en.settings.languageLabel), "ru");

    const alert = await screen.findByTestId("language-sync-error");
    // UI already switched to Russian, so the notice is Russian.
    expect(alert).toHaveTextContent(ru.common.notSavedInAccount);
    // Device choice is kept even though the account save failed.
    expect(window.localStorage.getItem("lifeos-language")).toContain("ru");

    mockedUpdateProfile.mockImplementation(async (input) => ({ ...PROFILE, ...input }) as never);
    await user.click(screen.getByRole("button", { name: ru.common.retrySync }));

    await waitFor(() => expect(screen.getByTestId("language-sync-saved")).toBeInTheDocument());
  });

  it("marks Kyrgyz as unavailable while keeping profile compatibility", async () => {
    mockedGetProfile.mockResolvedValue({ ...PROFILE, language: "ky" });
    renderSettings();

    expect(await screen.findByText(en.settings.languageUnavailable)).toBeInTheDocument();
    const select = screen.getByLabelText(en.settings.languageLabel) as HTMLSelectElement;
    expect(select.value).toBe("ky");
    // UI falls back to English.
    expect(screen.getByText(en.settings.title)).toBeInTheDocument();
  });

  it("clears the name-saved notice as soon as the name is edited again", async () => {
    const user = userEvent.setup();
    renderSettings();

    await screen.findByLabelText(en.settings.nameLabel);
    await user.clear(screen.getByLabelText(en.settings.nameLabel));
    await user.type(screen.getByLabelText(en.settings.nameLabel), "Ada Lovelace");
    await user.click(screen.getByRole("button", { name: en.settings.nameSubmit }));

    expect(await screen.findByText(en.settings.nameSaved)).toBeInTheDocument();

    await user.type(screen.getByLabelText(en.settings.nameLabel), " Cooper");

    await waitFor(() => expect(screen.queryByText(en.settings.nameSaved)).not.toBeInTheDocument());
  });

  it("clears the day-setup saved notice when its fields are edited again", async () => {
    const user = userEvent.setup();
    renderSettings();

    await screen.findByLabelText(en.preferences.wakeLabel);
    await user.click(screen.getByRole("button", { name: en.preferences.submit }));

    expect(await screen.findByText(en.preferences.saved)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(en.preferences.timezoneLabel));
    await user.type(screen.getByLabelText(en.preferences.timezoneLabel), "Europe/Berlin");

    await waitFor(() => expect(screen.queryByText(en.preferences.saved)).not.toBeInTheDocument());
  });

  it("saves the day setup across both tables and invalidates both keys", async () => {
    const user = userEvent.setup();
    const { invalidateSpy } = renderSettings();

    await screen.findByLabelText(en.preferences.wakeLabel);

    await user.clear(screen.getByLabelText(en.preferences.timezoneLabel));
    await user.type(screen.getByLabelText(en.preferences.timezoneLabel), "Europe/Berlin");
    await user.click(screen.getByRole("button", { name: en.preferences.submit }));

    await waitFor(() =>
      expect(mockedUpdateProfile).toHaveBeenCalledWith({ timezone: "Europe/Berlin" }),
    );
    await waitFor(() =>
      expect(mockedUpdatePreferences).toHaveBeenCalledWith({
        wakeUpTime: "07:00",
        sleepTime: "23:00",
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["profile"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["preferences"] });
  });

  it("reports which table failed instead of swallowing the error", async () => {
    const user = userEvent.setup();
    mockedUpdateProfile.mockRejectedValueOnce(new Error("profiles down"));
    renderSettings();

    await screen.findByLabelText(en.preferences.wakeLabel);
    await user.click(screen.getByRole("button", { name: en.preferences.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      en.preferences.profileErrorPrefix,
    );
    // The preferences write still landed and its key was invalidated.
    expect(mockedUpdatePreferences).toHaveBeenCalled();
  });

  it("signs out from settings", async () => {
    const user = userEvent.setup();
    renderSettings();

    await screen.findByLabelText(en.preferences.wakeLabel);
    await user.click(screen.getByRole("button", { name: en.settings.signOut }));

    await waitFor(() => expect(mockedSignOut).toHaveBeenCalledTimes(1));
  });

  it("reports a sign-out failure instead of failing silently", async () => {
    const user = userEvent.setup();
    mockedSignOut.mockRejectedValueOnce(new Error("network down"));
    renderSettings();

    await screen.findByLabelText(en.preferences.wakeLabel);
    await user.click(screen.getByRole("button", { name: en.settings.signOut }));

    expect(await screen.findByRole("alert")).toHaveTextContent(en.settings.signOutFailed);
  });

  it("keeps SETTINGS_COPY for backward compatibility", () => {
    expect(SETTINGS_COPY.title).toBe("Settings");
  });
});
