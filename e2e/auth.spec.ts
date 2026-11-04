import { expect, test } from "@playwright/test";

import {
  dismissOnboarding,
  E2E_EMAIL,
  E2E_PASSWORD,
  E2E_SIGNUP_EMAIL,
  signIn,
  skipWithoutCreds,
} from "./helpers";

/**
 * Live-auth suite (iteration 1.2, unit 6). Hits the real Supabase project.
 * No `service_role` anywhere: every step goes through the same UI and
 * anon-key paths a user would take.
 *
 * Playwright gives each test a fresh browser context by default, so sessions
 * never leak between scenarios. When the credentials are absent (CI without
 * secrets) the whole file skips instead of failing.
 */

skipWithoutCreds();

test("anonymous visit to / redirects to /sign-in", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("signs in with the test user and lands on the dashboard", async ({ page }) => {
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await dismissOnboarding(page);

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("settings persist wake/sleep across reload", async ({ page }) => {
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await dismissOnboarding(page);

  await page.goto("/settings");

  const wake = page.getByLabel("Wake-up time");
  const sleep = page.getByLabel("Sleep time");
  await expect(wake).toBeVisible();

  await wake.fill("06:30");
  await sleep.fill("22:45");

  // Both tables save independently and the success note unmounts on
  // refetch, so completion is observed on the network and persistence
  // is asserted after reload.
  const profileSaved = page.waitForResponse(
    (response) => response.url().includes("/profiles") && response.request().method() === "PATCH",
  );
  const preferencesSaved = page.waitForResponse(
    (response) =>
      response.url().includes("/user_preferences") && response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save day setup" }).click();
  await profileSaved;
  await preferencesSaved;

  await page.reload();

  // The time input normalizes to HH:MM:SS; persistence is what matters.
  await expect(page.getByLabel("Wake-up time")).toHaveValue("06:30:00");
  await expect(page.getByLabel("Sleep time")).toHaveValue("22:45:00");

  // Leave the shared e2e account on the defaults for the next run.
  await page.getByLabel("Wake-up time").fill("07:00");
  await page.getByLabel("Sleep time").fill("23:00");
  const profileRestored = page.waitForResponse(
    (response) => response.url().includes("/profiles") && response.request().method() === "PATCH",
  );
  const preferencesRestored = page.waitForResponse(
    (response) =>
      response.url().includes("/user_preferences") && response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save day setup" }).click();
  await profileRestored;
  await preferencesRestored;
});

test("sign out returns to /sign-in and / becomes unavailable", async ({ page }) => {
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await dismissOnboarding(page);

  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/sign-in$/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("sign-up with confirmation OFF lands directly in the app", async ({ page }) => {
  // Needs a real inbox: fake `e2e.signup.*@gmail.com` senders got the
  // project's default SMTP restricted, and with `Confirm email = OFF`
  // sign-up returns a session immediately (no "Check your email" screen).
  test.skip(
    !E2E_SIGNUP_EMAIL,
    "E2E_SIGNUP_EMAIL is not set — copy .env.e2e.example. Skipping live sign-up.",
  );

  // A `+`-alias of the real mailbox: unique user per run, same inbox.
  // The user stays (no admin API to remove it); cleanup is a dashboard job.
  const stamp = Date.now();
  const [local, domain] = E2E_SIGNUP_EMAIL.split("@");
  const email = `${local}+e2e${stamp}@${domain}`;

  await page.goto("/sign-up");
  await page.getByLabel("Full name (optional)").fill("E2E Signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(`E2e-pass-${stamp}`);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
});
