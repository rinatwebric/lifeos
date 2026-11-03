import { expect, type Page, test } from "@playwright/test";

/**
 * Shared live-auth helpers (iteration 1.2, unit 6). Credentials come only
 * from `process.env.E2E_EMAIL` / `E2E_PASSWORD` (local `.env.e2e`,
 * gitignored — see `.env.e2e.example`). No `service_role` anywhere.
 */

export const E2E_EMAIL = process.env.E2E_EMAIL ?? "";
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "";

export function skipWithoutCreds(): void {
  test.skip(
    !E2E_EMAIL || !E2E_PASSWORD,
    "E2E_EMAIL / E2E_PASSWORD are not set — copy .env.e2e.example to .env.e2e. Skipping live-auth tests.",
  );
}

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Fail fast here (not three steps later) when Auth rate-limits or rejects.
  await expect(page).toHaveURL(/\/$/);
}

/**
 * The one-step onboarding dialog ("Set up your day") mounts only after the
 * profile query resolves, i.e. it can lag behind the sign-in navigation.
 * Wait for it briefly, dismiss with Skip when present, no-op when the user
 * is already onboarded (`onboarded_at` set on an earlier run).
 */
export async function dismissOnboarding(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Set up your day" });

  await dialog.waitFor({ state: "visible", timeout: 8_000 }).catch(() => null);

  if ((await dialog.count()) > 0) {
    await dialog.getByRole("button", { name: "Skip" }).click();
    await expect(dialog).toHaveCount(0);
  }
}
