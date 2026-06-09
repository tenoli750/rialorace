-- Frontend race clock state.
-- Apply this in Supabase before running the VPS browser keeper.

create table if not exists public.frontend_race_clock_state (
  market_id text not null,
  source_label text not null default 'browser',
  page_url text,
  client_reported_at timestamp with time zone,
  server_received_at timestamp with time zone not null default now(),
  backend_server_now timestamp with time zone,
  estimated_frontend_now timestamp with time zone,
  official_offset_ms double precision,
  round_trip_ms double precision,
  current_visible_race_start_at timestamp with time zone,
  backend_race_start_at timestamp with time zone,
  next_prep_start_at timestamp with time zone,
  scheduled_visible_race_start_at timestamp with time zone,
  engine_race_started_at timestamp with time zone,
  engine_race_finished_at timestamp with time zone,
  phase text,
  prep_duration_ms integer,
  race_interval_ms integer,
  document_visibility text,
  user_agent text,
  updated_at timestamp with time zone not null default now(),
  primary key (market_id, source_label)
);

create index if not exists frontend_race_clock_state_updated_idx
  on public.frontend_race_clock_state(updated_at desc);

drop function if exists public.record_frontend_race_clock(
  text,
  text,
  text,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  double precision,
  double precision,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  text,
  integer,
  integer,
  text,
  text
);

create or replace function public.record_frontend_race_clock(
  requested_market_id text,
  requested_source_label text default 'browser',
  requested_page_url text default null::text,
  requested_client_reported_at timestamp with time zone default null::timestamp with time zone,
  requested_backend_server_now timestamp with time zone default null::timestamp with time zone,
  requested_estimated_frontend_now timestamp with time zone default null::timestamp with time zone,
  requested_official_offset_ms double precision default null::double precision,
  requested_round_trip_ms double precision default null::double precision,
  requested_current_visible_race_start_at timestamp with time zone default null::timestamp with time zone,
  requested_backend_race_start_at timestamp with time zone default null::timestamp with time zone,
  requested_next_prep_start_at timestamp with time zone default null::timestamp with time zone,
  requested_scheduled_visible_race_start_at timestamp with time zone default null::timestamp with time zone,
  requested_engine_race_started_at timestamp with time zone default null::timestamp with time zone,
  requested_engine_race_finished_at timestamp with time zone default null::timestamp with time zone,
  requested_phase text default null::text,
  requested_prep_duration_ms integer default null::integer,
  requested_race_interval_ms integer default null::integer,
  requested_document_visibility text default null::text,
  requested_user_agent text default null::text
) returns table (
  saved_market_id text,
  saved_source_label text,
  saved_server_received_at timestamp with time zone,
  saved_current_visible_race_start_at timestamp with time zone,
  saved_backend_race_start_at timestamp with time zone,
  saved_phase text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  normalized_market_id text := left(coalesce(nullif(trim(requested_market_id), ''), ''), 64);
  normalized_source_label text := left(coalesce(nullif(trim(requested_source_label), ''), 'browser'), 64);
begin
  if normalized_market_id = '' then
    raise exception 'market_id is required.';
  end if;

  insert into public.frontend_race_clock_state (
    market_id,
    source_label,
    page_url,
    client_reported_at,
    server_received_at,
    backend_server_now,
    estimated_frontend_now,
    official_offset_ms,
    round_trip_ms,
    current_visible_race_start_at,
    backend_race_start_at,
    next_prep_start_at,
    scheduled_visible_race_start_at,
    engine_race_started_at,
    engine_race_finished_at,
    phase,
    prep_duration_ms,
    race_interval_ms,
    document_visibility,
    user_agent,
    updated_at
  ) values (
    normalized_market_id,
    normalized_source_label,
    left(requested_page_url, 1024),
    requested_client_reported_at,
    now(),
    requested_backend_server_now,
    requested_estimated_frontend_now,
    requested_official_offset_ms,
    requested_round_trip_ms,
    requested_current_visible_race_start_at,
    requested_backend_race_start_at,
    requested_next_prep_start_at,
    requested_scheduled_visible_race_start_at,
    requested_engine_race_started_at,
    requested_engine_race_finished_at,
    left(requested_phase, 32),
    requested_prep_duration_ms,
    requested_race_interval_ms,
    left(requested_document_visibility, 32),
    left(requested_user_agent, 512),
    now()
  )
  on conflict on constraint frontend_race_clock_state_pkey do update
  set page_url = excluded.page_url,
      client_reported_at = excluded.client_reported_at,
      server_received_at = excluded.server_received_at,
      backend_server_now = excluded.backend_server_now,
      estimated_frontend_now = excluded.estimated_frontend_now,
      official_offset_ms = excluded.official_offset_ms,
      round_trip_ms = excluded.round_trip_ms,
      current_visible_race_start_at = excluded.current_visible_race_start_at,
      backend_race_start_at = excluded.backend_race_start_at,
      next_prep_start_at = excluded.next_prep_start_at,
      scheduled_visible_race_start_at = excluded.scheduled_visible_race_start_at,
      engine_race_started_at = excluded.engine_race_started_at,
      engine_race_finished_at = excluded.engine_race_finished_at,
      phase = excluded.phase,
      prep_duration_ms = excluded.prep_duration_ms,
      race_interval_ms = excluded.race_interval_ms,
      document_visibility = excluded.document_visibility,
      user_agent = excluded.user_agent,
      updated_at = excluded.updated_at;

  return query
    select
      state.market_id,
      state.source_label,
      state.server_received_at,
      state.current_visible_race_start_at,
      state.backend_race_start_at,
      state.phase
    from public.frontend_race_clock_state state
    where state.market_id = normalized_market_id
      and state.source_label = normalized_source_label;
end;
$$;

grant execute on function public.record_frontend_race_clock(
  text,
  text,
  text,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  double precision,
  double precision,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  text,
  integer,
  integer,
  text,
  text
) to anon, authenticated, service_role;

create table if not exists public.frontend_race_finish_state (
  market_id text not null,
  source_label text not null default 'browser',
  backend_race_start_at timestamp with time zone not null,
  visible_race_start_at timestamp with time zone,
  symbol text not null,
  frontend_finish_place integer,
  backend_finish_place integer,
  backend_elapsed_ms double precision,
  backend_finish_at timestamp with time zone,
  expected_frontend_finish_at timestamp with time zone,
  actual_engine_race_started_at timestamp with time zone,
  actual_engine_finished_at timestamp with time zone,
  actual_engine_elapsed_ms double precision,
  finish_delta_ms double precision,
  distance_meters double precision,
  phase text,
  page_url text,
  server_received_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (market_id, source_label, backend_race_start_at, symbol)
);

create index if not exists frontend_race_finish_state_updated_idx
  on public.frontend_race_finish_state(updated_at desc);

create index if not exists frontend_race_finish_state_market_race_idx
  on public.frontend_race_finish_state(market_id, backend_race_start_at desc);

drop function if exists public.record_frontend_race_finish_times(
  text,
  text,
  timestamp with time zone,
  timestamp with time zone,
  text,
  text,
  jsonb
);

create or replace function public.record_frontend_race_finish_times(
  requested_market_id text,
  requested_source_label text default 'browser',
  requested_backend_race_start_at timestamp with time zone default null::timestamp with time zone,
  requested_visible_race_start_at timestamp with time zone default null::timestamp with time zone,
  requested_page_url text default null::text,
  requested_phase text default null::text,
  requested_finish_payload jsonb default '[]'::jsonb
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  normalized_market_id text := left(coalesce(nullif(trim(requested_market_id), ''), ''), 64);
  normalized_source_label text := left(coalesce(nullif(trim(requested_source_label), ''), 'browser'), 64);
  saved_count integer := 0;
begin
  if normalized_market_id = '' then
    raise exception 'market_id is required.';
  end if;

  if requested_backend_race_start_at is null then
    raise exception 'backend_race_start_at is required.';
  end if;

  insert into public.frontend_race_finish_state (
    market_id,
    source_label,
    backend_race_start_at,
    visible_race_start_at,
    symbol,
    frontend_finish_place,
    backend_finish_place,
    backend_elapsed_ms,
    backend_finish_at,
    expected_frontend_finish_at,
    actual_engine_race_started_at,
    actual_engine_finished_at,
    actual_engine_elapsed_ms,
    finish_delta_ms,
    distance_meters,
    phase,
    page_url,
    server_received_at,
    updated_at
  )
  select
    normalized_market_id,
    normalized_source_label,
    requested_backend_race_start_at,
    requested_visible_race_start_at,
    left(nullif(trim(payload.symbol), ''), 32),
    payload.frontend_finish_place,
    payload.backend_finish_place,
    payload.backend_elapsed_ms,
    payload.backend_finish_at,
    payload.expected_frontend_finish_at,
    payload.actual_engine_race_started_at,
    payload.actual_engine_finished_at,
    payload.actual_engine_elapsed_ms,
    payload.finish_delta_ms,
    payload.distance_meters,
    left(requested_phase, 32),
    left(requested_page_url, 1024),
    now(),
    now()
  from jsonb_to_recordset(coalesce(requested_finish_payload, '[]'::jsonb)) as payload(
    symbol text,
    frontend_finish_place integer,
    backend_finish_place integer,
    backend_elapsed_ms double precision,
    backend_finish_at timestamp with time zone,
    expected_frontend_finish_at timestamp with time zone,
    actual_engine_race_started_at timestamp with time zone,
    actual_engine_finished_at timestamp with time zone,
    actual_engine_elapsed_ms double precision,
    finish_delta_ms double precision,
    distance_meters double precision
  )
  where nullif(trim(payload.symbol), '') is not null
  on conflict on constraint frontend_race_finish_state_pkey do update
  set visible_race_start_at = excluded.visible_race_start_at,
      frontend_finish_place = excluded.frontend_finish_place,
      backend_finish_place = excluded.backend_finish_place,
      backend_elapsed_ms = excluded.backend_elapsed_ms,
      backend_finish_at = excluded.backend_finish_at,
      expected_frontend_finish_at = excluded.expected_frontend_finish_at,
      actual_engine_race_started_at = excluded.actual_engine_race_started_at,
      actual_engine_finished_at = excluded.actual_engine_finished_at,
      actual_engine_elapsed_ms = excluded.actual_engine_elapsed_ms,
      finish_delta_ms = excluded.finish_delta_ms,
      distance_meters = excluded.distance_meters,
      phase = excluded.phase,
      page_url = excluded.page_url,
      server_received_at = excluded.server_received_at,
      updated_at = excluded.updated_at;

  get diagnostics saved_count = row_count;
  return saved_count;
end;
$$;

grant execute on function public.record_frontend_race_finish_times(
  text,
  text,
  timestamp with time zone,
  timestamp with time zone,
  text,
  text,
  jsonb
) to anon, authenticated, service_role;
