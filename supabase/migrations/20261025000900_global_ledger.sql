-- ═══════════════════════════════════════════════════════════════════════════
-- Global pairwise ledger + consent claims
--
-- Groups remain outing helpers: their expenses still set group_id as a label.
-- Direct claims use group_id NULL. Home nets sum ALL ledger rows for a pair.
-- Tours are untouched.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── nullable scope ────────────────────────────────────────────────────────

alter table public.ledger_entries alter column group_id drop not null;
alter table public.proposals alter column group_id drop not null;

alter table public.proposals drop constraint if exists proposals_type_check;
alter table public.proposals
  add constraint proposals_type_check
  check (type in ('transfer', 'amendment', 'settlement', 'void', 'claim'));

create index if not exists ledger_entries_pair_idx
  on public.ledger_entries (from_user, to_user);

create index if not exists ledger_entries_global_created_idx
  on public.ledger_entries (created_at desc)
  where group_id is null;

-- Claim invite codes for counterparties not yet on the ledger.
create table if not exists public.claim_invites (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  proposer_id   uuid not null references public.profiles(id),
  direction     text not null check (direction in ('get', 'give')),
  amount_poisha bigint not null check (amount_poisha > 0),
  note          text check (note is null or length(note) <= 300),
  expires_at    timestamptz not null default now() + interval '7 days',
  redeemed_by   uuid references public.profiles(id),
  proposal_id   uuid references public.proposals(id),
  created_at    timestamptz not null default now()
);

alter table public.claim_invites enable row level security;
revoke all on table public.claim_invites from anon, authenticated;

create or replace function public.new_claim_invite_code()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
$$;

-- ── global derivation ─────────────────────────────────────────────────────

create or replace view public.v_global_user_net
with (security_invoker = true) as
select user_id, sum(delta)::bigint as net_poisha
from (
  select to_user   as user_id,  amount_poisha as delta from public.ledger_entries
  union all
  select from_user as user_id, -amount_poisha as delta from public.ledger_entries
) t
group by user_id;

create or replace view public.v_global_pairwise_net
with (security_invoker = true) as
select from_user, to_user, sum(delta)::bigint as owed_poisha
from (
  select from_user, to_user,  amount_poisha as delta from public.ledger_entries
  union all
  select to_user as from_user, from_user as to_user, -amount_poisha as delta
    from public.ledger_entries
) t
group by from_user, to_user;

grant select on public.v_global_user_net, public.v_global_pairwise_net to authenticated;

create or replace function public.net_owed_global_raw(p_debtor uuid, p_creditor uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    case
      when from_user = p_debtor   and to_user = p_creditor then  amount_poisha
      when from_user = p_creditor and to_user = p_debtor   then -amount_poisha
      else 0
    end
  ), 0)::bigint
  from public.ledger_entries
  where from_user in (p_debtor, p_creditor)
    and to_user   in (p_debtor, p_creditor);
$$;

create or replace function public.net_owed_global(p_debtor uuid, p_creditor uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_actor not in (p_debtor, p_creditor) then
    raise exception 'PROPOSER_NOT_INVOLVED';
  end if;
  return public.net_owed_global_raw(p_debtor, p_creditor);
end $$;

create or replace function public.pair_lock(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      least(p_a::text, p_b::text) || ',' || greatest(p_a::text, p_b::text),
      0
    )
  );
end $$;

create or replace function public.shares_ledger_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user = auth.uid()
      or public.shares_a_group_with(p_user)
      or exists (
           select 1 from public.ledger_entries le
            where (le.from_user = auth.uid() and le.to_user = p_user)
               or (le.to_user = auth.uid() and le.from_user = p_user)
         )
      or exists (
           select 1 from public.proposal_participants a
           join public.proposal_participants b on a.proposal_id = b.proposal_id
            where a.user_id = auth.uid() and b.user_id = p_user
         );
$$;

-- ── rate limit: allow null group (claims) ─────────────────────────────────

create or replace function public.assert_proposal_rate_ok(p_group_id uuid, p_actor uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_recent int;
  v_limit  int := coalesce(nullif(current_setting('hishebnama.proposal_rate_limit', true), '')::int, 10);
begin
  select count(*) into v_recent
  from public.proposals
  where proposer_id = p_actor
    and created_at > now() - interval '1 hour'
    and group_id is not distinct from p_group_id;

  if v_recent >= v_limit then
    raise exception 'PROPOSAL_RATE_LIMIT';
  end if;
end $$;

-- ── claims ────────────────────────────────────────────────────────────────

create or replace function public.propose_claim(
  p_other     uuid,
  p_direction text,   -- 'get' = other owes me; 'give' = I owe other
  p_amount    bigint,
  p_note      text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_debtor uuid;
  v_creditor uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_other is null or p_other = v_actor then raise exception 'PARTIES_MUST_DIFFER'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_direction not in ('get', 'give') then raise exception 'INVALID_DIRECTION'; end if;

  if p_direction = 'get' then
    v_debtor := p_other; v_creditor := v_actor;
  else
    v_debtor := v_actor; v_creditor := p_other;
  end if;

  perform public.assert_proposal_rate_ok(null, v_actor);
  perform public.pair_lock(v_actor, p_other);

  insert into public.proposals (group_id, type, proposer_id, payload, note)
  values (
    null, 'claim', v_actor,
    jsonb_build_object(
      'debtor', v_debtor,
      'creditor', v_creditor,
      'amount', p_amount,
      'direction', p_direction
    ),
    p_note
  )
  returning id into v_id;

  insert into public.proposal_participants (proposal_id, user_id, decision, decided_at)
  select v_id, u,
         case when u = v_actor then 'approved' else 'pending' end,
         case when u = v_actor then now() else null end
  from unnest(array[v_actor, p_other]) u;

  return v_id;
end $$;

create or replace function public.create_claim_invite(
  p_direction text,
  p_amount    bigint,
  p_note      text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_code text;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_direction not in ('get', 'give') then raise exception 'INVALID_DIRECTION'; end if;

  v_code := public.new_claim_invite_code();
  insert into public.claim_invites (code, proposer_id, direction, amount_poisha, note)
  values (v_code, v_actor, p_direction, p_amount, p_note);

  return v_code;
end $$;

create or replace function public.preview_claim_invite(p_code text)
returns table (
  invite_id uuid,
  proposer_id uuid,
  proposer_name text,
  direction text,
  amount_poisha bigint,
  note text,
  already_redeemed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  return query
  select c.id, c.proposer_id, coalesce(p.display_name, 'Someone'),
         c.direction, c.amount_poisha, c.note,
         c.redeemed_by is not null or c.expires_at < now()
    from public.claim_invites c
    left join public.profiles p on p.id = c.proposer_id
   where c.code = p_code;

  if not found then raise exception 'INVALID_CLAIM_INVITE'; end if;
end $$;

create or replace function public.accept_claim_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_inv public.claim_invites%rowtype;
  v_id uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_inv from public.claim_invites where code = p_code for update;
  if not found then raise exception 'INVALID_CLAIM_INVITE'; end if;
  if v_inv.redeemed_by is not null or v_inv.expires_at < now() then
    raise exception 'CLAIM_INVITE_USED';
  end if;
  if v_inv.proposer_id = v_actor then raise exception 'PARTIES_MUST_DIFFER'; end if;

  -- Proposer consented by creating the invite; invitee consents by accepting.
  perform public.pair_lock(v_actor, v_inv.proposer_id);

  if v_inv.direction = 'get' then
    -- proposer supposed to get => invitee owes proposer
    insert into public.proposals (group_id, type, proposer_id, payload, note, status, resolved_at, resolution_reason)
    values (
      null, 'claim', v_inv.proposer_id,
      jsonb_build_object(
        'debtor', v_actor,
        'creditor', v_inv.proposer_id,
        'amount', v_inv.amount_poisha,
        'direction', 'get'
      ),
      v_inv.note,
      'approved', now(), 'Approved via claim invite'
    )
    returning id into v_id;

    insert into public.proposal_participants (proposal_id, user_id, decision, decided_at)
    values
      (v_id, v_inv.proposer_id, 'approved', now()),
      (v_id, v_actor, 'approved', now());

    insert into public.ledger_entries
      (group_id, from_user, to_user, amount_poisha, source_type, source_id)
    values
      (null, v_actor, v_inv.proposer_id, v_inv.amount_poisha, 'proposal', v_id);
  else
    -- proposer needs to give => proposer owes invitee
    insert into public.proposals (group_id, type, proposer_id, payload, note, status, resolved_at, resolution_reason)
    values (
      null, 'claim', v_inv.proposer_id,
      jsonb_build_object(
        'debtor', v_inv.proposer_id,
        'creditor', v_actor,
        'amount', v_inv.amount_poisha,
        'direction', 'give'
      ),
      v_inv.note,
      'approved', now(), 'Approved via claim invite'
    )
    returning id into v_id;

    insert into public.proposal_participants (proposal_id, user_id, decision, decided_at)
    values
      (v_id, v_inv.proposer_id, 'approved', now()),
      (v_id, v_actor, 'approved', now());

    insert into public.ledger_entries
      (group_id, from_user, to_user, amount_poisha, source_type, source_id)
    values
      (null, v_inv.proposer_id, v_actor, v_inv.amount_poisha, 'proposal', v_id);
  end if;

  update public.claim_invites
     set redeemed_by = v_actor, proposal_id = v_id
   where id = v_inv.id;

  return v_id;
end $$;

-- Global settlement / transfer (Home flows)
create or replace function public.propose_settlement_global(
  p_debtor   uuid,
  p_creditor uuid,
  p_amount   bigint,
  p_note     text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_id uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_actor not in (p_debtor, p_creditor) then raise exception 'PROPOSER_NOT_INVOLVED'; end if;
  if p_debtor = p_creditor then raise exception 'PARTIES_MUST_DIFFER'; end if;
  if p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  perform public.assert_proposal_rate_ok(null, v_actor);
  perform public.pair_lock(p_debtor, p_creditor);

  if public.net_owed_global_raw(p_debtor, p_creditor) < p_amount then
    raise exception 'SETTLEMENT_EXCEEDS_BALANCE';
  end if;

  insert into public.proposals (group_id, type, proposer_id, payload, note)
  values (null, 'settlement', v_actor,
          jsonb_build_object('debtor', p_debtor, 'creditor', p_creditor, 'amount', p_amount),
          p_note)
  returning id into v_id;

  insert into public.proposal_participants (proposal_id, user_id, decision, decided_at)
  select v_id, u,
         case when u = v_actor then 'approved' else 'pending' end,
         case when u = v_actor then now() else null end
  from unnest(array[p_debtor, p_creditor]) u;

  return v_id;
end $$;

create or replace function public.propose_transfer_global(
  p_debtor       uuid,
  p_intermediary uuid,
  p_creditor     uuid,
  p_amount       bigint,
  p_note         text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_id uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_actor not in (p_debtor, p_intermediary, p_creditor) then
    raise exception 'PROPOSER_NOT_INVOLVED';
  end if;
  if p_debtor = p_intermediary or p_intermediary = p_creditor or p_debtor = p_creditor then
    raise exception 'PARTIES_MUST_BE_DISTINCT';
  end if;
  if p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  perform public.assert_proposal_rate_ok(null, v_actor);
  -- lock pairs involved (debtor-inter, inter-creditor)
  perform public.pair_lock(p_debtor, p_intermediary);
  perform public.pair_lock(p_intermediary, p_creditor);

  if public.net_owed_global_raw(p_debtor, p_intermediary) < p_amount
     or public.net_owed_global_raw(p_intermediary, p_creditor) < p_amount then
    raise exception 'DEBTOR_LEG_INSUFFICIENT';
  end if;

  insert into public.proposals (group_id, type, proposer_id, payload, note)
  values (null, 'transfer', v_actor,
          jsonb_build_object(
            'debtor', p_debtor, 'intermediary', p_intermediary,
            'creditor', p_creditor, 'amount', p_amount),
          p_note)
  returning id into v_id;

  insert into public.proposal_participants (proposal_id, user_id, decision, decided_at)
  select v_id, u,
         case when u = v_actor then 'approved' else 'pending' end,
         case when u = v_actor then now() else null end
  from unnest(array[p_debtor, p_intermediary, p_creditor]) u;

  return v_id;
end $$;

-- ── respond_to_proposal: support null group_id + claim ────────────────────

create or replace function public.respond_to_proposal(
  p_proposal_id uuid,
  p_approve     boolean
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := auth.uid();
  v_prop     public.proposals%rowtype;
  v_pending  int;
  v_payload  jsonb;
  v_debtor   uuid;
  v_inter    uuid;
  v_creditor uuid;
  v_amount   bigint;
  v_target   uuid;
  v_use_global boolean;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_prop from public.proposals where id = p_proposal_id;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  v_use_global := v_prop.group_id is null;
  if v_use_global then
    v_payload := v_prop.payload;
    v_debtor := coalesce((v_payload ->> 'debtor')::uuid, (v_payload ->> 'from_user')::uuid);
    v_creditor := coalesce((v_payload ->> 'creditor')::uuid, (v_payload ->> 'to_user')::uuid);
    if v_debtor is not null and v_creditor is not null then
      perform public.pair_lock(v_debtor, v_creditor);
    end if;
    if (v_payload ->> 'intermediary') is not null then
      perform public.pair_lock(
        (v_payload ->> 'intermediary')::uuid,
        coalesce(v_debtor, v_creditor)
      );
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended(v_prop.group_id::text, 0));
  end if;

  select * into v_prop from public.proposals where id = p_proposal_id;

  if v_prop.status <> 'pending' then
    raise exception 'PROPOSAL_NOT_PENDING: %', v_prop.status;
  end if;

  if v_prop.expires_at < now() then
    update public.proposals
       set status = 'expired', resolved_at = now(),
           resolution_reason = 'Expired before all parties responded'
     where id = p_proposal_id;
    return 'expired';
  end if;

  if not exists (select 1 from public.proposal_participants
                 where proposal_id = p_proposal_id
                   and user_id = v_actor
                   and decision = 'pending') then
    raise exception 'NOT_A_PENDING_PARTICIPANT';
  end if;

  update public.proposal_participants
     set decision = case when p_approve then 'approved' else 'rejected' end,
         decided_at = now()
   where proposal_id = p_proposal_id and user_id = v_actor;

  if not p_approve then
    update public.proposals
       set status = 'rejected', resolved_at = now(),
           resolution_reason = 'Rejected by a participant'
     where id = p_proposal_id;
    return 'rejected';
  end if;

  select count(*) into v_pending
  from public.proposal_participants
  where proposal_id = p_proposal_id and decision = 'pending';

  if v_pending > 0 then
    return 'pending';
  end if;

  v_payload := v_prop.payload;

  if v_prop.type = 'transfer' then
    v_debtor   := (v_payload ->> 'debtor')::uuid;
    v_inter    := (v_payload ->> 'intermediary')::uuid;
    v_creditor := (v_payload ->> 'creditor')::uuid;
    v_amount   := (v_payload ->> 'amount')::bigint;

    if v_use_global then
      if public.net_owed_global_raw(v_debtor, v_inter) < v_amount
         or public.net_owed_global_raw(v_inter, v_creditor) < v_amount then
        update public.proposals
           set status = 'invalidated', resolved_at = now(),
               resolution_reason = 'The underlying debt changed after this was proposed'
         where id = p_proposal_id;
        return 'invalidated';
      end if;
      insert into public.ledger_entries
        (group_id, from_user, to_user, amount_poisha, source_type, source_id)
      values
        (null, v_inter,    v_debtor,   v_amount, 'proposal', p_proposal_id),
        (null, v_creditor, v_inter,    v_amount, 'proposal', p_proposal_id),
        (null, v_debtor,   v_creditor, v_amount, 'proposal', p_proposal_id);
    else
      if public.net_owed_raw(v_prop.group_id, v_debtor, v_inter) < v_amount
         or public.net_owed_raw(v_prop.group_id, v_inter, v_creditor) < v_amount then
        update public.proposals
           set status = 'invalidated', resolved_at = now(),
               resolution_reason = 'The underlying debt changed after this was proposed'
         where id = p_proposal_id;
        return 'invalidated';
      end if;
      insert into public.ledger_entries
        (group_id, from_user, to_user, amount_poisha, source_type, source_id)
      values
        (v_prop.group_id, v_inter,    v_debtor,   v_amount, 'proposal', p_proposal_id),
        (v_prop.group_id, v_creditor, v_inter,    v_amount, 'proposal', p_proposal_id),
        (v_prop.group_id, v_debtor,   v_creditor, v_amount, 'proposal', p_proposal_id);
    end if;

  elsif v_prop.type in ('settlement', 'claim') then
    v_debtor   := (v_payload ->> 'debtor')::uuid;
    v_creditor := (v_payload ->> 'creditor')::uuid;
    v_amount   := (v_payload ->> 'amount')::bigint;

    if v_prop.type = 'settlement' then
      if v_use_global then
        if public.net_owed_global_raw(v_debtor, v_creditor) < v_amount then
          update public.proposals
             set status = 'invalidated', resolved_at = now(),
                 resolution_reason = 'The debt changed after this was proposed'
           where id = p_proposal_id;
          return 'invalidated';
        end if;
        insert into public.ledger_entries
          (group_id, from_user, to_user, amount_poisha, source_type, source_id)
        values (null, v_creditor, v_debtor, v_amount, 'proposal', p_proposal_id);
      else
        if public.net_owed_raw(v_prop.group_id, v_debtor, v_creditor) < v_amount then
          update public.proposals
             set status = 'invalidated', resolved_at = now(),
                 resolution_reason = 'The debt changed after this was proposed'
           where id = p_proposal_id;
          return 'invalidated';
        end if;
        insert into public.ledger_entries
          (group_id, from_user, to_user, amount_poisha, source_type, source_id)
        values (v_prop.group_id, v_creditor, v_debtor, v_amount, 'proposal', p_proposal_id);
      end if;
    else
      -- claim: create debt debtor -> creditor (no prior balance required)
      insert into public.ledger_entries
        (group_id, from_user, to_user, amount_poisha, source_type, source_id)
      values (null, v_debtor, v_creditor, v_amount, 'proposal', p_proposal_id);
    end if;

  elsif v_prop.type = 'amendment' then
    v_debtor   := (v_payload ->> 'from_user')::uuid;
    v_creditor := (v_payload ->> 'to_user')::uuid;
    v_amount   := (v_payload ->> 'amount')::bigint;

    if (v_payload ->> 'direction') = 'increase' then
      insert into public.ledger_entries
        (group_id, from_user, to_user, amount_poisha, source_type, source_id)
      values (v_prop.group_id, v_debtor, v_creditor, v_amount, 'proposal', p_proposal_id);
    else
      if public.net_owed_raw(v_prop.group_id, v_debtor, v_creditor) < v_amount then
        update public.proposals
           set status = 'invalidated', resolved_at = now(),
               resolution_reason = 'The balance changed after this was proposed'
         where id = p_proposal_id;
        return 'invalidated';
      end if;
      insert into public.ledger_entries
        (group_id, from_user, to_user, amount_poisha, source_type, source_id)
      values (v_prop.group_id, v_creditor, v_debtor, v_amount, 'proposal', p_proposal_id);
    end if;

  elsif v_prop.type = 'void' then
    v_target := (v_payload ->> 'expense_id')::uuid;

    if exists (select 1 from public.expenses
               where id = v_target and voided_at is not null) then
      update public.proposals
         set status = 'invalidated', resolved_at = now(),
             resolution_reason = 'This expense was already cancelled'
       where id = p_proposal_id;
      return 'invalidated';
    end if;

    insert into public.ledger_entries
      (group_id, from_user, to_user, amount_poisha, source_type, source_id)
    select le.group_id, le.to_user, le.from_user,
           le.amount_poisha, 'expense', v_target
    from public.ledger_entries le
    where le.source_type = 'expense' and le.source_id = v_target;

    update public.expenses
       set voided_at = now(),
           voided_by = v_prop.proposer_id,
           void_reason = coalesce(v_prop.note, 'Cancelled by agreement')
     where id = v_target;

  else
    raise exception 'UNKNOWN_PROPOSAL_TYPE: %', v_prop.type;
  end if;

  update public.proposals
     set status = 'approved', resolved_at = now(),
         resolution_reason = 'Approved by all parties'
   where id = p_proposal_id;

  return 'approved';
end $$;

-- cancel_proposal: lock by pair when group_id is null
create or replace function public.cancel_proposal(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_prop public.proposals%rowtype;
  v_a uuid; v_b uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_prop from public.proposals where id = p_proposal_id;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  if v_prop.group_id is null then
    v_a := coalesce((v_prop.payload ->> 'debtor')::uuid, (v_prop.payload ->> 'from_user')::uuid);
    v_b := coalesce((v_prop.payload ->> 'creditor')::uuid, (v_prop.payload ->> 'to_user')::uuid);
    if v_a is not null and v_b is not null then
      perform public.pair_lock(v_a, v_b);
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended(v_prop.group_id::text, 0));
  end if;

  update public.proposals
     set status = 'cancelled', resolved_at = now(),
         resolution_reason = 'Withdrawn by proposer'
   where id = p_proposal_id
     and proposer_id = v_actor
     and status = 'pending';

  if not found then raise exception 'CANNOT_CANCEL'; end if;
end $$;

-- Global explain (all ledger rows between me and other)
create or replace function public.explain_balance_global(p_other uuid)
returns table (
  entry_id        uuid,
  occurred_at     timestamptz,
  signed_poisha   bigint,
  running_poisha  bigint,
  cause_type      text,
  cause_label     text,
  detail          jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_other is null or p_other = v_actor then raise exception 'PARTIES_MUST_DIFFER'; end if;

  return query
  with rel as (
    select le.*,
           case when le.to_user = v_actor then  le.amount_poisha
                else                           -le.amount_poisha end as signed
    from public.ledger_entries le
    where le.from_user in (v_actor, p_other)
      and le.to_user   in (v_actor, p_other)
  ),
  ordered as (
    select r.*,
           sum(r.signed) over (order by r.created_at, r.id
                               rows between unbounded preceding and current row)::bigint
             as running
    from rel r
  )
  select
    o.id,
    o.created_at,
    o.signed,
    o.running,
    o.source_type,
    case
      when o.source_type = 'expense' then coalesce(e.description, 'Expense')
      when o.source_type = 'proposal' and p.type = 'claim' then
        'Recorded balance — ' || public.fmt_taka(o.amount_poisha)
      when o.source_type = 'proposal' and p.type = 'settlement' then
        'Payment recorded — ' || public.fmt_taka(o.amount_poisha)
      when o.source_type = 'proposal' and p.type = 'transfer' then
        'Transfer — ' || public.fmt_taka(o.amount_poisha)
      else coalesce(p.type, o.source_type)
    end,
    jsonb_build_object(
      'group_id', o.group_id,
      'source_type', o.source_type,
      'source_id', o.source_id,
      'proposal_type', p.type
    )
  from ordered o
  left join public.expenses e on o.source_type = 'expense' and e.id = o.source_id
  left join public.proposals p on o.source_type = 'proposal' and p.id = o.source_id
  order by o.created_at, o.id;
end $$;

-- ── RLS updates ───────────────────────────────────────────────────────────

drop policy if exists ledger_read on public.ledger_entries;
create policy ledger_read on public.ledger_entries for select to authenticated
using (
  (group_id is not null and public.is_group_member(group_id))
  or (group_id is null and (from_user = auth.uid() or to_user = auth.uid()))
);

drop policy if exists proposals_read on public.proposals;
create policy proposals_read on public.proposals for select to authenticated
using (
  (group_id is not null and public.is_group_member(group_id))
  or (
    group_id is null and (
      proposer_id = auth.uid()
      or exists (
        select 1 from public.proposal_participants pp
         where pp.proposal_id = proposals.id and pp.user_id = auth.uid()
      )
    )
  )
);

create or replace function public.can_see_proposal(p_proposal uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.proposals p
    where p.id = p_proposal
      and (
        (p.group_id is not null and exists (
           select 1 from public.group_members m
            where m.group_id = p.group_id and m.user_id = auth.uid()
         ))
        or p.proposer_id = auth.uid()
        or exists (
           select 1 from public.proposal_participants pp
            where pp.proposal_id = p.id and pp.user_id = auth.uid()
         )
      )
  );
$$;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using (public.shares_ledger_with(id));

create policy claim_invites_read_own on public.claim_invites for select to authenticated
using (proposer_id = auth.uid() or redeemed_by = auth.uid());

grant select on public.claim_invites to authenticated;

grant execute on function public.shares_ledger_with(uuid) to authenticated;
grant execute on function
  public.net_owed_global(uuid, uuid),
  public.propose_claim(uuid, text, bigint, text),
  public.create_claim_invite(text, bigint, text),
  public.preview_claim_invite(text),
  public.accept_claim_invite(text),
  public.propose_settlement_global(uuid, uuid, bigint, text),
  public.propose_transfer_global(uuid, uuid, uuid, bigint, text),
  public.explain_balance_global(uuid),
  public.respond_to_proposal(uuid, boolean),
  public.cancel_proposal(uuid)
to authenticated;

revoke all on function public.net_owed_global_raw(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pair_lock(uuid, uuid) from public, anon, authenticated;
revoke all on function public.new_claim_invite_code() from public, anon, authenticated;
