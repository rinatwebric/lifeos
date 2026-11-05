import { expect, test } from "@playwright/test";

import { dismissOnboarding, E2E_EMAIL, E2E_PASSWORD, restoreProfileBaseline, signIn, skipWithoutCreds } from "./helpers";

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

  test("EN to RU translates the shell instantly and persists after reload", async ({ page, request }) => {
    skipWithoutCreds();
    await signIn(page, E2E_EMAIL, E2E_PASSWORD);
    await dismissOnboarding(page);
    // Precondition, not assertion: the shared account may be left RU/dark by
    // an interrupted run or a parallel agent. Start from the EN/light
    // baseline through REST (asserted), the UI round-trip below is the test.
    await restoreProfileBaseline(page, request, { language: "en", theme: "light" });
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    const language = page.getByLabel("Language");
    const original = await language.inputValue();
    const originalTheme = await page.getByLabel("Theme").inputValue();

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

    // Restore the account's original language AND theme through REST (same
    // single-field PATCHs the app sends, asserted on the persisted row): a UI
    // background PATCH issued right before context-close may never land.
    await restoreProfileBaseline(page, request, { language: original, theme: originalTheme });
  });
});
