-- ═══════════════════════════════════════════════════════════════════════════
-- respond_to_proposal — the critical function (DEVELOPMENT_PLAN.md §11.4)
--
-- The whole consent model lives or dies here.  Three things make it correct:
--   1. the per-group advisory lock, taken before anything is read (§11.1),
--   2. re-validation against LIVE balances at the moment of final approval,
--      never against a snapshot from proposal time (§10),
--   3. identity from auth.uid(), never from a parameter (P4).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function respond_to_proposal(
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
  v_trip     uuid;
  v_target   uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_prop from public.proposals where id = p_proposal_id;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  -- SERIALISE every ledger mutation in this group
  perform pg_advisory_xact_lock(hashtextextended(v_prop.group_id::text, 0));

  -- re-read under the lock: status may have changed while we waited
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

  -- IDENTITY CHECK: caller must be a listed participant.
  -- Identity is auth.uid(), never a parameter. See principle P4.
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

  -- any rejection ends it immediately
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

  -- ══ ALL APPROVED — RE-VALIDATE AGAINST LIVE BALANCES AND COMMIT ══
  v_payload := v_prop.payload;
  -- trip_id on a proposal entry is a reporting dimension copied from the
  -- payload (§8.2 note).  It never affects validation or netting.
  v_trip    := nullif(v_payload ->> 'trip_id', '')::uuid;

  if v_prop.type = 'transfer' then
    v_debtor   := (v_payload ->> 'debtor')::uuid;
    v_inter    := (v_payload ->> 'intermediary')::uuid;
    v_creditor := (v_payload ->> 'creditor')::uuid;
    v_amount   := (v_payload ->> 'amount')::bigint;

    -- live re-check, NOT a snapshot from proposal time
    if public.net_owed_raw(v_prop.group_id, v_debtor, v_inter) < v_amount
       or public.net_owed_raw(v_prop.group_id, v_inter, v_creditor) < v_amount then
      update public.proposals
         set status = 'invalidated', resolved_at = now(),
             resolution_reason =
               'The underlying debt changed after this was proposed'
       where id = p_proposal_id;
      return 'invalidated';
    end if;

    insert into public.ledger_entries
      (group_id, trip_id, from_user, to_user, amount_poisha, source_type, source_id)
    values
      (v_prop.group_id, v_trip, v_inter,    v_debtor,   v_amount, 'proposal', p_proposal_id),
      (v_prop.group_id, v_trip, v_creditor, v_inter,    v_amount, 'proposal', p_proposal_id),
      (v_prop.group_id, v_trip, v_debtor,   v_creditor, v_amount, 'proposal', p_proposal_id);

  elsif v_prop.type = 'settlement' then
    v_debtor   := (v_payload ->> 'debtor')::uuid;
    v_creditor := (v_payload ->> 'creditor')::uuid;
    v_amount   := (v_payload ->> 'amount')::bigint;

    if public.net_owed_raw(v_prop.group_id, v_debtor, v_creditor) < v_amount then
      update public.proposals
         set status = 'invalidated', resolved_at = now(),
             resolution_reason = 'The debt changed after this was proposed'
       where id = p_proposal_id;
      return 'invalidated';
    end if;

    insert into public.ledger_entries
      (group_id, trip_id, from_user, to_user, amount_poisha, source_type, source_id)
    values
      (v_prop.group_id, v_trip, v_creditor, v_debtor, v_amount, 'proposal', p_proposal_id);

  elsif v_prop.type = 'amendment' then
    v_debtor   := (v_payload ->> 'from_user')::uuid;
    v_creditor := (v_payload ->> 'to_user')::uuid;
    v_amount   := (v_payload ->> 'amount')::bigint;

    if (v_payload ->> 'direction') = 'increase' then
      insert into public.ledger_entries
        (group_id, trip_id, from_user, to_user, amount_poisha, source_type, source_id)
      values (v_prop.group_id, v_trip, v_debtor, v_creditor, v_amount,
              'proposal', p_proposal_id);
    else
      if public.net_owed_raw(v_prop.group_id, v_debtor, v_creditor) < v_amount then
        update public.proposals
           set status = 'invalidated', resolved_at = now(),
               resolution_reason = 'The balance changed after this was proposed'
         where id = p_proposal_id;
        return 'invalidated';
      end if;
      insert into public.ledger_entries
        (group_id, trip_id, from_user, to_user, amount_poisha, source_type, source_id)
      values (v_prop.group_id, v_trip, v_creditor, v_debtor, v_amount,
              'proposal', p_proposal_id);
    end if;

  elsif v_prop.type = 'void' then
    v_target := (v_payload ->> 'expense_id')::uuid;

    -- Re-validate: the expense must still be un-voided. A leader may have
    -- voided it while this proposal was pending.
    if exists (select 1 from public.expenses
               where id = v_target and voided_at is not null) then
      update public.proposals
         set status = 'invalidated', resolved_at = now(),
             resolution_reason = 'This expense was already cancelled'
       where id = p_proposal_id;
      return 'invalidated';
    end if;

    -- Append the mirror of every entry the expense produced.
    insert into public.ledger_entries
      (group_id, trip_id, from_user, to_user, amount_poisha, source_type, source_id)
    select le.group_id, le.trip_id, le.to_user, le.from_user,
           le.amount_poisha, 'expense', v_target
    from public.ledger_entries le
    where le.source_type = 'expense' and le.source_id = v_target;

    update public.expenses
       set voided_at = now(),
           voided_by = v_prop.proposer_id,
           void_reason = coalesce(v_prop.note, 'Cancelled by agreement')
     where id = v_target;

    -- An open dispute on a cancelled expense has been answered.
    update public.entry_disputes set status = 'resolved'
     where expense_id = v_target and status = 'open';

  else
    raise exception 'UNKNOWN_PROPOSAL_TYPE: %', v_prop.type;
  end if;

  update public.proposals
     set status = 'approved', resolved_at = now(),
         resolution_reason = 'Approved by all parties'
   where id = p_proposal_id;

  return 'approved';
end $$;
