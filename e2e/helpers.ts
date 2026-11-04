import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

/**
 * Shared live-auth helpers (iteration 1.2, unit 6). Credentials come only
 * from `process.env.E2E_EMAIL` / `E2E_PASSWORD` (local `.env.e2e`,
 * gitignored — see `.env.e2e.example`). No `service_role` anywhere.
 */

const E2E_SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const E2E_SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";

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

export async function signIn(
  page: Page,
  email: string,
  password: string,
  options?: { force?: boolean },
): Promise<void> {
  const signInForm = page.getByLabel("Email");
  // The shell-only anchor: AuthLayout renders no Primary nav, so this node
  // exists only when the session is live. (The "Welcome back" heading can NOT
  // serve as the anchor — SignInPage and DashboardPage render the same text.)
  // `.first()` is the Sidebar nav; MobileNav renders a second same-named node
  // that is hidden on the desktop-Chromium viewport this suite runs.
  const shellAnchor = page.getByRole("navigation", { name: "Primary" }).first();

  if (options?.force) {
    // auth.spec path (blank storageState): always perform the real login,
    // never inherit a session.
    await page.goto("/sign-in");
    await expect(signInForm).toBeVisible();
    await signInForm.fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    // The shell anchor, not just the URL: only it proves the session is live.
    await expect(shellAnchor).toBeVisible();
    return;
  }

  // Idempotent (single sign-in per run): global-setup already saved a session
  // to `e2e/.auth/state.json`, so a signed-in page lands on the shell (`/`)
  // and returns without touching the form. Without that session `/` bounces
  // to `/sign-in` (RequireAuth) and we log in — the auth.spec path, which
  // opts out of the saved session, and runs without credentials on disk.
  //
  // No URL reads here: right after `goto("/")` the document is still on `/`
  // while RequireAuth resolves the session, so a URL check can not tell
  // "signed in" from "not redirected yet" (that race was the auth.spec
  // regression). Wait for exactly one of the two stable states instead: the
  // sign-in form or the authenticated shell.
  // Liveness probe, armed BEFORE navigation: the app reads the profile the
  // moment the shell mounts, so the first profiles GET settles the question
  // "is the stored session alive server-side". A stored session can flash
  // the shell while already dead (a global sign-out in an earlier test
  // revokes the saved refresh token while the access JWT still parses
  // client-side) — visibility alone can not tell that flash from a live
  // shell, but a 200 from the server can. Zero extra requests: this only
  // observes the app's own read.
  const profileStatus = page
    .waitForResponse(
      (response) =>
        response.url().includes("/rest/v1/profiles") &&
        response.request().method() === "GET",
      { timeout: 10_000 },
    )
    .then(
      (response) => response.status(),
      () => 0,
    );

  await page.goto("/");
  await expect(signInForm.or(shellAnchor)).toBeVisible();

  if ((await shellAnchor.isVisible()) && ((await profileStatus) === 200)) {
    return;
  }

  // Anonymous, or a stale stored session that RequireAuth is already
  // bouncing to /sign-in: perform the real login. `fill` waits for the
  // form to arrive after the bounce, no URL reads.
  await signInForm.fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Fail fast here (not three steps later) when Auth rate-limits or rejects.
  // The shell anchor, not just the URL: the URL settles on `/` before the
  // shell renders, so only the anchor proves the session is live.
  await expect(shellAnchor).toBeVisible();
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
 * Restores `profiles.language/theme` on the shared e2e account through the
 * same single-field REST PATCHs the app sends (anon key + the user's own
 * JWT from the open session — never `service_role`). Used in `finally`
 * blocks: UI selects apply instantly on-device, but a background PATCH
 * issued right before navigation/context-close may never land, so hygiene
 * restores go through REST and assert the persisted value.
 */
export async function restoreProfileBaseline(
  page: Page,
  request: APIRequestContext,
  baseline: { language: string; theme: string },
): Promise<void> {
  if (!E2E_SUPABASE_URL || !E2E_SUPABASE_ANON_KEY) return;
  let token: string;
  try {
    token = await getSessionAccessToken(page);
  } catch {
    return;
  }
  let userId: string;
  try {
    userId = (JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8")) as { sub: string }).sub;
  } catch {
    return;
  }
  const headers = {
    apikey: E2E_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  for (const patch of [{ language: baseline.language }, { theme: baseline.theme }]) {
    const res = await request.patch(
      `${E2E_SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
      { headers, data: patch },
    );
    expect(res.ok()).toBe(true);
  }
  const check = await request.get(
    `${E2E_SUPABASE_URL}/rest/v1/profiles?select=language,theme&id=eq.${userId}`,
    { headers },
  );
  expect(await check.json()).toStrictEqual([
    { language: baseline.language, theme: baseline.theme },
  ]);
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
