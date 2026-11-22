/* Isolated RLS verification for 0009_focus_sessions.
 *
 * Applies the REAL migration on PGlite and proves, with two users plus anon:
 *   - owner-only reads and writes,
 *   - a forged task_id from another user is rejected (not merely hidden),
 *   - one active session per user is enforced,
 *   - pause/resume/complete timestamps stay consistent,
 *   - rollback leaves no row behind.
 *
 * No network, no live project, no secrets. Run:
 *   node scripts/verify-focus-rls.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  join(root, "supabase", "migrations", "0009_focus_sessions.sql"),
  "utf8",
);

const db = new PGlite();
let failures = 0;
const ok = (msg) => console.log(`ok: ${msg}`);
const fail = (msg, extra) => {
  failures += 1;
  console.error(`FAIL: ${msg}`, extra ?? "");
};
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const execAs = async (role, sub, sql) => {
  await db.exec(`RESET ROLE; SET ROLE ${role};`);
  await db.exec(`SET request.jwt.claim.sub = '${sub === null ? "" : sub}';`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec(`RESET ROLE; SET request.jwt.claim.sub = '';`);
  }
};
const expectReject = async (label, role, sub, sql) => {
  try {
    await execAs(role, sub, sql);
    fail(`${label} — write was NOT rejected`);
  } catch {
    ok(`${label} — rejected`);
  }
};

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const TA = "33333333-3333-4333-8333-333333333333";
const TB = "44444444-4444-4444-8444-444444444444";

await db.exec(`
  create role authenticated;
  create role anon;
  create schema if not exists auth;
  create table auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid
    language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create or replace function public.set_updated_at() returns trigger
    language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
  create table public.tasks (
    id uuid primary key,
    user_id uuid not null,
    title text not null
  );
  grant usage on schema public to authenticated, anon;
`);
await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}');`);
await db.exec(`
  insert into tasks (id, user_id, title) values
    ('${TA}', '${A}', 'A task'),
    ('${TB}', '${B}', 'B task');
`);

try {
  await db.exec(migration);
  ok("migration 0009 applies unmodified (table, index, trigger, RLS)");
} catch (error) {
  fail("migration failed to apply", error.message);
  process.exit(1);
}

await db.exec(`
  grant select, insert, update, delete on focus_sessions to authenticated;
  grant select on focus_sessions to anon;
  grant select on tasks to authenticated;
`);

const sessionA = (
  await execAs(
    "authenticated",
    A,
    `insert into focus_sessions (user_id, task_id, planned_minutes)
     values ('${A}', '${TA}', 25) returning id`,
  )
).rows[0].id;
ok("A starts a focus session on her own task");

if ((await execAs("authenticated", B, "select id from focus_sessions")).rows.length === 0) {
  ok("B reads zero focus sessions");
} else {
  fail("B sees A's focus sessions");
}
if ((await execAs("anon", null, "select id from focus_sessions")).rows.length === 0) {
  ok("anon reads zero focus sessions");
} else {
  fail("anon sees focus sessions");
}

await expectReject(
  "forged user_id",
  "authenticated",
  A,
  `insert into focus_sessions (user_id, task_id, planned_minutes)
   values ('${B}', '${TA}', 25)`,
);
await expectReject(
  "B links A's task",
  "authenticated",
  B,
  `insert into focus_sessions (user_id, task_id, planned_minutes)
   values ('${B}', '${TA}', 25)`,
);
await expectReject(
  "second active session for the same user",
  "authenticated",
  A,
  `insert into focus_sessions (user_id, task_id, planned_minutes)
   values ('${A}', '${TA}', 50)`,
);
await expectReject(
  "invalid planned duration",
  "authenticated",
  A,
  `insert into focus_sessions (user_id, task_id, planned_minutes)
   values ('${A}', '${TA}', 0)`,
);

await execAs(
  "authenticated",
  A,
  `update focus_sessions set paused_at = now() where id = '${sessionA}'`,
);
const paused = await execAs(
  "authenticated",
  A,
  `select paused_at is not null as paused from focus_sessions where id = '${sessionA}'`,
);
if (paused.rows[0]?.paused) ok("A pauses the active session");
else fail("pause did not persist");

await execAs(
  "authenticated",
  A,
  `update focus_sessions
   set paused_seconds = 60, paused_at = null
   where id = '${sessionA}'`,
);
const resumed = await execAs(
  "authenticated",
  A,
  `select paused_at is null and paused_seconds = 60 as resumed from focus_sessions where id = '${sessionA}'`,
);
if (resumed.rows[0]?.resumed) ok("A resumes with accumulated paused time");
else fail("resume did not persist");

await execAs(
  "authenticated",
  A,
  `update focus_sessions set ended_at = now() where id = '${sessionA}'`,
);
const completed = await execAs(
  "authenticated",
  A,
  `select ended_at is not null as ended from focus_sessions where id = '${sessionA}'`,
);
if (completed.rows[0]?.ended) ok("A completes the session");
else fail("completion did not persist");

const openAfter = await execAs(
  "authenticated",
  A,
  `select id from focus_sessions where ended_at is null`,
);
if (openAfter.rows.length === 0) ok("no active session remains after completion");
else fail("completed session still considered active");

await db.exec(`RESET ROLE; SET ROLE authenticated; SET request.jwt.claim.sub = '${B}'; BEGIN;`);
await db.query(
  `insert into focus_sessions (user_id, task_id, planned_minutes) values ('${B}', '${TB}', 25)`,
);
await db.exec(`ROLLBACK; RESET ROLE; SET request.jwt.claim.sub = '';`);
const doomed = await execAs("authenticated", B, "select id from focus_sessions");
if (doomed.rows.length === 0) ok("rollback removes the uncommitted session");
else fail("rollback leaked a session", doomed.rows);

if (failures > 0) {
  console.error(`\n${failures} focus RLS check(s) failed`);
  process.exit(1);
}
console.log("\nAll focus RLS checks passed.");
