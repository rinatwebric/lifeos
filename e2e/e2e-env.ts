import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root: this module lives in `e2e/`, one level below the root. */
export function repoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

/**
 * Loads live-auth e2e credentials without a new dependency.
 * `.env.e2e` is gitignored (see `.env.e2e.example` for the template);
 * values already in `process.env` win, so CI secrets keep working.
 * Tests skip themselves when `E2E_EMAIL` / `E2E_PASSWORD` are absent.
 *
 * Shared by `playwright.config.ts` and `e2e/global-setup.ts` (global setup
 * runs in its own process, so the config's copy does not cover it).
 */
export function loadE2eEnv(): void {
  const file = join(repoRoot(), ".env.e2e");

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
