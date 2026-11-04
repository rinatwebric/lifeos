import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseClient } from "@/lib/supabase/client";

import { getPreferences, getProfile, markOnboarded, updatePreferences, updateProfile } from "./api";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));

const mockedGetClient = vi.mocked(getSupabaseClient);

const PROFILE_ROW = {
  id: "u1",
  full_name: "Ada",
  avatar_url: null,
  timezone: "Asia/Bishkek",
  language: "en",
  theme: "dark",
  onboarded_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

const PREFERENCES_ROW = {
  id: "p1",
  user_id: "u1",
  wake_up_time: "07:00",
  sleep_time: "23:00",
  working_hours: {},
  study_hours: {},
  preferred_work_periods: {},
  notification_preferences: {},
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

interface Chain {
  mocks: Record<string, ReturnType<typeof vi.fn>>;
}

function singleResult(data: unknown, error: unknown = null) {
  return { data, error };
}

/** Builds a `from().select().eq().single()` chain with spies on each link. */
function selectChain(result: {
  data: unknown;
  error: unknown;
}): Chain & { entry: ReturnType<typeof vi.fn> } {
  const single = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const entry = vi.fn().mockReturnValue({ select });
  return { mocks: { select, eq, single }, entry };
}

/** Builds a `from().update().eq().select().single()` chain. */
function updateChain(result: {
  data: unknown;
  error: unknown;
}): Chain & { entry: ReturnType<typeof vi.fn> } {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  const entry = vi.fn().mockReturnValue({ update });
  return { mocks: { update, eq, select, single }, entry };
}

function stubClient(
  authUserId: string | null,
  fromEntry: ReturnType<typeof vi.fn>,
  authError: unknown = null,
) {
  const getUser = vi
    .fn()
    .mockResolvedValue(
      authError
        ? { data: { user: null }, error: authError }
        : { data: { user: authUserId ? { id: authUserId } : null }, error: null },
    );
  mockedGetClient.mockReturnValue({
    auth: { getUser },
    from: fromEntry,
  } as unknown as SupabaseClient);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("settings api", () => {
  it("maps a profiles row from snake_case to camelCase", async () => {
    const chain = selectChain(singleResult(PROFILE_ROW));
    stubClient("u1", chain.entry);

    const profile = await getProfile();

    expect(chain.entry).toHaveBeenCalledWith("profiles");
    expect(chain.mocks.select).toHaveBeenCalledWith("*");
    expect(chain.mocks.eq).toHaveBeenCalledWith("id", "u1");
    expect(profile).toMatchObject({
      id: "u1",
      fullName: "Ada",
      avatarUrl: null,
      timezone: "Asia/Bishkek",
      language: "en",
      theme: "dark",
      onboardedAt: null,
    });
  });

  it("updates the profile with a snake_case payload filtered by the JWT identity", async () => {
    const chain = updateChain(
      singleResult({ ...PROFILE_ROW, full_name: "Ada L.", language: "ru", theme: "dark" }),
    );
    stubClient("u1", chain.entry);

    const profile = await updateProfile({ fullName: "Ada L.", language: "ru", theme: "dark" });

    expect(chain.entry).toHaveBeenCalledWith("profiles");
    expect(chain.mocks.update).toHaveBeenCalledWith({
      full_name: "Ada L.",
      language: "ru",
      theme: "dark",
    });
    expect(chain.mocks.eq).toHaveBeenCalledWith("id", "u1");
    expect(profile.fullName).toBe("Ada L.");
    expect(profile.language).toBe("ru");
  });

  it("maps a user_preferences row from snake_case to camelCase", async () => {
    const chain = selectChain(singleResult(PREFERENCES_ROW));
    stubClient("u1", chain.entry);

    const prefs = await getPreferences();

    expect(chain.entry).toHaveBeenCalledWith("user_preferences");
    expect(chain.mocks.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(prefs).toMatchObject({
      id: "p1",
      userId: "u1",
      wakeUpTime: "07:00",
      sleepTime: "23:00",
    });
  });

  it("updates preferences with snake_case times filtered by the JWT identity", async () => {
    const chain = updateChain(singleResult({ ...PREFERENCES_ROW, wake_up_time: "06:30" }));
    stubClient("u1", chain.entry);

    const prefs = await updatePreferences({ wakeUpTime: "06:30", sleepTime: "22:30" });

    expect(chain.mocks.update).toHaveBeenCalledWith({
      wake_up_time: "06:30",
      sleep_time: "22:30",
    });
    expect(chain.mocks.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(prefs.wakeUpTime).toBe("06:30");
  });

  it("maps the availability JSONB columns to camelCase on read", async () => {
    const workingHours = { mon: [{ start: "09:00", end: "12:00" }] };
    const studyHours = { tue: [{ start: "18:00", end: "20:00" }] };
    const preferredWorkPeriods = { sat: [{ start: "10:00", end: "11:00" }] };
    const chain = selectChain(
      singleResult({
        ...PREFERENCES_ROW,
        working_hours: workingHours,
        study_hours: studyHours,
        preferred_work_periods: preferredWorkPeriods,
      }),
    );
    stubClient("u1", chain.entry);

    const prefs = await getPreferences();

    expect(prefs.workingHours).toStrictEqual(workingHours);
    expect(prefs.studyHours).toStrictEqual(studyHours);
    expect(prefs.preferredWorkPeriods).toStrictEqual(preferredWorkPeriods);
  });

  it("writes the three availability objects as snake_case JSONB", async () => {
    const workingHours = { mon: [{ start: "09:00", end: "12:00" }] };
    const studyHours = { tue: [{ start: "18:00", end: "20:00" }] };
    const preferredWorkPeriods = { sat: [{ start: "10:00", end: "11:00" }] };
    const chain = updateChain(
      singleResult({
        ...PREFERENCES_ROW,
        working_hours: workingHours,
        study_hours: studyHours,
        preferred_work_periods: preferredWorkPeriods,
      }),
    );
    stubClient("u1", chain.entry);

    const prefs = await updatePreferences({ workingHours, studyHours, preferredWorkPeriods });

    expect(chain.mocks.update).toHaveBeenCalledWith({
      working_hours: workingHours,
      study_hours: studyHours,
      preferred_work_periods: preferredWorkPeriods,
    });
    expect(chain.mocks.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(prefs.workingHours).toStrictEqual(workingHours);
    expect(prefs.studyHours).toStrictEqual(studyHours);
    expect(prefs.preferredWorkPeriods).toStrictEqual(preferredWorkPeriods);
  });

  it("sends only the availability keys the caller passed", async () => {
    const workingHours = { wed: [{ start: "08:00", end: "09:00" }] };
    const chain = updateChain(singleResult({ ...PREFERENCES_ROW, working_hours: workingHours }));
    stubClient("u1", chain.entry);

    await updatePreferences({ workingHours });

    expect(chain.mocks.update).toHaveBeenCalledWith({ working_hours: workingHours });
    expect(chain.mocks.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ study_hours: expect.anything() }),
    );
  });

  it("markOnboarded writes onboarded_at through updateProfile", async () => {
    const stamped = { ...PROFILE_ROW, onboarded_at: "2026-11-03T00:00:00.000Z" };
    const chain = updateChain(singleResult(stamped));
    stubClient("u1", chain.entry);

    const profile = await markOnboarded();

    expect(chain.mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ onboarded_at: expect.any(String) }),
    );
    expect(profile.onboardedAt).toBe(stamped.onboarded_at);
  });

  it("never trusts a caller-provided user: identity comes from auth.getUser()", async () => {
    const chain = selectChain(singleResult(PROFILE_ROW));
    stubClient("jwt-user-9", chain.entry);

    await getProfile();

    expect(chain.mocks.eq).toHaveBeenCalledWith("id", "jwt-user-9");
  });

  it("throws when there is no authenticated user", async () => {
    const chain = selectChain(singleResult(PROFILE_ROW));
    stubClient(null, chain.entry);

    await expect(getProfile()).rejects.toThrow("Not authenticated.");
  });

  it("surfaces database errors with their message", async () => {
    const chain = selectChain(singleResult(null, { message: "row not found" }));
    stubClient("u1", chain.entry);

    await expect(getProfile()).rejects.toThrow("row not found");
  });
});
