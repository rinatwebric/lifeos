import { expect, type Page, test } from "@playwright/test";

/**
 * Shared live-auth helpers (iteration 1.2, unit 6). Credentials come only
 * from `process.env.E2E_EMAIL` / `E2E_PASSWORD` (local `.env.e2e`,
 * gitignored — see `.env.e2e.example`). No `service_role` anywhere.
 */

export const E2E_EMAIL = process.env.E2E_EMAIL ?? "";
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "";
/**
 * Real inbox for the live sign-up test (a `+`-alias of a real mailbox).
 * The suite never invents addresses: fake `e2e.signup.*@gmail.com` senders
 * got the project's default SMTP restricted for bounce rate, and with
 * `Confirm email = OFF` sign-up returns a session immediately (no
 * check-email screen). Absent → the sign-up test skips, the rest stay green.
 */
export const E2E_SIGNUP_EMAIL = process.env.E2E_SIGNUP_EMAIL ?? "";

export function skipWithoutCreds(): void {
  test.skip(
    !E2E_EMAIL || !E2E_PASSWORD,
    "E2E_EMAIL / E2E_PASSWORD are not set — copy .env.e2e.example to .env.e2e. Skipping live-auth tests.",
  );
}

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  // Idempotent (single sign-in per run): global-setup already saved a session
  // to `e2e/.auth/state.json`, so a signed-in page lands on the shell (`/`)
  // and returns without touching the form. Without that session `/` bounces
  // to `/sign-in` (RequireAuth) and we log in — the auth.spec path, which
  // opts out of the saved session, and runs without credentials on disk.
  await page.goto("/");
  await expect(page).toHaveURL(/\/$|\/sign-in$/);

  if (!page.url().includes("/sign-in")) {
    return;
  }

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Fail fast here (not three steps later) when Auth rate-limits or rejects.
  await expect(page).toHaveURL(/\/$/);
}

/**
 * Reads the access token of the already open browser session (same posture
 * as the recurrence cleanup: RLS keeps everything scoped to the signed-in
 * user, no `service_role`, and no second password-grant sign-in on the
 * shared e2e account). Throws when there is no session — call `signIn`
 * first.
 */
export async function getSessionAccessToken(page: Page): Promise<string> {
  const stored = await page.evaluate(() => {
    const keys: string[] = [];

    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);

      if (key && /^sb-.*-auth-token(\.\d+)?$/.test(key)) {
        keys.push(key);
      }
    }

    const chunked = keys
      .filter((key) => /\.\d+$/.test(key))
      .sort((a, b) => Number(a.split(".").pop()) - Number(b.split(".").pop()));

    if (chunked.length > 0) {
      return chunked.map((key) => window.localStorage.getItem(key) ?? "").join("");
    }

    const single = keys.find((key) => /^sb-.*-auth-token$/.test(key));
    return single ? (window.localStorage.getItem(single) ?? "") : "";
  });

  try {
    const token = (JSON.parse(stored) as { access_token: string }).access_token;

    if (!token) {
      throw new Error("no access_token in the open browser session");
    }

    return token;
  } catch {
    throw new Error("no access_token in the open browser session");
  }
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
