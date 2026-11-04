import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium, expect, type FullConfig } from "@playwright/test";

import { loadE2eEnv, repoRoot } from "./e2e-env";

/**
 * Single sign-in per e2e run (iteration 4 follow-up).
 *
 * Before this file every test called `helpers.signIn` itself, so a full run
 * performed a dozen password grants on the same shared e2e account and
 * tripped Supabase Auth rate limits — hence the old self-imposed rule of at
 * most one live run per hour. Now the login happens exactly once here: the
 * session is saved to `e2e/.auth/state.json` (gitignored) and every spec
 * reuses it via `use.storageState`, while `helpers.signIn` becomes a no-op
 * when the shell is already up. The hourly rule is lifted by construction.
 *
 * Without `E2E_EMAIL` / `E2E_PASSWORD` nothing is created; the specs keep
 * skipping through the existing `skipWithoutCreds`.
 */
async function globalSetup(config: FullConfig): Promise<void> {
  loadE2eEnv();

  const email = process.env.E2E_EMAIL ?? "";
  const password = process.env.E2E_PASSWORD ?? "";

  if (!email || !password) {
    console.log(
      "global-setup: E2E_EMAIL / E2E_PASSWORD are not set — no session saved, specs will skip.",
    );
    return;
  }

  const authDir = join(repoRoot(), "e2e", ".auth");
  mkdirSync(authDir, { recursive: true });

  // The dev server (playwright `webServer`) is already up when global setup
  // runs; the baseURL comes from the project config, same as in the specs.
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://127.0.0.1:5173";
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ baseURL });
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    // Fail fast here (not three steps later) when Auth rate-limits or rejects.
    await expect(page).toHaveURL(/\/$/);
    await page.context().storageState({ path: join(authDir, "state.json") });
    console.log("global-setup: signed in once, storage state saved.");
  } finally {
    await browser.close();
  }
}

export default globalSetup;
