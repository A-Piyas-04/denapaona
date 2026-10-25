-- ═══════════════════════════════════════════════════════════════════════════
-- RPC layer — groups, expenses, proposals (DEVELOPMENT_PLAN.md §11)
--
-- Every function here is `security definer`, sets an empty search_path,
-- derives identity from auth.uid() (principle P4) and is the only way to write
-- to the ledger (principle P3).  Every reference is schema-qualified (§12.5).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- GROUPS  (§11.7)
-- ─────────────────────────────────────────────────────────────

-- Create a group; creator becomes owner and first member.
create or replace function create_group(p_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_group uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'GROUP_NAME_REQUIRED';
  end if;

  insert into public.groups (name, created_by) values (trim(p_name), v_actor)
  returning id into v_group;

  insert into public.group_members (group_id, user_id, role)
  values (v_group, v_actor, 'owner');

  return v_group;
end $$;

-- Join a group by invite code.
create or replace function join_group(p_invite_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_group uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select id into v_group from public.groups where invite_code = p_invite_code;
  if not found then raise exception 'INVALID_INVITE_CODE'; end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group, v_actor, 'member')
  on conflict do nothing;

  return v_group;
end $$;

-- Preview an invite before joining (story A-03 step 4: "Join Hall 3 Friends?"
-- with the member list).  The caller is by definition not yet a member, so RLS
-- cannot serve this read — hence a function, and hence the deliberately narrow
-- return: group name and member count only.  Nothing about balances, and on a
-- bad code nothing at all (A-03 unhappy path 1: "No group details leaked").
create or replace function preview_invite(p_invite_code text)
returns table (group_id uuid, group_name text, member_count int, already_member boolean)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  return query
  select g.id, g.name,
         (select count(*)::int from public.group_members m where m.group_id = g.id),
         exists (select 1 from public.group_members m
                 where m.group_id = g.id and m.user_id = v_actor)
  from public.groups g
  where g.invite_code = p_invite_code;

  if not found then raise exception 'INVALID_INVITE_CODE'; end if;
end $$;

-- Rotate a leaked invite link (story A-05).  Owner only, enforced here rather
-- than by hiding the button (principle P3).
create or replace function rotate_invite_code(p_group_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_code text;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (select 1 from public.group_members
                 where group_id = p_group_id and user_id = v_actor
                   and role = 'owner') then
    raise exception 'NOT_A_GROUP_OWNER';
  end if;

  update public.groups
     set invite_code = public.new_invite_code()
   where id = p_group_id
  returning invite_code into v_code;

  return v_code;
end $$;

-- Leave a group (story A-06).  Every refusal below protects ledger integrity:
-- an entry pointing at a non-member would be unexplainable and unsettleable.
create or replace function leave_group(p_group_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor  uuid := auth.uid();
  v_net    bigint;
  v_owners int;
  v_lead   int;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (select 1 from public.group_members
                 where group_id = p_group_id and user_id = v_actor) then
    raise exception 'NOT_A_MEMBER';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));

  select coalesce(sum(case when to_user = v_actor then amount_poisha
                           when from_user = v_actor then -amount_poisha
                           else 0 end), 0)
    into v_net
  from public.ledger_entries
  where group_id = p_group_id and v_actor in (from_user, to_user);

  if v_net <> 0 then
    raise exception 'OUTSTANDING_BALANCE: %', v_net;
  end if;

  select count(*) into v_owners
  from public.group_members where group_id = p_group_id and role = 'owner';

  if v_owners = 1 and exists (select 1 from public.group_members
                              where group_id = p_group_id and user_id = v_actor
                                and role = 'owner') then
    raise exception 'LAST_OWNER_MUST_TRANSFER_OWNERSHIP';
  end if;

  select count(*) into v_lead
  from public.trip_leaders l
  join public.trips t on t.id = l.trip_id
  where t.group_id = p_group_id and t.status = 'active' and l.user_id = v_actor;

  if v_lead > 0 then
    raise exception 'STILL_AN_ACTIVE_TRIP_LEADER';
  end if;

  delete from public.group_members
   where group_id = p_group_id and user_id = v_actor;
end $$;

-- Hand ownership to another member, so the last owner can then leave (A-06#2).
create or replace function transfer_group_ownership(p_group_id uuid, p_to uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (select 1 from public.group_members
                 where group_id = p_group_id and user_id = v_actor
                   and role = 'owner') then
    raise exception 'NOT_A_GROUP_OWNER';
  end if;

  if not exists (select 1 from public.group_members
                 where group_id = p_group_id and user_id = p_to) then
    raise exception 'NOT_A_MEMBER';
  end if;

  update public.group_members set role = 'owner'
   where group_id = p_group_id and user_id = p_to;
  update public.group_members set role = 'member'
   where group_id = p_group_id and user_id = v_actor;
end $$;

-- ─────────────────────────────────────────────────────────────
-- EXPENSES  (§11.2, plus the trip changes from §11.7)
-- ─────────────────────────────────────────────────────────────
create or replace function add_expense(
  p_group_id     uuid,
  p_payer_id     uuid,
  p_total        bigint,
  p_description  text,
  p_shares       jsonb,                 -- [{"user_id":"...","share":1234}, ...]
  p_trip_id      uuid default null,     -- added in v1.1
  p_client_token uuid default null      -- retry guard, USER_STORIES §12.1
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid := auth.uid();
  v_expense_id uuid;
  v_sum        bigint := 0;
  v_share      jsonb;
  v_uid        uuid;
  v_amt        bigint;
  v_others     int := 0;
  v_status     text;
  v_mode       text;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- caller must belong to the group
  if not exists (select 1 from public.group_members
                 where group_id = p_group_id and user_id = v_actor) then
    raise exception 'NOT_A_MEMBER';
  end if;

  -- payer must belong to the group
  if not exists (select 1 from public.group_members
                 where group_id = p_group_id and user_id = p_payer_id) then
    raise exception 'PAYER_NOT_A_MEMBER';
  end if;

  if p_total <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  if p_description is null or length(trim(p_description)) = 0 then
    -- story B-01 unhappy path 6: an unlabelled expense is unverifiable later.
    raise exception 'DESCRIPTION_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));

  -- Retry guard: a replayed request returns the original expense unchanged.
  if p_client_token is not null then
    select id into v_expense_id from public.expenses
     where group_id = p_group_id and client_token = p_client_token;
    if found then return v_expense_id; end if;
  end if;

  -- Trip scope and entry mode (§11.7, Feature 4.3)
  if p_trip_id is not null then
    select status, entry_mode into v_status, v_mode
    from public.trips where id = p_trip_id and group_id = p_group_id;

    if not found then raise exception 'TRIP_NOT_IN_GROUP'; end if;
    if v_status <> 'active' then raise exception 'TRIP_CLOSED'; end if;

    if v_mode = 'leaders_only'
       and not public.is_trip_leader(p_trip_id, v_actor) then
      raise exception 'LEADERS_ONLY_TRIP';
    end if;
  end if;

  -- validate shares: every user is a member, amounts non-negative, sum matches
  for v_share in select * from jsonb_array_elements(p_shares) loop
    v_uid := (v_share ->> 'user_id')::uuid;
    v_amt := (v_share ->> 'share')::bigint;

    if v_amt < 0 then raise exception 'NEGATIVE_SHARE'; end if;

    if not exists (select 1 from public.group_members
                   where group_id = p_group_id and user_id = v_uid) then
      raise exception 'SHARE_USER_NOT_A_MEMBER';
    end if;

    if v_uid <> p_payer_id and v_amt > 0 then
      v_others := v_others + 1;
    end if;

    v_sum := v_sum + v_amt;
  end loop;

  if v_sum <> p_total then
    raise exception 'SHARES_DO_NOT_SUM_TO_TOTAL: % vs %', v_sum, p_total;
  end if;

  -- Stories B-01 unhappy path 4 and D-03 unhappy path 1: an expense that
  -- charges nobody but the payer moves no balance and means nothing.
  if v_others = 0 then
    raise exception 'NEEDS_ANOTHER_PARTICIPANT';
  end if;

  insert into public.expenses (group_id, trip_id, payer_id, total_poisha,
                               description, created_by, client_token)
  values (p_group_id, p_trip_id, p_payer_id, p_total, trim(p_description),
          v_actor, p_client_token)
  returning id into v_expense_id;

  insert into public.expense_shares (expense_id, user_id, share_poisha)
  select v_expense_id, (s ->> 'user_id')::uuid, (s ->> 'share')::bigint
  from jsonb_array_elements(p_shares) s;

  -- emit one ledger entry per non-payer with a non-zero share
  insert into public.ledger_entries
         (group_id, trip_id, from_user, to_user, amount_poisha,
          source_type, source_id)
  select p_group_id, p_trip_id, (s ->> 'user_id')::uuid, p_payer_id,
         (s ->> 'share')::bigint, 'expense', v_expense_id
  from jsonb_array_elements(p_shares) s
  where (s ->> 'user_id')::uuid <> p_payer_id
    and (s ->> 'share')::bigint > 0;

  return v_expense_id;
end $$;

-- Duplicate detection for the B-03 warning.  Read-only; it never blocks a save.
create or replace function recent_similar_expense(
  p_group_id uuid, p_payer_id uuid, p_total bigint, p_window interval default '10 minutes'
) returns table (id uuid, description text, created_at timestamptz,
                 created_by_name text)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (select 1 from public.group_members
                 where group_id = p_group_id and user_id = v_actor) then
    raise exception 'NOT_A_MEMBER';
  end if;

  return query
  select e.id, e.description, e.created_at, pr.display_name
  from public.expenses e
  join public.profiles pr on pr.id = e.created_by
  where e.group_id = p_group_id
    and e.payer_id = p_payer_id
    and e.total_poisha = p_total
    and e.voided_at is null
    and e.created_at > now() - p_window
  order by e.created_at desc
  limit 1;
end $$;

-- ─────────────────────────────────────────────────────────────
-- PROPOSALS  (§11.3, §11.4, §11.7)
-- ─────────────────────────────────────────────────────────────

-- Story H-06: proposal flooding is a social problem with a technical
-- mitigation.  The cap exists to stop harassment by notification volume, not to
-- stop legitimate re-proposal, so it is generous and time-based.
create or replace function assert_proposal_rate_ok(p_group_id uuid, p_actor uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_recent int;
  -- Tunable per database (`alter database ... set hishebnama.proposal_rate_limit`).
  -- Not settable from a client: PostgREST exposes no SET, and no RPC writes it.
  v_limit  int := coalesce(nullif(current_setting('hishebnama.proposal_rate_limit', true), '')::int, 10);
begin
  select count(*) into v_recent
  from public.proposals
  where group_id = p_group_id
    and proposer_id = p_actor
    and created_at > now() - interval '1 hour';

  if v_recent >= v_limit then
    raise exception 'PROPOSAL_RATE_LIMIT';
  end if;
end $$;

create or replace function propose_transfer(
  p_group_id     uuid,
  p_debtor       uuid,
  p_intermediary uuid,
  p_creditor     uuid,
  p_amount       bigint,
  p_note         text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id    uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  -- the proposer must be one of the three affected parties
  if v_actor not in (p_debtor, p_intermediary, p_creditor) then
    raise exception 'PROPOSER_NOT_INVOLVED';
  end if;

  if p_debtor = p_intermediary
     or p_intermediary = p_creditor
     or p_debtor = p_creditor then
    raise exception 'PARTIES_MUST_BE_DISTINCT';
  end if;

  if p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  -- all three must be members of the group
  if (select count(*) from public.group_members
      where group_id = p_group_id
        and user_id in (p_debtor, p_intermediary, p_creditor)) <> 3 then
    raise exception 'ALL_PARTIES_MUST_BE_MEMBERS';
  end if;

  perform public.assert_proposal_rate_ok(p_group_id, v_actor);

  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));

  -- feasibility check at proposal time (re-checked again at commit)
  if public.net_owed_raw(p_group_id, p_debtor, p_intermediary) < p_amount then
    raise exception 'DEBTOR_LEG_INSUFFICIENT';
  end if;
  if public.net_owed_raw(p_group_id, p_intermediary, p_creditor) < p_amount then
    raise exception 'INTERMEDIARY_LEG_INSUFFICIENT';
  end if;

  insert into public.proposals (group_id, type, proposer_id, payload, note)
  values (
    p_group_id, 'transfer', v_actor,
    jsonb_build_object(
      'debtor',       p_debtor,
      'intermediary', p_intermediary,
      'creditor',     p_creditor,
      'amount',       p_amount
    ),
    p_note
  )
  returning id into v_id;

  -- proposer is auto-approved; the other two start pending
  insert into public.proposal_participants (proposal_id, user_id, decision, decided_at)
  select v_id,
         u,
         case when u = v_actor then 'approved' else 'pending' end,
         case when u = v_actor then now() else null end
  from unnest(array[p_debtor, p_intermediary, p_creditor]) u;

  -- a 3-party proposal where the proposer is the only participant cannot
  -- happen (parties are distinct), so no immediate auto-commit is needed here
  return v_id;
end $$;

-- ADDITION: Feature 2b names settlement and amendment as the same machinery
-- with different payloads, and §10 gives their participant derivation and
-- payload shapes, but §11 only spells out propose_transfer and propose_void.
-- These two are the missing creation paths for stories C-07, F-02 and F-05.
-- Same structure, same locking, same auto-approval rule.
create or replace function propose_settlement(
  p_group_id uuid,
  p_debtor   uuid,
  p_creditor uuid,
  p_amount   bigint,
  p_note     text default null,
  p_trip_id  uuid default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_id uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  if v_actor not in (p_debtor, p_creditor) then
    raise exception 'PROPOSER_NOT_INVOLVED';
  end if;
  if p_debtor = p_creditor then raise exception 'PARTIES_MUST_DIFFER'; end if;
  if p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  if (select count(*) from public.group_members
      where group_id = p_group_id and user_id in (p_debtor, p_creditor)) <> 2 then
    raise exception 'ALL_PARTIES_MUST_BE_MEMBERS';
  end if;

  if p_trip_id is not null
     and not exists (select 1 from public.trips
                     where id = p_trip_id and group_id = p_group_id) then
    raise exception 'TRIP_NOT_IN_GROUP';
  end if;

  perform public.assert_proposal_rate_ok(p_group_id, v_actor);

  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));

  if public.net_owed_raw(p_group_id, p_debtor, p_creditor) < p_amount then
    raise exception 'SETTLEMENT_EXCEEDS_BALANCE';
  end if;

  insert into public.proposals (group_id, type, proposer_id, payload, note)
  values (p_group_id, 'settlement', v_actor,
          jsonb_build_object('debtor', p_debtor, 'creditor', p_creditor,
                             'amount', p_amount, 'trip_id', p_trip_id),
          p_note)
  returning id into v_id;

  insert into public.proposal_participants (proposal_id, user_id, decision, decided_at)
  select v_id, u,
         case when u = v_actor then 'approved' else 'pending' end,
         case when u = v_actor then now() else null end
  from unnest(array[p_debtor, p_creditor]) u;

  return v_id;
end $$;

create or replace function propose_amendment(
  p_group_id  uuid,
  p_from_user uuid,
  p_to_user   uuid,
  p_amount    bigint,
  p_direction text,              -- 'increase' | 'decrease'
  p_note      text default null,
  p_trip_id   uuid default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_id uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  if v_actor not in (p_from_user, p_to_user) then
    raise exception 'PROPOSER_NOT_INVOLVED';
  end if;
  if p_from_user = p_to_user then raise exception 'PARTIES_MUST_DIFFER'; end if;
  if p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_direction not in ('increase', 'decrease') then
    raise exception 'INVALID_DIRECTION';
  end if;

  if (select count(*) from public.group_members
      where group_id = p_group_id and user_id in (p_from_user, p_to_user)) <> 2 then
    raise exception 'ALL_PARTIES_MUST_BE_MEMBERS';
  end if;

  if p_trip_id is not null
     and not exists (select 1 from public.trips
                     where id = p_trip_id and group_id = p_group_id) then
    raise exception 'TRIP_NOT_IN_GROUP';
  end if;

  perform public.assert_proposal_rate_ok(p_group_id, v_actor);

  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));

  -- A decrease is only meaningful against a debt that exists.  Re-checked at
  -- commit, where it becomes `invalidated` rather than an error (story C-07#3).
  if p_direction = 'decrease'
     and public.net_owed_raw(p_group_id, p_from_user, p_to_user) < p_amount then
    raise exception 'DECREASE_EXCEEDS_BALANCE';
  end if;

  insert into public.proposals (group_id, type, proposer_id, payload, note)
  values (p_group_id, 'amendment', v_actor,
          jsonb_build_object('from_user', p_from_user, 'to_user', p_to_user,
                             'amount', p_amount, 'direction', p_direction,
                             'trip_id', p_trip_id),
          p_note)
  returning id into v_id;

  insert into public.proposal_participants (proposal_id, user_id, decision, decided_at)
  select v_id, u,
         case when u = v_actor then 'approved' else 'pending' end,
         case when u = v_actor then now() else null end
  from unnest(array[p_from_user, p_to_user]) u;

  return v_id;
end $$;

-- Proposer withdraws their own pending proposal.
create or replace function cancel_proposal(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_group uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select group_id into v_group from public.proposals where id = p_proposal_id;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  -- Story C-05 unhappy path 3: withdrawal must not race the final approval.
  -- Same lock as every other ledger-affecting path, so the two serialise and
  -- the outcome is either fully approved or fully cancelled, never half.
  perform pg_advisory_xact_lock(hashtextextended(v_group::text, 0));

  update public.proposals
     set status = 'cancelled', resolved_at = now(),
         resolution_reason = 'Withdrawn by proposer'
   where id = p_proposal_id
     and proposer_id = v_actor      -- only the proposer, enforced here not in the UI
     and status = 'pending';

  if not found then raise exception 'CANNOT_CANCEL'; end if;
end $$;

-- Scheduled expiry sweep.
create or replace function expire_stale_proposals()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_count int;
begin
  with updated as (
    update public.proposals
       set status = 'expired', resolved_at = now(),
           resolution_reason = 'Expired before all parties responded'
     where status = 'pending' and expires_at < now()
    returning 1
  )
  select count(*) into v_count from updated;
  return v_count;
end $$;
