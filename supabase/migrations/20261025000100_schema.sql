-- ═══════════════════════════════════════════════════════════════════════════
-- HishebNama — complete schema (DEVELOPMENT_PLAN.md §8.2)
--
-- Phase 0, ordering rule: "Full schema in the first migration."  ledger_entries
-- is append-only, so a column added later would be permanently NULL for every
-- entry written before it existed.  Everything lands at once.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
-- pg_cron is enabled in the scheduling migration (20261025000700), guarded so
-- the schema also loads on a plain local Postgres for the SQL test suite.

-- ─────────────────────────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────────────────────────
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email        text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row whenever a user signs up.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- GROUPS
-- ─────────────────────────────────────────────────────────────

-- DIVERGENCE FROM §8.2: the plan's default is
--   encode(gen_random_bytes(9), 'base64')
-- Two problems, neither of them about entropy.  Base64 emits '+' and '/', and
-- an invite code travels in a URL path (/join/:code) where both are reserved or
-- get mangled by chat clients (USER_STORIES A-03 unhappy path 6).  And
-- gen_random_bytes() lives in the `extensions` schema on Supabase, so it is not
-- reachable from a function with `set search_path = ''`.
--
-- gen_random_uuid() is core PostgreSQL (v4, 122 random bits), and
-- encode/decode/translate are core too, so this needs no extension and no
-- search_path exemption.  Result: 22 URL-safe characters.
create or replace function new_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(
           rtrim(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'),
                        'base64'), '='),
           '+/', '-_');
$$;

create table groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 60),
  created_by  uuid not null references profiles(id),
  invite_code text not null unique default new_invite_code(),
  created_at  timestamptz not null default now()
);

create table group_members (
  group_id  uuid not null references groups(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index on group_members (user_id);

-- ─────────────────────────────────────────────────────────────
-- EXPENSES  (immutable once created)
-- ─────────────────────────────────────────────────────────────
create table expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups(id) on delete cascade,
  payer_id     uuid not null references profiles(id),
  total_poisha bigint not null check (total_poisha > 0),
  description  text not null check (length(trim(description)) between 1 and 200),
  created_by   uuid not null references profiles(id),
  created_at   timestamptz not null default now(),

  -- ADDITION TO §8.2, required by USER_STORIES §12.1 ("Request succeeds but the
  -- response is lost"): every write RPC must be safe to retry, "either
  -- naturally idempotent, or guarded by a client-generated request id".
  -- add_expense is not naturally idempotent, so the client sends a token and a
  -- replay returns the original expense instead of creating a second one.
  -- Distinct from the B-03 duplicate warning, which catches two *people*
  -- recording the same payment; this catches one person's request arriving twice.
  client_token uuid,

  -- Voiding is a correction, never a deletion. The row and its original
  -- ledger entries remain; reversing entries are appended alongside.
  voided_at     timestamptz,
  voided_by     uuid references profiles(id),
  void_reason   text check (length(trim(void_reason)) between 1 and 300),
  constraint void_fields_together check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and void_reason is not null)
  )
);

create unique index on expenses (group_id, client_token) where client_token is not null;
create index on expenses (group_id, created_at desc);
-- Supports the B-03 duplicate-expense warning (same payer, same amount, recent).
create index on expenses (group_id, payer_id, total_poisha, created_at desc);

create table expense_shares (
  expense_id   uuid not null references expenses(id) on delete cascade,
  user_id      uuid not null references profiles(id),
  share_poisha bigint not null check (share_poisha >= 0),
  primary key (expense_id, user_id)
);
-- INVARIANT (enforced in add_expense): sum(share_poisha) = expenses.total_poisha

-- ─────────────────────────────────────────────────────────────
-- LEDGER ENTRIES  ◀── APPEND ONLY. NEVER UPDATE. NEVER DELETE.
-- ─────────────────────────────────────────────────────────────
create table ledger_entries (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references groups(id) on delete cascade,
  from_user     uuid not null references profiles(id),  -- owes
  to_user       uuid not null references profiles(id),  -- is owed
  amount_poisha bigint not null check (amount_poisha > 0),
  source_type   text not null check (source_type in ('expense', 'proposal')),
  source_id     uuid not null,
  created_at    timestamptz not null default now(),
  constraint no_self_debt check (from_user <> to_user)
);

create index on ledger_entries (group_id);
create index on ledger_entries (group_id, from_user, to_user);
create index on ledger_entries (source_id);
create index on ledger_entries (group_id, created_at desc);

-- Belt and braces: block mutation at the database level, so that even a
-- future bug or a compromised role cannot rewrite history.
create or replace function block_ledger_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'ledger_entries is append-only (attempted %)', tg_op;
end $$;

create trigger ledger_no_update before update on ledger_entries
  for each row execute function block_ledger_mutation();
create trigger ledger_no_delete before delete on ledger_entries
  for each row execute function block_ledger_mutation();

-- ─────────────────────────────────────────────────────────────
-- PROPOSALS
-- ─────────────────────────────────────────────────────────────
create table proposals (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references groups(id) on delete cascade,
  type              text not null check (type in ('transfer', 'amendment',
                                                  'settlement', 'void')),
  proposer_id       uuid not null references profiles(id),
  payload           jsonb not null,
  note              text check (length(note) <= 300),
  status            text not null default 'pending'
                      check (status in ('pending','approved','rejected',
                                        'expired','invalidated','cancelled')),
  expires_at        timestamptz not null default now() + interval '7 days',
  resolved_at       timestamptz,
  resolution_reason text,
  created_at        timestamptz not null default now()
);

create index on proposals (group_id, status, created_at desc);
create index on proposals (status, expires_at) where status = 'pending';
-- Supports the H-06 proposal rate limit.
create index on proposals (proposer_id, group_id, created_at desc);

create table proposal_participants (
  proposal_id uuid not null references proposals(id) on delete cascade,
  user_id     uuid not null references profiles(id),
  decision    text not null default 'pending'
                check (decision in ('pending', 'approved', 'rejected')),
  decided_at  timestamptz,
  primary key (proposal_id, user_id)
);

create index on proposal_participants (user_id, decision);
