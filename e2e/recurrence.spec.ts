import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { dismissOnboarding, E2E_EMAIL, E2E_PASSWORD, signIn, skipWithoutCreds } from "./helpers";

/**
 * Live recurrence flow (Phase 2.5, Unit 7; hygiene in iteration 3, unit 3).
 * Hits the real Supabase project with the shared e2e account — no
 * `service_role`, only UI paths for create/assert, plus anon-key REST for
 * cleanup. Creates a daily rule with a close end date (3 instances) plus
 * scheduled times, checks the Repeat badge and that the second instance
 * keeps the wall times (09:00–10:00 shifted by whole days), reloads (no
 * duplicates), then deletes the rule FIRST and the tasks after it.
 *
 * Rule-first matters: an in-flight sign-in top-up can re-insert a deleted
 * date while the rule still exists (read-then-insert race). With the rule
 * gone the top-up is a no-op, so no retry loop is needed.
 */

skipWithoutCreds();

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function loadEnvFile(name: string): Record<string, string> {
  const file = join(process.cwd(), name);

  if (!existsSync(file)) {
    return {};
  }

  const values: Record<string, string> = {};

  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");

    if (separator === -1) {
      continue;
    }

    values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }

  return values;
}

/**
 * Deletes the series created by this test via anon-key REST (same posture
 * as `scripts/seed-demo.mjs`): sign in, find the rule ids behind `title`,
 * delete the rules first, then the tasks. RLS keeps every step scoped to
 * the signed-in user — no `service_role` anywhere.
 */
async function cleanupRecurrenceSeries(title: string): Promise<void> {
  const local = loadEnvFile(".env.local");
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? local.VITE_SUPABASE_URL ?? "";
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? local.VITE_SUPABASE_ANON_KEY ?? "";

  if (!supabaseUrl || !anonKey) {
    throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY required for recurrence cleanup");
  }

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
  });

  if (!authResponse.ok) {
    throw new Error(`recurrence cleanup sign-in failed: ${authResponse.status}`);
  }

  const { access_token: token } = (await authResponse.json()) as { access_token: string };
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const titleFilter = `title=eq.${encodeURIComponent(title)}`;

  const tasksResponse = await fetch(
    `${supabaseUrl}/rest/v1/tasks?${titleFilter}&select=id,recurrence_rule_id`,
    { headers },
  );

  if (!tasksResponse.ok) {
    throw new Error(`recurrence cleanup lookup failed: ${tasksResponse.status}`);
  }

  const rows = (await tasksResponse.json()) as Array<{
    id: string;
    recurrence_rule_id: string | null;
  }>;
  const ruleIds = [...new Set(rows.map((row) => row.recurrence_rule_id).filter(Boolean))];

  // Rule first: with no rule the sign-in top-up cannot resurrect a date.
  if (ruleIds.length > 0) {
    const deleteRules = await fetch(
      `${supabaseUrl}/rest/v1/recurrence_rules?id=in.(${ruleIds.join(",")})`,
      { method: "DELETE", headers },
    );

    if (!deleteRules.ok) {
      throw new Error(`recurrence cleanup rule delete failed: ${deleteRules.status}`);
    }
  }

  const deleteTasks = await fetch(`${supabaseUrl}/rest/v1/tasks?${titleFilter}`, {
    method: "DELETE",
    headers,
  });

  if (!deleteTasks.ok) {
    throw new Error(`recurrence cleanup tasks delete failed: ${deleteTasks.status}`);
  }
}

test("recurrence: create daily series, badge, reload without duplicates, cleanup", async ({
  page,
}) => {
  await signIn(page, E2E_EMAIL, E2E_PASSWORD);
  await dismissOnboarding(page);

  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();

  const title = `E2E repeat ${Date.now()}`;
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const end = new Date(today.getTime() + 2 * 86_400_000);
  const startInput = `${toDateKey(today)}T09:00`;
  const endInput = `${toDateKey(today)}T10:00`;
  const expectedSecondStart = `${toDateKey(tomorrow)}T09:00`;
  const expectedSecondEnd = `${toDateKey(tomorrow)}T10:00`;

  await page.getByRole("button", { name: "New task" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Due date").fill(toDateKey(today));
  await dialog.getByLabel("Scheduled start").fill(startInput);
  await dialog.getByLabel("Scheduled end").fill(endInput);
  await dialog.getByLabel("Repeat", { exact: true }).check();
  await dialog.getByLabel("Frequency").selectOption("daily");
  await dialog.getByLabel("Repeat ends").fill(toDateKey(end));
  await dialog.getByRole("button", { name: "Create task" }).click();

  const rows = page.locator("li", { hasText: title });
  await expect(rows.first()).toBeVisible();
  await expect(rows).toHaveCount(3);
  await expect(rows.first().getByText("Repeat", { exact: true })).toBeVisible();

  // The second instance keeps the template's wall times, shifted by one day.
  await rows.nth(1).getByRole("button", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog");
  await expect(editDialog.getByLabel("Scheduled start")).toHaveValue(expectedSecondStart);
  await expect(editDialog.getByLabel("Scheduled end")).toHaveValue(expectedSecondEnd);
  await editDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("li", { hasText: title })).toHaveCount(3);

  // Second load must not duplicate the series (idempotent top-up).
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
  await expect(page.locator("li", { hasText: title })).toHaveCount(3);

  // Cleanup: rule first (top-up becomes a no-op), then the instances.
  await cleanupRecurrenceSeries(title);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
  await expect(page.locator("li", { hasText: title })).toHaveCount(0);
});
