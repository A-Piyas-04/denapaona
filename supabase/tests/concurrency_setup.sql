-- Setup helpers for concurrency.sh.  Each builds a fresh, isolated scenario and
-- returns the ids the racers need as one JSON object.
create or replace function t.race_world(p_tag text) returns jsonb
language plpgsql as $$
declare arif uuid := t.new_user('Arif' || p_tag); sami uuid := t.new_user('Sami' || p_tag);
  rafi uuid := t.new_user('Rafi' || p_tag); tania uuid := t.new_user('Tania' || p_tag);
  nadia uuid := t.new_user('Nadia' || p_tag); g uuid; code text; trip uuid; e uuid;
begin
  perform set_config('hishebnama.proposal_rate_limit', '1000000', false);
  perform t.login(arif);
  g := public.create_group('Race ' || p_tag);
  select invite_code into code from public.groups where id = g;
  perform t.login(sami);  perform public.join_group(code);
  perform t.login(rafi);  perform public.join_group(code);
  perform t.login(tania); perform public.join_group(code);
  perform t.login(nadia); perform public.join_group(code);
  -- §11.1: Sami owes Arif 30; Arif owes Rafi 20.
  perform t.login(arif);
  perform public.add_expense(g, arif, 3000, 'Z owes X', jsonb_build_array(jsonb_build_object('user_id', sami, 'share', 3000)));
  perform t.login(rafi);
  perform public.add_expense(g, rafi, 2000, 'X owes Y', jsonb_build_array(jsonb_build_object('user_id', arif, 'share', 2000)));
  -- A trip led by Arif, Tania and Nadia, with Sami owing Arif 3333 on it.
  perform t.login(arif);
  trip := public.create_trip(g, 'Race trip', array[sami, tania, nadia], array[tania, nadia]);
  e := public.add_expense(g, arif, 10000, 'Vehicle', jsonb_build_array(
         jsonb_build_object('user_id', arif, 'share', 3334),
         jsonb_build_object('user_id', sami, 'share', 3333),
         jsonb_build_object('user_id', tania, 'share', 3333)), trip);
  return jsonb_build_object('g', g, 'arif', arif, 'sami', sami, 'rafi', rafi,
                            'tania', tania, 'nadia', nadia, 'trip', trip, 'e', e);
end $$;
