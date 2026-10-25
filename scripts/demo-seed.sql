-- Demo data for `npm run demo` — the LOCAL DEMO DATABASE ONLY.
-- Never run this against a real project.
--
-- Everything financial goes through the real RPCs (create_group, add_expense,
-- propose_*, respond_to_proposal, void_expense, …) as the right user, so every
-- balance, approval and leader action is exactly what the app would produce.
-- The one exception is demo.ago(): to make the history span a few weeks, it
-- moves every timestamp written so far back in time, uniformly, with triggers
-- off.  Order between rows never changes.
--
-- Statements run one per transaction (psql autocommit), so each step gets its
-- own now().

set client_min_messages = warning;
create schema demo;
create table demo.ids (key text primary key, id uuid);

create function demo.u(p_name text) returns uuid language sql stable as
$$ select id from public.profiles where display_name = p_name $$;

create function demo.id(p_key text) returns uuid language sql stable as
$$ select id from demo.ids where key = p_key $$;

create function demo.keep(p_key text, p_id uuid) returns void language sql as
$$ insert into demo.ids values (p_key, p_id) on conflict (key) do update set id = excluded.id $$;

create function demo.act(p_name text) returns void language sql as
$$ select t.login(demo.u(p_name)) $$;

create function demo.ago(p interval) returns void language plpgsql as $$
begin
  perform set_config('session_replication_role', 'replica', true);
  update public.profiles              set created_at   = created_at - p;
  update public.groups                set created_at   = created_at - p;
  update public.group_members         set joined_at    = joined_at - p;
  update public.trips                 set created_at   = created_at - p;
  update public.trip_leaders          set appointed_at = appointed_at - p;
  update public.trip_leader_log       set created_at   = created_at - p;
  update public.expenses              set created_at   = created_at - p, voided_at = voided_at - p;
  update public.entry_disputes        set created_at   = created_at - p;
  update public.ledger_entries        set created_at   = created_at - p;
  update public.proposals             set created_at   = created_at - p, expires_at = expires_at - p,
                                          resolved_at  = resolved_at - p;
  update public.proposal_participants set decided_at   = decided_at - p;
end $$;

create function demo.new_group(p_key text, p_owner text, p_name text, p_members text[]) returns void
language plpgsql as $$
declare g uuid; c text; m text;
begin
  perform demo.act(p_owner);
  g := public.create_group(p_name);
  perform demo.keep(p_key, g);
  select invite_code into c from public.groups where id = g;
  foreach m in array p_members loop
    perform demo.act(m);
    perform public.join_group(c);
  end loop;
end $$;

-- Equal split, remainder poisha in the same fixed order as src/lib/money.ts.
create function demo.spend(p_group text, p_actor text, p_payer text, p_taka numeric, p_desc text,
                           p_people text[], p_trip text default null) returns uuid
language plpgsql as $$
declare
  total  bigint := round(p_taka * 100);
  n      int := array_length(p_people, 1);
  base   bigint := total / n;
  r      bigint := total - (total / n) * n;
  shares jsonb := '[]';
  rec    record;
  i      int := 0;
begin
  for rec in select demo.u(x) as id from unnest(p_people) x order by demo.u(x)::text collate "C" loop
    shares := shares || jsonb_build_object('user_id', rec.id, 'share', base + case when i < r then 1 else 0 end);
    i := i + 1;
  end loop;
  perform demo.act(p_actor);
  return public.add_expense(demo.id(p_group), demo.u(p_payer), total, p_desc, shares, demo.id(p_trip));
end $$;

-- Itemised split: {"Name": taka, ...}.  The total is the sum of the shares.
create function demo.spend_by(p_group text, p_actor text, p_payer text, p_desc text,
                              p_items jsonb, p_trip text default null) returns uuid
language plpgsql as $$
declare shares jsonb := '[]'; total bigint := 0; k text; v numeric;
begin
  for k, v in select key, value::numeric from jsonb_each_text(p_items) loop
    shares := shares || jsonb_build_object('user_id', demo.u(k), 'share', round(v * 100));
    total := total + round(v * 100);
  end loop;
  perform demo.act(p_actor);
  return public.add_expense(demo.id(p_group), demo.u(p_payer), total, p_desc, shares, demo.id(p_trip));
end $$;

-- A settlement for a share of what is currently owed, in whole taka.
create function demo.settle(p_group text, p_actor text, p_debtor text, p_creditor text,
                            p_fraction numeric, p_note text) returns uuid
language plpgsql as $$
declare owed bigint := public.net_owed_raw(demo.id(p_group), demo.u(p_debtor), demo.u(p_creditor)); amt bigint;
begin
  amt := case when p_fraction >= 1 then owed else (floor(owed * p_fraction / 100) * 100)::bigint end;
  if amt <= 0 then raise notice 'demo: no debt % -> %, settlement skipped', p_debtor, p_creditor; return null; end if;
  perform demo.act(p_actor);
  return public.propose_settlement(demo.id(p_group), demo.u(p_debtor), demo.u(p_creditor), amt, p_note);
end $$;

-- The best transfer available to an intermediary: the pair that frees the most.
create function demo.best_transfer(p_group text, p_intermediary text, p_note text) returns uuid
language plpgsql as $$
declare
  g uuid := demo.id(p_group); me uuid := demo.u(p_intermediary);
  best_d uuid; best_c uuid; best bigint := 0; rec record;
begin
  for rec in
    select d.user_id as d, c.user_id as c,
           least(public.net_owed_raw(g, d.user_id, me), public.net_owed_raw(g, me, c.user_id)) as amt
    from public.group_members d, public.group_members c
    where d.group_id = g and c.group_id = g and d.user_id <> me and c.user_id <> me and d.user_id <> c.user_id
  loop
    if rec.amt > best then best := rec.amt; best_d := rec.d; best_c := rec.c; end if;
  end loop;
  if best <= 0 then raise notice 'demo: no transfer possible for %', p_intermediary; return null; end if;
  perform demo.act(p_intermediary);
  return public.propose_transfer(g, best_d, me, best_c, (floor(best / 100) * 100)::bigint, p_note);
end $$;

create function demo.respond(p_proposal uuid, p_name text, p_approve boolean) returns void
language plpgsql as $$
begin
  if p_proposal is null then return; end if;
  perform demo.act(p_name);
  perform public.respond_to_proposal(p_proposal, p_approve);
end $$;

create function demo.trip(p_key text, p_group text, p_actor text, p_name text, p_members text[],
                          p_leaders text[], p_mode text) returns void
language plpgsql as $$
begin
  perform demo.act(p_actor);
  perform demo.keep(p_key, public.create_trip(
    demo.id(p_group), p_name,
    (select array_agg(demo.u(x)) from unnest(p_members) x),
    coalesce((select array_agg(demo.u(x)) from unnest(p_leaders) x), '{}'),
    p_mode));
end $$;

-- ── people ──────────────────────────────────────────────────────────────
select t.new_user('Arif');
select t.new_user('Sami');
select t.new_user('Rafi');
select t.new_user('Nadia');
select t.new_user('Imran');
select t.new_user('Mitu');
select t.new_user('Joya');
select t.new_user('Tania');   -- in no group: try the empty state and joining by invite link

-- ── five weeks ago: groups ──────────────────────────────────────────────
select demo.new_group('hall3', 'Arif', 'Hall 3 Friends', array['Sami', 'Rafi', 'Nadia', 'Imran']);
select demo.ago('2 hours');
select demo.new_group('flat', 'Nadia', 'Flat 4B', array['Mitu', 'Joya', 'Arif']);
select demo.new_group('office', 'Imran', 'Office Lunch', array['Arif', 'Sami', 'Joya', 'Mitu']);
select demo.new_group('badminton', 'Sami', 'Badminton Club', array['Rafi', 'Imran', 'Mitu']);
select demo.ago('1 day');

select demo.spend('flat', 'Nadia', 'Nadia', 36000, 'June rent', array['Nadia', 'Mitu', 'Joya', 'Arif']);
select demo.ago('3 hours');
select demo.spend('flat', 'Mitu', 'Mitu', 1200, 'Internet bill', array['Nadia', 'Mitu', 'Joya', 'Arif']);
select demo.ago('1 day');
select demo.spend('hall3', 'Arif', 'Arif', 1200, 'Dinner at Star Kabab', array['Arif', 'Sami', 'Rafi']);
select demo.ago('5 hours');
select demo.spend('hall3', 'Sami', 'Sami', 1600, 'Movie tickets', array['Arif', 'Sami', 'Nadia', 'Imran']);
select demo.ago('1 day 2 hours');

-- Sylhet weekend: a trip that is already closed (anyone could add).
select demo.trip('sylhet', 'hall3', 'Rafi', 'Sylhet Weekend', array['Arif', 'Sami', 'Rafi', 'Imran'], array['Sami'], 'open');
select demo.ago('3 hours');
select demo.spend('hall3', 'Rafi', 'Rafi', 2800, 'Train tickets', array['Arif', 'Sami', 'Rafi', 'Imran'], 'sylhet');
select demo.ago('4 hours');
select demo.spend('hall3', 'Sami', 'Sami', 6000, 'Hotel Rose View', array['Arif', 'Sami', 'Rafi', 'Imran'], 'sylhet');
select demo.ago('5 hours');
select demo.spend('hall3', 'Imran', 'Imran', 1200, 'Tea garden tour', array['Arif', 'Sami', 'Rafi', 'Imran'], 'sylhet');
select demo.ago('3 hours');
select demo.spend_by('hall3', 'Arif', 'Arif', 'Dinner at Panshi', '{"Arif": 520, "Sami": 410, "Rafi": 450, "Imran": 470}', 'sylhet');
select demo.ago('1 day');
select demo.act('Rafi');
select public.close_trip(demo.id('sylhet'));
select demo.ago('2 days');

select demo.spend('office', 'Imran', 'Imran', 1500, 'Biryani Friday', array['Imran', 'Arif', 'Sami', 'Joya', 'Mitu']);
select demo.ago('1 day');
select demo.spend('office', 'Joya', 'Joya', 650, 'Coffee run', array['Joya', 'Arif', 'Mitu']);
select demo.ago('2 days');
select demo.spend('badminton', 'Sami', 'Sami', 2000, 'Court booking, week 1', array['Sami', 'Rafi', 'Imran', 'Mitu']);
select demo.ago('4 hours');
select demo.spend('badminton', 'Rafi', 'Rafi', 1100, 'Shuttlecocks', array['Sami', 'Rafi', 'Imran', 'Mitu']);
select demo.ago('1 day');

-- Rafi pays Arif back; Arif confirms.
select demo.keep('r1', demo.settle('hall3', 'Rafi', 'Rafi', 'Arif', 1, 'Paid in cash'));
select demo.ago('3 hours');
select demo.respond(demo.id('r1'), 'Arif', true);
select demo.ago('2 days');

-- ── three weeks ago ─────────────────────────────────────────────────────
select demo.spend_by('flat', 'Joya', 'Joya', 'Groceries, Shwapno', '{"Nadia": 1020, "Mitu": 860, "Joya": 900, "Arif": 700}');
select demo.ago('6 hours');
select demo.spend('flat', 'Nadia', 'Nadia', 2240, 'Electricity bill', array['Nadia', 'Mitu', 'Joya', 'Arif']);
select demo.ago('1 day');
select demo.spend('flat', 'Arif', 'Arif', 1450, 'Gas cylinder', array['Nadia', 'Mitu', 'Joya', 'Arif']);
select demo.ago('1 day');

-- Arif asks for a correction; Nadia declines.
select demo.act('Arif');
select demo.keep('r3', public.propose_amendment(demo.id('flat'), demo.u('Arif'), demo.u('Nadia'), 20000, 'decrease',
                                                'I was away for a week of the internet bill'));
select demo.ago('5 hours');
select demo.respond(demo.id('r3'), 'Nadia', false);
select demo.ago('1 day');

select demo.spend('hall3', 'Imran', 'Imran', 360, 'Late-night chotpoti', array['Imran', 'Sami', 'Nadia', 'Rafi']);
select demo.ago('1 day');
select demo.spend('hall3', 'Sami', 'Sami', 1800, 'Birthday cake for Nadia', array['Arif', 'Sami', 'Rafi', 'Imran']);
select demo.ago('1 day');
select demo.spend('hall3', 'Nadia', 'Nadia', 480, 'Fuchka at TSC', array['Nadia', 'Arif', 'Sami', 'Rafi']);
select demo.ago('7 hours');
select demo.spend('flat', 'Joya', 'Joya', 2600, 'Water filter service', array['Nadia', 'Mitu', 'Joya', 'Arif']);
select demo.ago('1 day');

-- Joya hands Arif's coffee debt to Imran; both agree.
select demo.act('Joya');
select demo.keep('r2', public.propose_transfer(demo.id('office'), demo.u('Arif'), demo.u('Joya'), demo.u('Imran'), 20000,
                                               'Saves us a payment each'));
select demo.ago('2 hours');
select demo.respond(demo.id('r2'), 'Arif', true);
select demo.ago('1 hour');
select demo.respond(demo.id('r2'), 'Imran', true);
select demo.ago('2 days');

-- ── two weeks ago ───────────────────────────────────────────────────────
select demo.spend_by('office', 'Arif', 'Arif', 'Kacchi at Sultan''s Dine', '{"Arif": 550, "Sami": 600, "Joya": 500, "Mitu": 550, "Imran": 550}');
select demo.ago('3 hours');
select demo.spend('office', 'Sami', 'Sami', 1800, 'Thai lunch', array['Sami', 'Arif', 'Imran']);
select demo.ago('10 minutes');
select demo.keep('thai2', demo.spend('office', 'Sami', 'Sami', 1800, 'Thai lunch', array['Sami', 'Arif', 'Imran']));
select demo.ago('2 hours');
-- The duplicate is cancelled by agreement.
select demo.act('Sami');
select demo.keep('r4', public.propose_void(demo.id('thai2'), 'Added twice by mistake'));
select demo.ago('1 hour');
select demo.respond(demo.id('r4'), 'Arif', true);
select demo.ago('30 minutes');
select demo.respond(demo.id('r4'), 'Imran', true);
select demo.ago('1 day');

select demo.spend('badminton', 'Imran', 'Imran', 2000, 'Court booking, week 2', array['Sami', 'Rafi', 'Imran', 'Mitu']);
select demo.ago('1 day');
select demo.spend('badminton', 'Mitu', 'Mitu', 480, 'Energy drinks', array['Mitu', 'Rafi', 'Sami']);
select demo.ago('1 day');
select demo.spend('hall3', 'Rafi', 'Rafi', 1350, 'Pizza night', array['Arif', 'Sami', 'Rafi', 'Nadia', 'Imran']);
select demo.ago('9 hours');
select demo.spend('office', 'Mitu', 'Mitu', 960, 'Printing and binding', array['Mitu', 'Joya', 'Imran']);
select demo.ago('1 day');

-- Mitu starts a payment, then withdraws it.
select demo.keep('r5', demo.settle('badminton', 'Mitu', 'Mitu', 'Sami', 1, 'Sending now'));
select demo.ago('40 minutes');
select demo.act('Mitu');
select public.cancel_proposal(demo.id('r5'));
select demo.ago('3 hours');

-- Nadia pays Sami for the movie; Sami confirms.
select demo.keep('r6', demo.settle('hall3', 'Nadia', 'Nadia', 'Sami', 1, 'bKash sent'));
select demo.ago('2 hours');
select demo.respond(demo.id('r6'), 'Sami', true);
select demo.ago('3 days');

-- ── last week: Cox's Bazar, a trip still in progress ───────────────────
select demo.trip('cox', 'hall3', 'Arif', 'Cox''s Bazar Tour', array['Arif', 'Sami', 'Rafi', 'Nadia'], array['Rafi'], 'leaders_only');
select demo.ago('1 hour');
select demo.act('Arif');
select public.add_trip_leader(demo.id('cox'), demo.u('Nadia'));
select demo.ago('2 hours');
select demo.spend('hall3', 'Arif', 'Arif', 4800, 'Bus tickets, Green Line', array['Arif', 'Sami', 'Rafi', 'Nadia'], 'cox');
select demo.ago('6 hours');
select demo.spend('hall3', 'Rafi', 'Rafi', 9600, 'Hotel Sea Crown, 2 nights', array['Arif', 'Sami', 'Rafi', 'Nadia'], 'cox');
select demo.ago('3 hours');
select demo.act('Nadia');
select public.remove_trip_leader(demo.id('cox'), demo.u('Nadia'));
select demo.ago('2 hours');
select demo.spend_by('hall3', 'Arif', 'Arif', 'Seafood dinner', '{"Arif": 780, "Sami": 920, "Rafi": 860, "Nadia": 700}', 'cox');
select demo.ago('12 hours');
select demo.spend('hall3', 'Arif', 'Sami', 1100, 'Breakfast', array['Arif', 'Sami', 'Rafi', 'Nadia'], 'cox');
select demo.ago('3 hours');
select demo.keep('jetski', demo.spend('hall3', 'Rafi', 'Rafi', 2500, 'Jet ski', array['Rafi', 'Sami', 'Nadia'], 'cox'));
select demo.ago('2 hours');
select demo.spend('hall3', 'Rafi', 'Rafi', 400, 'Auto rickshaw to Himchari', array['Arif', 'Sami', 'Rafi', 'Nadia'], 'cox');
select demo.ago('4 hours');
-- A typo, voided by a leader and entered again.
select demo.keep('souv1', demo.spend('hall3', 'Arif', 'Nadia', 1500, 'Souvenirs', array['Nadia', 'Sami'], 'cox'));
select demo.ago('1 hour');
select demo.act('Arif');
select public.void_expense(demo.id('souv1'), 'Typed 1500, was 1050');
select demo.ago('5 minutes');
select demo.spend('hall3', 'Arif', 'Nadia', 1050, 'Souvenirs', array['Nadia', 'Sami'], 'cox');
select demo.ago('3 hours');
-- Nadia questions the jet ski: a flag, no balance change.
select demo.act('Nadia');
select public.raise_dispute(demo.id('jetski'), 'I only watched, I didn''t ride');
select demo.ago('6 hours');
select demo.spend('hall3', 'Rafi', 'Sami', 600, 'Beach chairs', array['Arif', 'Sami', 'Rafi', 'Nadia'], 'cox');
select demo.ago('1 day');
-- A leader records a repayment straight away, inside the trip.
select demo.act('Rafi');
select public.leader_record_settlement(
  demo.id('cox'), demo.u('Sami'), demo.u('Rafi'),
  greatest(100, (floor(public.trip_net_owed_raw(demo.id('cox'), demo.u('Sami'), demo.u('Rafi')) / 200) * 100)::bigint),
  'Paid cash at the hotel');
select demo.ago('1 day 4 hours');

-- ── yesterday and today ────────────────────────────────────────────────
select demo.spend('flat', 'Mitu', 'Mitu', 1600, 'Cleaning help', array['Nadia', 'Mitu', 'Joya', 'Arif']);
select demo.ago('8 hours');
select demo.spend_by('flat', 'Nadia', 'Nadia', 'Groceries, Meena Bazar', '{"Nadia": 640, "Mitu": 510, "Joya": 730, "Arif": 380}');
select demo.ago('4 hours');
select demo.spend('hall3', 'Arif', 'Arif', 750, 'Rickshaw and snacks', array['Arif', 'Rafi', 'Imran']);
select demo.ago('3 hours');
select demo.spend('hall3', 'Imran', 'Imran', 2400, 'Football turf', array['Imran', 'Arif', 'Rafi', 'Sami']);
select demo.ago('5 hours');
select demo.spend('badminton', 'Sami', 'Sami', 2000, 'Court booking, week 3', array['Sami', 'Rafi', 'Imran', 'Mitu']);
select demo.ago('3 hours');
select demo.spend('office', 'Imran', 'Imran', 400, 'Tea and singara', array['Imran', 'Joya', 'Mitu', 'Sami', 'Arif']);
select demo.ago('2 hours');
select demo.spend('badminton', 'Sami', 'Sami', 1150, 'Shuttlecocks (tube)', array['Sami', 'Rafi', 'Imran', 'Mitu']);
select demo.ago('20 minutes');
select demo.keep('shuttle2', demo.spend('badminton', 'Sami', 'Sami', 1150, 'Shuttlecocks (tube)', array['Sami', 'Rafi', 'Imran', 'Mitu']));
select demo.ago('1 hour');

-- Waiting in someone's Inbox right now.
select demo.act('Imran');
select public.propose_void(demo.id('shuttle2'), 'Sami added this twice');            -- Sami, Rafi, Mitu
select demo.ago('40 minutes');
select demo.best_transfer('hall3', 'Sami', 'One payment instead of two');            -- two of Hall 3
select demo.ago('35 minutes');
select demo.settle('flat', 'Mitu', 'Mitu', 'Nadia', 1, 'Sent by bKash');            -- Nadia
select demo.ago('30 minutes');
select demo.settle('office', 'Joya', 'Joya', 'Imran', 1, 'Cash on Thursday');      -- Imran
select demo.ago('25 minutes');
select demo.act('Nadia');
select public.propose_amendment(demo.id('flat'), demo.u('Joya'), demo.u('Nadia'), 15000, 'increase',
                                'Your share of the gas refill');                    -- Joya
select demo.ago('20 minutes');
select demo.settle('hall3', 'Nadia', 'Nadia', 'Arif', 0.5, 'Half now, rest after payday'); -- Arif
select demo.ago('15 minutes');

-- Trip dates follow the (shifted) activity.
select set_config('session_replication_role', 'replica', false);
update public.trips set started_on = created_at::date;
update public.trips tr set ended_on = (select max(l.created_at)::date from public.trip_leader_log l
                                       where l.trip_id = tr.id and l.action = 'trip_closed')
  where status = 'closed';
select set_config('session_replication_role', 'origin', false);
select t.login(null);

drop schema demo cascade;
