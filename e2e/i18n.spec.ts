import { expect, test } from "@playwright/test";

import { dismissOnboarding, E2E_EMAIL, E2E_PASSWORD, signIn, skipWithoutCreds } from "./helpers";

/**
 * EN↔RU + theme persistence (branch `feat/i18n-preferences`).
 *
 * SAFETY: mutates `profiles.language/theme` on the SHARED e2e account.
 * Run only when no other agent uses the account (never concurrently with
 * the Phase 5 track). The test restores the original values at the end.
 * Without `E2E_EMAIL/E2E_PASSWORD` the suite skips (CI without secrets).
 */
test.describe("i18n EN/RU + theme", () => {
  test.skip(!E2E_EMAIL || !E2E_PASSWORD, "no e2e credentials");

  test("EN to RU translates the shell instantly and persists after reload", async ({ page }) => {
    skipWithoutCreds();
    await signIn(page, E2E_EMAIL, E2E_PASSWORD);
    await dismissOnboarding(page);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    const language = page.getByLabel("Language");
    const original = await language.inputValue();

    // EN → RU: instant, no Save button, no reload.
    await language.selectOption("ru");
    await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Дашборд" }).first()).toBeVisible();

    // RU → EN.
    await page.getByLabel("Язык").selectOption("en");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    // RU again, then reload: last choice wins after reload.
    await page.getByLabel("Language").selectOption("ru");
    await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();

    // Theme round-trip + reload persistence.
    const theme = page.getByLabel("Тема");
    await theme.selectOption("dark");
    await expect(page.locator("html.dark")).toHaveCount(1);
    await theme.selectOption("light");
    await page.reload();
    await expect(page.locator("html.dark")).toHaveCount(0);

    // Restore the account's original language and wait until the
    // background PATCH lands — the context closes right after this test,
    // and an un-awaited sync would leave the shared account dirty.
    // Body-matched: a stale in-flight PATCH for another field must not
    // satisfy the waiter.
    const restoreLabel = original === "ru" ? "Язык" : "Language";
    const restoreSelect = page.getByLabel(restoreLabel);
    const currentLang = await restoreSelect.inputValue();
    if (currentLang !== original) {
      const saved = page.waitForResponse(
        (r) =>
          r.request().method() === "PATCH" &&
          r.url().includes("/rest/v1/profiles") &&
          (r.request().postData() ?? "").includes(`"language":"${original}"`),
      );
      await restoreSelect.selectOption(original);
      await saved;
    }
  });
});
