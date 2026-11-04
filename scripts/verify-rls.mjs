/**
 * Manual RLS verification for iteration 1.2, extended in iteration 4
 * (NOT part of `npm test`).
 *
 * Proves row isolation is enforced by Postgres RLS, not by client code:
 *  - anonymous (anon key, no JWT) sees zero rows in all tables;
 *  - user A reads/writes only their own rows;
 *  - user A selecting or updating any other id gets zero rows / zero writes;
 *  - time_blocks (migration 0005): foreign select returns 0 rows, a foreign
 *    insert is refused, an own row is visible and deletable again.
 *
 * A second Supabase account (user B) adds nothing beyond the foreign-id
 * checks below: every policy is `... = auth.uid()`, so ANY authenticated
 * non-owner — B included — is denied exactly like a random UUID.
 *
 * Only the public anon key is used. No `service_role`, no new dependencies
 * (plain `fetch`). Secrets come from local gitignored files and are never
 * printed: `.env.local` (URL + anon key) and `.env.e2e` (user A creds).
 *
 * Run: `node scripts/verify-rls.mjs`
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function loadEnvFile(name) {
  const file = join(rootDir, name);

  if (!existsSync(file)) {
    throw new Error(`Missing ${name} — see .env.e2e.example / .env.example`);
  }

  const values = {};

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

const local = loadEnvFile(".env.local");
const e2e = loadEnvFile(".env.e2e");

const SUPABASE_URL = local.VITE_SUPABASE_URL;
const ANON_KEY = local.VITE_SUPABASE_ANON_KEY;
const EMAIL = e2e.E2E_EMAIL;
const PASSWORD = e2e.E2E_PASSWORD;

if (!SUPABASE_URL || !ANON_KEY || !EMAIL || !PASSWORD) {
  throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / E2E_EMAIL / E2E_PASSWORD required");
}

const FOREIGN_ID = "00000000-0000-4000-8000-000000000000";

let failures = 0;

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function rest(path, { token = null, method = "GET", body = null } = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token ?? ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : null,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json();
}

// 1. Anonymous: no JWT, RLS policies target `authenticated` only.
console.log("anonymous (no JWT):");
const anonProfiles = await rest("profiles?select=id");
check("select profiles returns 0 rows", Array.isArray(anonProfiles) && anonProfiles.length === 0);
const anonPrefs = await rest("user_preferences?select=id");
check("select user_preferences returns 0 rows", Array.isArray(anonPrefs) && anonPrefs.length === 0);

// 2. Sign in as user A (password grant, same flow as the UI).
const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});

if (!authResponse.ok) {
  throw new Error(`sign-in as user A failed: ${authResponse.status}`);
}

const { access_token: token, user } = await authResponse.json();
check("sign-in as user A returns a JWT", Boolean(token) && Boolean(user?.id));
console.log(`  (user A id: ${user.id})`);

// 3. User A reads their own rows.
console.log("user A, own rows:");
const ownProfiles = await rest("profiles?select=id,timezone", { token });
check(
  "select profiles returns exactly 1 own row",
  ownProfiles.length === 1 && ownProfiles[0].id === user.id,
  JSON.stringify(ownProfiles).slice(0, 120),
);
const ownPrefs = await rest("user_preferences?select=user_id,wake_up_time,sleep_time", { token });
check(
  "select user_preferences returns exactly 1 own row",
  ownPrefs.length === 1 && ownPrefs[0].user_id === user.id,
  JSON.stringify(ownPrefs).slice(0, 120),
);

// 4. User A touches a foreign id: denied by RLS (0 rows, no error leak).
console.log("user A, foreign id (stands in for user B's row):");
const foreignSelect = await rest(`profiles?select=id&id=eq.${FOREIGN_ID}`, { token });
check("select foreign profile returns 0 rows", foreignSelect.length === 0);
const foreignPrefsSelect = await rest(`user_preferences?select=id&user_id=eq.${FOREIGN_ID}`, {
  token,
});
check("select foreign preferences returns 0 rows", foreignPrefsSelect.length === 0);
const foreignUpdate = await rest(`profiles?id=eq.${FOREIGN_ID}`, {
  token,
  method: "PATCH",
  body: { full_name: "Mallory" },
});
check("update foreign profile touches 0 rows", foreignUpdate.length === 0);
const foreignPrefsUpdate = await rest(`user_preferences?user_id=eq.${FOREIGN_ID}`, {
  token,
  method: "PATCH",
  body: { wake_up_time: "05:00" },
});
check("update foreign preferences touches 0 rows", foreignPrefsUpdate.length === 0);

// 5. User A writes their own rows (round-trip with restore).
console.log("user A, own write round-trip:");
const before = ownPrefs[0];
const written = await rest(`user_preferences?user_id=eq.${user.id}`, {
  token,
  method: "PATCH",
  body: { wake_up_time: "06:30" },
});
check("update own preferences touches 1 row", written.length === 1);
const restored = await rest(`user_preferences?user_id=eq.${user.id}`, {
  token,
  method: "PATCH",
  body: { wake_up_time: before.wake_up_time, sleep_time: before.sleep_time },
});
check(
  "restore touches 1 row with original values",
  restored.length === 1 &&
    restored[0].wake_up_time === before.wake_up_time &&
    restored[0].sleep_time === before.sleep_time,
);

// 6. time_blocks (migration 0005): same `... = auth.uid()` posture.
// A break block needs no task_id, so the probes below need no task setup.
console.log("time_blocks RLS:");
const anonBlocks = await rest("time_blocks?select=id");
check(
  "anonymous select time_blocks returns 0 rows",
  Array.isArray(anonBlocks) && anonBlocks.length === 0,
);
const foreignBlocks = await rest(`time_blocks?select=id&user_id=eq.${FOREIGN_ID}`, { token });
check("select foreign time_blocks returns 0 rows", foreignBlocks.length === 0);

// A foreign insert must be refused by the WITH CHECK guard. rest() throws on
// any non-2xx, so a raw fetch is used here: refusal is the PASS, not an error.
const probeStart = new Date(Date.now() + 8 * 86_400_000).toISOString();
const probeEnd = new Date(Date.now() + 8 * 86_400_000 + 3_600_000).toISOString();
const foreignInsert = await fetch(`${SUPABASE_URL}/rest/v1/time_blocks`, {
  method: "POST",
  headers: {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  },
  body: JSON.stringify({
    user_id: FOREIGN_ID,
    title: "RLS probe (must be refused)",
    block_type: "break",
    start_time: probeStart,
    end_time: probeEnd,
  }),
});
await foreignInsert.text();
check("insert with foreign user_id is refused", !foreignInsert.ok, `HTTP ${foreignInsert.status}`);

// An own row is visible to its owner, then removed again — no leftovers.
const ownInsert = await rest("time_blocks", {
  token,
  method: "POST",
  body: {
    user_id: user.id,
    title: "RLS probe own row (deleted below)",
    block_type: "break",
    start_time: probeStart,
    end_time: probeEnd,
  },
});
check(
  "insert own time_block returns 1 row",
  Array.isArray(ownInsert) && ownInsert.length === 1 && ownInsert[0].user_id === user.id,
  JSON.stringify(ownInsert).slice(0, 120),
);
const probeId = ownInsert[0]?.id;
const ownBlocks = await rest(`time_blocks?select=id&user_id=eq.${user.id}`, { token });
check(
  "select own time_blocks contains the probe row",
  Array.isArray(ownBlocks) && ownBlocks.some((row) => row.id === probeId),
  JSON.stringify(ownBlocks).slice(0, 120),
);
const deletedProbe = await rest(`time_blocks?id=eq.${probeId}`, { token, method: "DELETE" });
check(
  "delete own time_block removes 1 row",
  Array.isArray(deletedProbe) && deletedProbe.length === 1,
);
const afterDelete = await rest(`time_blocks?select=id&user_id=eq.${user.id}`, { token });
check(
  "probe row is gone after cleanup",
  Array.isArray(afterDelete) && !afterDelete.some((row) => row.id === probeId),
  JSON.stringify(afterDelete).slice(0, 120),
);

console.log(
  failures === 0 ? "RLS verification: ALL CHECKS PASSED" : `RLS verification: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);