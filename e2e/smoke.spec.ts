import { expect, test } from "@playwright/test";

import { dismissOnboarding, E2E_EMAIL, E2E_PASSWORD, signIn, skipWithoutCreds } from "./helpers";

/**
 * Post-guards smoke test: the shell renders for a signed-in user and primary
 * navigation works. (Before iteration 1.2 unit 5 this asserted the dashboard
 * anonymously; anonymous `/` now redirects to `/sign-in` by design.)
 */

skipWithoutCreds();

test("dashboard renders and primary navigation works", async ({ page }) => {
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await dismissOnboarding(page);

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

  await page.getByRole("link", { name: "Goals", exact: true }).first().click();

  await expect(page.getByRole("heading", { name: "Goals", exact: true })).toBeVisible();
  await expect(page.getByText("Phase 2 — Goals & Tasks")).toBeVisible();
});
