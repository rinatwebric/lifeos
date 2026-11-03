import { expect, test } from "@playwright/test";

import { dismissOnboarding, E2E_EMAIL, E2E_PASSWORD, signIn, skipWithoutCreds } from "./helpers";

/**
 * Live recurrence flow (Phase 2.5, Unit 7). Hits the real Supabase project
 * with the shared e2e account — no `service_role`, only UI paths. Creates a
 * daily rule with a close end date (3 instances) plus scheduled times,
 * checks the Repeat badge and that the second instance keeps the wall
 * times (09:00–10:00 shifted by whole days), reloads (no duplicates),
 * then deletes the instances it created.
 */

skipWithoutCreds();

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

test("recurrence: create daily series, badge, reload without duplicates, cleanup", async ({
  page,
}) => {
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await dismissOnboarding(page);

  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();

  const title = `E2E repeat ${Date.now()}`;
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const end = new Date(today.getTime() + 2 * 86_400_000);
  const startInput = `${toDateKey(today)}T09:00`;
  const endInput = `${toDateKey(today)}T10:00`;
  const expectedSecondStart = `${toDateKey(tomorrow)}T09:00`;
  const expectedSecondEnd = `${toDateKey(tomorrow)}T10:00`;

  await page.getByRole("button", { name: "New task" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Due date").fill(toDateKey(today));
  await dialog.getByLabel("Scheduled start").fill(startInput);
  await dialog.getByLabel("Scheduled end").fill(endInput);
  await dialog.getByLabel("Repeat", { exact: true }).check();
  await dialog.getByLabel("Frequency").selectOption("daily");
  await dialog.getByLabel("Repeat ends").fill(toDateKey(end));
  await dialog.getByRole("button", { name: "Create task" }).click();

  const rows = page.locator("li", { hasText: title });
  await expect(rows.first()).toBeVisible();
  await expect(rows).toHaveCount(3);
  await expect(rows.first().getByText("Repeat", { exact: true })).toBeVisible();

  // The second instance keeps the template's wall times, shifted by one day.
  await rows.nth(1).getByRole("button", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog");
  await expect(editDialog.getByLabel("Scheduled start")).toHaveValue(expectedSecondStart);
  await expect(editDialog.getByLabel("Scheduled end")).toHaveValue(expectedSecondEnd);
  await editDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("li", { hasText: title })).toHaveCount(3);

  // Second load must not duplicate the series (idempotent top-up).
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
  await expect(page.locator("li", { hasText: title })).toHaveCount(3);

  // Cleanup: delete every instance created above, leaving the orphan rule
  // with no template (future top-ups generate nothing). The sign-in top-up
  // may still be in flight and resurrect one deleted date once (read-then-
  // insert race), so loop generously until the count is stably 0 instead of
  // asserting an exact decrease per iteration.
  for (let i = 0; i < 12; i += 1) {
    const remaining = page.locator("li", { hasText: title });
    if ((await remaining.count()) === 0) {
      break;
    }
    await remaining.first().getByRole("button", { name: `Delete ${title}` }).click();
    const confirm = page.getByRole("dialog");
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await page.waitForTimeout(800);
  }

  await expect(page.locator("li", { hasText: title })).toHaveCount(0);
});
