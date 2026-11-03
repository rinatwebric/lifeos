-- 0003_goals_milestones: goals + milestones + RLS.
-- Applies after 0002.
--
-- Deletion strategy (user decision 2026-11-04, docs/plan.md Unit 1):
-- goals are hard-deleted only with an explicit confirmation dialog that shows
-- the linked-task count; milestones die with their goal (CASCADE); tasks only
-- lose the link (SET NULL in 0004, never CASCADE).

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  category text not null
    check (category in (
      'career', 'education', 'health', 'finance',
      'personal_development', 'relationships', 'projects', 'other'
    )),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'not_started'
    check (status in ('not_started', 'active', 'paused', 'completed', 'archived')),
  start_date date not null,
  target_date date null
    check (target_date is null or target_date >= start_date),
  progress integer not null default 0
    check (progress between 0 and 100),
  progress_mode text not null default 'manual'
    check (progress_mode in ('manual', 'milestones')),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Milestone statuses stay pending | completed (decision 2026-11-04): the PRD
-- does not enumerate them, and "in progress" is derived from the milestone's
-- tasks once the Planner exists. See src/types/domain.ts.

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  title text not null,
  description text,
  position integer not null default 0
    check (position >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'completed')),
  target_date date null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_goals_user_id on public.goals (user_id);
create index idx_goals_user_status on public.goals (user_id, status);
create index idx_milestones_user_id on public.milestones (user_id);
create index idx_milestones_goal_id on public.milestones (goal_id);

create trigger trg_goals_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

create trigger trg_milestones_updated_at
  before update on public.milestones
  for each row execute function public.set_updated_at();

alter table public.goals enable row level security;
alter table public.milestones enable row level security;

create policy "goals_select_own"
  on public.goals for select to authenticated using (user_id = auth.uid());

create policy "goals_insert_own"
  on public.goals for insert to authenticated with check (user_id = auth.uid());

create policy "goals_update_own"
  on public.goals for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "goals_delete_own"
  on public.goals for delete to authenticated using (user_id = auth.uid());

create policy "milestones_select_own"
  on public.milestones for select to authenticated using (user_id = auth.uid());

create policy "milestones_insert_own"
  on public.milestones for insert to authenticated with check (user_id = auth.uid());

create policy "milestones_update_own"
  on public.milestones for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "milestones_delete_own"
  on public.milestones for delete to authenticated using (user_id = auth.uid());
