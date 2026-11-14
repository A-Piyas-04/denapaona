-- ═══════════════════════════════════════════════════════════════════════════
-- Cancelling an expense by agreement, and the explanation engine
-- (DEVELOPMENT_PLAN.md §11.5, §11.6)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- VOIDING — correction without mutation, by consent
-- ─────────────────────────────────────────────────────────────
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
          jsonb_build_object('expense_id', p_expense_id),
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
-- THE EXPLANATION ENGINE  (§11.5)
--
-- Read-only derivation of the pairwise balance between the caller and
-- p_other.  `stable`, writes nothing.  `security definer` only to join across
-- tables uniformly; it re-checks group membership itself — a read-only function
-- is not a public function (security test 7).
--
-- EXTENDED beyond §11.5 (additive; the arithmetic is untouched):
--   * cause_type 'void' for the mirror entries a cancellation appends, rendered
--     with the reason (story B-05#2) instead of leaving the reader to notice
--     two offsetting rows (§11.6 note on the reversal);
--   * rounding attribution naming who absorbed the extra poisha, and
--     distinguishing rounding from a hand-entered uneven split (E-02, E-02#2).
-- ─────────────────────────────────────────────────────────────
create or replace function explain_balance(
  p_group_id uuid,
  p_other    uuid              -- the other party; "you" is always auth.uid()
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
           e.created_by       as e_creator,
           e.payer_id         as e_payer,
           e.void_reason      as e_void_reason,
           pay.display_name   as payer_name,
           cre.display_name   as creator_name,
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
           sc.n, sc.min_share, sc.max_share
    from ordered o
    left join public.expenses  e   on o.source_type = 'expense'  and e.id = o.source_id
    left join public.profiles  pay on pay.id = e.payer_id
    left join public.profiles  cre on cre.id = e.created_by
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
        'Cancelled: ' || x.e_desc || ' — cancelled by agreement — ' || x.e_void_reason
      -- ── expense ──────────────────────────────────────────────
      when x.source_type = 'expense' then
        x.e_desc
        || ' — '   || public.fmt_taka(x.e_total)
        || ' paid by ' || coalesce(x.payer_name, '(former member)')
        || ', split ' || x.n::text || case when x.n = 1 then ' way' else ' ways' end
        || ', share ' || public.fmt_taka(x.amount_poisha)
        || case when x.e_creator <> x.e_payer
                then ' · added by ' || coalesce(x.creator_name, '(former member)')
                else '' end
      -- ── proposal ─────────────────────────────────────────────
      when x.source_type = 'proposal' then
        case
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
          'split_count',    x.n,
          'share',          x.amount_poisha,
          'share_holder_is_you', x.holder = v_actor,
          'is_reversal',    x.is_reversal,
          'void_reason',    x.e_void_reason,
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
            else null end)
      else
        jsonb_build_object(
          'proposal_id',     x.source_id,
          'proposal_type',   x.p_type,
          'approvers',       (select jsonb_agg(pr.display_name)
                              from public.proposal_participants pp
                              join public.profiles pr on pr.id = pp.user_id
                              where pp.proposal_id = x.source_id
                                and pp.decision = 'approved'),
          'resolved_at',     x.p_resolved,
          'note',            x.p_note)
    end
  from enriched x
  order by x.created_at, x.id;
end $$;
