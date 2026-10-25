-- ═══════════════════════════════════════════════════════════════════════════
-- Story-driven behaviour tests.  IDs refer to USER_STORIES.md.  Per its §1
-- instruction, unhappy paths are tested alongside (and mostly before) the
-- happy ones.
-- ═══════════════════════════════════════════════════════════════════════════

-- Pairwise "a owes b", bypassing the membership gate (tests run as owner).
create function t.owes(g uuid, a text, b text) returns bigint language sql as
  $$ select public.net_owed_raw(g, t.id(a), t.id(b)) $$;
create function t.entries() returns int language sql as
  $$ select count(*)::int from public.ledger_entries $$;
create function t.net(g uuid, u text) returns bigint language sql as
  $$ select coalesce((select net_poisha from public.v_user_net
                       where group_id = g and user_id = t.id(u)), 0) $$;

-- ── Epic A ─────────────────────────────────────────────────────────────────
do $$
declare g uuid; code text; old_code text; pv record;
begin
  perform t.login(t.id('arif'));
  g := public.create_group('  Duplicate OK  ');
  perform t.assert_eq((select name from public.groups where id = g), 'Duplicate OK', 'A-02: name trimmed');
  perform t.assert_eq((select role from public.group_members where group_id = g and user_id = t.id('arif')),
                      'owner', 'A-02: creator is owner');
  perform t.expect_error('select public.create_group(''   '')', '%GROUP_NAME_REQUIRED%', 'A-02#1: blank name');
  perform t.expect_error('select public.create_group(repeat(''x'', 61))', '%check constraint%', 'A-02#2: >60 chars');

  select invite_code into code from public.groups where id = g;
  perform t.assert(code ~ '^[A-Za-z0-9_-]{22}$', 'invite code is 22 URL-safe chars');

  perform t.login(t.id('sami'));
  select * into pv from public.preview_invite(code);
  perform t.assert_eq(pv.group_name, 'Duplicate OK', 'A-03#4: preview shows group name');
  perform t.assert_eq(pv.already_member, false, 'A-03: preview knows Sami is not a member');
  perform public.join_group(code);
  perform public.join_group(code);
  perform t.assert_eq((select count(*)::int from public.group_members where group_id = g and user_id = t.id('sami')),
                      1, 'A-03#2/#4: joining twice leaves one membership');
  perform t.expect_error('select * from public.preview_invite(''nope'')', '%INVALID_INVITE_CODE%',
                         'A-03#1: invalid code reveals nothing');

  -- A-05 rotation
  perform t.expect_error(format('select public.rotate_invite_code(%L)', g), '%NOT_A_GROUP_OWNER%',
                         'A-05#2: non-owner cannot rotate');
  perform t.login(t.id('arif'));
  old_code := code;
  code := public.rotate_invite_code(g);
  perform t.assert(code <> old_code, 'A-05: new code differs');
  perform t.login(t.id('nadia'));
  perform t.expect_error(format('select public.join_group(%L)', old_code), '%INVALID_INVITE_CODE%',
                         'A-05: old code stops working immediately');

  -- A-06 leave
  perform t.login(t.id('sami'));
  perform public.leave_group(g);
  perform t.assert_eq((select count(*)::int from public.group_members where group_id = g and user_id = t.id('sami')),
                      0, 'A-06: zero-balance member can leave');
  perform t.login(t.id('arif'));
  perform t.expect_error(format('select public.leave_group(%L)', g), '%LAST_OWNER_MUST_TRANSFER_OWNERSHIP%',
                         'A-06#2: sole owner cannot leave');
end $$;

do $$
begin
  perform t.login(t.id('sami'));   -- owes Arif ৳30 in g1
  perform t.expect_error(format('select public.leave_group(%L)', t.id('g1')), '%OUTSTANDING_BALANCE%',
                         'A-06#1: cannot leave with a non-zero balance');
  perform t.login(t.id('tania'));  -- zero balance, but leads trip1
  perform t.expect_error(format('select public.leave_group(%L)', t.id('g1')), '%STILL_AN_ACTIVE_TRIP_LEADER%',
                         'A-06#3: active trip leader must hand over first');
end $$;

-- ── Epic B ─────────────────────────────────────────────────────────────────
do $$
declare g uuid := t.id('g1'); e uuid; e2 uuid; before int;
  arif uuid := t.id('arif'); sami uuid := t.id('sami'); rafi uuid := t.id('rafi');
  nadia uuid := t.id('nadia'); tania uuid := t.id('tania');
begin
  perform t.login(arif);
  before := t.entries();

  -- Unhappy paths first.
  perform t.expect_error(format($f$select public.add_expense(%L,%L,1000,'x',
    jsonb_build_array(jsonb_build_object('user_id',%L,'share',1000)))$f$, g, arif, arif),
    '%NEEDS_ANOTHER_PARTICIPANT%', 'B-01#4: payer as sole participant');
  perform t.expect_error(format($f$select public.add_expense(%L,%L,0,'x','[]')$f$, g, arif),
    '%INVALID_AMOUNT%', 'B-01#1: zero amount');
  perform t.expect_error(format($f$select public.add_expense(%L,%L,1000,'   ',
    jsonb_build_array(jsonb_build_object('user_id',%L,'share',1000)))$f$, g, arif, sami),
    '%DESCRIPTION_REQUIRED%', 'B-01#6: blank description');
  perform t.expect_error(format($f$select public.add_expense(%L,%L,1000,'x',
    jsonb_build_array(jsonb_build_object('user_id',%L,'share',1500),
                      jsonb_build_object('user_id',%L,'share',-500)))$f$, g, arif, sami, nadia),
    '%NEGATIVE_SHARE%', 'B-02#3: negative share');
  perform t.expect_error(format($f$select public.add_expense(%L,%L,1000,'x',
    jsonb_build_array(jsonb_build_object('user_id',%L,'share',900)))$f$, g, arif, sami),
    '%SHARES_DO_NOT_SUM_TO_TOTAL%', 'B-02#5: tampered shares that do not sum');
  perform t.expect_error(format($f$select public.add_expense(%L,%L,1000,'x',
    jsonb_build_array(jsonb_build_object('user_id',%L,'share',1000)))$f$, g, arif, t.id('outsider')),
    '%SHARE_USER_NOT_A_MEMBER%', 'B-01#10: share for a non-member');
  perform t.expect_error(format($f$select public.add_expense(%L,%L,1000,'x',
    jsonb_build_array(jsonb_build_object('user_id',%L,'share',1000)))$f$, g, t.id('outsider'), sami),
    '%PAYER_NOT_A_MEMBER%', 'B-03#1: payer not a member');
  perform t.assert_eq(t.entries(), before, 'B-01#7: failed saves wrote nothing');

  -- B-01 acceptance: ৳1,200 split 4 ways → three entries of 30000.
  e := public.add_expense(g, arif, 120000, 'Dinner at Star', jsonb_build_array(
         jsonb_build_object('user_id', arif,  'share', 30000),
         jsonb_build_object('user_id', sami,  'share', 30000),
         jsonb_build_object('user_id', rafi,  'share', 30000),
         jsonb_build_object('user_id', nadia, 'share', 30000)));
  perform t.assert_eq((select count(*)::int from public.ledger_entries where source_id = e), 3,
                      'B-01: ৳1,200 / 4 → exactly three ledger entries');
  perform t.assert_eq((select sum(share_poisha) from public.expense_shares where expense_id = e)::bigint,
                      120000::bigint, 'B-01: shares sum to exactly 120000');
  perform t.assert((select bool_and(amount_poisha = 30000) from public.ledger_entries where source_id = e),
                   'B-01: each entry is 30000');

  -- B-01 acceptance: ৳100 split 3 ways → 3334/3333/3333.
  e := public.add_expense(g, arif, 10000, 'Rickshaw', jsonb_build_array(
         jsonb_build_object('user_id', arif, 'share', 3334),
         jsonb_build_object('user_id', sami, 'share', 3333),
         jsonb_build_object('user_id', rafi, 'share', 3333)));
  perform t.assert_eq((select sum(share_poisha) from public.expense_shares where expense_id = e)::bigint,
                      10000::bigint, 'B-01: ৳100 / 3 sums to exactly 10000');

  -- B-01#5: payer not among participants — owed the full amount.
  e := public.add_expense(g, arif, 5000, 'Treat for Tania',
         jsonb_build_array(jsonb_build_object('user_id', tania, 'share', 5000)));
  perform t.assert_eq((select amount_poisha from public.ledger_entries where source_id = e), 5000::bigint,
                      'B-01#5: payer who did not participate is owed the whole amount');

  -- B-02#4: zero share creates no entry.
  e := public.add_expense(g, arif, 1000, 'Snacks', jsonb_build_array(
         jsonb_build_object('user_id', sami, 'share', 1000),
         jsonb_build_object('user_id', nadia, 'share', 0)));
  perform t.assert_eq((select count(*)::int from public.ledger_entries where source_id = e), 1,
                      'B-02#4: zero share produces no ledger entry');

  -- B-03: payer ≠ creator, both recorded.
  e := public.add_expense(g, tania, 2000, 'Paid by Tania',
         jsonb_build_array(jsonb_build_object('user_id', sami, 'share', 2000)));
  perform t.assert((select payer_id = tania and created_by = arif from public.expenses where id = e),
                   'B-03: paid by Tania, added by Arif');
  perform t.assert((select count(*) = 1 from public.recent_similar_expense(g, tania, 2000)),
                   'B-03#3: duplicate warning finds a same-payer same-amount expense');

  -- §12.1: replayed request with the same client token returns the same expense.
  e  := public.add_expense(g, arif, 700, 'Retry me',
          jsonb_build_array(jsonb_build_object('user_id', sami, 'share', 700)), null,
          '11111111-1111-1111-1111-111111111111');
  e2 := public.add_expense(g, arif, 700, 'Retry me',
          jsonb_build_array(jsonb_build_object('user_id', sami, 'share', 700)), null,
          '11111111-1111-1111-1111-111111111111');
  perform t.assert_eq(e2, e, '§12.1: retried add_expense is idempotent');
  perform t.assert_eq((select count(*)::int from public.expenses where description = 'Retry me'), 1,
                      '§12.1: exactly one expense after a retry');
end $$;

-- B-08: 0.1 + 0.2 = exactly 30 poisha.
do $$
declare g uuid;
begin
  perform t.login(t.id('arif'));
  g := public.create_group('Float test');
  insert into t.ids values ('g_float', g);
end $$;
do $$
declare g uuid := t.id('g_float'); code text;
begin
  select invite_code into code from public.groups where id = g;
  perform t.login(t.id('sami')); perform public.join_group(code);
  perform t.login(t.id('arif'));
  perform public.add_expense(g, t.id('arif'), 10, 'a', jsonb_build_array(jsonb_build_object('user_id', t.id('sami'), 'share', 10)));
  perform public.add_expense(g, t.id('arif'), 20, 'b', jsonb_build_array(jsonb_build_object('user_id', t.id('sami'), 'share', 20)));
  perform t.assert_eq(t.owes(g, 'sami', 'arif'), 30::bigint, 'B-08: ৳0.10 + ৳0.20 = exactly 30 poisha');
end $$;

-- ── Epic C: transfers, on a clean group reproducing §9.1 exactly ────────────
do $$
declare g uuid; code text;
begin
  perform t.login(t.id('arif'));
  g := public.create_group('Transfer lab');
  insert into t.ids values ('gx', g);
  select invite_code into code from public.groups where id = g;
  perform t.login(t.id('sami'));  perform public.join_group(code);
  perform t.login(t.id('rafi'));  perform public.join_group(code);
  perform t.login(t.id('nadia')); perform public.join_group(code);
  -- Z=Sami owes X=Arif 30; X=Arif owes Y=Rafi 20.
  perform t.login(t.id('arif'));
  perform public.add_expense(g, t.id('arif'), 3000, 'Z owes X',
    jsonb_build_array(jsonb_build_object('user_id', t.id('sami'), 'share', 3000)));
  perform t.login(t.id('rafi'));
  perform public.add_expense(g, t.id('rafi'), 2000, 'X owes Y',
    jsonb_build_array(jsonb_build_object('user_id', t.id('arif'), 'share', 2000)));
end $$;

do $$
declare g uuid := t.id('gx'); p uuid; p2 uuid; r text; before int; nadia_before bigint;
  arif uuid := t.id('arif'); sami uuid := t.id('sami'); rafi uuid := t.id('rafi'); nadia uuid := t.id('nadia');
begin
  perform t.login(arif);
  -- C-01 unhappy paths
  perform t.expect_error(format('select public.propose_transfer(%L,%L,%L,%L,2500)', g, sami, arif, rafi),
    '%INTERMEDIARY_LEG_INSUFFICIENT%', 'C-01 acceptance: ৳25 against legs 30/20 refused');
  perform t.expect_error(format('select public.propose_transfer(%L,%L,%L,%L,3500)', g, sami, arif, rafi),
    '%DEBTOR_LEG_INSUFFICIENT%', 'C-01#1: exceeds debtor leg');
  perform t.expect_error(format('select public.propose_transfer(%L,%L,%L,%L,100)', g, sami, rafi, nadia),
    '%PROPOSER_NOT_INVOLVED%', 'C-01#2: proposer not a party');
  perform t.expect_error(format('select public.propose_transfer(%L,%L,%L,%L,100)', g, sami, arif, sami),
    '%PARTIES_MUST_BE_DISTINCT%', 'C-01#3: duplicate party');
  perform t.expect_error(format('select public.propose_transfer(%L,%L,%L,%L,100)', g, sami, arif, t.id('tania')),
    '%ALL_PARTIES_MUST_BE_MEMBERS%', 'C-01#4: non-member party');
  perform t.assert_eq((select count(*)::int from public.proposals where group_id = g), 0,
                      'C-01: refused proposals leave no row');

  -- C-01 happy path
  p := public.propose_transfer(g, sami, arif, rafi, 2000, 'One payment instead of two');
  perform t.assert_eq((select count(*)::int from public.proposal_participants where proposal_id = p), 3,
                      'C-01: three participants');
  perform t.assert_eq((select decision from public.proposal_participants where proposal_id = p and user_id = arif),
                      'approved', 'C-01: proposer auto-approved');

  -- C-02
  perform t.login(rafi);
  r := public.respond_to_proposal(p, true);
  perform t.assert_eq(r, 'pending', 'C-02: waiting for Sami');
  perform t.expect_error(format('select public.respond_to_proposal(%L, true)', p),
    '%NOT_A_PENDING_PARTICIPANT%', 'C-02#1/#5: second response refused');

  before := t.entries();
  nadia_before := t.net(g, 'nadia');
  perform t.login(sami);
  r := public.respond_to_proposal(p, true);
  perform t.assert_eq(r, 'approved', 'C-02: final approval commits');
  perform t.assert_eq(t.entries() - before, 3, 'C-02 acceptance: exactly three entries');
  -- §9.1 outcome, and I4: exactly these three pairs moved, by exactly 2000.
  perform t.assert_eq(t.owes(g, 'sami', 'arif'), 1000::bigint, '§9.1: Z owes X 30 → 10');
  perform t.assert_eq(t.owes(g, 'arif', 'rafi'),    0::bigint, '§9.1: X owes Y 20 → 0');
  perform t.assert_eq(t.owes(g, 'sami', 'rafi'), 2000::bigint, '§9.1: Z now owes Y 20');
  perform t.assert_eq(t.net(g, 'nadia'), nadia_before, 'I4: no fourth party moved');
  perform t.assert_eq(t.net(g, 'arif'), 1000::bigint, 'I4: intermediary net unchanged by transfer (was 3000-2000)');

  -- C-03: rejection
  perform t.login(sami);
  p := public.propose_settlement(g, sami, arif, 500);
  before := t.entries();
  perform t.login(arif);
  r := public.respond_to_proposal(p, false);
  perform t.assert_eq(r, 'rejected', 'C-03: rejected');
  perform t.assert_eq(t.entries(), before, 'C-03 / F-02#2: no entries on rejection');
  perform t.expect_error(format('select public.respond_to_proposal(%L, true)', p),
    '%PROPOSAL_NOT_PENDING%', 'C-03#3: rejection is terminal');

  -- C-01#6 / §11.1 attack 2: two proposals spending the same debt
  perform t.login(sami);
  p  := public.propose_settlement(g, sami, rafi, 2000, 'all of it');
  p2 := public.propose_settlement(g, sami, rafi, 1500, 'most of it');
  perform t.login(rafi);
  perform t.assert_eq(public.respond_to_proposal(p, true),  'approved',    'double-spend: first commits');
  perform t.assert_eq(public.respond_to_proposal(p2, true), 'invalidated', 'C-01#6 / F-02#6: second is invalidated');
  perform t.assert_eq((select resolution_reason from public.proposals where id = p2),
                      'The debt changed after this was proposed', 'invalidated carries a plain reason');

  -- C-05 withdraw
  perform t.login(sami);
  p := public.propose_settlement(g, sami, arif, 100);
  perform t.login(arif);
  perform t.expect_error(format('select public.cancel_proposal(%L)', p), '%CANNOT_CANCEL%', 'C-05#1: only the proposer');
  perform t.login(sami);
  perform public.cancel_proposal(p);
  perform t.assert_eq((select status from public.proposals where id = p), 'cancelled', 'C-05: withdrawn');
  perform t.expect_error(format('select public.cancel_proposal(%L)', p), '%CANNOT_CANCEL%', 'C-05#2: already resolved');

  -- C-06 expiry, both enforcement points
  p := public.propose_settlement(g, sami, arif, 100);
  update public.proposals set expires_at = now() - interval '1 second' where id = p;
  before := t.entries();
  perform t.login(arif);
  perform t.assert_eq(public.respond_to_proposal(p, true), 'expired', 'C-06#1: approval after expiry returns expired');
  perform t.assert_eq(t.entries(), before, 'C-06: expired writes nothing');
  perform t.login(sami);
  p := public.propose_settlement(g, sami, arif, 100);
  update public.proposals set expires_at = now() - interval '1 second' where id = p;
  perform t.assert(public.expire_stale_proposals() >= 1, 'C-06: sweep expires stale proposals');
  perform t.assert_eq((select status from public.proposals where id = p), 'expired', 'C-06: swept to expired');

  -- C-07 amendment
  perform t.login(sami);
  p := public.propose_amendment(g, sami, arif, 1000, 'decrease', 'we agreed it was less');
  p2 := public.propose_settlement(g, sami, arif, 600);
  perform t.login(arif);
  perform t.assert_eq(public.respond_to_proposal(p2, true), 'approved', 'settlement lands first');
  perform t.assert_eq(public.respond_to_proposal(p, true), 'invalidated',
                      'C-07#3/#4: decrease exceeding the live balance is invalidated at commit');
  p := public.propose_amendment(g, sami, arif, 250, 'increase', 'forgot the tip');
  perform t.login(sami);
  perform t.assert_eq(public.respond_to_proposal(p, true), 'approved', 'C-07: increase approved');
  perform t.assert_eq(t.owes(g, 'sami', 'arif'), 650::bigint, 'C-07: compensating entry appended (400 + 250)');
  perform t.expect_error(format('select public.propose_amendment(%L,%L,%L,100,''sideways'')', g, sami, arif),
    '%INVALID_DIRECTION%', 'amendment direction validated');

  -- F-02: settlement
  perform t.expect_error(format('select public.propose_settlement(%L,%L,%L,99999)', g, sami, arif),
    '%SETTLEMENT_EXCEEDS_BALANCE%', 'F-02#4: cannot settle more than owed');
  p := public.propose_settlement(g, sami, arif, 650, 'cash');
  perform t.assert_eq(t.owes(g, 'sami', 'arif'), 650::bigint, 'F-02 acceptance: unconfirmed settlement changes nothing');
  perform t.login(arif);
  perform public.respond_to_proposal(p, true);
  perform t.assert_eq(t.owes(g, 'sami', 'arif'), 0::bigint, 'F-02/F-05: confirmed settlement clears the balance');
end $$;

-- H-06: proposal rate limit
do $$
declare g uuid := t.id('gx'); i int;
begin
  -- Nadia has proposed nothing in this group; an 'increase' amendment needs no
  -- existing balance.
  perform t.login(t.id('nadia'));
  for i in 1..10 loop
    perform public.propose_amendment(g, t.id('nadia'), t.id('rafi'), 1, 'increase');
  end loop;
  perform t.expect_error(format('select public.propose_amendment(%L,%L,%L,1,''increase'')', g, t.id('nadia'), t.id('rafi')),
    '%PROPOSAL_RATE_LIMIT%', 'H-06: eleventh proposal in an hour is refused');
end $$;

-- ── Epic B-06 / C-08: void by consent ───────────────────────────────────────
do $$
declare g uuid := t.id('g1'); e uuid; p uuid; snap jsonb; r text;
  arif uuid := t.id('arif'); sami uuid := t.id('sami'); rafi uuid := t.id('rafi');
begin
  perform t.login(arif);
  e := public.add_expense(g, arif, 120000, 'Dinner typo', jsonb_build_array(
         jsonb_build_object('user_id', arif, 'share', 40000),
         jsonb_build_object('user_id', sami, 'share', 40000),
         jsonb_build_object('user_id', rafi, 'share', 40000)));
  select jsonb_object_agg(user_id, net_poisha) into snap from public.v_user_net where group_id = g;

  perform t.expect_error(format('select public.propose_void(%L, ''  '')', e), '%VOID_REASON_REQUIRED%', 'B-06#2: reason required');
  p := public.propose_void(e, 'typed 1200, was 1100');
  perform t.expect_error(format('select public.propose_void(%L, ''again'')', e), '%VOID_ALREADY_PROPOSED%', 'B-06#6: one at a time');
  perform t.assert_eq((select count(*)::int from public.proposal_participants where proposal_id = p), 3,
                      'void participants: payer + share holders');

  -- C-08#1: a decline leaves the expense standing.
  perform t.login(sami);
  perform t.assert_eq(public.respond_to_proposal(p, false), 'rejected', 'C-08#1: declined');
  perform t.assert((select voided_at is null from public.expenses where id = e), 'C-08: expense still counts after decline');

  -- Full approval.
  perform t.login(arif);
  p := public.propose_void(e, 'typed 1200, was 1100');
  perform t.login(sami); perform public.respond_to_proposal(p, true);
  perform t.login(rafi); r := public.respond_to_proposal(p, true);
  perform t.assert_eq(r, 'approved', 'B-06: void approved by all');
  perform t.assert((select voided_at is not null and void_reason = 'typed 1200, was 1100'
                      from public.expenses where id = e), 'B-06: original row kept, marked voided');
  perform t.assert_eq((select coalesce(sum(case when to_user = arif then amount_poisha else -amount_poisha end), 0)
                         from public.ledger_entries where source_id = e)::bigint, 0::bigint,
                      'I8: voided expense nets to exactly zero');
  perform t.assert_eq((select count(*)::int from public.ledger_entries where source_id = e), 4,
                      'I8: two originals + two reversals, nothing deleted');
  perform t.assert(
    (select jsonb_object_agg(user_id, net_poisha) from public.v_user_net where group_id = g)
      = (select jsonb_object_agg(k, (v::bigint - case when k = arif::text then 80000
                                                  when k in (sami::text, rafi::text) then -40000 else 0 end))
           from jsonb_each_text(snap) s(k, v)),
    'I8: every balance is back to its pre-expense value');
  perform t.login(arif);
  perform t.expect_error(format('select public.propose_void(%L, ''x'')', e), '%ALREADY_VOIDED%', 'B-06#5: already voided');
end $$;

-- ── Epic D: trips and leaders ───────────────────────────────────────────────
do $$
declare g uuid := t.id('g1'); trip uuid := t.id('trip1'); e uuid; e2 uuid; p uuid; tr uuid;
  arif uuid := t.id('arif'); sami uuid := t.id('sami'); nadia uuid := t.id('nadia');
  tania uuid := t.id('tania'); nabil uuid := t.id('nabil'); rafi uuid := t.id('rafi');
begin
  -- D-01
  perform t.assert(exists (select 1 from public.trip_leaders where trip_id = trip and user_id = arif),
                   'D-01: creator is a leader');
  perform t.assert_eq((select count(*)::int from public.trip_leader_log where trip_id = trip and action = 'appointed'),
                      (select count(*)::int from public.trip_leaders where trip_id = trip),
                      'D-01: one log row per initial leader');
  perform t.login(arif);
  tr := public.create_trip(g, 'Leader off roster', array[sami], array[nabil]);
  perform t.assert(exists (select 1 from public.trip_members where trip_id = tr and user_id = nabil),
                   'D-01#1: leader not on roster is added, never silently dropped');
  perform t.expect_error(format('select public.create_trip(%L, ''x'', array[%L]::uuid[], array[%L]::uuid[])',
                         g, sami, t.id('outsider')), '%LEADER_MUST_BE_GROUP_MEMBER%', 'D-01#2');
  perform t.expect_error(format('select public.create_trip(%L, ''solo'', array[]::uuid[])', g),
                         '%ROSTER_TOO_SMALL%', 'D-01#5: empty roster');

  -- D-02 entry mode
  perform t.login(sami);
  perform t.expect_error(format($f$select public.add_expense(%L,%L,1000,'x',
    jsonb_build_array(jsonb_build_object('user_id',%L,'share',1000)), %L)$f$, g, sami, arif, trip),
    '%LEADERS_ONLY_TRIP%', 'D-02#1: non-leader on leaders_only trip');
  perform t.expect_error(format('select public.set_trip_entry_mode(%L, ''open'')', trip),
    '%NOT_A_TRIP_LEADER%', 'entry mode is leader-only');

  -- D-03: 3 of N, by a leader (Tania), paid by Arif
  perform t.login(tania);
  e := public.add_expense(g, arif, 10000, 'Second vehicle', jsonb_build_array(
         jsonb_build_object('user_id', arif,  'share', 3334),
         jsonb_build_object('user_id', sami,  'share', 3333),
         jsonb_build_object('user_id', nadia, 'share', 3333)), trip);
  insert into t.ids values ('e_trip_vehicle', e);
  perform t.assert_eq((select count(*)::int from public.ledger_entries where source_id = e), 2,
                      'D-03: 3-of-N → exactly two entries');
  perform t.assert((select bool_and(trip_id = trip) from public.ledger_entries where source_id = e),
                   'D-02 acceptance: every entry carries the trip_id');

  perform public.set_trip_entry_mode(trip, 'open');
  perform t.login(sami);
  e2 := public.add_expense(g, sami, 50000, 'Hotel', jsonb_build_array(
          jsonb_build_object('user_id', sami, 'share', 25000),
          jsonb_build_object('user_id', arif, 'share', 25000)), trip);
  perform t.ok('D-02: any member may add on an open trip');
  insert into t.ids values ('e_trip_hotel', e2);

  -- D-07: corrections.  Non-leader (even the author) cannot void.
  perform t.expect_error(format('select public.void_expense(%L, ''mine'')', e2),
    '%NOT_AUTHORIZED_TO_VOID%', 'D-07#1: non-leader cannot void even own trip entry');
  -- A void proposal pending when a leader voids directly → invalidated.
  p := public.propose_void(e2, 'wrong hotel');
  perform t.login(tania);
  perform t.expect_error(format('select public.void_expense(%L, '''')', e2), '%VOID_REASON_REQUIRED%', 'D-07#4');
  perform public.void_expense(e2, 'wrong amount');
  perform t.expect_error(format('select public.void_expense(%L, ''again'')', e2), '%ALREADY_VOIDED%', 'D-07: no double void');
  perform t.login(arif);
  perform t.assert_eq(public.respond_to_proposal(p, true), 'invalidated', 'B-06#8 / C-08#4: void proposal invalidated');
  perform t.assert_eq((select resolution_reason from public.proposals where id = p),
                      'This expense was already cancelled', 'B-06#8: plain reason');
  perform t.assert_eq((select coalesce(sum(case when to_user = sami then amount_poisha else -amount_poisha end), 0)
                         from public.ledger_entries where source_id = e2)::bigint, 0::bigint,
                      'D-07 / I8: leader-voided expense contributes zero');

  -- D-08 leader settlement: trip has Sami owing Arif 3333.
  perform t.login(tania);
  perform t.expect_error(format('select public.leader_record_settlement(%L,%L,%L,4000)', trip, sami, arif),
    '%EXCEEDS_TRIP_BALANCE%', 'D-08 acceptance: more than the trip created');
  perform t.expect_error(format('select public.leader_record_settlement(%L,%L,%L,1)', trip, sami, sami),
    '%PARTIES_MUST_DIFFER%', 'D-08#4');
  p := public.leader_record_settlement(trip, sami, arif, 3000, 'cash at the station');
  perform t.assert((select status = 'approved' and resolution_reason like 'Recorded by trip leader%'
                      from public.proposals where id = p), 'D-08 acceptance: approved proposal naming the leader');
  perform t.assert_eq(public.trip_net_owed_raw(trip, sami, arif), 333::bigint, 'D-08: trip balance reduced');

  -- D-05 / D-06 leaders
  perform t.login(sami);
  perform t.expect_error(format('select public.add_trip_leader(%L,%L)', trip, sami), '%NOT_A_TRIP_LEADER%', 'D-05#1');
  perform t.login(arif);
  perform public.add_trip_leader(trip, nadia);
  perform public.add_trip_leader(trip, nadia);
  perform t.assert_eq((select count(*)::int from public.trip_leader_log
                        where trip_id = trip and user_id = nadia and action = 'appointed'), 1,
                      'D-05#2: re-appointing is a no-op with no extra log row');
  perform t.expect_error(format('select public.add_trip_leader(%L,%L)', trip, t.id('outsider')),
    '%LEADER_MUST_BE_GROUP_MEMBER%', 'D-05#3');
  perform public.remove_trip_leader(trip, nadia);
  perform public.remove_trip_leader(trip, tania);
  perform t.expect_error(format('select public.remove_trip_leader(%L,%L)', trip, arif),
    '%CANNOT_REMOVE_LAST_LEADER%', 'D-06#1: never leaderless');
  perform public.add_trip_leader(trip, tania);

  -- D-11 disputes
  perform t.login(sami);
  declare snap bigint := t.owes(g, 'sami', 'arif'); d uuid;
  begin
    d := public.raise_dispute(e, 'I was not in that vehicle');
    perform public.raise_dispute(e, 'Really, I was not');
    perform t.assert_eq((select count(*)::int from public.entry_disputes where expense_id = e), 1,
                        'D-11#2: disputing twice updates the existing one');
    perform t.assert_eq(t.owes(g, 'sami', 'arif'), snap, 'D-11 acceptance: dispute changes no balance');
    perform t.login(arif);
    perform t.expect_error(format('select public.withdraw_dispute(%L)', d), '%CANNOT_WITHDRAW_DISPUTE%',
                           'only the raiser withdraws');
    perform t.login(sami);
    perform public.withdraw_dispute(d);
    perform t.assert_eq((select status from public.entry_disputes where id = d), 'withdrawn', 'D-11#4');
    perform t.login(t.id('outsider'));
    perform t.expect_error(format('select public.raise_dispute(%L, ''x'')', e), '%NOT_A_MEMBER%', 'D-11#5');
  end;

  -- D-10 close
  perform t.login(arif);
  perform public.close_trip(trip);
  perform t.assert_eq(public.is_trip_leader(trip, arif), false, 'D-10 acceptance: authority lapses on close');
  perform t.expect_error(format('select public.leader_record_settlement(%L,%L,%L,1)', trip, sami, arif),
    '%NOT_A_TRIP_LEADER%', 'D-10 acceptance / D-08#3: leader action refused after close');
  perform t.expect_error(format('select public.void_expense(%L, ''x'')', e),
    '%NOT_AUTHORIZED_TO_VOID%', 'D-07#3: closed trip → void proposal only');
  perform t.expect_error(format($f$select public.add_expense(%L,%L,1000,'x',
    jsonb_build_array(jsonb_build_object('user_id',%L,'share',1000)), %L)$f$, g, arif, sami, trip),
    '%TRIP_CLOSED%', 'D-02#2: closed trip refuses expenses');
  perform t.login(sami);
  perform t.expect_error(format('select public.reopen_trip(%L)', trip), '%NOT_A_TRIP_LEADER%',
                         'D-10#4: only a former leader may reopen');
  perform t.login(arif);
  perform public.reopen_trip(trip);
  perform t.assert(public.is_trip_leader(trip, arif), 'D-10#4: reopened, authority restored');
  perform t.assert(exists (select 1 from public.trip_leader_log where trip_id = trip and action = 'trip_reopened'),
                   'D-10#4: reopening is logged');
end $$;

-- ── Feature 4.1 worked example, exact numbers ──────────────────────────────
do $$
declare g uuid; code text; a uuid := t.new_user('A'); b uuid := t.new_user('B'); c uuid := t.new_user('C');
  d uuid := t.new_user('D'); e uuid := t.new_user('E'); tr uuid; s record; total bigint;
begin
  perform t.login(a);
  g := public.create_group('Feature 4.1');
  select invite_code into code from public.groups where id = g;
  perform t.login(b); perform public.join_group(code);
  perform t.login(c); perform public.join_group(code);
  perform t.login(d); perform public.join_group(code);
  perform t.login(e); perform public.join_group(code);
  perform t.login(a);
  tr := public.create_trip(g, 'Day trip', array[b, c, d, e], array[b], 'open');
  perform public.add_expense(g, a, 10000, 'Auto rickshaw', jsonb_build_array(
    jsonb_build_object('user_id', a, 'share', 2000), jsonb_build_object('user_id', b, 'share', 2000),
    jsonb_build_object('user_id', c, 'share', 2000), jsonb_build_object('user_id', d, 'share', 2000),
    jsonb_build_object('user_id', e, 'share', 2000)), tr);
  perform t.login(b);
  perform public.add_expense(g, b, 10000, 'Second vehicle', jsonb_build_array(
    jsonb_build_object('user_id', a, 'share', 3334), jsonb_build_object('user_id', b, 'share', 3333),
    jsonb_build_object('user_id', c, 'share', 3333)), tr);

  perform t.assert_eq((select net_poisha from public.v_user_net where group_id = g and user_id = a), 4666::bigint, '4.1: A +4666');
  perform t.assert_eq((select net_poisha from public.v_user_net where group_id = g and user_id = b), 4667::bigint, '4.1: B +4667');
  perform t.assert_eq((select net_poisha from public.v_user_net where group_id = g and user_id = c), -5333::bigint, '4.1: C −5333');
  perform t.assert_eq((select net_poisha from public.v_user_net where group_id = g and user_id = d), -2000::bigint, '4.1: D −2000');
  perform t.assert_eq((select net_poisha from public.v_user_net where group_id = g and user_id = e), -2000::bigint, '4.1: E −2000');
  perform t.assert_eq(public.net_owed_raw(g, a, b), 1334::bigint, '4.1: A owes B ৳13.34, not ৳33.34');

  -- trip_net_positions = group view here, and sums to zero (I7)
  perform t.login(c);
  select sum(net_poisha) as s into s from public.trip_net_positions(tr);
  perform t.assert_eq(s.s, 0::numeric, 'I7: trip positions sum to zero');

  -- E-01 / I6 for every pair, and E-02 rounding attribution for A's 3334
  for s in select u.id as other, u.nm from (values (a,'A'),(b,'B'),(c,'C'),(d,'D'),(e,'E')) u(id, nm) loop
    if s.other <> c then
      select coalesce((select running_poisha from public.explain_balance(g, s.other) order by occurred_at desc, entry_id desc limit 1), 0)
        into total;
      perform t.assert_eq(total, public.net_owed_raw(g, s.other, c),
                          'I6: derivation for C vs ' || s.nm || ' equals net_owed');
    end if;
  end loop;

  perform t.login(a);
  perform t.assert((select bool_or(detail ->> 'rounding_note' like '%you were charged ৳33.34, one poisha more%')
                      from public.explain_balance(g, b)),
                   'E-02: derivation explains A''s extra poisha in plain language');
  perform t.assert((select bool_or(cause_label like 'Second vehicle — ৳100.00 paid by B, split 3 ways, share ৳33.34%')
                      from public.explain_balance(g, b)),
                   'E-01: plain-language cause label');
end $$;

-- E-03: leader attribution with role at write time, and void labelling
do $$
declare lbl text;
begin
  perform t.login(t.id('sami'));
  select string_agg(cause_label, ' | ') into lbl from public.explain_balance(t.id('g1'), t.id('arif'), t.id('trip1'));
  perform t.assert(lbl like '%added by Tania (trip leader)%', 'E-03: "added by Tania (trip leader)"');
  perform t.assert(lbl like '%Cancelled: Hotel — voided by Tania (trip leader) — wrong amount%', 'E-03 / B-05#2: void shown with actor and reason');
  perform t.assert(lbl like '%Payment recorded by Tania (trip leader)%', 'D-08 / E-03: leader settlement labelled');
  perform t.assert_eq(
    (select running_poisha from public.explain_balance(t.id('g1'), t.id('arif'), null) order by occurred_at desc, entry_id desc limit 1),
    public.net_owed_raw(t.id('g1'), t.id('arif'), t.id('sami')),
    'I6: full-group derivation matches net_owed');
end $$;

select t.ok('BEHAVIOUR SUITE PASSED');
