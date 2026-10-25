-- ═══════════════════════════════════════════════════════════════════════════
-- DEVELOPMENT_PLAN.md §14.1 — fuzz test over invariants I1–I10.
--
-- Several thousand random operations (add expense, propose, approve, reject,
-- cancel, expire, settle, void, leader actions, trip open/close) across one
-- group of 7 simulated users, asserting invariants after EVERY operation.
--
-- Each operation commits in its own transaction (a procedure with COMMIT), so
-- now() differs per operation exactly as it would between real requests.
-- Expected domain errors (insufficient balance, not a leader, ...) are part of
-- the fuzz: the attempt is made, refused, and invariants must still hold.
-- ═══════════════════════════════════════════════════════════════════════════

\set fuzz_ops `echo "${FUZZ_OPS:-3000}"`

create table t.fuzz_stats (op text primary key, attempted int default 0, succeeded int default 0);

-- Was the trip active at moment p_at?  Reconstructed from the close/reopen log.
create function t.trip_active_at(p_trip uuid, p_at timestamptz) returns boolean
language sql stable as $$
  select coalesce((select action = 'trip_reopened' from public.trip_leader_log
                    where trip_id = p_trip and action in ('trip_closed','trip_reopened')
                      and created_at <= p_at
                    order by created_at desc, id desc limit 1), true);
$$;

create function t.check_invariants(g uuid) returns void
language plpgsql as $$
declare bad int; r record;
begin
  -- I1: every group nets to exactly zero.
  select count(*) into bad from (select group_id from public.v_user_net
                                  group by group_id having sum(net_poisha) <> 0) x;
  perform t.assert_eq(bad, 0, 'I1: group nets to zero');

  -- I2: every entry traces to a real expense or an APPROVED proposal.
  select count(*) into bad from public.ledger_entries le
  where (le.source_type = 'expense'
         and not exists (select 1 from public.expenses e where e.id = le.source_id))
     or (le.source_type = 'proposal'
         and not exists (select 1 from public.proposals p
                         where p.id = le.source_id and p.status = 'approved'));
  perform t.assert_eq(bad, 0, 'I2: no orphan or unapproved-source entries');

  -- I3: exactly one set of entries per approved proposal; none for any other.
  select count(*) into bad from public.proposals p
  where (select count(*) from public.ledger_entries le
          where le.source_type = 'proposal' and le.source_id = p.id)
        <> case when p.status <> 'approved' then 0
                when p.type = 'transfer' then 3
                when p.type in ('settlement', 'amendment') then 1
                when p.type = 'void' then 0 end;
  perform t.assert_eq(bad, 0, 'I3: approved exactly once, entries match type');

  -- I7: every trip nets to zero; trip-tagged + untagged = group, per user.
  select count(*) into bad from (select trip_id from public.v_trip_net
                                  group by trip_id having sum(net_poisha) <> 0) x;
  perform t.assert_eq(bad, 0, 'I7: every trip nets to zero');
  select count(*) into bad from public.v_user_net u
  where u.group_id = g
    and u.net_poisha <> coalesce((select sum(net_poisha) from public.v_trip_net tn
                                   where tn.group_id = g and tn.user_id = u.user_id), 0)
                      + coalesce((select sum(case when le.to_user = u.user_id then le.amount_poisha
                                                  else -le.amount_poisha end)
                                    from public.ledger_entries le
                                   where le.group_id = g and le.trip_id is null
                                     and u.user_id in (le.from_user, le.to_user)), 0);
  perform t.assert_eq(bad, 0, 'I7: trip scoping never creates or destroys value');

  -- I8: a voided expense contributes zero to every pair; a live one has no
  -- reversals; nothing is voided twice (entry count is exactly 1× or 2×).
  select count(*) into bad from public.expenses e
  where (select count(*) from public.ledger_entries le where le.source_type = 'expense' and le.source_id = e.id)
        <> (select count(*) from public.expense_shares s
             where s.expense_id = e.id and s.share_poisha > 0 and s.user_id <> e.payer_id)
           * case when e.voided_at is null then 1 else 2 end;
  perform t.assert_eq(bad, 0, 'I8: entry count is 1× live / 2× voided — never voided twice');
  select count(*) into bad from (
    select le.source_id, least(le.from_user, le.to_user), greatest(le.from_user, le.to_user)
    from public.ledger_entries le join public.expenses e on e.id = le.source_id
    where le.source_type = 'expense' and e.voided_at is not null
    group by 1, 2, 3
    having sum(case when le.from_user < le.to_user then le.amount_poisha else -le.amount_poisha end) <> 0) x;
  perform t.assert_eq(bad, 0, 'I8: voided expenses net to zero per pair');

  -- I9: every leader-originated write came from a leader of an ACTIVE trip at
  -- that moment.  Two kinds exist: leader-recorded settlements and direct voids.
  select count(*) into bad from public.proposals p
  where (p.payload ->> 'leader_recorded')::boolean
    and not (public.was_trip_leader_at((p.payload ->> 'trip_id')::uuid, p.proposer_id, p.created_at)
             and t.trip_active_at((p.payload ->> 'trip_id')::uuid, p.created_at));
  perform t.assert_eq(bad, 0, 'I9: leader settlements only by an active-trip leader');
  select count(*) into bad from public.expenses e
  where e.voided_at is not null
    and not exists (select 1 from public.proposals vp where vp.type = 'void' and vp.status = 'approved'
                     and (vp.payload ->> 'expense_id')::uuid = e.id)
    and not (e.trip_id is not null
             and public.was_trip_leader_at(e.trip_id, e.voided_by, e.voided_at)
             and t.trip_active_at(e.trip_id, e.voided_at));
  perform t.assert_eq(bad, 0, 'I9: direct voids only by an active-trip leader');

  -- I10: every leader row has a matching appointment as its latest log state;
  -- no trip is ever leaderless.
  select count(*) into bad from public.trip_leaders l
  where not public.was_trip_leader_at(l.trip_id, l.user_id, clock_timestamp());
  perform t.assert_eq(bad, 0, 'I10: every trip_leaders row matches the log');
  select count(*) into bad from public.trips tr
  where not exists (select 1 from public.trip_leaders l where l.trip_id = tr.id);
  perform t.assert_eq(bad, 0, 'I10: no trip is leaderless');
end $$;

-- Pairwise snapshot of a group, for the I4/I5 transfer checks.
create function t.pairs(g uuid, users uuid[]) returns jsonb language sql as $$
  select jsonb_object_agg(a::text || '>' || b::text, public.net_owed_raw(g, a, b))
  from unnest(users) a, unnest(users) b where a < b;
$$;
create function t.nets(g uuid) returns jsonb language sql as $$
  select coalesce(jsonb_object_agg(user_id, net_poisha), '{}') from public.v_user_net where group_id = g;
$$;

create function t.rnd(n int) returns int language sql volatile as $$ select floor(random() * n)::int $$;
create function t.pick(a uuid[]) returns uuid language sql volatile as
  $$ select a[1 + floor(random() * array_length(a, 1))::int] $$;

-- 80% of the time act as a current leader of the trip (if any), otherwise as
-- the random actor — so both the authorised and the refused paths get exercised.
create function t.as_leader(p_trip uuid, p_fallback uuid) returns uuid language sql volatile as $$
  select coalesce(case when random() < 0.8 then
                    (select user_id from public.trip_leaders where trip_id = p_trip order by random() limit 1)
                  end, p_fallback);
$$;

create function t.fuzz_step(g uuid, users uuid[], trips uuid[]) returns void
language plpgsql as $$
declare
  roll int := t.rnd(100); v_op text; actor uuid := t.pick(users);
  a uuid; b uuid; c uuid; amt bigint; tr uuid; p record; e record; r text;
  shares jsonb; subset uuid[]; n int; base bigint; rem bigint; i int;
  before_pairs jsonb; after_pairs jsonb; before_nets jsonb; k text; delta bigint;
begin
  perform t.login(actor);
  v_op := case when roll < 28 then 'add_expense' when roll < 40 then 'transfer'
             when roll < 49 then 'settlement'  when roll < 54 then 'amendment'
             when roll < 59 then 'propose_void' when roll < 80 then 'respond'
             when roll < 83 then 'cancel'      when roll < 85 then 'expire'
             when roll < 89 then 'leader_void' when roll < 93 then 'leader_settle'
             when roll < 96 then 'leader_admin' else 'trip_state' end;
  insert into t.fuzz_stats (op, attempted) values (v_op, 1)
    on conflict (op) do update set attempted = t.fuzz_stats.attempted + 1;

  begin
    if v_op = 'add_expense' then
      -- random subset of 2..7, equal split via largest remainder (sorted ids)
      select array_agg(u order by u) into subset
        from (select u from unnest(users) u order by random() limit 2 + t.rnd(6)) s;
      amt := 1 + t.rnd(200000);
      n := array_length(subset, 1); base := amt / n; rem := amt - base * n;
      select jsonb_agg(jsonb_build_object('user_id', subset[gs.k], 'share', base + case when gs.k <= rem then 1 else 0 end))
        into shares from generate_series(1, n) gs(k);
      tr := case when t.rnd(2) = 0 then null else t.pick(trips) end;
      perform public.add_expense(g, t.pick(subset), amt, 'fuzz', shares, tr);

    elsif v_op = 'transfer' then
      -- Mostly aim at feasible transfers (both legs positive), sometimes not.
      b := actor;
      select u into a from unnest(users) u where public.net_owed_raw(g, u, b) > 0 order by random() limit 1;
      select u into c from unnest(users) u where public.net_owed_raw(g, b, u) > 0 and u is distinct from a
       order by random() limit 1;
      if a is null or c is null or t.rnd(5) = 0 then a := t.pick(users); c := t.pick(users); end if;
      amt := least(public.net_owed_raw(g, a, b), public.net_owed_raw(g, b, c));
      if amt > 0 then amt := 1 + t.rnd(amt::int); else amt := 1 + t.rnd(1000); end if;
      perform public.propose_transfer(g, a, b, c, amt);

    elsif v_op = 'settlement' then
      a := actor;
      select u into b from unnest(users) u where public.net_owed_raw(g, a, u) > 0 order by random() limit 1;
      if b is null or t.rnd(5) = 0 then b := t.pick(users); end if;
      amt := greatest(public.net_owed_raw(g, a, b), 1);
      perform public.propose_settlement(g, a, b, 1 + t.rnd(amt::int + 50));

    elsif v_op = 'amendment' then
      perform public.propose_amendment(g, actor, t.pick(users), 1 + t.rnd(5000),
                                       case when t.rnd(2) = 0 then 'increase' else 'decrease' end);

    elsif v_op = 'propose_void' then
      select id into e from public.expenses where group_id = g and voided_at is null order by random() limit 1;
      if found then perform public.propose_void(e.id, 'fuzz void'); else raise exception 'NOOP'; end if;

    elsif v_op = 'respond' then
      select pp.proposal_id, pp.user_id, pr.type, pr.payload into p
        from public.proposal_participants pp join public.proposals pr on pr.id = pp.proposal_id
       where pr.group_id = g and pr.status = 'pending' and pp.decision = 'pending'
       order by random() limit 1;
      if found then
        perform t.login(p.user_id);
        before_pairs := t.pairs(g, users); before_nets := t.nets(g);
        r := public.respond_to_proposal(p.proposal_id, t.rnd(10) < 8);
        if r = 'approved' and p.type = 'transfer' then
          -- I4: exactly three pairs changed, each by exactly the amount; no
          -- net position moved.  I5: neither leg crossed zero.
          after_pairs := t.pairs(g, users); amt := (p.payload ->> 'amount')::bigint;
          a := (p.payload ->> 'debtor')::uuid; b := (p.payload ->> 'intermediary')::uuid; c := (p.payload ->> 'creditor')::uuid;
          n := 0;
          for k in select jsonb_object_keys(after_pairs) loop
            delta := (after_pairs ->> k)::bigint - (before_pairs ->> k)::bigint;
            if delta <> 0 then
              n := n + 1;
              perform t.assert(abs(delta) = amt, 'I4: a changed pair moved by exactly the transfer amount');
            end if;
          end loop;
          perform t.assert_eq(n, 3, 'I4: exactly three pairwise balances changed');
          perform t.assert_eq(t.nets(g), before_nets, 'I4: no net position moved');
          perform t.assert(public.net_owed_raw(g, a, b) >= 0 and public.net_owed_raw(g, b, c) >= 0,
                           'I5: no transfer leg crossed zero');
        end if;
      else raise exception 'NOOP';
      end if;

    elsif v_op = 'cancel' then
      select id, proposer_id into p from public.proposals
       where group_id = g and status = 'pending' order by random() limit 1;
      if found then perform t.login(p.proposer_id); perform public.cancel_proposal(p.id);
      else raise exception 'NOOP'; end if;

    elsif v_op = 'expire' then
      update public.proposals set expires_at = now() - interval '1 second'
       where id = (select id from public.proposals where group_id = g and status = 'pending'
                   order by random() limit 1);
      if t.rnd(2) = 0 then perform public.expire_stale_proposals(); end if;

    elsif v_op = 'leader_void' then
      perform t.login(t.as_leader(t.pick(trips), actor));
      select id into e from public.expenses where group_id = g and trip_id is not null and voided_at is null
       order by random() limit 1;
      if found then perform public.void_expense(e.id, 'fuzz leader void'); else raise exception 'NOOP'; end if;

    elsif v_op = 'leader_settle' then
      tr := t.pick(trips);
      perform t.login(t.as_leader(tr, actor));
      select x, y into a, b from unnest(users) x, unnest(users) y
       where public.trip_net_owed_raw(tr, x, y) > 0 order by random() limit 1;
      if a is null or t.rnd(5) = 0 then a := t.pick(users); b := t.pick(users); end if;
      amt := greatest(public.trip_net_owed_raw(tr, a, b), 1);
      perform public.leader_record_settlement(tr, a, b, 1 + t.rnd(amt::int + 20));

    elsif v_op = 'leader_admin' then
      tr := t.pick(trips);
      perform t.login(t.as_leader(tr, actor));
      if t.rnd(2) = 0 then perform public.add_trip_leader(tr, t.pick(users));
      else perform public.remove_trip_leader(tr, t.pick(users)); end if;

    elsif v_op = 'trip_state' then
      tr := t.pick(trips);
      if (select status from public.trips where id = tr) = 'active' then perform public.close_trip(tr);
      else perform public.reopen_trip(tr); end if;
    end if;

    update t.fuzz_stats set succeeded = succeeded + 1 where t.fuzz_stats.op = v_op;
  exception when others then
    -- An invariant assertion is a real failure; a domain refusal is expected.
    if sqlerrm like 'ASSERTION FAILED%' then raise; end if;
  end;

  perform t.check_invariants(g);
end $$;

create procedure t.fuzz(p_ops int) language plpgsql as $$
declare g uuid; code text; users uuid[] := '{}'; trips uuid[] := '{}'; i int; u uuid; a uuid; b uuid; total bigint;
begin
  -- The H-06 cap (tested in 02) would throttle the fuzz to ~70 proposals.
  perform set_config('hishebnama.proposal_rate_limit', '1000000', false);
  for i in 1..7 loop users := users || t.new_user('Fuzz' || i); end loop;
  perform t.login(users[1]);
  g := public.create_group('Fuzz group');
  select invite_code into code from public.groups where id = g;
  for i in 2..7 loop perform t.login(users[i]); perform public.join_group(code); end loop;
  perform t.login(users[1]);
  trips := trips || public.create_trip(g, 'Fuzz trip A', users[1:5], array[users[2]], 'open');
  trips := trips || public.create_trip(g, 'Fuzz trip B', users[3:7], array[users[4]]);
  commit;

  for i in 1..p_ops loop
    perform t.fuzz_step(g, users, trips);
    commit;

    -- I6 sample every 20 operations: the derivation equals the balance, both
    -- group-wide and trip-scoped.
    if i % 20 = 0 then
      a := t.pick(users); b := t.pick(users);
      if a <> b then
        perform t.login(a);
        total := coalesce((select running_poisha from public.explain_balance(g, b)
                            order by occurred_at desc, entry_id desc limit 1), 0);
        perform t.assert_eq(total, public.net_owed_raw(g, b, a), 'I6: derivation equals net_owed');
        total := coalesce((select running_poisha from public.explain_balance(g, b, trips[1])
                            order by occurred_at desc, entry_id desc limit 1), 0);
        perform t.assert_eq(total, public.trip_net_owed_raw(trips[1], b, a), 'I6: trip-scoped derivation equals trip balance');
      end if;
    end if;
  end loop;
end $$;

call t.fuzz(:fuzz_ops);

do $$
declare r record; s text := '';
begin
  for r in select * from t.fuzz_stats order by op loop
    s := s || format(E'\n     %-14s %5s attempted %5s succeeded', r.op, r.attempted, r.succeeded);
  end loop;
  raise notice 'fuzz operations:%', s;
  perform t.assert((select sum(succeeded) from t.fuzz_stats) > 0, 'fuzz made progress');
  perform t.assert((select count(*) from public.proposals where status = 'approved' and type = 'transfer') > 0,
                   'fuzz exercised committed transfers');
  perform t.assert((select count(*) from public.proposals where status = 'invalidated') > 0,
                   'fuzz exercised invalidation');
  raise notice '  ok  — FUZZ: invariants I1–I10 held after every operation (% ops, % entries)',
    (select sum(attempted) from t.fuzz_stats), (select count(*) from public.ledger_entries);
end $$;
