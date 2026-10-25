-- ═══════════════════════════════════════════════════════════════════════════
-- Trips, leaders, voids, disputes, explanation (DEVELOPMENT_PLAN.md §11.5–11.7)
--
-- Trips are a REPORTING SCOPE, not a second ledger.  Nothing in this file
-- computes a trip balance by any path other than filtering ledger_entries on
-- trip_id, and every ledger write still takes the lock keyed on group_id —
-- never on trip_id (§11.7: locking at trip granularity would permit two
-- concurrent writes to the same underlying balance).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- TRIP MANAGEMENT
-- ─────────────────────────────────────────────────────────────
create or replace function create_trip(
  p_group_id   uuid,
  p_name       text,
  p_member_ids uuid[],
  p_leader_ids uuid[] default '{}',
  p_entry_mode text default 'leaders_only'
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor  uuid := auth.uid();
  v_trip   uuid;
  v_roster uuid[];
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (select 1 from public.group_members
                 where group_id = p_group_id and user_id = v_actor) then
    raise exception 'NOT_A_MEMBER';
  end if;

  -- every listed member must belong to the group
  if exists (
    select 1 from unnest(coalesce(p_member_ids, '{}')) u
    where not exists (select 1 from public.group_members
                      where group_id = p_group_id and user_id = u)
  ) then
    raise exception 'ROSTER_CONTAINS_NON_MEMBER';
  end if;

  -- Story D-01 unhappy path 2.
  if exists (
    select 1 from unnest(coalesce(p_leader_ids, '{}')) u
    where not exists (select 1 from public.group_members
                      where group_id = p_group_id and user_id = u)
  ) then
    raise exception 'LEADER_MUST_BE_GROUP_MEMBER';
  end if;

  -- DIVERGENCE FROM §11.7: the plan's create_trip filters leaders to those
  -- already on the roster, which silently drops anyone else.  Story D-01
  -- unhappy path 1 says such a leader is "added to the roster automatically,
  -- or the selection is refused ... Never silently dropped."  Adding them to the
  -- roster first satisfies both: §11.7's "additional leaders must be on the
  -- roster" still holds, and nobody vanishes.
  select array_agg(distinct u) into v_roster
  from unnest(coalesce(p_member_ids, '{}')
              || coalesce(p_leader_ids, '{}')
              || array[v_actor]) u;

  -- Story D-01 unhappy path 5: "Add at least two people."
  if coalesce(array_length(v_roster, 1), 0) < 2 then
    raise exception 'ROSTER_TOO_SMALL';
  end if;

  insert into public.trips (group_id, name, entry_mode, created_by)
  values (p_group_id, trim(p_name), coalesce(p_entry_mode, 'leaders_only'), v_actor)
  returning id into v_trip;

  insert into public.trip_members (trip_id, user_id)
  select v_trip, u from unnest(v_roster) u
  on conflict do nothing;

  -- The creator is always a leader, so a trip is never leaderless.
  insert into public.trip_leaders (trip_id, user_id, appointed_by)
  select v_trip, u, v_actor
  from unnest(array_append(coalesce(p_leader_ids, '{}'), v_actor)) u
  on conflict do nothing;

  insert into public.trip_leader_log (trip_id, user_id, action, actor_id)
  select v_trip, l.user_id, 'appointed', v_actor
  from public.trip_leaders l where l.trip_id = v_trip;

  return v_trip;
end $$;

-- Closing is a soft state. It never freezes the ledger: corrections after a
-- trip closes must remain possible through the normal amendment path.
--
-- CONFLICT NOTED, plan followed: story D-10 unhappy path 5 says "A non-leader
-- closes it — Refused."  §11.7's close_trip checks group membership only.  Per
-- the precedence rule (§1: Sections 7, 8, 11, 12 and 14 win), this implements
-- §11.7 as written.  See IMPLEMENTATION_NOTES.md — closing ends leader
-- authority, so this is worth a deliberate decision.
create or replace function close_trip(p_trip_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_group uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select group_id into v_group from public.trips where id = p_trip_id;
  if not found then raise exception 'TRIP_NOT_FOUND'; end if;

  if not exists (select 1 from public.group_members
                 where group_id = v_group and user_id = v_actor) then
    raise exception 'NOT_A_MEMBER';
  end if;

  -- Story D-10 unhappy path 3: an expense added during closing is either
  -- included before close or refused with TRIP_CLOSED.  add_expense holds the
  -- group lock while it checks trip status, so taking it here serialises them.
  perform pg_advisory_xact_lock(hashtextextended(v_group::text, 0));

  update public.trips
     set status = 'closed', ended_on = coalesce(ended_on, current_date)
   where id = p_trip_id and status = 'active';

  if found then
    insert into public.trip_leader_log (trip_id, user_id, action, actor_id)
    values (p_trip_id, v_actor, 'trip_closed', v_actor);
  end if;
end $$;

-- ADDITION: story D-10 unhappy path 4 — "Reopening: possible by a former
-- leader, logged, and notified to the roster. Never silent."  Not in §11.
-- trip_leaders rows survive closure (is_trip_leader just stops honouring them),
-- so "former leader" is exactly "has a trip_leaders row".
create or replace function reopen_trip(p_trip_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_group uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select group_id into v_group from public.trips where id = p_trip_id;
  if not found then raise exception 'TRIP_NOT_FOUND'; end if;

  if not exists (select 1 from public.trip_leaders
                 where trip_id = p_trip_id and user_id = v_actor) then
    raise exception 'NOT_A_TRIP_LEADER';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_group::text, 0));

  update public.trips set status = 'active', ended_on = null
   where id = p_trip_id and status = 'closed';

  if found then
    insert into public.trip_leader_log (trip_id, user_id, action, actor_id)
    values (p_trip_id, v_actor, 'trip_reopened', v_actor);
  end if;
end $$;

-- Feature 4.3: "It is one column and one toggle."  Leader-only.
create or replace function set_trip_entry_mode(p_trip_id uuid, p_mode text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_trip_leader(p_trip_id, v_actor) then
    raise exception 'NOT_A_TRIP_LEADER';
  end if;
  if p_mode not in ('leaders_only', 'open') then
    raise exception 'INVALID_ENTRY_MODE';
  end if;
  update public.trips set entry_mode = p_mode where id = p_trip_id;
end $$;

-- Trip-scoped settlement input: net positions for one trip.
create or replace function trip_net_positions(p_trip_id uuid)
returns table (user_id uuid, display_name text, net_poisha bigint)
language plpgsql stable security definer set search_path = ''
as $$
-- FIX vs §11.5: the OUT column `user_id` shadows group_members.user_id in the
-- membership check below, so the plan's version fails on every call with
-- "column reference user_id is ambiguous".  Found by the SQL suite.
#variable_conflict use_column
declare v_actor uuid := auth.uid(); v_group uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select group_id into v_group from public.trips where id = p_trip_id;
  if not found then raise exception 'TRIP_NOT_FOUND'; end if;

  if not exists (select 1 from public.group_members
                 where group_id = v_group and user_id = v_actor) then
    raise exception 'NOT_A_MEMBER';
  end if;

  return query
  select n.user_id, pr.display_name, n.net_poisha
  from public.v_trip_net n
  join public.profiles pr on pr.id = n.user_id
  where n.trip_id = p_trip_id and n.net_poisha <> 0
  order by n.net_poisha desc;
end $$;

-- ─────────────────────────────────────────────────────────────
-- LEADER APPOINTMENT  (§11.6)
-- trip_leaders has no client insert policy; these are its only write paths.
-- ─────────────────────────────────────────────────────────────
create or replace function add_trip_leader(p_trip_id uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_group uuid; v_rows int;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select group_id into v_group from public.trips where id = p_trip_id;
  if not found then raise exception 'TRIP_NOT_FOUND'; end if;

  -- only an existing leader may appoint another
  if not public.is_trip_leader(p_trip_id, v_actor) then
    raise exception 'NOT_A_TRIP_LEADER';
  end if;

  if not exists (select 1 from public.group_members
                 where group_id = v_group and user_id = p_user) then
    raise exception 'LEADER_MUST_BE_GROUP_MEMBER';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_trip_id::text, 1));

  -- Re-check under the lock: a concurrent removal may have revoked us.
  if not public.is_trip_leader(p_trip_id, v_actor) then
    raise exception 'NOT_A_TRIP_LEADER';
  end if;

  insert into public.trip_leaders (trip_id, user_id, appointed_by)
  values (p_trip_id, p_user, v_actor)
  on conflict do nothing;
  get diagnostics v_rows = row_count;

  -- Story D-05 unhappy path 2: already a leader is a no-op, so no log row.
  -- (The plan logs unconditionally, which would record an appointment that
  -- did not happen and corrupt the role-at-time reconstruction.)
  if v_rows > 0 then
    insert into public.trip_leader_log (trip_id, user_id, action, actor_id)
    values (p_trip_id, p_user, 'appointed', v_actor);

    insert into public.trip_members (trip_id, user_id)
    values (p_trip_id, p_user) on conflict do nothing;
  end if;
end $$;

create or replace function remove_trip_leader(p_trip_id uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_remaining int;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  if not public.is_trip_leader(p_trip_id, v_actor) then
    raise exception 'NOT_A_TRIP_LEADER';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_trip_id::text, 1));

  -- FIX vs §11.6 (time-of-check/time-of-use): the plan checks authority only
  -- before taking the lock.  If A removes B while B removes C, B can pass the
  -- check, wait on the lock, and then remove C after B itself was demoted.
  -- Re-checking here closes that; the concurrency suite exercises it.
  if not public.is_trip_leader(p_trip_id, v_actor) then
    raise exception 'NOT_A_TRIP_LEADER';
  end if;

  if not exists (select 1 from public.trip_leaders
                 where trip_id = p_trip_id and user_id = p_user) then
    raise exception 'TARGET_NOT_A_LEADER';
  end if;

  select count(*) into v_remaining
  from public.trip_leaders where trip_id = p_trip_id;

  -- A trip accruing debts with nobody able to correct them is unmanageable.
  if v_remaining <= 1 then
    raise exception 'CANNOT_REMOVE_LAST_LEADER';
  end if;

  delete from public.trip_leaders where trip_id = p_trip_id and user_id = p_user;

  insert into public.trip_leader_log (trip_id, user_id, action, actor_id)
  values (p_trip_id, p_user, 'removed', v_actor);
end $$;

-- ─────────────────────────────────────────────────────────────
-- VOIDING  (§11.6) — correction without mutation
-- ─────────────────────────────────────────────────────────────

-- Leader, active trip.  Appends reversing entries; NEVER updates or deletes
-- the originals.  Principle P1 is not suspended for leaders.
create or replace function void_expense(p_expense_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_exp   public.expenses%rowtype;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'VOID_REASON_REQUIRED';
  end if;

  select * into v_exp from public.expenses where id = p_expense_id;
  if not found then raise exception 'EXPENSE_NOT_FOUND'; end if;

  -- Authority: a trip leader inside an ACTIVE trip. Nothing else.
  -- There is deliberately NO author self-void.  See Feature 4.3, §12.8.
  if v_exp.trip_id is null
     or not public.is_trip_leader(v_exp.trip_id, v_actor) then
    raise exception 'NOT_AUTHORIZED_TO_VOID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_exp.group_id::text, 0));

  -- Re-read under the lock.  Two leaders voiding at once (§14.2): the second
  -- must see the first's voided_at, or two sets of reversals would be written.
  select * into v_exp from public.expenses where id = p_expense_id;
  if v_exp.voided_at is not null then raise exception 'ALREADY_VOIDED'; end if;

  -- §14.2: "A trip closes while a leader action is in flight."  Re-check
  -- authority under the same lock close_trip takes.
  if not public.is_trip_leader(v_exp.trip_id, v_actor) then
    raise exception 'NOT_AUTHORIZED_TO_VOID';
  end if;

  -- reverse every entry this expense produced, by appending mirrors
  insert into public.ledger_entries
    (group_id, trip_id, from_user, to_user, amount_poisha, source_type, source_id)
  select le.group_id, le.trip_id, le.to_user, le.from_user,
         le.amount_poisha, 'expense', p_expense_id
  from public.ledger_entries le
  where le.source_type = 'expense' and le.source_id = p_expense_id;

  update public.expenses
     set voided_at = now(), voided_by = v_actor, void_reason = trim(p_reason)
   where id = p_expense_id;

  update public.entry_disputes set status = 'resolved'
   where expense_id = p_expense_id and status = 'open';
end $$;

-- Consent path, everywhere outside an active trip.
create or replace function propose_void(p_expense_id uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_exp   public.expenses%rowtype;
  v_id    uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'VOID_REASON_REQUIRED';
  end if;

  select * into v_exp from public.expenses where id = p_expense_id;
  if not found      then raise exception 'EXPENSE_NOT_FOUND'; end if;
  if v_exp.voided_at is not null then raise exception 'ALREADY_VOIDED'; end if;

  -- The proposer must be affected by the expense: the payer, or someone
  -- holding a share. Being charged for something is standing to contest it.
  if v_actor <> v_exp.payer_id
     and not exists (select 1 from public.expense_shares
                     where expense_id = p_expense_id and user_id = v_actor) then
    raise exception 'NOT_INVOLVED_IN_EXPENSE';
  end if;

  perform public.assert_proposal_rate_ok(v_exp.group_id, v_actor);

  -- Lock before the duplicate check, so two simultaneous propose_void calls
  -- cannot both pass it.
  perform pg_advisory_xact_lock(hashtextextended(v_exp.group_id::text, 0));

  if exists (select 1 from public.proposals
             where type = 'void' and status = 'pending'
               and (payload ->> 'expense_id')::uuid = p_expense_id) then
    raise exception 'VOID_ALREADY_PROPOSED';
  end if;

  insert into public.proposals (group_id, type, proposer_id, payload, note)
  values (v_exp.group_id, 'void', v_actor,
          jsonb_build_object('expense_id', p_expense_id,
                             'trip_id',    v_exp.trip_id),
          trim(p_reason))
  returning id into v_id;

  -- Participants: the payer plus everyone holding a non-zero share.
  insert into public.proposal_participants (proposal_id, user_id, decision, decided_at)
  select distinct v_id, u,
         case when u = v_actor then 'approved' else 'pending' end,
         case when u = v_actor then now() else null end
  from (
    select v_exp.payer_id as u
    union
    select user_id from public.expense_shares
     where expense_id = p_expense_id and share_poisha > 0
  ) parties;

  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────
-- LEADER-RECORDED SETTLEMENT
-- Permitted ONLY by a leader, ONLY inside an active trip, and ONLY against
-- a balance that arose within that same trip.
-- ─────────────────────────────────────────────────────────────
create or replace function leader_record_settlement(
  p_trip_id  uuid,
  p_debtor   uuid,
  p_creditor uuid,
  p_amount   bigint,
  p_note     text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_group uuid;
  v_trip_balance bigint;
  v_id uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_debtor = p_creditor then raise exception 'PARTIES_MUST_DIFFER'; end if;

  select group_id into v_group from public.trips where id = p_trip_id;
  if not found then raise exception 'TRIP_NOT_FOUND'; end if;

  if not public.is_trip_leader(p_trip_id, v_actor) then
    raise exception 'NOT_A_TRIP_LEADER';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_group::text, 0));

  -- Re-check under the lock: the trip may have closed while we waited.
  if not public.is_trip_leader(p_trip_id, v_actor) then
    raise exception 'NOT_A_TRIP_LEADER';
  end if;

  -- Scope guard: the leader may only settle what this trip created.
  v_trip_balance := public.trip_net_owed_raw(p_trip_id, p_debtor, p_creditor);

  if v_trip_balance < p_amount then
    raise exception 'EXCEEDS_TRIP_BALANCE: trip balance is %', v_trip_balance;
  end if;

  -- Recorded as a proposal for a uniform audit trail, but opened already
  -- resolved: there is no pending state and nobody is asked to approve.
  insert into public.proposals
    (group_id, type, proposer_id, payload, note, status,
     resolved_at, resolution_reason)
  values (
    v_group, 'settlement', v_actor,
    jsonb_build_object('debtor', p_debtor, 'creditor', p_creditor,
                       'amount', p_amount, 'trip_id', p_trip_id,
                       'leader_recorded', true),
    p_note, 'approved', now(),
    'Recorded by trip leader — no approval required inside an active trip'
  )
  returning id into v_id;

  insert into public.proposal_participants (proposal_id, user_id, decision, decided_at)
  values (v_id, v_actor, 'approved', now());

  insert into public.ledger_entries
    (group_id, trip_id, from_user, to_user, amount_poisha, source_type, source_id)
  values (v_group, p_trip_id, p_creditor, p_debtor, p_amount, 'proposal', v_id);

  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────
-- DISPUTES — flag, never reverse
-- ─────────────────────────────────────────────────────────────
create or replace function raise_dispute(p_expense_id uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_group uuid; v_id uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select group_id into v_group from public.expenses where id = p_expense_id;
  if not found then raise exception 'EXPENSE_NOT_FOUND'; end if;

  if not exists (select 1 from public.group_members
                 where group_id = v_group and user_id = v_actor) then
    raise exception 'NOT_A_MEMBER';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'DISPUTE_REASON_REQUIRED';
  end if;

  insert into public.entry_disputes (expense_id, raised_by, reason)
  values (p_expense_id, v_actor, trim(p_reason))
  on conflict (expense_id, raised_by)
    do update set reason = excluded.reason, status = 'open'
  returning id into v_id;

  return v_id;
end $$;

-- Story D-11 unhappy path 4.  Only the person who raised it.
create or replace function withdraw_dispute(p_dispute_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  update public.entry_disputes set status = 'withdrawn'
   where id = p_dispute_id and raised_by = v_actor and status = 'open';

  if not found then raise exception 'CANNOT_WITHDRAW_DISPUTE'; end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- THE EXPLANATION ENGINE  (§11.5, Feature 4.5)
--
-- Read-only derivation of the pairwise balance between the caller and
-- p_other.  `stable`, writes nothing.  `security definer` only to join across
-- tables uniformly; it re-checks group membership itself — a read-only function
-- is not a public function (security test 7).
--
-- EXTENDED beyond §11.5 (additive; the arithmetic is untouched):
--   * cause_type 'void' for the mirror entries a cancellation appends, rendered
--     with who voided and why (story E-03, B-05#2) instead of leaving the reader
--     to notice two offsetting rows (§11.6 note on the reversal);
--   * "added by X (trip leader)" with the role AT WRITE TIME (E-03#1);
--   * rounding attribution naming who absorbed the extra poisha, and
--     distinguishing rounding from a hand-entered uneven split (E-02, E-02#2);
--   * leader-recorded settlements labelled as such;
--   * open dispute count on each expense (D-11#3: disputes surface here).
-- ─────────────────────────────────────────────────────────────
create or replace function explain_balance(
  p_group_id uuid,
  p_other    uuid,             -- the other party; "you" is always auth.uid()
  p_trip_id  uuid default null -- optional: restrict to one trip
)
returns table (
  entry_id        uuid,
  occurred_at     timestamptz,
  signed_poisha   bigint,      -- + they owe you more, - you owe them more
  running_poisha  bigint,      -- + they owe you overall, at this point in time
  cause_type      text,        -- 'expense' | 'void' | 'proposal'
  cause_label     text,        -- plain language, ready to display
  detail          jsonb        -- structured backup for the UI
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

  if not exists (select 1 from public.group_members
                 where group_id = p_group_id and user_id = v_actor) then
    raise exception 'NOT_A_MEMBER';
  end if;

  return query
  with rel as (
    select le.*,
           case when le.to_user = v_actor then  le.amount_poisha
                else                           -le.amount_poisha end as signed
    from public.ledger_entries le
    where le.group_id = p_group_id
      and (p_trip_id is null or le.trip_id = p_trip_id)
      and le.from_user in (v_actor, p_other)
      and le.to_user   in (v_actor, p_other)
  ),
  ordered as (
    select r.*,
           sum(r.signed) over (order by r.created_at, r.id
                               rows between unbounded preceding and current row)::bigint
             as running
    from rel r
  ),
  enriched as (
    select o.*,
           e.description      as e_desc,
           e.total_poisha     as e_total,
           e.trip_id          as e_trip,
           e.created_by       as e_creator,
           e.created_at       as e_created_at,
           e.payer_id         as e_payer,
           e.void_reason      as e_void_reason,
           pay.display_name   as payer_name,
           cre.display_name   as creator_name,
           vby.display_name   as voider_name,
           -- a mirror appended by a void shares the expense's source_id but
           -- was written at or after voided_at; originals were written at
           -- creation, which always precedes it.
           (o.source_type = 'expense' and e.voided_at is not null
              and o.created_at >= e.voided_at)               as is_reversal,
           -- the share holder of an expense entry is its debtor side
           case when o.source_type = 'expense'
                then case when o.to_user = e.payer_id then o.from_user
                          else o.to_user end end              as holder,
           p.type             as p_type,
           p.resolved_at      as p_resolved,
           p.note             as p_note,
           p.proposer_id      as p_proposer,
           coalesce((p.payload ->> 'leader_recorded')::boolean, false) as p_leader,
           sc.n, sc.min_share, sc.max_share,
           (e.trip_id is not null
              and public.was_trip_leader_at(e.trip_id, e.created_by, e.created_at))
                                                              as creator_was_leader,
           (e.trip_id is not null and e.voided_by is not null
              and public.was_trip_leader_at(e.trip_id, e.voided_by, e.voided_at))
                                                              as voider_was_leader,
           exists (select 1 from public.proposals vp
                   where vp.type = 'void' and vp.status = 'approved'
                     and (vp.payload ->> 'expense_id')::uuid = e.id) as voided_by_agreement,
           (select count(*)::int from public.entry_disputes d
             where d.expense_id = e.id and d.status = 'open')  as open_disputes
    from ordered o
    left join public.expenses  e   on o.source_type = 'expense'  and e.id = o.source_id
    left join public.profiles  pay on pay.id = e.payer_id
    left join public.profiles  cre on cre.id = e.created_by
    left join public.profiles  vby on vby.id = e.voided_by
    left join public.proposals p   on o.source_type = 'proposal' and p.id = o.source_id
    left join lateral (
      select count(*)::int        as n,
             min(s.share_poisha)  as min_share,
             max(s.share_poisha)  as max_share
      from public.expense_shares s
      where s.expense_id = e.id and s.share_poisha > 0
    ) sc on true
  )
  select
    x.id,
    x.created_at,
    x.signed,
    x.running,
    case when x.is_reversal then 'void' else x.source_type end,
    case
      -- ── cancellation of an expense ────────────────────────────
      when x.is_reversal then
        'Cancelled: ' || x.e_desc || ' — '
        || case when x.voided_by_agreement
                then 'cancelled by agreement'
                else 'voided by ' || coalesce(x.voider_name, '(former member)')
                     || case when x.voider_was_leader then ' (trip leader)' else '' end
           end
        || ' — ' || x.e_void_reason
      -- ── expense ──────────────────────────────────────────────
      when x.source_type = 'expense' then
        x.e_desc
        || ' — '   || public.fmt_taka(x.e_total)
        || ' paid by ' || coalesce(x.payer_name, '(former member)')
        || ', split ' || x.n::text || case when x.n = 1 then ' way' else ' ways' end
        || ', share ' || public.fmt_taka(x.amount_poisha)
        || case when x.e_creator <> x.e_payer or x.creator_was_leader
                then ' · added by ' || coalesce(x.creator_name, '(former member)')
                     || case when x.creator_was_leader then ' (trip leader)' else '' end
                else '' end
      -- ── proposal ─────────────────────────────────────────────
      when x.source_type = 'proposal' then
        case
          when x.p_type = 'settlement' and x.p_leader then
            'Payment recorded by '
            || coalesce((select pr.display_name from public.profiles pr
                          where pr.id = x.p_proposer), '(former member)')
            || ' (trip leader)'
          when x.p_type = 'transfer' then
            'Transfer approved by '
            || (select string_agg(case when pp.user_id = v_actor then 'you'
                                       else pr.display_name end, ', '
                                  order by pp.decided_at)
                  from public.proposal_participants pp
                  join public.profiles pr on pr.id = pp.user_id
                 where pp.proposal_id = x.source_id and pp.decision = 'approved')
          when x.p_type = 'settlement' then 'Settlement confirmed by both'
          when x.p_type = 'amendment'  then 'Agreed correction'
          else 'Agreed change'
        end
        || ' on ' || to_char(x.p_resolved, 'DD Mon YYYY')
      else 'Unknown'
    end,
    case
      when x.source_type = 'expense' then
        jsonb_build_object(
          'expense_id',     x.source_id,
          'description',    x.e_desc,
          'total',          x.e_total,
          'payer',          x.payer_name,
          'entered_by',     x.creator_name,
          'entered_by_leader', x.creator_was_leader,
          'split_count',    x.n,
          'share',          x.amount_poisha,
          'share_holder_is_you', x.holder = v_actor,
          'is_reversal',    x.is_reversal,
          'void_reason',    x.e_void_reason,
          'voided_by',      x.voider_name,
          'voided_by_agreement', x.voided_by_agreement,
          'open_disputes',  x.open_disputes,
          -- 'rounding': an even split whose remainder poisha went to some
          -- holders (shares differ by exactly one).  'manual': amounts
          -- entered by hand.  'even': no remainder.
          'split_kind',     case when x.max_share = x.min_share then 'even'
                                 when x.max_share - x.min_share = 1 then 'rounding'
                                 else 'manual' end,
          'got_extra_poisha', (x.max_share - x.min_share = 1
                               and x.amount_poisha = x.max_share),
          'rounding_note',  case
            when x.max_share - x.min_share = 1 and x.amount_poisha = x.max_share then
              public.fmt_taka(x.e_total) || ' split ' || x.n::text || ' ways — '
              || case when x.holder = v_actor then 'you were' else 'they were' end
              || ' charged ' || public.fmt_taka(x.amount_poisha)
              || ', one poisha more than some others, because remainders are '
              || 'assigned in a fixed, repeatable order (sorted by user id) — '
              || 'not at random and not targeted.'
            when x.max_share - x.min_share = 1 then
              public.fmt_taka(x.e_total) || ' split ' || x.n::text || ' ways did '
              || 'not divide evenly; the leftover poisha went to others in a '
              || 'fixed, repeatable order.'
            when x.max_share <> x.min_share then
              'Shares were entered by hand, not split evenly.'
            else null end,
          'trip_id',        x.trip_id)
      else
        jsonb_build_object(
          'proposal_id',     x.source_id,
          'proposal_type',   x.p_type,
          'leader_recorded', x.p_leader,
          'approvers',       (select jsonb_agg(pr.display_name)
                              from public.proposal_participants pp
                              join public.profiles pr on pr.id = pp.user_id
                              where pp.proposal_id = x.source_id
                                and pp.decision = 'approved'),
          'resolved_at',     x.p_resolved,
          'note',            x.p_note,
          'trip_id',         x.trip_id)
    end
  from enriched x
  order by x.created_at, x.id;
end $$;

-- ─────────────────────────────────────────────────────────────
-- ATTRIBUTION for list views (§13.3: "Leader actions are visibly labelled";
-- story E-03#1: the role AT THE TIME of the action, not now).
-- A function rather than a view so it can gate on membership itself while
-- reading trip_leader_log through was_trip_leader_at().
-- ─────────────────────────────────────────────────────────────
create or replace function expense_attribution(p_group_id uuid, p_trip_id uuid default null)
returns table (expense_id uuid, entered_by_leader boolean,
               voided_by_leader boolean, voided_by_agreement boolean)
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
  select e.id,
         e.trip_id is not null
           and public.was_trip_leader_at(e.trip_id, e.created_by, e.created_at),
         e.trip_id is not null and e.voided_by is not null
           and public.was_trip_leader_at(e.trip_id, e.voided_by, e.voided_at),
         exists (select 1 from public.proposals vp
                 where vp.type = 'void' and vp.status = 'approved'
                   and (vp.payload ->> 'expense_id')::uuid = e.id)
  from public.expenses e
  where e.group_id = p_group_id
    and (p_trip_id is null or e.trip_id = p_trip_id)
    and (e.trip_id is not null or e.voided_at is not null);
end $$;
