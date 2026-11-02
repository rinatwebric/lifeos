-- 0001_profiles: profiles + updated_at infrastructure + RLS.
-- Applies before 0002. handle_new_user lives in 0002 because it inserts
-- into both tables (profiles + user_preferences).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  timezone text not null default 'UTC',
  language text not null default 'en' check (language in ('en', 'ru', 'ky')),
  theme text not null default 'light' check (theme in ('light', 'dark')),
  onboarded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Shared updated_at function. SECURITY DEFINER + empty search_path so the
-- trigger behaves predictably regardless of the caller's search_path.
-- Requires explicit review per AGENTS.md §5 (security definer).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- The client never inserts/deletes profiles directly (only handle_new_user does).
create policy "profiles_select_own"
  on public.profiles for select to authenticated using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
