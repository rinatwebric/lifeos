-- 0005_time_blocks: planner time blocks (PRD §11.7) + RLS.
-- Unit 1 of iteration 4 (docs/plan.md). Only schema change of Phase 3.
--
-- Decisions (owner, 2026-11-04):
--   * block_type in ('task','break','personal'); 'personal' covers work/study/personal
--     events, separate work/study types are not introduced yet (Д4). No `source` column:
--     a task block is identified by task_id.
--   * task_id is ON DELETE CASCADE, not SET NULL: SET NULL runs as an UPDATE of the
--     referencing row, CHECKs are validated on UPDATE, so deleting a task that had a block
--     would fail with 23514 (Д5). The block is derived from the task; break/personal blocks
--     are unaffected (their task_id is null).
--   * Ownership of task_id is verified in the policies (EXISTS), same posture as 0004:
--     RLS alone would hide a forged link but not prevent creating it.

create table public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid null references public.tasks (id) on delete cascade,
  title text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  block_type text not null
    check (block_type in ('task', 'break', 'personal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Inverted intervals are rejected (PRD §11.13).
  check (end_time > start_time),
  -- A task block always points at its task...
  check (block_type <> 'task' or task_id is not null),
  -- ...and only a task block may point at a task.
  check (task_id is null or block_type = 'task')
);

create index idx_time_blocks_user_id on public.time_blocks (user_id);
create index idx_time_blocks_user_start on public.time_blocks (user_id, start_time);
create index idx_time_blocks_task_id on public.time_blocks (task_id);

create trigger trg_time_blocks_updated_at
  before update on public.time_blocks
  for each row execute function public.set_updated_at();

alter table public.time_blocks enable row level security;

-- Cross-tenant links are rejected here, not just unroutable (same reasoning as 0004).
create policy "time_blocks_select_own"
  on public.time_blocks for select to authenticated using (user_id = auth.uid());

create policy "time_blocks_insert_own"
  on public.time_blocks for insert to authenticated with check (
    user_id = auth.uid()
    and (task_id is null or exists (
      select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid()))
  );

create policy "time_blocks_update_own"
  on public.time_blocks for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (task_id is null or exists (
      select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid()))
  );

create policy "time_blocks_delete_own"
  on public.time_blocks for delete to authenticated using (user_id = auth.uid());
