import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPreferences, getProfile, updatePreferences, updateProfile } from "./api";
import { signOut } from "@/features/auth/api";
import type { Profile, UserPreferences } from "@/types/domain";
import { SETTINGS_COPY, SettingsPage } from "./SettingsPage";

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
      <SettingsPage />
    </QueryClientProvider>,
  );

  return { invalidateSpy, ...view };
}

beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.classList.remove("dark");
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

    expect(screen.getByRole("status")).toHaveTextContent(SETTINGS_COPY.loading);
  });

  it("renders the email read-only with profile and day-setup values", async () => {
    renderSettings();

    const email = (await screen.findByLabelText(SETTINGS_COPY.emailLabel)) as HTMLInputElement;
    expect(email).toHaveValue("ada@example.com");
    expect(email).toHaveAttribute("readonly");

    expect(screen.getByLabelText(SETTINGS_COPY.nameLabel)).toHaveValue("Ada");
    expect(screen.getByLabelText("Time zone")).toHaveValue("Asia/Bishkek");
    expect(screen.getByLabelText("Wake-up time")).toHaveValue("07:00");
    expect(screen.getByLabelText("Sleep time")).toHaveValue("23:00");
  });

  it("saves the profile and invalidates only its query key", async () => {
    const user = userEvent.setup();
    const { invalidateSpy } = renderSettings();

    await screen.findByLabelText(SETTINGS_COPY.nameLabel);

    await user.clear(screen.getByLabelText(SETTINGS_COPY.nameLabel));
    await user.type(screen.getByLabelText(SETTINGS_COPY.nameLabel), "Ada Lovelace");
    await user.selectOptions(screen.getByLabelText(SETTINGS_COPY.languageLabel), "ru");
    await user.selectOptions(screen.getByLabelText(SETTINGS_COPY.themeLabel), "dark");
    await user.click(screen.getByRole("button", { name: SETTINGS_COPY.profileSubmit }));

    await waitFor(() =>
      expect(mockedUpdateProfile).toHaveBeenCalledWith({
        fullName: "Ada Lovelace",
        language: "ru",
        theme: "dark",
      }),
    );
    expect(await screen.findByText(SETTINGS_COPY.profileSaved)).toBeInTheDocument();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["profile"] });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("saves the day setup across both tables and invalidates both keys", async () => {
    const user = userEvent.setup();
    const { invalidateSpy } = renderSettings();

    await screen.findByLabelText("Wake-up time");

    await user.clear(screen.getByLabelText("Time zone"));
    await user.type(screen.getByLabelText("Time zone"), "Europe/Berlin");
    await user.click(screen.getByRole("button", { name: "Save day setup" }));

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

    await screen.findByLabelText("Wake-up time");
    await user.click(screen.getByRole("button", { name: "Save day setup" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not save profile/);
    // The preferences write still landed and its key was invalidated.
    expect(mockedUpdatePreferences).toHaveBeenCalled();
  });

  it("signs out from settings", async () => {
    const user = userEvent.setup();
    renderSettings();

    await screen.findByLabelText("Wake-up time");
    await user.click(screen.getByRole("button", { name: SETTINGS_COPY.signOut }));

    await waitFor(() => expect(mockedSignOut).toHaveBeenCalledTimes(1));
  });

  it("reports a sign-out failure instead of failing silently", async () => {
    const user = userEvent.setup();
    mockedSignOut.mockRejectedValueOnce(new Error("network down"));
    renderSettings();

    await screen.findByLabelText("Wake-up time");
    await user.click(screen.getByRole("button", { name: SETTINGS_COPY.signOut }));

    expect(await screen.findByRole("alert")).toHaveTextContent(SETTINGS_COPY.signOutFailed);
  });
});
