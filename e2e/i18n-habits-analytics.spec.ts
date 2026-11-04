import { expect, test, type Page } from "@playwright/test";

import { dismissOnboarding, signIn, skipWithoutCreds } from "./helpers";

/**
 * Integration: RU Habits/Analytics on desktop + 375px, both themes.
 * Read-only — creates no habits/tasks/goals, touches only
 * `profiles.language`/`profiles.theme` on the shared account and restores
 * both at the end of every test (same discipline as `e2e/i18n.spec.ts`).
 * Runs in the single controlled `workers:1` live pass, after `habits.spec`.
 */
test.describe("i18n RU habits/analytics", () => {
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, "no e2e credentials");

  /** Waits for the exact single-field PATCH the app sends (body-matched, so a
   *  stale in-flight PATCH for another field can never satisfy the waiter). */
  function awaitProfilePatch(page: Page, bodySnippet: string) {
    return page.waitForResponse(
      (r) =>
        r.request().method() === "PATCH" &&
        r.url().includes("/rest/v1/profiles") &&
        (r.request().postData() ?? "").includes(bodySnippet),
    );
  }

  async function restoreAccount(page: Page, originalLang: string, originalTheme: string): Promise<void> {
    await page.goto("/settings").catch(() => {});
    const themeSelect = page.getByLabel("Тема").or(page.getByLabel("Theme"));
    if ((await themeSelect.count()) > 0) {
      const first = themeSelect.first();
      const currentTheme = await first.inputValue().catch(() => "");
      if (currentTheme !== originalTheme) {
        // Arm before the select: the PATCH is a background sync, and the
        // context may close before it lands if nobody awaits the response.
        const saved = awaitProfilePatch(page, `"theme":"${originalTheme || "light"}"`);
        await first.selectOption(originalTheme || "light");
        await saved;
      }
    }
    const langSelect = page.getByLabel("Язык").or(page.getByLabel("Language"));
    if ((await langSelect.count()) > 0) {
      const first = langSelect.first();
      const currentLang = await first.inputValue().catch(() => "");
      if (currentLang !== (originalLang || "en")) {
        const saved = awaitProfilePatch(page, `"language":"${originalLang || "en"}"`);
        await first.selectOption(originalLang || "en");
        await saved;
      }
    }
  }

  test("RU habits + analytics on desktop, both themes, reload keeps RU", async ({ page }) => {
    skipWithoutCreds();
    await signIn(page, process.env.E2E_EMAIL ?? "", process.env.E2E_PASSWORD ?? "");
    await dismissOnboarding(page);

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
      await restoreAccount(page, originalLang, originalTheme);
    }
  });

  test("RU habits + analytics at 375px without overflow", async ({ page }) => {
    skipWithoutCreds();
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, process.env.E2E_EMAIL ?? "", process.env.E2E_PASSWORD ?? "");
    await dismissOnboarding(page);

    await page.goto("/settings");
    const langSelect = page.getByLabel("Язык").or(page.getByLabel("Language"));
    const current = (await langSelect.first().inputValue().catch(() => "en")) || "en";
    const wasRu = current === "ru";
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
        await page.goto("/settings").catch(() => {});
        const back = page.getByLabel("Язык").or(page.getByLabel("Language"));
        if ((await back.count()) > 0) {
          const first = back.first();
          const currentLang = await first.inputValue().catch(() => "");
          if (currentLang !== "en") {
            const saved = awaitProfilePatch(page, '"language":"en"');
            await first.selectOption("en");
            await saved;
          }
        }
      }
    }
  });
});
