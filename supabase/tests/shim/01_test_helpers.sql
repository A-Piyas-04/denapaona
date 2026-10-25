-- Test helpers.  Lives in schema `t`, which exists only in the test database.
create schema t;
grant usage on schema t to authenticated, anon;

-- Create a user the way Supabase Auth would; the on_auth_user_created trigger
-- makes the profile.
create function t.new_user(p_name text) returns uuid
language plpgsql as $$
declare v uuid;
begin
  insert into auth.users (email, raw_user_meta_data)
  values (lower(p_name) || '@test.local', jsonb_build_object('full_name', p_name))
  returning id into v;
  return v;
end $$;

-- Impersonate: identical to what PostgREST sets from a verified JWT.
create function t.login(p_user uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
                    case when p_user is null then ''
                         else json_build_object('sub', p_user, 'role', 'authenticated')::text end,
                    false);
$$;

create function t.assert(p_cond boolean, p_msg text) returns void
language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'ASSERTION FAILED: %', p_msg;
  end if;
end $$;

create function t.assert_eq(p_got anyelement, p_want anyelement, p_msg text) returns void
language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'ASSERTION FAILED: % — got %, want %', p_msg, p_got, p_want;
  end if;
end $$;

-- Run a statement and require it to fail with an error matching p_pattern
-- (a LIKE pattern against SQLERRM).  Any success is a test failure.
create function t.expect_error(p_sql text, p_pattern text, p_msg text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_pattern then
      raise notice '  ok  — % (%)', p_msg, sqlerrm;
      return;
    end if;
    raise exception 'ASSERTION FAILED: % — wrong error: % (wanted %)', p_msg, sqlerrm, p_pattern;
  end;
  raise exception 'ASSERTION FAILED: % — statement succeeded but must fail', p_msg;
end $$;

create function t.ok(p_msg text) returns void
language plpgsql as $$ begin raise notice '  ok  — %', p_msg; end $$;

grant execute on all functions in schema t to authenticated, anon;
