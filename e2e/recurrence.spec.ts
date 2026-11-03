import { expect, test } from "@playwright/test";

import { dismissOnboarding, E2E_EMAIL, E2E_PASSWORD, signIn, skipWithoutCreds } from "./helpers";

/**
 * Live recurrence flow (Phase 2.5, Unit 7). Hits the real Supabase project
 * with the shared e2e account — no `service_role`, only UI paths. Creates a
 * daily rule with a close end date (3 instances), checks the Repeat badge,
 * reloads (no duplicates), then deletes the instances it created.
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
  const end = new Date(today.getTime() + 2 * 86_400_000);

  await page.getByRole("button", { name: "New task" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Due date").fill(toDateKey(today));
  await dialog.getByLabel("Repeat", { exact: true }).check();
  await dialog.getByLabel("Frequency").selectOption("daily");
  await dialog.getByLabel("Repeat ends").fill(toDateKey(end));
  await dialog.getByRole("button", { name: "Create task" }).click();

  const rows = page.locator("li", { hasText: title });
  await expect(rows.first()).toBeVisible();
  await expect(rows).toHaveCount(3);
  await expect(rows.first().getByText("Repeat", { exact: true })).toBeVisible();

  // Second load must not duplicate the series (idempotent top-up).
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
  await expect(page.locator("li", { hasText: title })).toHaveCount(3);

  // Cleanup: delete every instance created above, leaving the orphan rule
  // with no template (future top-ups generate nothing).
  for (let i = 0; i < 5; i += 1) {
    const remaining = page.locator("li", { hasText: title });
    if ((await remaining.count()) === 0) {
      break;
    }
    await remaining.first().getByRole("button", { name: `Delete ${title}` }).click();
    const confirm = page.getByRole("dialog");
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.locator("li", { hasText: title })).toHaveCount(
      Math.max(0, (await remaining.count()) - 1),
    );
  }

  await expect(page.locator("li", { hasText: title })).toHaveCount(0);
});
