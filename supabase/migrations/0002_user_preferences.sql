-- 0002_user_preferences: preferences + handle_new_user (single function
-- for both tables) + RLS.

create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  wake_up_time time not null default '07:00',
  sleep_time time not null default '23:00',
  working_hours jsonb not null default '{}'::jsonb
    check (jsonb_typeof(working_hours) = 'object'),
  study_hours jsonb not null default '{}'::jsonb
    check (jsonb_typeof(study_hours) = 'object'),
  preferred_work_periods jsonb not null default '{}'::jsonb
    check (jsonb_typeof(preferred_work_periods) = 'object'),
  notification_preferences jsonb not null default '{}'::jsonb
    check (jsonb_typeof(notification_preferences) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_user_preferences_user_id on public.user_preferences (user_id);

create trigger trg_user_preferences_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

alter table public.user_preferences enable row level security;

-- The client only selects/updates its own row (update, never insert).
create policy "user_preferences_select_own"
  on public.user_preferences for select to authenticated using (user_id = auth.uid());

create policy "user_preferences_update_own"
  on public.user_preferences for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Single function for both tables. SECURITY DEFINER requires explicit review
-- (AGENTS.md §5): empty search_path + schema-qualified names +
-- ON CONFLICT DO NOTHING (idempotent, signup retries must not fail).
-- timezone: the client passes TZ in options.data on signUp, fallback 'UTC'.
-- The trigger inserts; the client only ever updates (no contradiction).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text := coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'UTC');
begin
  insert into public.profiles (id, full_name, avatar_url, timezone)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''), null, v_timezone)
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
