-- ═══════════════════════════════════════════════════════════════════════════
-- Derived views and read helpers (DEVELOPMENT_PLAN.md §8.4, §11.5)
--
-- Principle P2: balances are derived, never stored.  There is no balance column
-- anywhere.  Everything below is a sum over ledger_entries.
-- ═══════════════════════════════════════════════════════════════════════════

-- Display helper: poisha -> "৳1,234.50".
-- Division is numeric, not floating point (principle P5).
create or replace function fmt_taka(p bigint)
returns text language sql immutable
set search_path = ''
as $$
  select '৳' || to_char(p::numeric / 100, 'FM999,999,990.00');
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Net position per member per group.
-- Positive => the group owes this person. Negative => this person owes.
--
-- DIVERGENCE FROM §8.4, closing a read hole: `security_invoker = true`.
-- A plain view runs with its owner's privileges, which would bypass RLS on
-- ledger_entries entirely and hand any authenticated user every group's
-- balances — defeating security test 4 and story H-05.  With security_invoker
-- the view evaluates under the caller, so ledger_read applies.  Requires
-- PostgreSQL 15+, which Supabase is.
-- ───────────────────────────────────────────────────────────────────────────
create or replace view v_user_net
with (security_invoker = true) as
select group_id, user_id, sum(delta)::bigint as net_poisha
from (
  select group_id, to_user   as user_id,  amount_poisha as delta from ledger_entries
  union all
  select group_id, from_user as user_id, -amount_poisha as delta from ledger_entries
) t
group by group_id, user_id;

-- Pairwise net, every direction, for the caller's own groups.  Lets the
-- dashboard render "to Arif ৳300 / from Tania ৳240" in one round trip
-- (story B-04) instead of one net_owed() call per member pair.
create or replace view v_pairwise_net
with (security_invoker = true) as
select group_id, from_user, to_user, sum(delta)::bigint as owed_poisha
from (
  select group_id, from_user, to_user,  amount_poisha as delta from ledger_entries
  union all
  select group_id, to_user as from_user, from_user as to_user,
         -amount_poisha as delta from ledger_entries
) t
group by group_id, from_user, to_user;

-- ───────────────────────────────────────────────────────────────────────────
-- net_owed: how much `debtor` owes `creditor` right now.
-- Negative if the relationship actually runs the other way.
--
-- DIVERGENCE FROM §8.4, closing a read hole: the plan's version is
-- `security definer` with no membership check and is granted to `authenticated`
-- in §12.4, so any signed-in user could read any pair's balance in any group by
-- id — the same leak security test 4 and story H-05 forbid for the table.
--
-- Split in two:
--   net_owed_raw()  internal, no gate, NOT granted to any client role.  Used by
--                   the RPCs, which have already checked membership/participation.
--   net_owed()      the client-facing one, membership-checked.
-- Both read the same rows, so the arithmetic is identical.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function net_owed_raw(p_group uuid, p_debtor uuid, p_creditor uuid)
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
  where group_id = p_group
    and from_user in (p_debtor, p_creditor)
    and to_user   in (p_debtor, p_creditor);
$$;

create or replace function net_owed(p_group uuid, p_debtor uuid, p_creditor uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (select 1 from public.group_members
                 where group_id = p_group and user_id = v_actor) then
    raise exception 'NOT_A_MEMBER';
  end if;

  return public.net_owed_raw(p_group, p_debtor, p_creditor);
end $$;
