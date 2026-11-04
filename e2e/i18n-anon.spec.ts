import { expect, test } from "@playwright/test";

/**
 * Credential-free i18n checks (anonymous surface, zero shared-account impact).
 * Safe to run any time — no sign-in, no PATCH, only the test browser's own
 * localStorage. Covers: RU rendering without reload, html lang + theme init
 * from device storage, reload persistence, and a mobile viewport spot check.
 *
 * The authenticated EN↔RU round-trip lives in `e2e/i18n.spec.ts`, which
 * mutates the shared account and runs only in an idle window with creds.
 */

const RU_LANG = JSON.stringify({ value: "ru", userId: null, updatedAt: "2026-11-04T00:00:00.000Z" });
const DARK_THEME = JSON.stringify({ value: "dark", userId: null, updatedAt: "2026-11-04T00:00:00.000Z" });

test.describe("i18n anonymous (no account impact)", () => {
  test("sign-in renders Russian from device storage, no reload", async ({ page }) => {
    await page.addInitScript(
      ({ lang, theme }) => {
        window.localStorage.setItem("lifeos-language", lang);
        window.localStorage.setItem("lifeos-theme", theme);
      },
      { lang: RU_LANG, theme: DARK_THEME },
    );

    await page.goto("/sign-in");

    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await expect(page.locator("html.dark")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "С возвращением" })).toBeVisible();
    await expect(page.getByLabel("Пароль")).toBeVisible();
  });

  test("English default, RU persists across reload", async ({ page }) => {
    await page.goto("/sign-in");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

    await page.evaluate((lang) => {
      window.localStorage.setItem("lifeos-language", lang);
    }, RU_LANG);
    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await expect(page.getByRole("heading", { name: "С возвращением" })).toBeVisible();
  });

  test("mobile viewport renders RU auth without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript((lang) => {
      window.localStorage.setItem("lifeos-language", lang);
    }, RU_LANG);

    await page.goto("/sign-in");

    await expect(page.getByRole("heading", { name: "С возвращением" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
