-- Shared fixture.  Named ids live in t.ids so later suites can refer to them.
--
-- The Section 9.1 worked example, with names from USER_STORIES personas:
--   Sami (Z) owes Arif (X) ৳30;  Arif (X) owes Rafi (Y) ৳20.
create table t.ids (name text primary key, id uuid not null);
grant select on t.ids to authenticated;
create function t.id(p text) returns uuid language sql stable as
  $$ select id from t.ids where name = p $$;
grant execute on function t.id(text) to authenticated;

do $$
declare
  arif uuid := t.new_user('Arif');   sami  uuid := t.new_user('Sami');
  rafi uuid := t.new_user('Rafi');   nadia uuid := t.new_user('Nadia');
  tania uuid := t.new_user('Tania'); nabil uuid := t.new_user('Nabil');
  outsider uuid := t.new_user('Outsider');
  g1 uuid; g2 uuid; code text; trip1 uuid; trip2 uuid; e uuid;
begin
  insert into t.ids values ('arif', arif), ('sami', sami), ('rafi', rafi),
    ('nadia', nadia), ('tania', tania), ('nabil', nabil), ('outsider', outsider);

  perform t.assert_eq((select count(*) from public.profiles)::int, 7,
                      'A-01: one profile per signed-up user');

  perform t.login(arif);
  g1 := public.create_group('Hall 3 Friends');
  select invite_code into code from public.groups where id = g1;
  foreach e in array array[sami, rafi, nadia, tania, nabil] loop
    perform t.login(e);
    perform public.join_group(code);
  end loop;

  perform t.login(outsider);
  g2 := public.create_group('Other Group');

  insert into t.ids values ('g1', g1), ('g2', g2);

  -- Sami owes Arif ৳30
  perform t.login(arif);
  e := public.add_expense(g1, arif, 3000, 'Lunch',
         jsonb_build_array(jsonb_build_object('user_id', sami, 'share', 3000)));
  insert into t.ids values ('e_sami_arif', e);

  -- Arif owes Rafi ৳20
  perform t.login(rafi);
  e := public.add_expense(g1, rafi, 2000, 'Tea',
         jsonb_build_array(jsonb_build_object('user_id', arif, 'share', 2000)));
  insert into t.ids values ('e_arif_rafi', e);

  -- A trip in g1 led by Arif and Tania
  perform t.login(arif);
  trip1 := public.create_trip(g1, 'Sylhet Tour', array[sami, nadia, tania], array[tania]);
  insert into t.ids values ('trip1', trip1);
end $$;

-- g2 needs a second member so a valid foreign trip and foreign expense exist.
do $$
declare foreign_user uuid := t.new_user('Foreigner'); code text; trip2 uuid; e uuid;
begin
  insert into t.ids values ('foreigner', foreign_user);
  select invite_code into code from public.groups where id = t.id('g2');
  perform t.login(foreign_user);
  perform public.join_group(code);

  perform t.login(t.id('outsider'));
  trip2 := public.create_trip(t.id('g2'), 'Elsewhere', array[foreign_user]);
  insert into t.ids values ('trip2', trip2);
  e := public.add_expense(t.id('g2'), t.id('outsider'), 5000, 'Foreign dinner',
         jsonb_build_array(jsonb_build_object('user_id', foreign_user, 'share', 5000)));
  insert into t.ids values ('e_foreign', e);
end $$;

select t.ok('fixture built');
