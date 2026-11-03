-- 0004_tasks_recurrence: recurrence_rules + tasks + RLS.
-- Applies after 0003 (tasks reference goals and milestones).
--
-- Recurrence strategy (user decision 2026-11-04, docs/plan.md Unit 7):
-- eager instances, 30-day horizon on rule save plus a top-up on app login
-- (service topUpRecurrenceInstances, Unit 7). A rule edit only affects future
-- dates not yet materialised; created instances are never regenerated; editing
-- one instance detaches it (recurrence_rule_id = NULL). Deleting a rule keeps
-- existing instances (SET NULL). Deleting a goal only unlinks tasks
-- (SET NULL on goal_id and milestone_id, never CASCADE).
--
-- The partial UNIQUE index below plus ON CONFLICT DO NOTHING on insert makes
-- the top-up idempotent across devices. Generated instances always carry a
-- due_date, so the NULL semantics of the partial index never bite.

create table public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  frequency text not null
    check (frequency in ('daily', 'weekdays', 'weekly')),
  -- Weekday convention: 0 = Sunday .. 6 = Saturday (matches JS getDay).
  weekdays integer[] not null default '{}'
    check (weekdays <@ '{0,1,2,3,4,5,6}'),
  -- A 'weekdays' rule with an empty set would silently generate zero instances;
  -- reject it loudly instead of debugging the app layer later.
  check (frequency <> 'weekdays' or coalesce(array_length(weekdays, 1), 0) > 0),
  -- '{0,NULL}' slips through <@ (NULL comparison is not false); ban NULLs outright.
  check (array_position(weekdays, null) is null),
  -- Every N days (daily) or every N weeks (weekdays / weekly).
  interval_value integer not null default 1
    check (interval_value >= 1),
  start_date date not null,
  end_date date null
    check (end_date is null or end_date >= start_date),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid null references public.goals (id) on delete set null,
  milestone_id uuid null references public.milestones (id) on delete set null,
  title text not null,
  description text,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'completed', 'cancelled')),
  due_date date null,
  scheduled_start timestamptz null,
  scheduled_end timestamptz null
    check (scheduled_end is null or scheduled_start is null or scheduled_end > scheduled_start),
  estimated_duration_minutes integer null
    check (estimated_duration_minutes is null or estimated_duration_minutes > 0),
  completed_at timestamptz null,
  recurrence_rule_id uuid null references public.recurrence_rules (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_recurrence_rules_user_id on public.recurrence_rules (user_id);
create index idx_tasks_user_id on public.tasks (user_id);
create index idx_tasks_goal_id on public.tasks (goal_id);
create index idx_tasks_milestone_id on public.tasks (milestone_id);
create index idx_tasks_user_status on public.tasks (user_id, status);
create index idx_tasks_user_due on public.tasks (user_id, due_date);
create index idx_tasks_user_scheduled on public.tasks (user_id, scheduled_start);
create index idx_tasks_recurrence_rule_id on public.tasks (recurrence_rule_id);

-- One instance per rule per day. Partial so hand-created tasks
-- (recurrence_rule_id IS NULL) are never affected.
create unique index uq_tasks_recurrence_instance
  on public.tasks (recurrence_rule_id, due_date)
  where recurrence_rule_id is not null;

create trigger trg_recurrence_rules_updated_at
  before update on public.recurrence_rules
  for each row execute function public.set_updated_at();

create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.recurrence_rules enable row level security;
alter table public.tasks enable row level security;

create policy "recurrence_rules_select_own"
  on public.recurrence_rules for select to authenticated using (user_id = auth.uid());

create policy "recurrence_rules_insert_own"
  on public.recurrence_rules for insert to authenticated with check (user_id = auth.uid());

create policy "recurrence_rules_update_own"
  on public.recurrence_rules for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "recurrence_rules_delete_own"
  on public.recurrence_rules for delete to authenticated using (user_id = auth.uid());

create policy "tasks_select_own"
  on public.tasks for select to authenticated using (user_id = auth.uid());

-- Cross-tenant links are rejected here, not just unroutable: without the EXISTS
-- guards below, user A could attach their task to user B's goal. SELECT would
-- still be blocked by RLS, but analytics / Phase 4 joins would follow a forged
-- link, so ownership of each referenced row is verified explicitly.
-- (Composite-FK alternative considered and rejected: needs PG 15+ for SET NULL
-- on multi-column FKs and extra UNIQUE indexes; RLS variant is 6 lines.)

create policy "tasks_insert_own"
  on public.tasks for insert to authenticated with check (
    user_id = auth.uid()
    and (goal_id is null or exists (
      select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()))
    and (milestone_id is null or exists (
      select 1 from public.milestones m where m.id = milestone_id and m.user_id = auth.uid()))
    and (recurrence_rule_id is null or exists (
      select 1 from public.recurrence_rules r
      where r.id = recurrence_rule_id and r.user_id = auth.uid()))
  );

create policy "tasks_delete_own"
  on public.tasks for delete to authenticated using (user_id = auth.uid());

create policy "tasks_update_own"
  on public.tasks for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (goal_id is null or exists (
      select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()))
    and (milestone_id is null or exists (
      select 1 from public.milestones m where m.id = milestone_id and m.user_id = auth.uid()))
    and (recurrence_rule_id is null or exists (
      select 1 from public.recurrence_rules r
      where r.id = recurrence_rule_id and r.user_id = auth.uid()))
  );
