/**
 * Demo data seeding for LifeOS (NOT part of `npm test`).
 *
 * Creates a small, realistic dataset for the signed-in demo user: two active
 * goals with milestones (one milestone-based, one manual), one goal without
 * milestones, and six tasks that exercise every dashboard state — today's
 * work, completed work, an `in_progress` task that is overdue, and a plain
 * overdue task.
 *
 * Everything is created through PostgREST with the user's own JWT, so RLS is
 * fully in force: no `service_role`, no bypass, no new dependencies.
 * Every row is prefixed with `Demo:` so `--clean` can remove it and nothing else.
 *
 * Usage:
 *   node scripts/seed-demo.mjs --dry-run   # print the plan, touch nothing
 *   node scripts/seed-demo.mjs             # clean leftovers, then seed
 *   node scripts/seed-demo.mjs --clean     # remove demo rows only
 *
 * Secrets come from the local gitignored `.env.local` and are never printed:
 * the Supabase URL + anon key, plus `VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD`.
 * The demo account is deliberately separate from the e2e account (visitors
 * change demo data; e2e assertions must stay stable), so `E2E_*` is never read
 * here — the same two variables also drive the "Explore the demo account"
 * button on `/sign-in`.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const DEMO_PREFIX = "Demo: ";

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

function dayKey(offsetDays) {
  const now = new Date();
  const utc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays),
  );
  return utc.toISOString().slice(0, 10);
}

function isoAt(offsetDays, hour) {
  return `${dayKey(offsetDays)}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

function buildPlan() {
  return {
    goals: [
      {
        key: "lifeos",
        row: {
          title: `${DEMO_PREFIX}Ship LifeOS v1`,
          description: "Phase 2 milestone: goals, tasks and a real dashboard.",
          category: "projects",
          priority: "high",
          status: "active",
          start_date: dayKey(-14),
          target_date: dayKey(30),
          progress: 0,
          progress_mode: "milestones",
        },
        milestones: [
          { title: `${DEMO_PREFIX}Spec approved`, status: "completed", position: 0 },
          { title: `${DEMO_PREFIX}Goals and tasks shipped`, status: "pending", position: 1 },
          { title: `${DEMO_PREFIX}Dashboard on real data`, status: "pending", position: 2 },
        ],
      },
      {
        key: "running",
        row: {
          title: `${DEMO_PREFIX}Run a half marathon`,
          description: "Manual progress: the plan lives in my head for now.",
          category: "health",
          priority: "medium",
          status: "active",
          start_date: dayKey(-30),
          target_date: dayKey(90),
          progress: 40,
          progress_mode: "manual",
        },
        milestones: [
          { title: `${DEMO_PREFIX}Run 10 km non-stop`, status: "completed", position: 0 },
          { title: `${DEMO_PREFIX}Run 15 km`, status: "pending", position: 1 },
        ],
      },
      {
        key: "books",
        row: {
          title: `${DEMO_PREFIX}Read 12 books this year`,
          description: "No milestones yet — shows the empty state and an insight.",
          category: "personal_development",
          priority: "low",
          status: "active",
          start_date: dayKey(-60),
          target_date: dayKey(180),
          progress: 25,
          progress_mode: "manual",
        },
        milestones: [],
      },
    ],
    tasks: [
      {
        title: `${DEMO_PREFIX}Review PRD for Phase 3`,
        priority: "high",
        status: "todo",
        due_date: dayKey(0),
        scheduled_start: isoAt(0, 9),
        scheduled_end: isoAt(0, 10),
        estimated_duration_minutes: 60,
        goalKey: "lifeos",
        milestoneIndex: 1,
      },
      {
        title: `${DEMO_PREFIX}Write release notes`,
        priority: "medium",
        status: "completed",
        due_date: dayKey(0),
        scheduled_start: isoAt(0, 11),
        scheduled_end: isoAt(0, 12),
        estimated_duration_minutes: 60,
        goalKey: "lifeos",
        milestoneIndex: null,
      },
      {
        title: `${DEMO_PREFIX}5 km easy run`,
        priority: "low",
        status: "in_progress",
        due_date: dayKey(0),
        scheduled_start: isoAt(0, 18),
        scheduled_end: isoAt(0, 19),
        estimated_duration_minutes: 60,
        goalKey: "running",
        milestoneIndex: null,
      },
      {
        title: `${DEMO_PREFIX}Buy running shoes`,
        priority: "medium",
        status: "todo",
        due_date: dayKey(-1),
        scheduled_start: null,
        scheduled_end: null,
        estimated_duration_minutes: 45,
        goalKey: "running",
        milestoneIndex: 1,
      },
      {
        title: `${DEMO_PREFIX}Finish sprint retro notes`,
        priority: "high",
        status: "in_progress",
        due_date: dayKey(-2),
        scheduled_start: null,
        scheduled_end: null,
        estimated_duration_minutes: 30,
        goalKey: "lifeos",
        milestoneIndex: null,
      },
      {
        title: `${DEMO_PREFIX}Read 30 pages`,
        priority: "low",
        status: "todo",
        due_date: dayKey(1),
        scheduled_start: null,
        scheduled_end: null,
        estimated_duration_minutes: 30,
        goalKey: "books",
        milestoneIndex: null,
      },
    ],
  };
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const cleanOnly = args.has("--clean");

const plan = buildPlan();

if (dryRun) {
  console.log(`DRY RUN — nothing is written. Prefix: "${DEMO_PREFIX}"`);
  console.log(`goals to create: ${plan.goals.length}`);
  for (const goal of plan.goals) {
    console.log(
      `  - ${goal.row.title} [${goal.row.progress_mode}] ` +
        `${goal.row.start_date}..${goal.row.target_date}, milestones: ${goal.milestones.length}`,
    );
  }
  console.log(`tasks to create: ${plan.tasks.length}`);
  for (const task of plan.tasks) {
    console.log(`  - ${task.title} (${task.status}, due ${task.due_date}, goal ${task.goalKey})`);
  }
  console.log("Re-run without --dry-run to write, --clean to remove demo rows.");
  process.exit(0);
}

const local = loadEnvFile(".env.local");

const SUPABASE_URL = local.VITE_SUPABASE_URL;
const ANON_KEY = local.VITE_SUPABASE_ANON_KEY;
const EMAIL = local.VITE_DEMO_EMAIL;
const PASSWORD = local.VITE_DEMO_PASSWORD;

if (!SUPABASE_URL || !ANON_KEY || !EMAIL || !PASSWORD) {
  throw new Error(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_DEMO_EMAIL / VITE_DEMO_PASSWORD " +
      "required in .env.local — create the demo account first (it must NOT be the e2e account)",
  );
}

async function rest(path, { token, method = "GET", body = null } = {}) {
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
    throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`);
  }

  const raw = await response.text();
  return raw ? JSON.parse(raw) : [];
}

const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});

if (!authResponse.ok) {
  throw new Error(`sign-in failed: ${authResponse.status} ${await authResponse.text()}`);
}

const { access_token: token, user } = await authResponse.json();
console.log(`signed in (user ${user.id.slice(0, 8)}...)`);

const likeFilter = `like.${encodeURIComponent(`${DEMO_PREFIX}%`)}`;

async function clean() {
  const removedTasks = await rest(`tasks?title=${likeFilter}&select=id`, {
    token,
    method: "DELETE",
  });
  const removedGoals = await rest(`goals?title=${likeFilter}&select=id`, {
    token,
    method: "DELETE",
  });
  console.log(`removed ${removedTasks.length} demo tasks, ${removedGoals.length} demo goals`);
}

await clean();

if (cleanOnly) {
  console.log("--clean: done, nothing was created.");
  process.exit(0);
}

const goalIds = {};
const milestoneIds = {};

for (const goal of plan.goals) {
  const [created] = await rest("goals", {
    token,
    method: "POST",
    body: { ...goal.row, user_id: user.id },
  });
  goalIds[goal.key] = created.id;
  milestoneIds[goal.key] = [];

  for (const milestone of goal.milestones) {
    const [createdMilestone] = await rest("milestones", {
      token,
      method: "POST",
      body: {
        user_id: user.id,
        goal_id: created.id,
        title: milestone.title,
        status: milestone.status,
        position: milestone.position,
        completed_at: milestone.status === "completed" ? new Date().toISOString() : null,
      },
    });
    milestoneIds[goal.key].push(createdMilestone.id);
  }
}

for (const task of plan.tasks) {
  const milestoneId =
    task.milestoneIndex === null
      ? null
      : (milestoneIds[task.goalKey]?.[task.milestoneIndex] ?? null);

  await rest("tasks", {
    token,
    method: "POST",
    body: {
      user_id: user.id,
      goal_id: goalIds[task.goalKey] ?? null,
      milestone_id: milestoneId,
      title: task.title,
      description: null,
      priority: task.priority,
      status: task.status,
      due_date: task.due_date,
      scheduled_start: task.scheduled_start,
      scheduled_end: task.scheduled_end,
      estimated_duration_minutes: task.estimated_duration_minutes,
      completed_at: task.status === "completed" ? new Date().toISOString() : null,
    },
  });
}

const createdGoals = await rest(`goals?title=${likeFilter}&select=title,progress_mode,progress`, {
  token,
});
const createdTasks = await rest(`tasks?title=${likeFilter}&select=title,status,due_date`, {
  token,
});

console.log(`created ${createdGoals.length} goals, ${createdTasks.length} tasks`);
for (const goal of createdGoals) {
  console.log(`  goal: ${goal.title} (${goal.progress_mode}, stored ${goal.progress})`);
}
for (const task of createdTasks) {
  console.log(`  task: ${task.title} (${task.status}, due ${task.due_date ?? "-"})`);
}
console.log("Dashboard should now show today's tasks, active goals and 2 overdue tasks.");
console.log("Remove everything with: node scripts/seed-demo.mjs --clean");
