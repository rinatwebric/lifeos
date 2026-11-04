-- 0007_habits_habit_logs: habits + habit_logs + RLS.
-- Step 1 of Phase 5 (docs/plan-phase-5.md). NOT applied here — the owner
-- applies it separately after review (same procedure as 0005/0006).
--
-- Numbering note: docs/plan-phase-4.md mentions "migration 0007" as a future
-- AI RPC backlog (atomic apply_proposal), but that file does not exist; 0007
-- is the next actually free number and is taken here by habits. The AI RPC
-- backlog, if implemented, must use 0008 or later.
--
-- Decisions (docs/plan-phase-5.md Р2–Р6):
--   * frequency in ('daily','weekdays','weekly') mirrors recurrence_rules
--     (0004); weekday convention 0 = Sunday .. 6 = Saturday matches JS getDay.
--   * A 'weekdays' habit with an empty set would silently schedule nothing;
--     rejected loudly (same as 0004). NULL elements banned outright.
--   * target_count is the per-day obligation for daily/weekdays and the
--     per-calendar-week sum for weekly (semantics fixed in plan-phase-5.md §3,
--     enforced in the service layer, not by CHECK). Overfulfilment
--     (completed > target) is allowed, so no upper CHECK exists.
--   * One log per habit per day: UNIQUE (habit_id, log_date).
--   * Pause/archive never delete rows (status change only); hard DELETE of a
--     habit removes its logs (CASCADE) — a log without its habit is
--     meaningless, and the step-3 delete dialog must confirm explicitly.
--   * reminder_time is nullable TIME; notification infrastructure is out of
--     scope — the column stores the time only.
--   * Cross-tenant habit_id links on logs are rejected in WITH CHECK (same
--     posture as 0004/0005): user_id = auth.uid() alone would hide a forged
--     link but not prevent creating it.

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  frequency text not null
    check (frequency in ('daily', 'weekdays', 'weekly')),
  -- Weekday convention: 0 = Sunday .. 6 = Saturday (matches JS getDay).
  weekdays integer[] not null default '{}'
    check (weekdays <@ '{0,1,2,3,4,5,6}'),
  -- A 'weekdays' habit with an empty set would silently schedule nothing;
  -- reject it loudly instead of debugging the app layer later.
  check (frequency <> 'weekdays' or coalesce(array_length(weekdays, 1), 0) > 0),
  -- '{0,NULL}' slips through <@ (NULL comparison is not false); ban NULLs outright.
  check (array_position(weekdays, null) is null),
  target_count integer not null default 1
    check (target_count >= 1),
  reminder_time time null,
  start_date date not null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  log_date date not null,
  completed_count integer not null default 0
    check (completed_count >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One log per habit per day (PRD §11.9).
create unique index uq_habit_logs_habit_date
  on public.habit_logs (habit_id, log_date);

create index idx_habits_user_id on public.habits (user_id);
create index idx_habits_user_status on public.habits (user_id, status);
create index idx_habit_logs_user_id on public.habit_logs (user_id);
-- Range reads of one owner's logs (habit progress over a period).
create index idx_habit_logs_user_date on public.habit_logs (user_id, log_date);

create trigger trg_habits_updated_at
  before update on public.habits
  for each row execute function public.set_updated_at();

create trigger trg_habit_logs_updated_at
  before update on public.habit_logs
  for each row execute function public.set_updated_at();

alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

create policy "habits_select_own"
  on public.habits for select to authenticated using (user_id = auth.uid());

create policy "habits_insert_own"
  on public.habits for insert to authenticated with check (user_id = auth.uid());

create policy "habits_update_own"
  on public.habits for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "habits_delete_own"
  on public.habits for delete to authenticated using (user_id = auth.uid());

create policy "habit_logs_select_own"
  on public.habit_logs for select to authenticated using (user_id = auth.uid());

-- Cross-tenant links are rejected here, not just unroutable (same reasoning
-- as 0004/0005): without the EXISTS guard, user A could log against user B's
-- habit. SELECT would still be blocked by RLS, but analytics joins would
-- follow a forged link, so ownership of the habit is verified explicitly on
-- every write. SELECT/DELETE stay owner-only by user_id.

create policy "habit_logs_insert_own"
  on public.habit_logs for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );

create policy "habit_logs_delete_own"
  on public.habit_logs for delete to authenticated using (user_id = auth.uid());

create policy "habit_logs_update_own"
  on public.habit_logs for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );
