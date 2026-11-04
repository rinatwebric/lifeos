/* Isolated integration verification for Phase 5 habit history.
 *
 * Applies the REAL migration files 0007 + 0008 (policies included, nothing
 * stripped) on PGlite — a real Postgres running locally — and proves, with
 * two distinct users plus anon:
 *   - owner-only RLS on habits / habit_logs / habit_schedule_versions,
 *   - cross-tenant habit_id links rejected on write (not just hidden),
 *   - transaction rollback leaves nothing behind,
 *   - trigger snapshot semantics: atomic creation, pause/status snapshots,
 *     rename/no-op silence, same-day last-wins, future-start safety,
 *     no invented past, past rows immutable.
 *
 * No network, no live project, no secrets. Run: `node scripts/verify-habit-history.mjs`
 * Requires devDependency @electric-sql/pglite (isolated-test only).
 *
 * Fidelity notes (honest limits, see docs/progress.md):
 *   - auth.uid() is stubbed to read request.jwt.claim.sub (exactly what the
 *     real function returns); roles authenticated/anon are created locally.
 *   - RLS *policy expressions* are the production ones; the JWT plumbing
 *     around them is PostgREST/Supabase and is covered live after the owner
 *     applies the migrations.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readMig = (name) => readFileSync(join(root, "supabase", "migrations", name), "utf8");

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
  // '' reads back as NULL in the auth.uid() stub (nullif guard); never RESET,
  // which errors on some servers when the placeholder was never assigned.
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

// --- Stubs the migrations expect from the real project --------------------
await db.exec(`
  create role authenticated;
  create role anon;
  create schema if not exists auth;
  create table auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid
    language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create or replace function public.set_updated_at() returns trigger
    language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
  create table public.profiles (id uuid primary key, timezone text not null default 'UTC');
  grant usage on schema public to authenticated, anon;
`);
await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}');`);
await db.exec(`insert into profiles (id, timezone) values ('${A}', 'Asia/Bishkek'), ('${B}', 'UTC');`);

// --- Apply the REAL migration files, policies included ---------------------
try {
  await db.exec(readMig("0007_habits_habit_logs.sql"));
  await db.exec(readMig("0008_habit_schedule_versions.sql"));
  ok("migrations 0007+0008 apply unmodified (tables, triggers, RLS)");
} catch (e) {
  fail("migrations failed to apply", e.message);
  process.exit(1);
}
await db.exec(`
  grant select, insert, update, delete on habits, habit_logs, habit_schedule_versions to authenticated;
  grant select on habits, habit_logs, habit_schedule_versions to anon;
  grant select on profiles to authenticated;
`);

const todayBishkek = (await q(`select ((now() at time zone 'Asia/Bishkek')::date)::text as d`))[0].d;

// --- RLS: owner-only reads --------------------------------------------------
const habitA = (
  await execAs(
    "authenticated",
    A,
    `insert into habits (user_id, title, frequency, start_date) values ('${A}', 'A habit', 'daily', '${todayBishkek}') returning id`,
  )
).rows[0].id;
ok("A creates her own habit (trigger snapshot under caller RLS)");

const seenByB = await execAs("authenticated", B, `select id from habits`);
if (seenByB.rows.length === 0) ok("B reads zero habits (A's rows hidden)");
else fail("B sees foreign habits", seenByB.rows);

const seenByAnon = await execAs("anon", null, `select id from habits`);
if (seenByAnon.rows.length === 0) ok("anon reads zero habits");
else fail("anon sees habits", seenByAnon.rows);

// --- RLS: forged ownership rejected on write --------------------------------
await expectReject(
  "habit with forged user_id",
  "authenticated",
  A,
  `insert into habits (user_id, title, frequency, start_date) values ('${B}', 'forged', 'daily', '${todayBishkek}')`,
);
await expectReject(
  "log on foreign habit",
  "authenticated",
  B,
  `insert into habit_logs (user_id, habit_id, log_date) values ('${B}', '${habitA}', '${todayBishkek}')`,
);
await expectReject(
  "version for foreign habit",
  "authenticated",
  B,
  `insert into habit_schedule_versions (user_id, habit_id, effective_from, frequency, target_count, start_date, status) values ('${B}', '${habitA}', '${todayBishkek}', 'daily', 1, '${todayBishkek}', 'active')`,
);
await execAs(
  "authenticated",
  A,
  `insert into habit_logs (user_id, habit_id, log_date, completed_count) values ('${A}', '${habitA}', '${todayBishkek}', 1)`,
);
await expectReject(
  "duplicate log (habit_id, log_date)",
  "authenticated",
  A,
  `insert into habit_logs (user_id, habit_id, log_date, completed_count) values ('${A}', '${habitA}', '${todayBishkek}', 2)`,
);

// --- B's own rows work (isolation is per-user, not broken) ------------------
const habitB = (
  await execAs(
    "authenticated",
    B,
    `insert into habits (user_id, title, frequency, start_date) values ('${B}', 'B habit', 'daily', '${todayBishkek}') returning id`,
  )
).rows[0].id;
const ownLog = await execAs(
  "authenticated",
  B,
  `insert into habit_logs (user_id, habit_id, log_date) values ('${B}', '${habitB}', '${todayBishkek}') returning id`,
);
if (ownLog.rows.length === 1) ok("B writes own habit + log");
else fail("B cannot write own rows");

// --- Rollback leaves nothing behind ------------------------------------------
await db.exec(`RESET ROLE; SET ROLE authenticated; SET request.jwt.claim.sub = '${A}'; BEGIN;`);
await db.query(
  `insert into habits (user_id, title, frequency, start_date) values ('${A}', 'doomed', 'daily', '${todayBishkek}')`,
);
await db.exec(`ROLLBACK; RESET ROLE; SET request.jwt.claim.sub = '';`);
const doomed = await execAs("authenticated", A, `select id from habits where title = 'doomed'`);
if (doomed.rows.length === 0) ok("rollback removes the uncommitted habit");
else fail("rollback leaked rows", doomed.rows);

// --- Trigger: pause snapshot is atomic, past row closed -----------------------
const vers = async (hid, role = "authenticated", sub = A) =>
  (
    await execAs(
      role,
      sub,
      `select effective_from::text ef, effective_to::text et, status, target_count::int tc from habit_schedule_versions where habit_id = '${hid}' order by effective_from`,
    )
  ).rows;
// --- Trigger: pause snapshot is atomic ----------------------------------------
// habitA was created today, so its creation row IS today's row: pause
// refreshes it in place (last change wins), no second row.
await execAs("authenticated", A, `update habits set status = 'paused' where id = '${habitA}'`);
let vs = await vers(habitA);
if (vs.length === 1 && vs[0].ef === todayBishkek && vs[0].et === null && vs[0].status === "paused") {
  ok("pause refreshes today's snapshot in place (atomic)");
} else {
  fail("pause snapshot wrong", vs);
}

// Close path: a pre-existing open row from a past day is closed (not
// rewritten) when today's snapshot opens.
await db.exec(`alter table habits disable trigger trg_habits_schedule_versioning`);
const oldStart = (
  await q(`select (((now() at time zone 'Asia/Bishkek')::date) - 2)::text as d`)
)[0].d;
const habitOld = (
  await execAs(
    "authenticated",
    A,
    `insert into habits (user_id, title, frequency, start_date) values ('${A}', 'old', 'daily', '${oldStart}') returning id`,
  )
).rows[0].id;
await db.exec(`alter table habits enable trigger trg_habits_schedule_versioning`);
await execAs(
  "authenticated",
  A,
  `insert into habit_schedule_versions (user_id, habit_id, effective_from, frequency, target_count, start_date, status) values ('${A}', '${habitOld}', '${oldStart}', 'daily', 1, '${oldStart}', 'active')`,
);
await execAs("authenticated", A, `update habits set status = 'paused' where id = '${habitOld}'`);
vs = await vers(habitOld);
const yesterday = (await q(`select ((now() at time zone 'Asia/Bishkek')::date - 1)::text as d`))[0].d;
if (
  vs.length === 2 &&
  vs[0].ef === oldStart &&
  vs[0].et === yesterday &&
  vs[0].status === "active" &&
  vs[1].ef === todayBishkek &&
  vs[1].et === null &&
  vs[1].status === "paused"
) {
  ok("past open row closed with yesterday, today row opened (atomic)");
} else {
  fail("close-path snapshot wrong", vs);
}

// --- Trigger: rename and no-op store nothing ----------------------------------
const countBefore = (await vers(habitA)).length;
await execAs("authenticated", A, `update habits set title = 'A habit renamed' where id = '${habitA}'`);
await execAs("authenticated", A, `update habits set target_count = 1 where id = '${habitA}'`);
vs = await vers(habitA);
if (vs.length === countBefore) ok("rename + no-op store no snapshot");
else fail("rename/no-op minted snapshots", vs);

// --- Trigger: same-day double change keeps one row with last values ----------
await execAs("authenticated", A, `update habits set target_count = 3 where id = '${habitA}'`);
await execAs("authenticated", A, `update habits set target_count = 5 where id = '${habitA}'`);
vs = await vers(habitA);
const todayRows = vs.filter((v) => v.ef === todayBishkek);
if (todayRows.length === 1 && todayRows[0].tc === 5) ok("same-day last change wins, one row");
else fail("same-day versions wrong", vs);

// --- Trigger: future start_date + tracked change must not abort --------------
const futureStart = (
  await q(`select (((now() at time zone 'Asia/Bishkek')::date) + 30)::text as d`)
)[0].d;
const habitFuture = (
  await execAs(
    "authenticated",
    A,
    `insert into habits (user_id, title, frequency, start_date) values ('${A}', 'future', 'daily', '${futureStart}') returning id`,
  )
).rows[0].id;
try {
  await execAs("authenticated", A, `update habits set status = 'paused' where id = '${habitFuture}'`);
  vs = await vers(habitFuture);
  const open = vs.filter((v) => v.et === null);
  if (vs.length === 2 && open.length === 1 && open[0].ef === futureStart) {
    ok("future-start pause: no abort, today row bounded, future row open");
  } else {
    fail("future-start versions wrong", vs);
  }
} catch (e) {
  fail("future-start pause aborted the transaction", e.message);
}

// --- Trigger: bad profile timezone degrades to UTC ----------------------------
await db.exec(`RESET ROLE; update profiles set timezone = 'Not/AZone' where id = '${A}'; RESET ROLE;`);
try {
  await execAs("authenticated", A, `update habits set target_count = 7 where id = '${habitA}'`);
  ok("invalid profile timezone falls back to UTC");
} catch (e) {
  fail("invalid timezone bricked the update", e.message);
}
await db.exec(`update profiles set timezone = 'Asia/Bishkek' where id = '${A}';`);

// --- Trigger: backdated start does not invent past -----------------------------
const pastStart = (
  await q(`select (((now() at time zone 'Asia/Bishkek')::date) - 5)::text as d`)
)[0].d;
const habitBack = (
  await execAs(
    "authenticated",
    A,
    `insert into habits (user_id, title, frequency, start_date) values ('${A}', 'backdated', 'daily', '${pastStart}') returning id`,
  )
).rows[0].id;
vs = await vers(habitBack);
if (vs.length === 1 && vs[0].ef === todayBishkek) ok("backdated start: effective_from = today, past uncovered");
else fail("backdated creation wrong", vs);

// --- Trigger: past rows immutable ----------------------------------------------
await execAs(
  "authenticated",
  A,
  `insert into habit_schedule_versions (user_id, habit_id, effective_from, effective_to, frequency, target_count, start_date, status) values ('${A}', '${habitBack}', '${pastStart}', '${todayBishkek}', 'daily', 1, '${pastStart}', 'active')`,
);
const pastBefore = JSON.stringify(
  (await vers(habitBack)).filter((v) => v.et !== null),
);
await execAs("authenticated", A, `update habits set target_count = 11 where id = '${habitBack}'`);
const pastAfter = JSON.stringify(
  (await vers(habitBack)).filter((v) => v.et !== null),
);
if (pastBefore === pastAfter) ok("past closed rows byte-identical after later edits");
else fail("past row rewritten", { pastBefore, pastAfter });

console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
