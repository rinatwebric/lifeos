import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { dismissOnboarding, restoreProfileBaseline, signIn, skipWithoutCreds } from "./helpers";

/**
 * Integration: RU Habits/Analytics on desktop + 375px, both themes.
 * Read-only — creates no habits/tasks/goals, touches only
 * `profiles.language`/`profiles.theme` on the shared account and restores
 * both at the end of every test (same discipline as `e2e/i18n.spec.ts`).
 * Runs in the single controlled `workers:1` live pass, after `habits.spec`.
 */
test.describe("i18n RU habits/analytics", () => {
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, "no e2e credentials");

  // Hygiene restore through the same single-field REST PATCHs the app sends.
  // UI selects apply instantly on-device, but a background PATCH issued right
  // before navigation/context-close may never land, so the restore asserts
  // the persisted value instead of trusting the UI round-trip.
  async function restoreAccount(page: Page, request: APIRequestContext, originalLang: string, originalTheme: string): Promise<void> {
    await restoreProfileBaseline(page, request, {
      language: originalLang || "en",
      theme: originalTheme || "light",
    });
  }

  test("RU habits + analytics on desktop, both themes, reload keeps RU", async ({ page, request }) => {
    skipWithoutCreds();
    await signIn(page, process.env.E2E_EMAIL ?? "", process.env.E2E_PASSWORD ?? "");
    await dismissOnboarding(page);
    // Precondition (asserted): EN/light baseline regardless of who touched
    // the shared account before this run.
    await restoreProfileBaseline(page, request, { language: "en", theme: "light" });

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    const originalLang = await page.getByLabel("Language").inputValue();
    const originalTheme = await page.getByLabel("Theme").inputValue();

    try {
      await page.getByLabel("Language").selectOption("ru");
      await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();

      await page.goto("/habits");
      await expect(page.getByRole("heading", { name: "Привычки", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Новая привычка" })).toBeVisible();

      await page.goto("/analytics");
      await expect(page.getByRole("heading", { name: "Аналитика", exact: true })).toBeVisible();
      await expect(page.getByRole("group", { name: "Период аналитики" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Обзор недели" })).toBeVisible();

      await page.getByRole("button", { name: "Месяц", exact: true }).click();
      await expect(page.getByRole("button", { name: "Месяц", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      await page.goto("/settings");
      await page.getByLabel("Тема").selectOption("dark");
      await expect(page.locator("html.dark")).toHaveCount(1);
      await page.goto("/habits");
      await expect(page.getByRole("heading", { name: "Привычки", exact: true })).toBeVisible();
      await expect(page.locator("html.dark")).toHaveCount(1);

      await page.goto("/settings");
      await page.getByLabel("Тема").selectOption("light");
      await expect(page.locator("html.dark")).toHaveCount(0);
      await page.goto("/analytics");
      await expect(page.getByRole("heading", { name: "Аналитика", exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "ru");

      await page.reload();
      await expect(page.getByRole("heading", { name: "Аналитика", exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    } finally {
      await restoreAccount(page, request, originalLang, originalTheme);
    }
  });

  test("RU habits + analytics at 375px without overflow", async ({ page, request }) => {
    skipWithoutCreds();
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, process.env.E2E_EMAIL ?? "", process.env.E2E_PASSWORD ?? "");
    await dismissOnboarding(page);
    // Precondition (asserted): EN/light baseline regardless of who touched
    // the shared account before this run.
    await restoreProfileBaseline(page, request, { language: "en", theme: "light" });

    await page.goto("/settings");
    const langSelect = page.getByLabel("Язык").or(page.getByLabel("Language"));
    const current = (await langSelect.first().inputValue().catch(() => "en")) || "en";
    const wasRu = current === "ru";
    const themeSelect = page.getByLabel("Тема").or(page.getByLabel("Theme"));
    const originalTheme = (await themeSelect.first().inputValue().catch(() => "light")) || "light";
    if (!wasRu) {
      await page.getByLabel("Language").selectOption("ru");
      await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
    }

    async function expectNoOverflow(): Promise<void> {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    }

    try {
      await page.goto("/habits");
      await expect(page.getByRole("heading", { name: "Привычки", exact: true })).toBeVisible();
      await expectNoOverflow();

      await page.goto("/analytics");
      await expect(page.getByRole("heading", { name: "Аналитика", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Обзор недели" })).toBeVisible();
      await expectNoOverflow();

      await page.getByRole("button", { name: "День", exact: true }).click();
      await expect(page.getByRole("button", { name: "День", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expectNoOverflow();

      await page.reload();
      await expect(page.getByRole("heading", { name: "Аналитика", exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "ru");
      await expectNoOverflow();
    } finally {
      if (!wasRu) {
        await restoreProfileBaseline(page, request, { language: "en", theme: originalTheme });
      }
    }
  });
});
