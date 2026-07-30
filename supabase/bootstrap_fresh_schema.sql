-- Fresh self-hosted Supabase bootstrap for Rialo Race.
-- Use this only for a new empty database. Historical managed Supabase data is not restored.

create extension if not exists pgcrypto;

create table if not exists public.login_accounts (
  id uuid primary key default gen_random_uuid(),
  login_id text not null unique,
  password_hash text not null,
  points_balance integer not null default 10000,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.login_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.login_accounts(id) on delete cascade,
  session_token text not null unique default encode(gen_random_bytes(32), 'hex'),
  expires_at timestamp with time zone not null default now() + interval '30 days',
  signed_out_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.login_accounts(id) on delete cascade,
  user_id uuid,
  market_id text,
  target_race_started_at timestamp with time zone,
  stake_points integer not null,
  first_pick text,
  second_pick text,
  third_pick text,
  ratio_snapshot jsonb not null default '{}'::jsonb,
  bet_type text not null default 'podium',
  finish_threshold_seconds integer,
  finish_time_pick text,
  finish_time_symbol text,
  status text not null default 'placed',
  payout_points integer not null default 0,
  matched_places integer not null default 0,
  settled_at timestamp with time zone,
  balance_delta_applied_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create index if not exists bets_account_created_idx on public.bets(account_id, created_at desc);
create index if not exists bets_market_race_idx on public.bets(market_id, target_race_started_at);

create table if not exists public.market_results_v2 (
  id uuid primary key default gen_random_uuid(),
  market_id text not null,
  race_started_at timestamp with time zone not null,
  race_finished_at timestamp with time zone,
  compared_finish_elapsed_ms jsonb not null default '{}'::jsonb,
  first_place text,
  second_place text,
  third_place text,
  fourth_place text,
  result_snapshot jsonb not null default '{}'::jsonb,
  resolved_by text,
  resolver_version text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (market_id, race_started_at)
);

create index if not exists market_results_v2_market_started_idx
  on public.market_results_v2(market_id, race_started_at desc);

create table if not exists public.market_chat_messages (
  id uuid primary key default gen_random_uuid(),
  market_id text not null,
  account_id uuid references public.login_accounts(id) on delete set null,
  author_login_id text not null,
  message text not null,
  created_at timestamp with time zone not null default now()
);

create index if not exists market_chat_messages_market_created_idx
  on public.market_chat_messages(market_id, created_at desc);

create table if not exists public.market_ratio_snapshots (
  market_id text not null,
  target_race_started_at timestamp with time zone not null,
  ratio_snapshot jsonb not null default '{}'::jsonb,
  sample_count integer not null default 0,
  source_label text not null default 'bootstrap',
  updated_at timestamp with time zone not null default now(),
  primary key (market_id, target_race_started_at)
);

create table if not exists public.coin_ticks_5s (
  symbol text not null,
  source text not null default 'binance',
  source_event_at timestamp with time zone,
  price numeric not null,
  previous_price numeric,
  change_percent numeric,
  speed_factor numeric,
  bucket_at timestamp with time zone not null,
  source_updated_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  primary key (symbol, bucket_at)
);

create index if not exists coin_ticks_5s_bucket_idx on public.coin_ticks_5s(bucket_at desc);

create or replace view public.price_history_5s as
select
  symbol,
  source,
  source_event_at,
  price,
  previous_price,
  change_percent,
  speed_factor,
  bucket_at,
  source_updated_at,
  created_at
from public.coin_ticks_5s;

create table if not exists public.race_results (
  id uuid primary key default gen_random_uuid(),
  market_id text not null,
  race_started_at timestamp with time zone not null,
  race_finished_at timestamp with time zone,
  first_place text,
  second_place text,
  third_place text,
  fourth_place text,
  result_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  unique (market_id, race_started_at)
);

create table if not exists public.race_results_realtime_test (
  id uuid primary key default gen_random_uuid(),
  market_id text not null,
  race_started_at timestamp with time zone not null,
  race_finished_at timestamp with time zone,
  source_label text not null default 'test',
  first_place text,
  second_place text,
  third_place text,
  fourth_place text,
  result_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  unique (market_id, race_started_at, source_label)
);

create table if not exists public.race_state_snapshots (
  id uuid primary key default gen_random_uuid(),
  market_id text,
  race_started_at timestamp with time zone,
  symbol text,
  bucket_at timestamp with time zone,
  price numeric,
  speed_factor numeric,
  target_speed_factor numeric,
  distance_meters numeric,
  change_percent numeric,
  speed_effect_percent numeric,
  finish_place integer,
  finished_at timestamp with time zone,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create unique index if not exists race_state_snapshots_market_race_bucket_symbol_idx
  on public.race_state_snapshots(market_id, race_started_at, bucket_at, symbol);

create index if not exists race_state_snapshots_market_race_bucket_idx
  on public.race_state_snapshots(market_id, race_started_at, bucket_at desc);

create table if not exists public.race_simulation_intervals (
  id uuid primary key default gen_random_uuid(),
  market_id text,
  interval_started_at timestamp with time zone,
  interval_ended_at timestamp with time zone,
  simulation_state jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.login_accounts(id) on delete cascade,
  checkin_date_kst date not null,
  points_awarded integer not null default 100,
  created_at timestamp with time zone not null default now(),
  unique (account_id, checkin_date_kst)
);

create or replace function public.session_account(requested_session_token text)
returns table (
  account_id uuid,
  login_id text,
  points_balance integer,
  session_token text,
  expires_at timestamp with time zone
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    la.id,
    la.login_id,
    la.points_balance,
    ls.session_token,
    ls.expires_at
  from public.login_sessions ls
  join public.login_accounts la on la.id = ls.account_id
  where ls.session_token = requested_session_token
    and ls.signed_out_at is null
    and ls.expires_at > now()
  limit 1;
$$;

create or replace function public.sign_up_with_login_id(
  requested_login_id text,
  requested_password text
) returns table (
  session_token text,
  account_id uuid,
  login_id text,
  points_balance integer,
  expires_at timestamp with time zone
)
language plpgsql
volatile
security definer
set search_path to 'public', 'extensions'
as $$
declare
  clean_login_id text := lower(regexp_replace(trim(coalesce(requested_login_id, '')), '[^a-z0-9._-]', '', 'g'));
  new_account public.login_accounts%rowtype;
  new_session public.login_sessions%rowtype;
begin
  if clean_login_id = '' or length(clean_login_id) > 40 then
    raise exception 'Enter a valid ID.';
  end if;
  if requested_password is null or length(requested_password) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;

  insert into public.login_accounts(login_id, password_hash)
  values (clean_login_id, crypt(requested_password, gen_salt('bf')))
  returning * into new_account;

  insert into public.login_sessions(account_id)
  values (new_account.id)
  returning * into new_session;

  return query select
    new_session.session_token,
    new_account.id,
    new_account.login_id,
    new_account.points_balance,
    new_session.expires_at;
exception
  when unique_violation then
    raise exception 'ID already exists.';
end;
$$;

create or replace function public.sign_in_with_login_id(
  requested_login_id text,
  requested_password text
) returns table (
  session_token text,
  account_id uuid,
  login_id text,
  points_balance integer,
  expires_at timestamp with time zone
)
language plpgsql
volatile
security definer
set search_path to 'public', 'extensions'
as $$
declare
  clean_login_id text := lower(regexp_replace(trim(coalesce(requested_login_id, '')), '[^a-z0-9._-]', '', 'g'));
  account_row public.login_accounts%rowtype;
  new_session public.login_sessions%rowtype;
begin
  select la.* into account_row
  from public.login_accounts as la
  where la.login_id = clean_login_id
    and la.password_hash = crypt(requested_password, la.password_hash)
  limit 1;

  if account_row.id is null then
    raise exception 'Invalid ID or password.';
  end if;

  update public.login_accounts as la
  set updated_at = now()
  where la.id = account_row.id;

  insert into public.login_sessions(account_id)
  values (account_row.id)
  returning * into new_session;

  return query select
    new_session.session_token,
    account_row.id,
    account_row.login_id,
    account_row.points_balance,
    new_session.expires_at;
end;
$$;

create or replace function public.get_login_session(requested_session_token text)
returns table (
  session_token text,
  account_id uuid,
  login_id text,
  points_balance integer,
  expires_at timestamp with time zone
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    sa.session_token,
    sa.account_id,
    sa.login_id,
    sa.points_balance,
    sa.expires_at
  from public.session_account(requested_session_token) sa;
$$;

create or replace function public.sign_out_login_session(requested_session_token text)
returns void
language sql
volatile
security definer
set search_path to 'public'
as $$
  update public.login_sessions
  set signed_out_at = now()
  where session_token = requested_session_token
    and signed_out_at is null;
$$;

create or replace function public.get_public_rankings()
returns table (
  rank_number bigint,
  login_id text,
  points_balance integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    row_number() over (order by points_balance desc, created_at asc) as rank_number,
    login_id,
    points_balance
  from public.login_accounts
  order by points_balance desc, created_at asc
  limit 100;
$$;

create or replace function public.get_daily_checkin_status(requested_session_token text)
returns table (
  login_id text,
  checkin_date_kst date,
  already_claimed boolean,
  points_awarded integer,
  current_points_balance integer,
  next_reset_at timestamp with time zone,
  claimed boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  account_row record;
  today_kst date := (now() at time zone 'Asia/Seoul')::date;
begin
  select * into account_row from public.session_account(requested_session_token) limit 1;
  if account_row.account_id is null then
    raise exception 'Login required.';
  end if;

  return query
  select
    account_row.login_id,
    today_kst,
    exists (
      select 1 from public.daily_checkins dc
      where dc.account_id = account_row.account_id
        and dc.checkin_date_kst = today_kst
    ),
    100,
    account_row.points_balance,
    ((today_kst + 1)::timestamp at time zone 'Asia/Seoul'),
    exists (
      select 1 from public.daily_checkins dc
      where dc.account_id = account_row.account_id
        and dc.checkin_date_kst = today_kst
    );
end;
$$;

create or replace function public.claim_daily_checkin(requested_session_token text)
returns table (
  login_id text,
  checkin_date_kst date,
  already_claimed boolean,
  points_awarded integer,
  current_points_balance integer,
  next_reset_at timestamp with time zone,
  claimed boolean
)
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  account_row record;
  today_kst date := (now() at time zone 'Asia/Seoul')::date;
  inserted_points integer := 0;
  next_balance integer;
begin
  select * into account_row from public.session_account(requested_session_token) limit 1;
  if account_row.account_id is null then
    raise exception 'Login required.';
  end if;

  insert into public.daily_checkins(account_id, checkin_date_kst, points_awarded)
  values (account_row.account_id, today_kst, 100)
  on conflict (account_id, checkin_date_kst) do nothing
  returning points_awarded into inserted_points;

  if inserted_points is not null and inserted_points > 0 then
    update public.login_accounts
    set points_balance = points_balance + inserted_points,
        updated_at = now()
    where id = account_row.account_id
    returning points_balance into next_balance;
  else
    next_balance := account_row.points_balance;
  end if;

  return query
  select
    account_row.login_id,
    today_kst,
    coalesce(inserted_points, 0) = 0,
    coalesce(inserted_points, 0),
    next_balance,
    ((today_kst + 1)::timestamp at time zone 'Asia/Seoul'),
    coalesce(inserted_points, 0) > 0;
end;
$$;

create or replace function public.compute_bet_payout_multiplier(
  requested_first_pick text,
  requested_second_pick text,
  requested_third_pick text,
  requested_ratio_snapshot jsonb
) returns numeric
language sql
immutable
set search_path to 'public'
as $$
  select greatest(
    1,
    coalesce(nullif(requested_ratio_snapshot->'first'->>requested_first_pick, '')::numeric, 1) *
    coalesce(nullif(requested_ratio_snapshot->'second'->>requested_second_pick, '')::numeric, 1) *
    coalesce(nullif(requested_ratio_snapshot->'third'->>requested_third_pick, '')::numeric, 1)
  );
$$;

create or replace function public.upsert_market_ratio_snapshot(
  requested_market_id text,
  requested_target_race_started_at timestamp with time zone,
  requested_ratio_snapshot jsonb,
  requested_sample_count integer default 0,
  requested_source_label text default 'frontend'
) returns table (
  market_id text,
  target_race_started_at timestamp with time zone,
  ratio_snapshot jsonb,
  sample_count integer
)
language sql
volatile
security definer
set search_path to 'public'
as $$
  insert into public.market_ratio_snapshots(
    market_id,
    target_race_started_at,
    ratio_snapshot,
    sample_count,
    source_label,
    updated_at
  )
  values (
    requested_market_id,
    requested_target_race_started_at,
    coalesce(requested_ratio_snapshot, '{}'::jsonb),
    coalesce(requested_sample_count, 0),
    coalesce(nullif(requested_source_label, ''), 'frontend'),
    now()
  )
  on conflict (market_id, target_race_started_at) do update
  set ratio_snapshot = excluded.ratio_snapshot,
      sample_count = excluded.sample_count,
      source_label = excluded.source_label,
      updated_at = now()
  returning
    market_ratio_snapshots.market_id,
    market_ratio_snapshots.target_race_started_at,
    market_ratio_snapshots.ratio_snapshot,
    market_ratio_snapshots.sample_count;
$$;

create or replace function public.get_or_create_market_ratio_snapshot(
  requested_market_id text,
  requested_target_race_started_at timestamp with time zone,
  requested_history_limit integer default 100
) returns table (
  market_id text,
  target_race_started_at timestamp with time zone,
  ratio_snapshot jsonb,
  sample_count integer
)
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  existing_row public.market_ratio_snapshots%rowtype;
begin
  select * into existing_row
  from public.market_ratio_snapshots mrs
  where mrs.market_id = requested_market_id
    and mrs.target_race_started_at = requested_target_race_started_at
  limit 1;

  if existing_row.market_id is not null then
    return query select
      existing_row.market_id,
      existing_row.target_race_started_at,
      existing_row.ratio_snapshot,
      existing_row.sample_count;
    return;
  end if;

  return query
  select * from public.upsert_market_ratio_snapshot(
    requested_market_id,
    requested_target_race_started_at,
    '{}'::jsonb,
    0,
    'bootstrap'
  );
end;
$$;

create or replace function public.create_market_chat_message(
  requested_session_token text,
  requested_market_id text,
  requested_message text
) returns table (
  id uuid,
  market_id text,
  author_login_id text,
  message text,
  created_at timestamp with time zone
)
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  account_row record;
  saved_row public.market_chat_messages%rowtype;
  clean_message text := left(trim(coalesce(requested_message, '')), 500);
begin
  select * into account_row from public.session_account(requested_session_token) limit 1;
  if account_row.account_id is null then
    raise exception 'Login required.';
  end if;
  if clean_message = '' then
    raise exception 'Message is required.';
  end if;

  insert into public.market_chat_messages(market_id, account_id, author_login_id, message)
  values (left(trim(requested_market_id), 64), account_row.account_id, account_row.login_id, clean_message)
  returning * into saved_row;

  return query select
    saved_row.id,
    saved_row.market_id,
    saved_row.author_login_id,
    saved_row.message,
    saved_row.created_at;
end;
$$;

create or replace function public.get_official_race_clock(
  requested_interval_ms integer default 300000,
  requested_prep_duration_ms integer default 10000
) returns table (
  server_now timestamp with time zone,
  current_race_start_at timestamp with time zone,
  next_prep_start_at timestamp with time zone,
  next_race_start_at timestamp with time zone
)
language sql
stable
set search_path to 'public'
as $$
  with clock as (
    select
      now() as server_now,
      greatest(coalesce(requested_interval_ms, 300000), 1000) as interval_ms,
      greatest(coalesce(requested_prep_duration_ms, 10000), 0) as prep_ms
  ),
  slots as (
    select
      server_now,
      to_timestamp(floor(extract(epoch from server_now) * 1000 / interval_ms) * interval_ms / 1000) as current_start,
      to_timestamp((floor(extract(epoch from server_now) * 1000 / interval_ms) + 1) * interval_ms / 1000) as next_start,
      prep_ms
    from clock
  )
  select
    server_now,
    current_start,
    next_start - (prep_ms / 1000.0) * interval '1 second',
    next_start
  from slots;
$$;

create or replace function public.resolve_race_result(
  requested_market_id text,
  requested_race_started_at timestamp with time zone,
  requested_interval_ms integer default 300000
) returns table (
  id uuid,
  market_id text,
  race_started_at timestamp with time zone,
  race_finished_at timestamp with time zone,
  compared_finish_elapsed_ms jsonb,
  first_place text,
  second_place text,
  third_place text,
  fourth_place text,
  created_at timestamp with time zone
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    mr.id,
    mr.market_id,
    mr.race_started_at,
    mr.race_finished_at,
    mr.compared_finish_elapsed_ms,
    mr.first_place,
    mr.second_place,
    mr.third_place,
    mr.fourth_place,
    mr.created_at
  from public.market_results_v2 mr
  where mr.market_id = requested_market_id
    and mr.race_started_at = requested_race_started_at
  limit 1;
$$;

create or replace function public.record_race_state_snapshots(
  requested_market_id text,
  requested_race_started_at timestamp with time zone,
  requested_bucket_at timestamp with time zone,
  requested_source_label text default 'browser',
  requested_snapshots jsonb default '[]'::jsonb
) returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  snapshot_row jsonb;
  normalized_market_id text := left(coalesce(nullif(trim(requested_market_id), ''), ''), 64);
begin
  if normalized_market_id = '' then
    raise exception 'market_id is required.';
  end if;
  if requested_race_started_at is null or requested_bucket_at is null then
    raise exception 'race_started_at and bucket_at are required.';
  end if;

  for snapshot_row in
    select value from jsonb_array_elements(coalesce(requested_snapshots, '[]'::jsonb))
  loop
    insert into public.race_state_snapshots(
      market_id,
      race_started_at,
      symbol,
      bucket_at,
      price,
      speed_factor,
      target_speed_factor,
      distance_meters,
      change_percent,
      speed_effect_percent,
      finish_place,
      finished_at,
      snapshot
    )
    values (
      normalized_market_id,
      requested_race_started_at,
      left(coalesce(snapshot_row->>'symbol', ''), 16),
      requested_bucket_at,
      nullif(snapshot_row->>'price', '')::numeric,
      nullif(snapshot_row->>'speed_factor', '')::numeric,
      nullif(snapshot_row->>'target_speed_factor', '')::numeric,
      nullif(snapshot_row->>'distance_meters', '')::numeric,
      nullif(snapshot_row->>'change_percent', '')::numeric,
      nullif(snapshot_row->>'speed_effect_percent', '')::numeric,
      nullif(snapshot_row->>'finish_place', '')::integer,
      nullif(snapshot_row->>'finished_at', '')::timestamp with time zone,
      snapshot_row || jsonb_build_object('source_label', coalesce(nullif(requested_source_label, ''), 'browser'))
    )
    on conflict (market_id, race_started_at, bucket_at, symbol) do update
    set price = excluded.price,
        speed_factor = excluded.speed_factor,
        target_speed_factor = excluded.target_speed_factor,
        distance_meters = excluded.distance_meters,
        change_percent = excluded.change_percent,
        speed_effect_percent = excluded.speed_effect_percent,
        finish_place = excluded.finish_place,
        finished_at = excluded.finished_at,
        snapshot = excluded.snapshot,
        created_at = now();
  end loop;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated, service_role;
grant insert, update, delete on all tables in schema public to service_role;
grant insert on public.race_results to anon, authenticated;
grant insert on public.race_results_realtime_test to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant select on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

notify pgrst, 'reload schema';
