-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security (DEVELOPMENT_PLAN.md §12.4)
--
-- Default-deny, then grant back only reads.  Writes go exclusively through the
-- RPC layer.  Note the deliberate ABSENCE of insert/update/delete policies on
-- every financial table.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ ENABLE RLS ON EVERY TABLE ═══
alter table profiles              enable row level security;
alter table groups                enable row level security;
alter table group_members         enable row level security;
alter table expenses              enable row level security;
alter table expense_shares        enable row level security;
alter table ledger_entries        enable row level security;
alter table proposals             enable row level security;
alter table proposal_participants enable row level security;
alter table trips                 enable row level security;
alter table trip_members          enable row level security;
alter table trip_presets          enable row level security;
alter table trip_leaders          enable row level security;
alter table trip_leader_log       enable row level security;
alter table entry_disputes        enable row level security;

-- ═══ STRIP PERMISSIVE DEFAULTS ═══
revoke all on all tables in schema public from anon, authenticated;

-- Functions are executable by PUBLIC by default in PostgreSQL, and Supabase
-- additionally grants anon/authenticated on new functions.  §12.4 only grants;
-- it never revokes.  Every internal helper (net_owed_raw, trip_net_owed_raw,
-- assert_proposal_rate_ok, expire_stale_proposals, ...) would otherwise be
-- callable from the browser.  Revoke all, then grant back the RPC surface.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- ═══ MEMBERSHIP HELPERS FOR POLICIES ═══
--
-- DIVERGENCE FROM §12.4, required for the policies to work at all: the plan's
-- `members_read` policy on group_members contains a subquery on group_members.
-- PostgreSQL evaluates that subquery under the same policy and fails every read
-- with "infinite recursion detected in policy for relation group_members".
-- Since nearly every other policy joins group_members too, that one error takes
-- down every read in the app.
--
-- The standard remedy: a `security definer` helper that reads group_members
-- without RLS.  It answers one question about the caller only — it takes no
-- user parameter, so it cannot be used to probe anyone else's membership (P4).
create or replace function is_group_member(p_group uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.group_members
                 where group_id = p_group and user_id = auth.uid());
$$;

create or replace function can_see_trip(p_trip uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.trips t
                 join public.group_members m on m.group_id = t.group_id
                 where t.id = p_trip and m.user_id = auth.uid());
$$;

create or replace function can_see_expense(p_expense uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.expenses e
                 join public.group_members m on m.group_id = e.group_id
                 where e.id = p_expense and m.user_id = auth.uid());
$$;

create or replace function can_see_proposal(p_proposal uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.proposals p
                 join public.group_members m on m.group_id = p.group_id
                 where p.id = p_proposal and m.user_id = auth.uid());
$$;

create or replace function shares_a_group_with(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_user = auth.uid()
      or exists (select 1 from public.group_members a
                 join public.group_members b on a.group_id = b.group_id
                 where a.user_id = auth.uid() and b.user_id = p_user);
$$;

grant execute on function
  is_group_member(uuid), can_see_trip(uuid), can_see_expense(uuid),
  can_see_proposal(uuid), shares_a_group_with(uuid)
to authenticated;

-- ═══ GRANT READ ONLY — writes go exclusively through RPC ═══
grant select on profiles, groups, group_members, expenses, expense_shares,
                ledger_entries, proposals, proposal_participants,
                trips, trip_members, trip_presets,
                trip_leaders, trip_leader_log, entry_disputes
  to authenticated;

-- Views are security_invoker (see 20261025000200), so RLS on ledger_entries
-- governs what each of these returns.
grant select on v_user_net, v_trip_net, v_pairwise_net to authenticated;

-- ═══ LEADERSHIP — READ ONLY. Appointment goes through RPC only. ═══
-- Without this restraint a member could open the console and insert
-- themselves into trip_leaders, granting themselves unconsented write power.
create policy trip_leaders_read on trip_leaders for select to authenticated
using (public.can_see_trip(trip_id));

create policy trip_leader_log_read on trip_leader_log for select to authenticated
using (public.can_see_trip(trip_id));

create policy disputes_read on entry_disputes for select to authenticated
using (public.can_see_expense(expense_id));

-- ═══ TRIPS — read only; creation and closure go through RPC ═══
create policy trips_read on trips for select to authenticated
using (public.is_group_member(group_id));

create policy trip_members_read on trip_members for select to authenticated
using (public.can_see_trip(trip_id));

-- Presets are a convenience with no financial effect, so direct writes are
-- permitted — but still scoped to the group, never ungated.
create policy trip_presets_read on trip_presets for select to authenticated
using (public.can_see_trip(trip_id));

create policy trip_presets_write on trip_presets for insert to authenticated
with check (public.can_see_trip(trip_id));

-- DIVERGENCE FROM §12.4: the plan grants DELETE on trip_presets but defines no
-- delete policy, and under RLS no policy means no rows — so the grant did
-- nothing.  Story D-04 unhappy path 3: "Deleting a preset: allowed by anyone on
-- the trip."
create policy trip_presets_delete on trip_presets for delete to authenticated
using (public.can_see_trip(trip_id));

grant insert, delete on trip_presets to authenticated;

-- ═══ LEDGER: READ ONLY, SCOPED TO YOUR OWN GROUPS ═══
-- Note the deliberate ABSENCE of insert/update/delete policies.
create policy ledger_read on ledger_entries for select to authenticated
using (public.is_group_member(group_id));

-- ═══ GROUPS ═══
create policy groups_read on groups for select to authenticated
using (public.is_group_member(id));

create policy members_read on group_members for select to authenticated
using (public.is_group_member(group_id));

-- ═══ EXPENSES ═══
create policy expenses_read on expenses for select to authenticated
using (public.is_group_member(group_id));

create policy shares_read on expense_shares for select to authenticated
using (public.can_see_expense(expense_id));

-- ═══ PROPOSALS — read only; decisions go through respond_to_proposal() ═══
create policy proposals_read on proposals for select to authenticated
using (public.is_group_member(group_id));

-- CRITICAL: no update policy here. Without this restraint a user could
-- open the console and set their own decision to 'approved'.
create policy participants_read on proposal_participants for select to authenticated
using (public.can_see_proposal(proposal_id));

-- ═══ PROFILES — visible only to people who share a group with you ═══
create policy profiles_read on profiles for select to authenticated
using (public.shares_a_group_with(id));

create policy profiles_update_own on profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

-- DIVERGENCE FROM §12.4: the policy above exists in the plan but the matching
-- grant does not, so it could never take effect.  Column-scoped: a user may
-- rename themselves or change their avatar, never their id or email.
grant update (display_name, avatar_url) on profiles to authenticated;

-- ═══ EXECUTE GRANTS — the RPC layer ═══
grant execute on function
  create_group(text),
  join_group(text),
  preview_invite(text),
  rotate_invite_code(uuid),
  leave_group(uuid),
  transfer_group_ownership(uuid, uuid),
  add_expense(uuid, uuid, bigint, text, jsonb, uuid, uuid),
  recent_similar_expense(uuid, uuid, bigint, interval),
  propose_transfer(uuid, uuid, uuid, uuid, bigint, text),
  propose_settlement(uuid, uuid, uuid, bigint, text, uuid),
  propose_amendment(uuid, uuid, uuid, bigint, text, text, uuid),
  respond_to_proposal(uuid, boolean),
  cancel_proposal(uuid),
  net_owed(uuid, uuid, uuid),
  create_trip(uuid, text, uuid[], uuid[], text),
  close_trip(uuid),
  reopen_trip(uuid),
  set_trip_entry_mode(uuid, text),
  trip_net_positions(uuid),
  explain_balance(uuid, uuid, uuid),
  fmt_taka(bigint),
  is_trip_leader(uuid, uuid),
  add_trip_leader(uuid, uuid),
  remove_trip_leader(uuid, uuid),
  void_expense(uuid, text),
  propose_void(uuid, text),
  leader_record_settlement(uuid, uuid, uuid, bigint, text),
  raise_dispute(uuid, text),
  withdraw_dispute(uuid),
  expense_attribution(uuid, uuid)
to authenticated;
