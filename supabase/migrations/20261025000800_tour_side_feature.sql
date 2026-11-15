-- ═══════════════════════════════════════════════════════════════════════════
-- Tour side-feature (tour-e-chol port)
--
-- Isolated from the group ledger: own tables, own RPCs, own settlement path.
-- Identity only from auth.uid(). No service role. No writes to groups /
-- expenses / ledger_entries / proposals.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── tables ────────────────────────────────────────────────────────────────

create table public.tours (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  join_code text not null unique check (join_code ~ '^[0-9]{8}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.tour_members (
  tour_id uuid not null references public.tours(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
  role text not null default 'member'
    check (role in ('owner', 'leader', 'member')),
  joined_at timestamptz not null default now(),
  primary key (tour_id, user_id)
);

-- Renamed from blueprint `expenses` to avoid colliding with group expenses.
create table public.tour_expenses (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references public.tours(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  amount_paisa bigint not null
    check (amount_paisa > 0 and amount_paisa <= 1000000000000),
  participant_ids uuid[] not null
    check (cardinality(participant_ids) > 0),
  contributions jsonb not null
    check (jsonb_typeof(contributions) = 'array'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  split_mode text not null default 'equal'
    check (split_mode in ('equal', 'individual'))
);

create index tour_expenses_tour_created_idx
  on public.tour_expenses (tour_id, created_at desc);

create index tour_members_user_idx
  on public.tour_members (user_id);

create table public.tour_expense_shares (
  expense_id uuid not null references public.tour_expenses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_paisa bigint not null
    check (amount_paisa >= 0 and amount_paisa <= 1000000000000),
  primary key (expense_id, user_id)
);

alter table public.tours enable row level security;
alter table public.tour_members enable row level security;
alter table public.tour_expenses enable row level security;
alter table public.tour_expense_shares enable row level security;

revoke all on table public.tours from anon, authenticated;
revoke all on table public.tour_members from anon, authenticated;
revoke all on table public.tour_expenses from anon, authenticated;
revoke all on table public.tour_expense_shares from anon, authenticated;

-- ── helpers ───────────────────────────────────────────────────────────────

create or replace function public.tour_display_name_for(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  select nullif(btrim(display_name), '') into v_name
    from public.profiles where id = p_user;
  if v_name is not null then return left(v_name, 100); end if;

  select coalesce(
           nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
           nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
           nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
           'Member'
         )
    into v_name
    from auth.users u where u.id = p_user;

  return left(coalesce(nullif(btrim(v_name), ''), 'Member'), 100);
end $$;

create or replace function public.tour_require_member(p_tour_id uuid)
returns public.tour_members
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.tour_members;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_row from public.tour_members
   where tour_id = p_tour_id and user_id = v_actor;
  if not found then raise exception 'TOUR_NOT_A_MEMBER'; end if;
  return v_row;
end $$;

create or replace function public.tour_require_leader(p_tour_id uuid)
returns public.tour_members
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.tour_members;
begin
  v_row := public.tour_require_member(p_tour_id);
  if v_row.role not in ('owner', 'leader') then
    raise exception 'TOUR_NOT_A_LEADER';
  end if;
  return v_row;
end $$;

-- ── mutations ─────────────────────────────────────────────────────────────

create or replace function public.tour_create(p_name text, p_join_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_tour uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_code text := coalesce(p_join_code, '');
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'TOUR_NAME_INVALID';
  end if;
  if v_code !~ '^[0-9]{8}$' then raise exception 'TOUR_PIN_INVALID'; end if;
  if exists (select 1 from public.tours where join_code = v_code) then
    raise exception 'TOUR_PIN_IN_USE';
  end if;

  insert into public.tours (name, join_code, created_by)
  values (v_name, v_code, v_actor)
  returning id into v_tour;

  insert into public.tour_members (tour_id, user_id, display_name, role)
  values (v_tour, v_actor, public.tour_display_name_for(v_actor), 'owner');

  return v_tour;
end $$;

create or replace function public.tour_join(p_join_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_tour uuid;
  v_code text := coalesce(p_join_code, '');
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_code !~ '^[0-9]{8}$' then raise exception 'TOUR_PIN_INVALID'; end if;

  select id into v_tour from public.tours where join_code = v_code;
  if not found then raise exception 'TOUR_PIN_NOT_FOUND'; end if;

  insert into public.tour_members (tour_id, user_id, display_name, role)
  values (v_tour, v_actor, public.tour_display_name_for(v_actor), 'member')
  on conflict do nothing;

  return v_tour;
end $$;

create or replace function public.tour_add_expense(
  p_tour_id uuid,
  p_title text,
  p_amount_paisa bigint,
  p_participant_ids uuid[],
  p_contributions jsonb,
  p_split_mode text default 'equal',
  p_shares jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.tour_members;
  v_title text := btrim(coalesce(p_title, ''));
  v_mode text := coalesce(p_split_mode, 'equal');
  v_expense_id uuid;
  v_paid bigint := 0;
  v_share_sum bigint := 0;
  v_id uuid;
  v_entry jsonb;
  v_amt bigint;
  v_seen uuid[] := '{}';
begin
  v_member := public.tour_require_leader(p_tour_id);

  if char_length(v_title) < 1 or char_length(v_title) > 100 then
    raise exception 'TOUR_TITLE_INVALID';
  end if;
  if v_mode not in ('equal', 'individual') then
    raise exception 'TOUR_SPLIT_MODE_INVALID';
  end if;
  if p_amount_paisa is null or p_amount_paisa <= 0 or p_amount_paisa > 1000000000000 then
    raise exception 'TOUR_AMOUNT_INVALID';
  end if;
  if p_participant_ids is null or cardinality(p_participant_ids) = 0 then
    raise exception 'TOUR_PARTICIPANTS_REQUIRED';
  end if;
  if cardinality(p_participant_ids) <> (
       select count(distinct x) from unnest(p_participant_ids) as x
     ) then
    raise exception 'TOUR_DUPLICATE_PARTICIPANT';
  end if;

  foreach v_id in array p_participant_ids loop
    if not exists (
      select 1 from public.tour_members
       where tour_id = p_tour_id and user_id = v_id
    ) then
      raise exception 'TOUR_PARTICIPANT_NOT_MEMBER';
    end if;
  end loop;

  if p_contributions is null or jsonb_typeof(p_contributions) <> 'array'
     or jsonb_array_length(p_contributions) < 1 then
    raise exception 'TOUR_PAYERS_REQUIRED';
  end if;

  for v_entry in select * from jsonb_array_elements(p_contributions) loop
    v_id := (v_entry ->> 'user_id')::uuid;
    v_amt := (v_entry ->> 'amount_paisa')::bigint;
    if v_id = any (v_seen) then raise exception 'TOUR_DUPLICATE_PAYER'; end if;
    v_seen := array_append(v_seen, v_id);
    if not exists (
      select 1 from public.tour_members
       where tour_id = p_tour_id and user_id = v_id
    ) then
      raise exception 'TOUR_PAYER_NOT_MEMBER';
    end if;
    if v_amt is null or v_amt <= 0 or v_amt > 1000000000000 then
      raise exception 'TOUR_AMOUNT_INVALID';
    end if;
    v_paid := v_paid + v_amt;
  end loop;

  if v_mode = 'individual' then
    if p_shares is null or jsonb_typeof(p_shares) <> 'array' then
      raise exception 'TOUR_SHARES_REQUIRED';
    end if;
    v_seen := '{}';
    for v_entry in select * from jsonb_array_elements(p_shares) loop
      v_id := (v_entry ->> 'user_id')::uuid;
      v_amt := (v_entry ->> 'amount_paisa')::bigint;
      if v_id = any (v_seen) then raise exception 'TOUR_DUPLICATE_SHARE'; end if;
      v_seen := array_append(v_seen, v_id);
      if not (v_id = any (p_participant_ids)) then
        raise exception 'TOUR_SHARE_NOT_PARTICIPANT';
      end if;
      if v_amt is null or v_amt < 0 or v_amt > 1000000000000 then
        raise exception 'TOUR_AMOUNT_INVALID';
      end if;
      v_share_sum := v_share_sum + v_amt;
    end loop;
    foreach v_id in array p_participant_ids loop
      if not (v_id = any (v_seen)) then
        raise exception 'TOUR_SHARE_MISSING';
      end if;
    end loop;
    if v_share_sum <> p_amount_paisa then
      raise exception 'TOUR_SHARES_MISMATCH';
    end if;
  end if;

  if v_paid <> p_amount_paisa then
    raise exception 'TOUR_PAID_MISMATCH';
  end if;

  insert into public.tour_expenses (
    tour_id, title, amount_paisa, participant_ids,
    contributions, created_by, split_mode
  ) values (
    p_tour_id, v_title, p_amount_paisa, p_participant_ids,
    p_contributions, v_member.user_id, v_mode
  )
  returning id into v_expense_id;

  if v_mode = 'individual' then
    insert into public.tour_expense_shares (expense_id, user_id, amount_paisa)
    select v_expense_id,
           (entry ->> 'user_id')::uuid,
           (entry ->> 'amount_paisa')::bigint
      from jsonb_array_elements(p_shares) as entry;
  end if;

  return v_expense_id;
end $$;

create or replace function public.tour_delete_expense(p_tour_id uuid, p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.tour_require_leader(p_tour_id);
  delete from public.tour_expenses
   where id = p_expense_id and tour_id = p_tour_id;
end $$;

create or replace function public.tour_set_leader_role(
  p_tour_id uuid,
  p_user_id uuid,
  p_is_leader boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_created_by uuid;
  v_role text;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;

  select created_by into v_created_by from public.tours where id = p_tour_id;
  if not found then raise exception 'TOUR_NOT_FOUND'; end if;
  if v_created_by <> v_actor then raise exception 'TOUR_NOT_OWNER'; end if;
  if p_user_id = v_actor then raise exception 'TOUR_OWNER_ROLE_FIXED'; end if;

  select role into v_role from public.tour_members
   where tour_id = p_tour_id and user_id = p_user_id;
  if not found then raise exception 'TOUR_MEMBER_NOT_FOUND'; end if;
  if v_role = 'owner' then raise exception 'TOUR_OWNER_ROLE_FIXED'; end if;

  update public.tour_members
     set role = case when p_is_leader then 'leader' else 'member' end
   where tour_id = p_tour_id and user_id = p_user_id;
end $$;

-- ── reads (jsonb payloads for the SPA) ────────────────────────────────────

create or replace function public.tour_list_mine()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  return coalesce((
    select jsonb_agg(
             jsonb_build_object(
               'id', t.id,
               'name', t.name,
               'role', m.role
             )
             order by t.created_at desc
           )
      from public.tour_members m
      join public.tours t on t.id = m.tour_id
     where m.user_id = v_actor
  ), '[]'::jsonb);
end $$;

create or replace function public.tour_get_balances(p_tour_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member public.tour_members;
  v_tour public.tours;
begin
  v_member := public.tour_require_member(p_tour_id);
  select * into v_tour from public.tours where id = p_tour_id;
  if not found then raise exception 'TOUR_NOT_FOUND'; end if;

  return jsonb_build_object(
    'tourId', v_tour.id,
    'tourName', v_tour.name,
    'userName', v_member.display_name,
    'role', v_member.role,
    'members', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'userId', m.user_id,
                 'name', m.display_name,
                 'role', m.role
               )
               order by m.joined_at
             )
        from public.tour_members m where m.tour_id = p_tour_id
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc)
        from (
          select e.id,
                 e.title,
                 e.amount_paisa,
                 e.participant_ids,
                 e.contributions,
                 e.created_by,
                 e.created_at,
                 e.split_mode,
                 coalesce((
                   select jsonb_agg(
                            jsonb_build_object(
                              'user_id', s.user_id,
                              'amount_paisa', s.amount_paisa
                            )
                          )
                     from public.tour_expense_shares s
                    where s.expense_id = e.id
                 ), '[]'::jsonb) as shares
            from public.tour_expenses e
           where e.tour_id = p_tour_id
        ) x
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.tour_get_manage(p_tour_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member public.tour_members;
  v_tour public.tours;
begin
  v_member := public.tour_require_leader(p_tour_id);
  select * into v_tour from public.tours where id = p_tour_id;
  if not found then raise exception 'TOUR_NOT_FOUND'; end if;

  return jsonb_build_object(
    'tourId', v_tour.id,
    'tourName', v_tour.name,
    'joinCode', v_tour.join_code,
    'isOwner', v_tour.created_by = v_member.user_id,
    'members', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'userId', m.user_id,
                 'name', m.display_name,
                 'role', m.role
               )
               order by m.joined_at
             )
        from public.tour_members m where m.tour_id = p_tour_id
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x."createdAt" desc)
        from (
          select e.id,
                 e.title,
                 e.amount_paisa as "amountPaisa",
                 cardinality(e.participant_ids) as "participantCount",
                 e.created_at as "createdAt",
                 e.split_mode as "splitMode",
                 e.contributions,
                 e.participant_ids,
                 coalesce((
                   select jsonb_agg(
                            jsonb_build_object(
                              'userId', s.user_id,
                              'amount_paisa', s.amount_paisa
                            )
                            order by s.user_id
                          )
                     from public.tour_expense_shares s
                    where s.expense_id = e.id
                 ), '[]'::jsonb) as shares
            from public.tour_expenses e
           where e.tour_id = p_tour_id
        ) x
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.tour_get_history(p_tour_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tour public.tours;
begin
  perform public.tour_require_member(p_tour_id);
  select * into v_tour from public.tours where id = p_tour_id;
  if not found then raise exception 'TOUR_NOT_FOUND'; end if;

  return jsonb_build_object(
    'tourName', v_tour.name,
    'createdBy', v_tour.created_by,
    'createdAt', v_tour.created_at,
    'members', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'userId', m.user_id,
                 'name', m.display_name,
                 'role', m.role,
                 'joinedAt', m.joined_at
               )
             )
        from public.tour_members m where m.tour_id = p_tour_id
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb)
        from (
          select e.title,
                 e.amount_paisa,
                 e.participant_ids,
                 e.contributions,
                 e.created_by,
                 e.created_at,
                 e.split_mode,
                 coalesce((
                   select jsonb_agg(
                            jsonb_build_object(
                              'user_id', s.user_id,
                              'amount_paisa', s.amount_paisa
                            )
                          )
                     from public.tour_expense_shares s
                    where s.expense_id = e.id
                 ), '[]'::jsonb) as shares
            from public.tour_expenses e
           where e.tour_id = p_tour_id
        ) x
    ), '[]'::jsonb)
  );
end $$;

-- ── grants ────────────────────────────────────────────────────────────────

revoke all on function public.tour_display_name_for(uuid) from public, anon, authenticated;
revoke all on function public.tour_require_member(uuid) from public, anon, authenticated;
revoke all on function public.tour_require_leader(uuid) from public, anon, authenticated;

revoke all on function public.tour_create(text, text) from public, anon;
revoke all on function public.tour_join(text) from public, anon;
revoke all on function public.tour_list_mine() from public, anon;
revoke all on function public.tour_get_balances(uuid) from public, anon;
revoke all on function public.tour_get_manage(uuid) from public, anon;
revoke all on function public.tour_get_history(uuid) from public, anon;
revoke all on function public.tour_add_expense(uuid, text, bigint, uuid[], jsonb, text, jsonb) from public, anon;
revoke all on function public.tour_delete_expense(uuid, uuid) from public, anon;
revoke all on function public.tour_set_leader_role(uuid, uuid, boolean) from public, anon;

grant execute on function
  public.tour_create(text, text),
  public.tour_join(text),
  public.tour_list_mine(),
  public.tour_get_balances(uuid),
  public.tour_get_manage(uuid),
  public.tour_get_history(uuid),
  public.tour_add_expense(uuid, text, bigint, uuid[], jsonb, text, jsonb),
  public.tour_delete_expense(uuid, uuid),
  public.tour_set_leader_role(uuid, uuid, boolean)
to authenticated;
