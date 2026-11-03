import { expect, test } from "@playwright/test";

import { dismissOnboarding, E2E_EMAIL, E2E_PASSWORD, signIn, skipWithoutCreds } from "./helpers";

/**
 * Live goals smoke flow (iteration 2, unit 6 rewrite). The committed history
 * never contained an `e2e/goals.spec.ts` (`git log --all -- e2e/` shows only
 * `auth`/`smoke`), so this is a fresh minimal rewrite: create a uniquely
 * named goal, see it in the list, delete it with confirmation.
 */

skipWithoutCreds();

test("goals: create and delete a goal", async ({ page }) => {
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await dismissOnboarding(page);

  await page.goto("/goals");
  await expect(page.getByRole("heading", { name: "Goals", exact: true })).toBeVisible();

  const title = `E2E goal ${Date.now()}`;

  await page.getByRole("button", { name: "New goal" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Create goal" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.getByRole("button", { name: `Delete ${title}` }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm.getByText(/tasks will stay but lose the link/)).toBeVisible();
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
});
