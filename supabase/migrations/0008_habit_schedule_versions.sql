-- 0008_habit_schedule_versions: minimal schedule/pause history for habits.
-- Step 1b of Phase 5 (docs/plan-phase-5.md §3 п. 6, решение A владельца
-- от 2026-11-06). NOT applied here — the owner applies it separately
-- after review (same procedure as 0005/0006/0007).
--
-- Why this table: one current `habits.status` row cannot restore the
-- historical calendar (was the habit paused 3 weeks ago? which schedule
-- applied then?). Past pauses and schedule changes are stored explicitly
-- as append-only snapshots; calculations read the version that was
-- effective on each date. Renames and no-op writes store nothing.
--
-- Semantics (enforced by the trigger below, same transaction = atomic):
--   * Habit creation + snapshot are atomic (AFTER INSERT writes the first
--     version with effective_from = GREATEST(start_date, creation day in the
--     owner's timezone): backdated starts do not materialize misses for
--     days on which the habit could not exist).
--   * Schedule/status change + snapshot are atomic (AFTER UPDATE writes or
--     refreshes today's version; past rows are never rewritten). Future
--     snapshots (a future start_date row) are refreshed to the newest
--     values, never closed into a CHECK violation, and today's new row is
--     bounded by the next future snapshot (single-open-version invariant).
--   * Only tracked fields version the history: frequency, weekdays,
--     target_count, start_date, status. Title/description/reminder_time
--     changes (rename) and no-op writes store nothing.
--   * The day is determined by the SERVER in the owner's IANA timezone
--     (`habit_current_date()`, fallback UTC when the profile is missing).
--   * The last change of the current day wins: an UPDATE that finds a
--     version with effective_from = today refreshes it in place instead
--     of inserting a second row (`UNIQUE (habit_id, effective_from)`).
--   * Existing rows are NOT back-invented: the backfill below uses
--     GREATEST(start_date, CURRENT_DATE), so dates before today stay
--     uncovered (unknown past = no obligations, never a fake 0%).
--   * No SECURITY DEFINER anywhere: both functions are SECURITY INVOKER,
--     the trigger writes under the caller's RLS (the habit row it guards
--     on is visible in the same transaction).
--
-- Cross-tenant links are rejected in WITH CHECK (same posture as
-- 0004/0005/0007): user_id = auth.uid() alone would hide a forged link
-- but not prevent creating it.

create or replace function public.habit_current_date(p_user_id uuid)
returns date
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_timezone text;
begin
  select timezone into v_timezone from public.profiles where id = p_user_id;

  if v_timezone is null then
    v_timezone := 'UTC';
  end if;

  begin
    return (now() at time zone v_timezone)::date;
  exception
    -- profiles.timezone is free text (0001 has no CHECK): a bad value must
    -- degrade to UTC, never brick habit edits (the trigger calls this on
    -- every tracked UPDATE).
    when invalid_parameter_value then
      return (now() at time zone 'UTC')::date;
  end;
end;
$$;

create table public.habit_schedule_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  effective_from date not null,
  effective_to date null
    check (effective_to is null or effective_to >= effective_from),
  frequency text not null
    check (frequency in ('daily', 'weekdays', 'weekly')),
  -- Weekday convention: 0 = Sunday .. 6 = Saturday (matches JS getDay,
  -- same as 0004 recurrence_rules and 0007 habits).
  weekdays integer[] not null default '{}'
    check (weekdays <@ '{0,1,2,3,4,5,6}'),
  check (frequency <> 'weekdays' or coalesce(array_length(weekdays, 1), 0) > 0),
  -- '{0,NULL}' slips through <@ (NULL comparison is not false); ban NULLs outright.
  check (array_position(weekdays, null) is null),
  target_count integer not null
    check (target_count >= 1),
  start_date date not null,
  status text not null
    check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One snapshot per habit per day: the last change of the day wins by
-- refreshing this row instead of inserting a second one.
create unique index uq_habit_schedule_versions_habit_from
  on public.habit_schedule_versions (habit_id, effective_from);

create index idx_habit_schedule_versions_user_id
  on public.habit_schedule_versions (user_id);
create index idx_habit_schedule_versions_user_from
  on public.habit_schedule_versions (user_id, effective_from);

create trigger trg_habit_schedule_versions_updated_at
  before update on public.habit_schedule_versions
  for each row execute function public.set_updated_at();

create or replace function public.sync_habit_schedule_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date;
  v_new_weekdays integer[];
  v_old_weekdays integer[];
  v_next_from date;
begin
  -- Weekday comparison and storage are order-insensitive: the service sorts,
  -- but direct-SQL writes of an equal-as-set array must not mint noise.
  select coalesce(array_agg(w order by w), '{}') into v_new_weekdays
    from unnest(NEW.weekdays) as w;
  if (TG_OP = 'UPDATE') then
    select coalesce(array_agg(w order by w), '{}') into v_old_weekdays
      from unnest(OLD.weekdays) as w;
  end if;

  if (TG_OP = 'INSERT') then
    -- Obligations start when the habit starts existing, not before: a
    -- backdated start_date does not materialize misses for days on which
    -- the habit (and therefore its logs) could not exist.
    insert into public.habit_schedule_versions
      (user_id, habit_id, effective_from, effective_to,
       frequency, weekdays, target_count, start_date, status)
    values
      (NEW.user_id, NEW.id,
       greatest(NEW.start_date, public.habit_current_date(NEW.user_id)), null,
       NEW.frequency, v_new_weekdays, NEW.target_count, NEW.start_date, NEW.status);
    return NEW;
  elsif (TG_OP = 'UPDATE') then
    -- Rename / no-op writes store nothing: only tracked schedule fields
    -- version the history.
    if (OLD.frequency is not distinct from NEW.frequency
        and v_old_weekdays = v_new_weekdays
        and OLD.target_count is not distinct from NEW.target_count
        and OLD.start_date is not distinct from NEW.start_date
        and OLD.status is not distinct from NEW.status) then
      return NEW;
    end if;

    v_today := public.habit_current_date(NEW.user_id);

    -- Last change of the current day wins: refresh today's snapshot.
    update public.habit_schedule_versions
      set frequency = NEW.frequency,
          weekdays = v_new_weekdays,
          target_count = NEW.target_count,
          start_date = NEW.start_date,
          status = NEW.status
      where habit_id = NEW.id
        and effective_from = v_today;
    if found then
      -- Today's refresh must not leave later snapshots stale (e.g. a
      -- future start_date row written at creation).
      update public.habit_schedule_versions
        set frequency = NEW.frequency,
            weekdays = v_new_weekdays,
            target_count = NEW.target_count,
            start_date = NEW.start_date,
            status = NEW.status
        where habit_id = NEW.id
          and effective_from > v_today;
      return NEW;
    end if;

    -- Close only strictly-past open rows. Future snapshots (a future
    -- start_date row) are refreshed below instead: closing one with
    -- effective_to = v_today - 1 would violate
    -- effective_to >= effective_from and abort the whole UPDATE.
    update public.habit_schedule_versions
      set effective_to = v_today - 1
      where habit_id = NEW.id
        and effective_to is null
        and effective_from < v_today;

    -- Future snapshots never go stale: they keep their effective_from
    -- but carry the newest field values.
    update public.habit_schedule_versions
      set frequency = NEW.frequency,
          weekdays = v_new_weekdays,
          target_count = NEW.target_count,
          start_date = NEW.start_date,
          status = NEW.status
      where habit_id = NEW.id
        and effective_from > v_today;

    -- Open today's snapshot, bounded by the next future snapshot if one
    -- exists (single-open-version invariant: at most one NULL row, and it
    -- always has the greatest effective_from).
    select min(effective_from) into v_next_from
      from public.habit_schedule_versions
      where habit_id = NEW.id
        and effective_from > v_today;

    insert into public.habit_schedule_versions
      (user_id, habit_id, effective_from, effective_to,
       frequency, weekdays, target_count, start_date, status)
    values
      (NEW.user_id, NEW.id, v_today,
       case when v_next_from is null then null else v_next_from - 1 end,
       NEW.frequency, v_new_weekdays, NEW.target_count, NEW.start_date, NEW.status);
    return NEW;
  end if;

  return NEW;
end;
$$;

create trigger trg_habits_schedule_versioning
  after insert or update on public.habits
  for each row execute function public.sync_habit_schedule_version();

-- Backfill for habits created before this migration (0007 is not applied
-- live yet, so this is expected to insert 0 rows). GREATEST keeps the
-- unknown past uncovered instead of inventing it: dates before today
-- have no version and therefore no obligations.
-- Midnight note: CURRENT_DATE is the server date while the trigger uses
-- the profile timezone; near midnight they can disagree by one day. This
-- is a one-shot statement, so the skew (if any) is documented, not fixed.
insert into public.habit_schedule_versions
  (user_id, habit_id, effective_from, effective_to,
   frequency, weekdays, target_count, start_date, status)
select
  user_id, id, greatest(start_date, CURRENT_DATE), null,
  frequency, weekdays, target_count, start_date, status
from public.habits
on conflict (habit_id, effective_from) do nothing;

alter table public.habit_schedule_versions enable row level security;

create policy "habit_schedule_versions_select_own"
  on public.habit_schedule_versions for select to authenticated
  using (user_id = auth.uid());

-- Cross-tenant habit_id links are rejected here, not just hidden (same
-- reasoning as 0004/0005/0007): without the EXISTS guard, user A could
-- version user B's habit. RLS still scopes reads to the owner's rows.
create policy "habit_schedule_versions_insert_own"
  on public.habit_schedule_versions for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );

create policy "habit_schedule_versions_update_own"
  on public.habit_schedule_versions for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );

create policy "habit_schedule_versions_delete_own"
  on public.habit_schedule_versions for delete to authenticated
  using (user_id = auth.uid());
