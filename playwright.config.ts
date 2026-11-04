import { existsSync } from "node:fs";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { loadE2eEnv, repoRoot } from "./e2e/e2e-env";

const baseURL = "http://127.0.0.1:5173";
const rootDir = repoRoot();
const storageStatePath = join(rootDir, "e2e", ".auth", "state.json");

loadE2eEnv();

export default defineConfig({
  testDir: "./e2e",
  // One worker: every test signs in with the same shared e2e account, and
  // parallel same-account sign-ins trip Supabase Auth rate limits.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "html",
  // Single sign-in per run: global-setup logs in once and saves the session;
  // specs reuse it from here. The file exists only after a credentialed run —
  // without it (CI without secrets) the key is omitted entirely and every
  // spec keeps skipping via `skipWithoutCreds`.
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
    ...(existsSync(storageStatePath) ? { storageState: storageStatePath } : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Bind explicitly: `vite` defaults to `localhost`, which on some
    // machines resolves to ::1 while Playwright polls 127.0.0.1.
    command: "npm run dev -- --host 127.0.0.1 --port 5173",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
