import { expect, test, type Page } from "@playwright/test";

import {
  dismissOnboarding,
  E2E_EMAIL,
  E2E_PASSWORD,
  getSessionAccessToken,
  signIn,
  skipWithoutCreds,
} from "./helpers";

/**
 * Live planner flow (iteration 4, units 9–10). Hits the real Supabase project
 * with the shared e2e account — no `service_role`, only UI paths plus one
 * read-only REST probe for the RLS negative.
 *
 * Requirements before running live:
 * - migration `supabase/migrations/0005_time_blocks.sql` applied (without it
 *   every test here fails on the missing table — do NOT run this spec before
 *   that; the table probe below only guards the RLS test, the UI tests need
 *   the real table);
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

function dayKeyInZone(timeZone: string, plusDays: number): string {
  const shifted = new Date(Date.now() + plusDays * 86_400_000);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

/**
 * The planner never prints the profile time zone on an empty day, so the
 * zone is read once from the dashboard header (same pattern as
 * `dashboard.spec.ts`), not from the runner machine's local date.
 */
async function profileTimeZone(page: Page): Promise<string> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  const headerText = (await page.getByText(/times shown in/).textContent()) ?? "";

  return headerText.split("times shown in")[1]?.trim() || "UTC";
}

async function openDay(page: Page, dateKey: string): Promise<void> {
  await page.goto(`/planner?view=day&date=${dateKey}`);
  // Stable anchor: the page chrome (view switch) is rendered in EVERY state —
  // loading skeleton, empty day, day with blocks — so it never depends on
  // whether the day has blocks.
  await expect(page.getByRole("navigation", { name: "Planner view" })).toBeVisible();
  // The day itself has settled once exactly one of its two legal states (§9.4)
  // is on screen. Which one is asserted explicitly by each test below.
  await expect(
    page.getByText("Nothing planned for this day").or(page.getByText("Day summary")),
  ).toBeVisible();
}

async function createBreakBlock(
  page: Page,
  title: string,
  dateKey: string,
  start: string,
  end: string,
): Promise<void> {
  await page.getByRole("button", { name: "Add block" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a time block" });
  await dialog.getByLabel("Block type").selectOption("break");
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel(/^Starts/).fill(`${dateKey}T${start}`);
  await dialog.getByLabel(/^Ends/).fill(`${dateKey}T${end}`);
  await dialog.getByRole("button", { name: "Add block" }).click();
  await expect(page.locator("li", { hasText: title })).toBeVisible();
  // Any created block makes the day non-empty, so the summary must render.
  // This stays local to block creation — openDay itself accepts both states.
  await expect(page.getByText("Day summary")).toBeVisible();
}

async function deleteBlock(page: Page, title: string): Promise<void> {
  await page
    .getByRole("button", { name: new RegExp(`^Edit ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) })
    .click();
  const editor = page.getByRole("dialog", { name: "Edit block" });
  await editor.getByRole("button", { name: "Delete block" }).click();
  const confirm = page.getByRole("dialog");
  await confirm.getByRole("button", { name: "Delete block" }).click();
  await expect(page.locator("li", { hasText: title })).toHaveCount(0);
}

test("planner: day and week views switch through the URL", async ({ page }) => {
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await dismissOnboarding(page);

  const timeZone = await profileTimeZone(page);
  const dateKey = dayKeyInZone(timeZone, 3);

  await openDay(page, dateKey);
  expect(page.url()).toContain(`view=day&date=${dateKey}`);
  // No test ever writes to this day: the empty state (§9.4) is the expectation.
  await expect(page.getByText("Nothing planned for this day")).toBeVisible();

  await page.getByRole("link", { name: "Week" }).click();
  // Same empty-day pattern as DayView: an empty week renders no "Week summary".
  await expect(page.getByText("Nothing planned for this week")).toBeVisible();
  expect(page.url()).toContain("view=week");

  await page.getByRole("link", { name: "Day" }).click();
  await expect(page.getByText("Nothing planned for this day")).toBeVisible();
  expect(page.url()).toContain("view=day");
});

test("planner: a manual break block is created and deleted", async ({ page }) => {
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await dismissOnboarding(page);

  const timeZone = await profileTimeZone(page);
  const dateKey = dayKeyInZone(timeZone, 4);
  const title = `E2E plan break ${Date.now()}`;

  await openDay(page, dateKey);
  await expect(page.getByText("Nothing planned for this day")).toBeVisible();
  await createBreakBlock(page, title, dateKey, "09:00", "10:00");
  await deleteBlock(page, title);
  await expect(page.getByText("Nothing planned for this day")).toBeVisible();
});

test("planner: an overlapping block is saved only after confirmation", async ({ page }) => {
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await dismissOnboarding(page);

  const timeZone = await profileTimeZone(page);
  const dateKey = dayKeyInZone(timeZone, 5);
  const stamp = Date.now();
  const first = `E2E plan first ${stamp}`;
  const second = `E2E plan second ${stamp}`;

  await openDay(page, dateKey);
  await expect(page.getByText("Nothing planned for this day")).toBeVisible();
  await createBreakBlock(page, first, dateKey, "09:00", "10:00");

  await page.getByRole("button", { name: "Add block" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a time block" });
  await dialog.getByLabel("Block type").selectOption("break");
  await dialog.getByLabel("Title").fill(second);
  await dialog.getByLabel(/^Starts/).fill(`${dateKey}T09:30`);
  await dialog.getByLabel(/^Ends/).fill(`${dateKey}T10:30`);
  await dialog.getByRole("button", { name: "Add block" }).click();

  // The conflict is known, consent is missing: nothing is written yet.
  await expect(
    dialog.getByText("Tick the box above to keep this block at this time."),
  ).toBeVisible();
  await expect(page.locator("li", { hasText: second })).toHaveCount(0);

  await dialog.getByRole("checkbox", { name: "Keep this block at this time anyway" }).check();
  await dialog.getByRole("button", { name: "Add block" }).click();
  await expect(page.locator("li", { hasText: second })).toBeVisible();
  await expect(page.getByText("Overlaps").first()).toBeVisible();

  await deleteBlock(page, second);
  await deleteBlock(page, first);
  await expect(page.getByText("Nothing planned for this day")).toBeVisible();
});

test("planner: generate then accept writes the blocks, generate then cancel writes nothing", async ({
  page,
}) => {
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await dismissOnboarding(page);

  const timeZone = await profileTimeZone(page);
  const stamp = Date.now();
  const acceptDay = dayKeyInZone(timeZone, 6);
  const cancelDay = dayKeyInZone(timeZone, 7);
  const taskA = `E2E plan task A ${stamp}`;
  const taskB = `E2E plan task B ${stamp}`;

  // Two estimated tasks: the only input the deterministic plan needs.
  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
  for (const title of [taskA, taskB]) {
    await page.getByRole("button", { name: "New task" }).click();
    const taskDialog = page.getByRole("dialog");
    await taskDialog.getByLabel("Title").fill(title);
    await taskDialog.getByLabel("Estimated duration (minutes)").fill("30");
    await taskDialog.getByRole("button", { name: "Create task" }).click();
    await expect(page.locator("li", { hasText: title })).toBeVisible();
  }

  // Accept: the preview writes its slots as task blocks and closes.
  await openDay(page, acceptDay);
  await expect(page.getByText("Nothing planned for this day")).toBeVisible();
  await page.getByRole("button", { name: "Generate plan" }).click();
  await expect(page.getByRole("heading", { name: "Plan preview" })).toBeVisible();
  await expect(page.getByText("Nothing is saved until you accept.")).toBeVisible();
  await page.getByRole("button", { name: "Accept plan" }).click();
  await expect(page.getByRole("heading", { name: "Plan preview" })).toHaveCount(0);
  await expect(page.locator("li", { hasText: taskA })).toBeVisible();
  await expect(page.locator("li", { hasText: taskB })).toBeVisible();
  // Accept wrote task blocks, so the day is no longer empty (§9.4).
  await expect(page.getByText("Day summary")).toBeVisible();

  // Cancel: the day stays exactly as it was — no block is written.
  await openDay(page, cancelDay);
  await expect(page.getByText("Nothing planned for this day")).toBeVisible();
  await page.getByRole("button", { name: "Generate plan" }).click();
  await expect(page.getByRole("heading", { name: "Plan preview" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Plan preview" })).toHaveCount(0);
  await expect(page.getByText("Nothing planned for this day")).toBeVisible();

  // Cleanup: the accepted blocks, then the tasks.
  await openDay(page, acceptDay);
  await deleteBlock(page, taskA);
  await deleteBlock(page, taskB);

  await page.goto("/tasks");
  for (const title of [taskA, taskB]) {
    const row = page.locator("li", { hasText: title });
    await row.getByRole("button", { name: `Delete ${title}` }).click();
    const confirm = page.getByRole("dialog");
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).toHaveCount(0);
  }
});

test("planner rls: a foreign user_id in time_blocks is invisible", async ({
  page,
  request,
}) => {
  test.skip(
    !SUPABASE_URL || !SUPABASE_ANON_KEY,
    "SUPABASE_URL / SUPABASE_ANON_KEY are not set — add them to .env.e2e to run the RLS probe.",
  );

  // Without migration 0005 the table does not exist yet: skip, do not fail.
  // Same posture as scripts/verify-rls.mjs — only the anon key, never
  // service_role; a foreign id stands in for user B because every policy is
  // `... = auth.uid()`.
  const probe = await request.get(`${SUPABASE_URL}/rest/v1/time_blocks?select=id&limit=1`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  test.skip(
    probe.status() !== 200,
    `time_blocks is not provisioned yet (HTTP ${probe.status()}) — apply 0005, then rerun.`,
  );

  // Single sign-in per run: reuse the access token of the already open
  // browser session (global-setup signed in once) instead of a second
  // password-grant sign-in on the shared e2e account (Supabase Auth
  // rate-limits extra sign-ins). Same posture as the recurrence cleanup:
  // anon key only, RLS scopes everything to the signed-in user.
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  const token = await getSessionAccessToken(page);

  const foreign = await request.get(
    `${SUPABASE_URL}/rest/v1/time_blocks?select=id&user_id=eq.${FOREIGN_ID}`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  );
  expect(foreign.ok()).toBeTruthy();
  expect(await foreign.json()).toEqual([]);
});
