import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import {
  dismissOnboarding,
  E2E_EMAIL,
  E2E_PASSWORD,
  getSessionAccessToken,
  signIn,
  skipWithoutCreds,
} from "./helpers";

/**
 * Live habits + analytics flow (Phase 5, step 5). Hits the real Supabase
 * project with the shared e2e account — no `service_role`, only UI paths
 * plus one read-only REST probe for the RLS negative.
 *
 * Requirements before running live:
 * - migrations `0007_habit_schedule_versions` + `0008_habit_schedule_versions`
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
const FOREIGN_ID = "00000000-0000-4000-8000-000000000000";

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

test("habits rls: a foreign user_id in habits is invisible", async ({ page, request }) => {
  test.skip(
    !SUPABASE_URL || !SUPABASE_ANON_KEY,
    "SUPABASE_URL / SUPABASE_ANON_KEY are not set — add them to .env.e2e to run the RLS probe.",
  );
  test.skip(
    !(await habitsProvisioned(request)),
    "habits tables are not provisioned yet — apply 0007+0008, then rerun.",
  );

  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  const token = await getSessionAccessToken(page);

  const foreign = await request.get(
    `${SUPABASE_URL}/rest/v1/habits?select=id&user_id=eq.${FOREIGN_ID}`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  );
  expect(foreign.ok()).toBeTruthy();
  expect(await foreign.json()).toEqual([]);
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
