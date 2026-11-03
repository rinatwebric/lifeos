import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:5173";

/**
 * Loads live-auth credentials for e2e without a new dependency.
 * `.env.e2e` is gitignored (see `.env.e2e.example` for the template);
 * values already in `process.env` win, so CI secrets keep working.
 * Tests skip themselves when `E2E_EMAIL` / `E2E_PASSWORD` are absent.
 */
function loadE2eEnv(): void {
  const rootDir = dirname(fileURLToPath(import.meta.url));
  const file = join(rootDir, ".env.e2e");

  if (!existsSync(file)) {
    return;
  }

  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

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
  use: {
    baseURL,
    trace: "on-first-retry",
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
