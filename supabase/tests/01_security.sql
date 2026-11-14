-- ═══════════════════════════════════════════════════════════════════════════
-- DEVELOPMENT_PLAN.md §12.7 — security acceptance tests.  EVERY ONE MUST FAIL.
-- Also USER_STORIES Epic H.  Run as the `authenticated` role with a real
-- (shimmed) JWT claim, exactly as a browser console attacker would be.
-- ═══════════════════════════════════════════════════════════════════════════

-- A proposal Nadia is not part of, for tests 2 and 5.
do $$
declare p uuid;
begin
  perform t.login(t.id('arif'));
  p := public.propose_transfer(t.id('g1'), t.id('sami'), t.id('arif'), t.id('rafi'), 2000);
  insert into t.ids values ('p_transfer', p);
end $$;

set role authenticated;
select t.login(t.id('nadia'));

-- 1. Direct ledger insert
select t.expect_error($q$
  insert into public.ledger_entries (group_id, from_user, to_user, amount_poisha, source_type, source_id)
  values (t.id('g1'), t.id('sami'), t.id('nadia'), 9999999, 'expense', gen_random_uuid())
$q$, '%permission denied%', '12.7#1 / H-01: direct ledger insert');

-- 2. Self-approve a proposal via the table
select t.expect_error($q$
  update public.proposal_participants set decision = 'approved'
   where proposal_id = t.id('p_transfer')
$q$, '%permission denied%', '12.7#2 / H-02: update proposal_participants');

-- 3. Mutate an existing ledger entry
select t.expect_error($q$
  update public.ledger_entries set amount_poisha = 1
   where id = (select id from public.ledger_entries limit 1)
$q$, '%permission denied%', '12.7#3 / H-01: update ledger entry');

select t.expect_error($q$
  delete from public.ledger_entries
$q$, '%permission denied%', 'H-01 variant: delete ledger entries');

-- 4. Read another group's data — must return empty
select t.assert_eq((select count(*) from public.ledger_entries where group_id = t.id('g2'))::int, 0,
                   '12.7#4 / H-05: foreign ledger rows invisible');
select t.assert_eq((select count(*) from public.expenses where group_id = t.id('g2'))::int, 0,
                   'H-05: foreign expenses invisible');
select t.assert_eq((select count(*) from public.v_user_net where group_id = t.id('g2'))::int, 0,
                   'H-05: foreign v_user_net invisible (security_invoker view)');
select t.assert_eq((select count(*) from public.v_pairwise_net where group_id = t.id('g2'))::int, 0,
                   'H-05: foreign v_pairwise_net invisible');
select t.assert_eq((select count(*) from public.groups where id = t.id('g2'))::int, 0,
                   'H-05: foreign group invisible');
select t.assert_eq((select count(*) from public.profiles where id = t.id('outsider'))::int, 0,
                   'H-05: profile of someone sharing no group invisible');
select t.assert((select count(*) from public.ledger_entries where group_id = t.id('g1')) > 0,
                'own group ledger IS visible (RLS not over-restrictive)');
select t.assert((select count(*) from public.group_members where group_id = t.id('g1')) = 6,
                'members_read works without policy recursion');
select t.ok('12.7#4 / H-05: cross-group reads return nothing');

select t.expect_error($q$ select public.net_owed(t.id('g2'), t.id('foreigner'), t.id('outsider')) $q$,
  '%NOT_A_MEMBER%', 'H-05: net_owed for a foreign group');

select t.expect_error($q$ select public.net_owed_raw(t.id('g2'), t.id('foreigner'), t.id('outsider')) $q$,
  '%permission denied%', 'internal net_owed_raw is not callable by clients');

select t.expect_error($q$ select public.expire_stale_proposals() $q$,
  '%permission denied%', 'internal expire sweep is not callable by clients');

-- 5. Approve on someone else's behalf via RPC
select t.expect_error($q$ select public.respond_to_proposal(t.id('p_transfer'), true) $q$,
  '%NOT_A_PENDING_PARTICIPANT%', '12.7#5 / H-02: respond as a non-participant');

-- 6. Create an expense in a group you do not belong to
select t.expect_error($q$
  select public.add_expense(t.id('g2'), t.id('outsider'), 100, 'x', '[]'::jsonb, null)
$q$, '%NOT_A_MEMBER%', '12.7#6: add_expense in a foreign group');

-- 7. Explain a balance in a group you do not belong to
select t.expect_error($q$ select * from public.explain_balance(t.id('g2'), t.id('outsider')) $q$,
  '%NOT_A_MEMBER%', '12.7#7: explain_balance in a foreign group');

-- 11b. Propose a void for an expense you are not part of
select t.expect_error($q$ select public.propose_void(t.id('e_sami_arif'), 'test') $q$,
  '%NOT_INVOLVED_IN_EXPENSE%', '12.7#11b: propose_void when not involved');

-- H-02 variant: passing another user's id is impossible — no RPC takes one
-- as caller identity.  Asserted structurally: no granted function has a
-- parameter named like an actor.
reset role;
select t.assert_eq((
  select count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('authenticated', p.oid, 'execute')
    and exists (select 1 from unnest(p.proargnames) a
                where a in ('p_actor', 'p_caller', 'p_me', 'p_user_id', 'p_proposer'))
), 0, 'P4: no client-callable function accepts a caller identity parameter');

-- §12.5: every security definer function pins search_path.
select t.assert_eq((
  select count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                    where c like 'search_path=%')
), 0, '§12.5: every security definer function sets search_path');

-- Every public table has RLS on (Supabase linter's first check).
select t.assert_eq((
  select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
), 0, '§12.6: RLS enabled on every public table');

-- The append-only trigger holds even for a superuser that bypasses RLS.
select t.expect_error($q$ update public.ledger_entries set amount_poisha = 1 $q$,
  '%append-only%', 'P1: trigger blocks UPDATE even for the table owner');
select t.expect_error($q$ delete from public.ledger_entries $q$,
  '%append-only%', 'P1: trigger blocks DELETE even for the table owner');

-- Unauthenticated (anon / no JWT) gets nothing.
set role anon;
select t.login(null);
select t.expect_error($q$ select count(*) from public.ledger_entries $q$,
  '%permission denied%', 'anon cannot read the ledger');
select t.expect_error($q$ select public.create_group('x') $q$,
  '%permission denied%', 'anon cannot call RPCs');
reset role;

select t.ok('§12.7 SECURITY CHECKLIST: ALL ATTACKS REFUSED');
