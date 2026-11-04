-- 0006_ai_assistant: AI assistant conversations / messages / proposals + RLS.
-- Step 1 of iteration 5 (docs/plan-phase-4.md). NOT applied here — the owner
-- applies it separately after review (same procedure as 0005).
--
-- Decisions (owner + review, 2026-11-04):
--   * DB statuses are only pending|approved|rejected. `expired` is never stored;
--     it is computed on read (pending AND expires_at < now()), and approving an
--     expired proposal is rejected in the Edge Function (Р3).
--   * expires_at defaults to created_at + 7 days; CHECK keeps it after created_at
--     (NULL passes the CHECK per SQL semantics, PRD §11.12 keeps it nullable).
--   * Deleting a conversation deletes its messages (CASCADE) but keeps proposals
--     (conversation_id SET NULL) so the audit trail survives (Р6).
--   * Messages are immutable: no updated_at (PRD §11.11) and no UPDATE policy —
--     RLS default-deny rejects updates, so history is append-only by
--     construction. Mutable state lives in ai_proposals (status/applied_at).
--   * proposal_type covers all 5 types in one CHECK; rollout order is enforced
--     in code, not by narrowing the CHECK (Р2).
--   * No vector/embeddings columns, no token/cost columns (no billing in this
--     iteration), no separate actions table: actions live as an array inside
--     payload and are validated by Zod/JSON Schema on the server.
--   * No secrets of any kind in this migration (see AGENTS.md §5).

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null
    check (title <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null
    check (role in ('user', 'assistant', 'system')),
  content text not null
    check (content <> ''),
  metadata jsonb not null default '{}'
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table public.ai_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid null references public.ai_conversations (id) on delete set null,
  proposal_type text not null
    check (proposal_type in ('goal_breakdown', 'task_creation', 'schedule_suggestion', 'schedule_changes', 'productivity_analysis')),
  payload jsonb not null
    check (jsonb_typeof(payload) = 'object')
    check (payload <> '{}'::jsonb),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  expires_at timestamptz null default (now() + interval '7 days'),
  applied_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Proposals always expire after creation; NULL expiry (never expires) passes.
  check (expires_at > created_at),
  -- approved ⟺ applied_at: an approved proposal always carries an apply
  -- timestamp, a pending/rejected one never does. No half-states either way.
  check ((status = 'approved') = (applied_at is not null))
);

create index idx_ai_conversations_user_id on public.ai_conversations (user_id);
create index idx_ai_messages_conversation_created on public.ai_messages (conversation_id, created_at);
create index idx_ai_proposals_user_status on public.ai_proposals (user_id, status);
create index idx_ai_proposals_expires_at on public.ai_proposals (expires_at);
create index idx_ai_proposals_user_type on public.ai_proposals (user_id, proposal_type);
-- The SET NULL delete path (conversation delete → proposals unlink) must not
-- scan the table: the FK column needs its own index.
create index idx_ai_proposals_conversation_id on public.ai_proposals (conversation_id);

create trigger trg_ai_conversations_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();

create trigger trg_ai_proposals_updated_at
  before update on public.ai_proposals
  for each row execute function public.set_updated_at();

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_proposals enable row level security;

create policy "ai_conversations_select_own"
  on public.ai_conversations for select to authenticated using (user_id = auth.uid());

create policy "ai_conversations_insert_own"
  on public.ai_conversations for insert to authenticated with check (user_id = auth.uid());

create policy "ai_conversations_update_own"
  on public.ai_conversations for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "ai_conversations_delete_own"
  on public.ai_conversations for delete to authenticated using (user_id = auth.uid());

-- Cross-tenant links are rejected here, not just unroutable (same reasoning as
-- 0004/0005): without the EXISTS guards below, user A could attach their
-- message to user B's conversation. SELECT would still be blocked by RLS, but
-- the forged link would exist, so ownership of the conversation is verified
-- explicitly on every policy.

create policy "ai_messages_select_own"
  on public.ai_messages for select to authenticated using (
    user_id = auth.uid()
    and exists (
      select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );

create policy "ai_messages_insert_own"
  on public.ai_messages for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );

create policy "ai_messages_delete_own"
  on public.ai_messages for delete to authenticated using (
    user_id = auth.uid()
    and exists (
      select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );

-- Proposals survive their conversation (SET NULL), so the guard explicitly
-- allows a NULL conversation_id; otherwise a detached proposal would become
-- invisible to its owner.

create policy "ai_proposals_select_own"
  on public.ai_proposals for select to authenticated using (
    user_id = auth.uid()
    and (conversation_id is null or exists (
      select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  );

create policy "ai_proposals_insert_own"
  on public.ai_proposals for insert to authenticated with check (
    user_id = auth.uid()
    -- New proposals are born pending and unapplied; approve/reject is a
    -- server-side UPDATE after re-validation, never a client-side INSERT.
    and status = 'pending'
    and applied_at is null
    and (conversation_id is null or exists (
      select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  );

create policy "ai_proposals_update_own"
  on public.ai_proposals for update to authenticated
  using (
    user_id = auth.uid()
    and (conversation_id is null or exists (
      select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  )
  with check (
    user_id = auth.uid()
    and (conversation_id is null or exists (
      select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  );

create policy "ai_proposals_delete_own"
  on public.ai_proposals for delete to authenticated using (
    user_id = auth.uid()
    and (conversation_id is null or exists (
      select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  );
