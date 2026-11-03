import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppLayout } from "@/components/layout/AppLayout";
import type { Profile, UserPreferences } from "@/types/domain";
import { getPreferences, getProfile, markOnboarded, updatePreferences, updateProfile } from "./api";
import { ONBOARDING_COPY, OnboardingDialog } from "./OnboardingDialog";

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
const mockedMarkOnboarded = vi.mocked(markOnboarded);

const PROFILE: Profile = {
  id: "u1",
  fullName: "Ada",
  avatarUrl: null,
  timezone: "Asia/Bishkek",
  language: "en",
  theme: "light",
  onboardedAt: null,
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

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");

  const view = render(
    <QueryClientProvider client={client}>
      <OnboardingDialog />
    </QueryClientProvider>,
  );

  return { invalidateSpy, ...view };
}

function renderLayout() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<div>Page content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { client, ...view };
}

beforeEach(() => {
  vi.clearAllMocks();
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
  mockedMarkOnboarded.mockResolvedValue({
    ...PROFILE,
    onboardedAt: "2026-11-03T00:00:00.000Z",
  } as never);
});

describe("OnboardingDialog", () => {
  it("shows the one-step setup with profile defaults", async () => {
    renderDialog();

    expect(await screen.findByText(ONBOARDING_COPY.title)).toBeInTheDocument();
    expect(await screen.findByLabelText("Time zone")).toHaveValue("Asia/Bishkek");
    expect(screen.getByLabelText("Wake-up time")).toHaveValue("07:00");
    expect(screen.getByLabelText("Sleep time")).toHaveValue("23:00");
  });

  it("Skip writes onboarded_at and dismisses the dialog", async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText(ONBOARDING_COPY.title);
    await user.click(screen.getByRole("button", { name: ONBOARDING_COPY.skip }));

    await waitFor(() => expect(mockedMarkOnboarded).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(ONBOARDING_COPY.title)).not.toBeInTheDocument());
  });

  it("Escape acts as Skip", async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText(ONBOARDING_COPY.title);
    await user.keyboard("{Escape}");

    await waitFor(() => expect(mockedMarkOnboarded).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(ONBOARDING_COPY.title)).not.toBeInTheDocument());
  });

  it("Save persists the day setup, then marks onboarded and closes", async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText(ONBOARDING_COPY.title);
    const timezoneInput = await screen.findByLabelText("Time zone");

    await user.clear(timezoneInput);
    await user.type(timezoneInput, "Europe/Berlin");
    await user.click(screen.getByRole("button", { name: ONBOARDING_COPY.save }));

    await waitFor(() =>
      expect(mockedUpdateProfile).toHaveBeenCalledWith({ timezone: "Europe/Berlin" }),
    );
    await waitFor(() =>
      expect(mockedUpdatePreferences).toHaveBeenCalledWith({
        wakeUpTime: "07:00",
        sleepTime: "23:00",
      }),
    );
    await waitFor(() => expect(mockedMarkOnboarded).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(ONBOARDING_COPY.title)).not.toBeInTheDocument());
  });
});

describe("AppLayout onboarding hint", () => {
  it("renders the dialog only while onboarded_at is null", async () => {
    mockedGetProfile.mockResolvedValue({ ...PROFILE, onboardedAt: null });
    const first = renderLayout();

    expect(await screen.findByText(ONBOARDING_COPY.title)).toBeInTheDocument();
    expect(screen.getByText("Page content")).toBeInTheDocument();
    first.unmount();

    vi.clearAllMocks();
    mockedGetProfile.mockResolvedValue({ ...PROFILE, onboardedAt: "2026-11-03T00:00:00.000Z" });
    mockedGetPreferences.mockResolvedValue({ ...PREFERENCES });
    renderLayout();

    await screen.findByText("Page content");
    await waitFor(() => expect(mockedGetProfile).toHaveBeenCalled());
    expect(screen.queryByText(ONBOARDING_COPY.title)).not.toBeInTheDocument();
  });
});
