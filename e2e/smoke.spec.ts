import { expect, test } from "@playwright/test";

test("dashboard renders and primary navigation works", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

  await page.getByRole("link", { name: "Goals", exact: true }).first().click();

  await expect(page.getByRole("heading", { name: "Goals", exact: true })).toBeVisible();
  await expect(page.getByText("Phase 2 — Goals & Tasks")).toBeVisible();
});
