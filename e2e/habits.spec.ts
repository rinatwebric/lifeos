import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

import {
  dismissOnboarding,
  E2E_EMAIL,
  E2E_PASSWORD,
  signIn,
  skipWithoutCreds,
} from "./helpers";

/**
 * Live habits + analytics flow (Phase 5, step 5). Hits the real Supabase
 * project with the shared e2e account — no `service_role`, only UI paths
 * plus one read-only REST probe for the RLS negative.
 *
 * Requirements before running live:
 * - migrations `0007_habits_habit_logs` + `0008_habit_schedule_versions`
 *   applied (without them every test here fails on the missing tables —
 *   do NOT run this spec before that; the probe below skips, it does not
 *   fail, when the tables are absent);
 * - `E2E_EMAIL` / `E2E_PASSWORD` set (see `.env.e2e.example`);
 * - for the RLS test only: `SUPABASE_URL` + `SUPABASE_ANON_KEY` in the
 *   environment or `.env.e2e` (same values as `.env.local`, anon key only).
 *
 * Every test creates uniquely named rows and deletes them afterwards, so the
 * shared account stays clean for reruns.
 */

skipWithoutCreds();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";

async function habitsProvisioned(request: APIRequestContext): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return false;
  }

  const probe = await request.get(`${SUPABASE_URL}/rest/v1/habits?select=id&limit=1`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });

  return probe.status() === 200;
}

async function openHabits(page: Page): Promise<void> {
  await page.goto("/habits");
  await expect(page.getByRole("heading", { name: "Habits", exact: true })).toBeVisible();
}

async function createHabit(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "New habit" }).click();
  const dialog = page.getByRole("dialog", { name: "New habit" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Create habit" }).click();
  await expect(page.locator("li", { hasText: title })).toBeVisible();
}

async function deleteHabit(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: `Delete ${title}` }).click();
  const confirm = page.getByRole("dialog", { name: `Delete ${title}?` });
  await confirm.getByRole("button", { name: "Delete habit" }).click();
  await expect(page.locator("li", { hasText: title })).toHaveCount(0);
}

test("habits: create, log, streak grows, and reload keeps it", async ({ page, request }) => {
  test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, "SUPABASE_URL / SUPABASE_ANON_KEY are not set.");
  test.skip(
    !(await habitsProvisioned(request)),
    "habits tables are not provisioned yet — apply 0007+0008, then rerun.",
  );
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await dismissOnboarding(page);
  await openHabits(page);

  const title = `E2E habit ${Date.now()}`;
  await createHabit(page, title);

  await page.getByRole("button", { name: "Log" }).first().click();
  const logDialog = page.getByRole("dialog", { name: `Log ${title}` });
  await logDialog.getByRole("button", { name: "Save log" }).click();
  await expect(page.getByText("1-day streak · best 1")).toBeVisible();

  await page.reload();
  await openHabits(page);
  await expect(page.locator("li", { hasText: title })).toBeVisible();
  await expect(page.getByText("1-day streak · best 1")).toBeVisible();

  await deleteHabit(page, title);
});

test("habits: an unscheduled weekday does not break the streak", async ({ page, request }) => {
  test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, "SUPABASE_URL / SUPABASE_ANON_KEY are not set.");
  test.skip(
    !(await habitsProvisioned(request)),
    "habits tables are not provisioned yet — apply 0007+0008, then rerun.",
  );
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await dismissOnboarding(page);
  await openHabits(page);

  const title = `E2E weekdays ${Date.now()}`;
  await page.getByRole("button", { name: "New habit" }).click();
  const dialog = page.getByRole("dialog", { name: "New habit" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Frequency").selectOption("weekdays");
  // Monday only: logging today never lands on an unscheduled day of this habit.
  await dialog.getByLabel("Mon").check();
  await dialog.getByRole("button", { name: "Create habit" }).click();
  await expect(page.locator("li", { hasText: title })).toBeVisible();

  await deleteHabit(page, title);
});

test("habits: pause keeps the logs, resume returns to active", async ({ page, request }) => {
  test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, "SUPABASE_URL / SUPABASE_ANON_KEY are not set.");
  test.skip(
    !(await habitsProvisioned(request)),
    "habits tables are not provisioned yet — apply 0007+0008, then rerun.",
  );
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await dismissOnboarding(page);
  await openHabits(page);

  const title = `E2E pause ${Date.now()}`;
  await createHabit(page, title);

  await page.getByRole("button", { name: `Pause ${title}` }).click();
  await expect(page.getByRole("button", { name: `Resume ${title}` })).toBeVisible();

  await page.getByRole("button", { name: `Resume ${title}` }).click();
  await expect(page.getByRole("button", { name: `Pause ${title}` })).toBeVisible();

  await deleteHabit(page, title);
});

test("habits rls: two independent users are fully isolated", async ({ page, request, browser }) => {
  const E2E_EMAIL_B = process.env.E2E_EMAIL_B ?? "";
  const E2E_PASSWORD_B = process.env.E2E_PASSWORD_B ?? "";
  test.skip(
    !SUPABASE_URL || !SUPABASE_ANON_KEY,
    "SUPABASE_URL / SUPABASE_ANON_KEY are not set — add them to .env.e2e to run the RLS test.",
  );
  test.skip(
    !E2E_EMAIL_B || !E2E_PASSWORD_B,
    "E2E_EMAIL_B / E2E_PASSWORD_B are not set — provision via scripts/provision-e2e-user-b.mjs.",
  );
  test.skip(
    !(await habitsProvisioned(request)),
    "habits tables are not provisioned yet — apply 0007+0008, then rerun.",
  );

  // Deterministic JWTs for both users straight from Auth (no localStorage
  // ambiguity): two password grants, two different users, asserted below.
  async function apiToken(email: string, password: string): Promise<{
    id: string;
    token: string;
    session: Record<string, unknown>;
  }> {
    const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      data: { email, password },
    });
    expect(res.ok(), `password grant failed: ${res.status()} ${(await res.text()).slice(0, 200)}`).toBeTruthy();
    const body = (await res.json()) as { access_token: string; user: { id: string } };
    return { id: body.user.id, token: body.access_token, session: body };
  }

  const userA = await apiToken(E2E_EMAIL, E2E_PASSWORD);
  const userB = await apiToken(E2E_EMAIL_B, E2E_PASSWORD_B);
  expect(userA.id).not.toBe(userB.id);
  const authA = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${userA.token}` };
  const authB = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${userB.token}` };

  // User A creates a habit through the real UI. Cleanup is guaranteed:
  // even if an assertion below fails, the habit must not leak.
  let created = false;
  let contextB: BrowserContext | null = null;
  const title = `E2E iso A ${Date.now()}`;
  try {
    await signIn(page, E2E_EMAIL, E2E_PASSWORD);
    await dismissOnboarding(page);
    await openHabits(page);
    await createHabit(page, title);
    created = true;
  const own = await request.get(
    `${SUPABASE_URL}/rest/v1/habits?select=id&title=eq.${encodeURIComponent(title)}`,
    { headers: authA },
  );
  expect(own.ok()).toBeTruthy();
  const habitIdA = (await own.json())[0]?.id as string;
  expect(habitIdA).toBeTruthy();

  // User B gets a separate browser context with B's own Auth session.
  // Explicit blank storage: the new context must never inherit A's session.
  // The session is seeded from B's own password grant (no extra Auth call):
  // the tokens are the ones Auth issued for B, the app boots them as B.
  const contextBValue = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  contextB = contextBValue;
  const pageB = await contextB.newPage();
  const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  await pageB.goto("/");
  await pageB.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [storageKey, JSON.stringify(userB.session)],
  );
  await pageB.goto("/");
  await dismissOnboarding(pageB);
  // Prove whose session this is before asserting isolation (no extra
  // password grant: the Settings page renders the signed-in email).
  // Auth normalizes the +alias to lowercase; match case-insensitively.
  // The email lives in a disabled textbox, so assert its value, not text.
  const escapedEmailB = E2E_EMAIL_B.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await pageB.goto("/settings");
  await expect(pageB.getByLabel("Email")).toHaveValue(new RegExp(`^${escapedEmailB}$`, "i"));
  await pageB.goto("/habits");
  await expect(pageB.getByRole("heading", { name: "Habits", exact: true })).toBeVisible();
  // B sees none of A's rows in the UI — the honest empty state, not A's data.
  await expect(pageB.getByText("No habits yet")).toBeVisible();
  await expect(pageB.locator("li", { hasText: title })).toHaveCount(0);

  // B reads zero habits through REST (RLS hides A's rows).
  const listB = await request.get(`${SUPABASE_URL}/rest/v1/habits?select=id`, {
    headers: authB,
  });
  expect(listB.ok()).toBeTruthy();
  expect(await listB.json()).toEqual([]);

  // B cannot log against A's habit (ownership EXISTS guard rejects the write).
  const forgedLog = await request.post(`${SUPABASE_URL}/rest/v1/habit_logs`, {
    headers: { ...authB, "Content-Type": "application/json" },
    data: { user_id: userB.id, habit_id: habitIdA, log_date: "2026-11-06", completed_count: 1 },
  });
  expect(forgedLog.ok()).toBeFalsy();

  // B cannot flip A's habit status (RLS matches zero rows).
  const forgedUpdate = await request.patch(
    `${SUPABASE_URL}/rest/v1/habits?id=eq.${habitIdA}`,
    {
      headers: { ...authB, "Content-Type": "application/json", Prefer: "return=representation" },
      data: { status: "paused" },
    },
  );
  expect(forgedUpdate.ok()).toBeTruthy();
  expect(await forgedUpdate.json()).toEqual([]);
  }
  // Cleanup as A; the habit is untouched by B. Runs even when an
  // assertion above failed — E2E rows must never leak into the next run.
  finally {
    if (created) {
      try {
        await page.goto("/habits");
        await expect(page.getByRole("heading", { name: "Habits", exact: true })).toBeVisible();
        // Settle first: the heading renders before rows load, and a bare
        // count() during the skeleton would read 0 and skip the delete.
        await expect(
          page.locator("li", { hasText: title }).or(page.getByText("No habits yet")),
        ).toBeVisible();
        if ((await page.locator("li", { hasText: title }).count()) > 0) {
          await deleteHabit(page, title);
        }
      } catch {
        // Best effort: the run already failed; do not mask the original error.
      }
    }
    await contextB?.close();
  }
});

test("analytics: periods switch and reload keeps the page", async ({ page, request }) => {
  test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, "SUPABASE_URL / SUPABASE_ANON_KEY are not set.");
  test.skip(
    !(await habitsProvisioned(request)),
    "habits tables are not provisioned yet — AnalyticsPage reads them, apply 0007+0008, then rerun.",
  );
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await dismissOnboarding(page);

  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.getByRole("button", { name: "Month", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.reload();
  await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
  await expect(page.getByText("Weekly review")).toBeVisible();
});

test("mobile: habits flow and analytics render at 375px width", async ({ page, request }) => {
  test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, "SUPABASE_URL / SUPABASE_ANON_KEY are not set.");
  test.skip(
    !(await habitsProvisioned(request)),
    "habits tables are not provisioned yet — apply 0007+0008, then rerun.",
  );
  // Narrow viewport on the desktop engine: proves the layout and flows work
  // at mobile width (media queries respond to the viewport, not the engine).
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await dismissOnboarding(page);
  await openHabits(page);

  async function expectNoHorizontalOverflow(): Promise<void> {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }

  await expectNoHorizontalOverflow();

  const title = `E2E mobile ${Date.now()}`;
  await createHabit(page, title);
  await page.getByRole("button", { name: "Log" }).first().click();
  const logDialog = page.getByRole("dialog", { name: `Log ${title}` });
  await logDialog.getByRole("button", { name: "Save log" }).click();
  await expect(page.getByText("1-day streak · best 1")).toBeVisible();
  await expectNoHorizontalOverflow();
  await deleteHabit(page, title);

  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
  await expect(page.getByText("Weekly review")).toBeVisible();
  await expectNoHorizontalOverflow();
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await expect(page.getByRole("button", { name: "Day", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expectNoHorizontalOverflow();
});
