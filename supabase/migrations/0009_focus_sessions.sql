-- 0009_focus_sessions: actual focused work sessions, separate from planned blocks.
--
-- The planner answers "when do I intend to work"; this table records what
-- actually happened. A session is active while ended_at is null, may be
-- paused (paused_at + accumulated paused_seconds), and keeps its history
-- after the linked task is deleted (task_id SET NULL).
--
-- Invariants:
--   * at most one active session per user (partial unique index);
--   * ended_at never precedes started_at;
--   * paused_at only exists on an open session and never precedes started_at;
--   * planned_minutes is deliberately bounded (1 minute .. 12 hours).
--
-- Cross-tenant task links are rejected by RLS, not only hidden. The session
-- row is always owned by auth.uid(); a forged task_id from another user is
-- refused by the EXISTS guard, same posture as 0004/0005/0006/0007/0008.

create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid null references public.tasks (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  planned_minutes integer not null
    check (planned_minutes between 1 and 720),
  paused_at timestamptz null,
  paused_seconds integer not null default 0
    check (paused_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  check (paused_at is null or (ended_at is null and paused_at >= started_at))
);

-- One running/paused session per user. A 23505 here means "another session is
-- already active"; the service maps it to active_exists and refreshes state.
create unique index uq_focus_sessions_one_active
  on public.focus_sessions (user_id)
  where ended_at is null;

create index idx_focus_sessions_user_started
  on public.focus_sessions (user_id, started_at desc);
create index idx_focus_sessions_task_id
  on public.focus_sessions (task_id);

create trigger trg_focus_sessions_updated_at
  before update on public.focus_sessions
  for each row execute function public.set_updated_at();

alter table public.focus_sessions enable row level security;

create policy "focus_sessions_select_own"
  on public.focus_sessions for select to authenticated using (
    user_id = auth.uid()
    and (
      task_id is null
      or exists (
        select 1 from public.tasks t
        where t.id = task_id and t.user_id = auth.uid()
      )
    )
  );

create policy "focus_sessions_insert_own"
  on public.focus_sessions for insert to authenticated with check (
    user_id = auth.uid()
    and (
      task_id is null
      or exists (
        select 1 from public.tasks t
        where t.id = task_id and t.user_id = auth.uid()
      )
    )
  );

create policy "focus_sessions_update_own"
  on public.focus_sessions for update to authenticated
  using (
    user_id = auth.uid()
    and (
      task_id is null
      or exists (
        select 1 from public.tasks t
        where t.id = task_id and t.user_id = auth.uid()
      )
    )
  )
  with check (
    user_id = auth.uid()
    and (
      task_id is null
      or exists (
        select 1 from public.tasks t
        where t.id = task_id and t.user_id = auth.uid()
      )
    )
  );

create policy "focus_sessions_delete_own"
  on public.focus_sessions for delete to authenticated using (
    user_id = auth.uid()
    and (
      task_id is null
      or exists (
        select 1 from public.tasks t
        where t.id = task_id and t.user_id = auth.uid()
      )
    )
  );