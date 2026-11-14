-- ═══════════════════════════════════════════════════════════════════════════
-- DEVELOPMENT_PLAN.md §14.1 — fuzz test over the ledger invariants.
--
-- Several thousand random operations (add expense, propose, approve, reject,
-- cancel, expire, settle, void) across one group of 7 simulated users,
-- asserting invariants after EVERY operation.
--
-- Each operation commits in its own transaction (a procedure with COMMIT), so
-- now() differs per operation exactly as it would between real requests.
-- Expected domain errors (insufficient balance, not involved, ...) are part of
-- the fuzz: the attempt is made, refused, and invariants must still hold.
-- ═══════════════════════════════════════════════════════════════════════════

\set fuzz_ops `echo "${FUZZ_OPS:-3000}"`

create table t.fuzz_stats (op text primary key, attempted int default 0, succeeded int default 0);

create function t.check_invariants(g uuid) returns void
language plpgsql as $$
declare bad int;
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

  -- Every voided expense was voided by an approved void proposal — there is
  -- no other path.
  select count(*) into bad from public.expenses e
  where e.voided_at is not null
    and not exists (select 1 from public.proposals vp where vp.type = 'void' and vp.status = 'approved'
                     and (vp.payload ->> 'expense_id')::uuid = e.id);
  perform t.assert_eq(bad, 0, 'voids happen only by agreement');
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

create function t.fuzz_step(g uuid, users uuid[]) returns void
language plpgsql as $$
declare
  roll int := t.rnd(100); v_op text; actor uuid := t.pick(users);
  a uuid; b uuid; c uuid; amt bigint; p record; e record; r text;
  shares jsonb; subset uuid[]; n int; base bigint; rem bigint;
  before_pairs jsonb; after_pairs jsonb; before_nets jsonb; k text; delta bigint;
begin
  perform t.login(actor);
  v_op := case when roll < 30 then 'add_expense' when roll < 45 then 'transfer'
             when roll < 56 then 'settlement'  when roll < 62 then 'amendment'
             when roll < 68 then 'propose_void' when roll < 92 then 'respond'
             when roll < 96 then 'cancel'      else 'expire' end;
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
      perform public.add_expense(g, t.pick(subset), amt, 'fuzz', shares);

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
    end if;

    update t.fuzz_stats set succeeded = succeeded + 1 where t.fuzz_stats.op = v_op;
  exception when others then
    -- An invariant assertion is a real failure; a domain refusal is expected.
    if sqlerrm like 'ASSERTION FAILED%' then raise; end if;
  end;

  perform t.check_invariants(g);
end $$;

create procedure t.fuzz(p_ops int) language plpgsql as $$
declare g uuid; code text; users uuid[] := '{}'; i int; a uuid; b uuid; total bigint;
begin
  -- The H-06 cap (tested in 02) would throttle the fuzz to ~70 proposals.
  perform set_config('hishebnama.proposal_rate_limit', '1000000', false);
  for i in 1..7 loop users := users || t.new_user('Fuzz' || i); end loop;
  perform t.login(users[1]);
  g := public.create_group('Fuzz group');
  select invite_code into code from public.groups where id = g;
  for i in 2..7 loop perform t.login(users[i]); perform public.join_group(code); end loop;
  commit;

  for i in 1..p_ops loop
    perform t.fuzz_step(g, users);
    commit;

    -- I6 sample every 20 operations: the derivation equals the balance.
    if i % 20 = 0 then
      a := t.pick(users); b := t.pick(users);
      if a <> b then
        perform t.login(a);
        total := coalesce((select running_poisha from public.explain_balance(g, b)
                            order by occurred_at desc, entry_id desc limit 1), 0);
        perform t.assert_eq(total, public.net_owed_raw(g, b, a), 'I6: derivation equals net_owed');
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
  raise notice '  ok  — FUZZ: invariants held after every operation (% ops, % entries)',
    (select sum(attempted) from t.fuzz_stats), (select count(*) from public.ledger_entries);
end $$;
