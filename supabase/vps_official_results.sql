-- VPS frontend official race results.
-- This lets the VPS browser keeper write official market_results_v2 rows
-- without putting the Supabase service role key on the VPS.

create extension if not exists pgcrypto;

create table if not exists public.vps_official_result_tokens (
  source_label text primary key,
  token_sha256 text not null,
  updated_at timestamp with time zone not null default now()
);

alter table public.vps_official_result_tokens enable row level security;
revoke all on public.vps_official_result_tokens from anon, authenticated;

insert into public.vps_official_result_tokens(source_label, token_sha256, updated_at)
values (
  'vps-browser',
  '966cca6be0ef9c1b2e62b9046419ad02f2f04a5307472b31ee0670b289210325',
  now()
)
on conflict (source_label) do update
set token_sha256 = excluded.token_sha256,
    updated_at = excluded.updated_at;

drop function if exists public.record_vps_frontend_official_race_result(
  text,
  text,
  text,
  timestamp with time zone,
  timestamp with time zone,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
);

create or replace function public.record_vps_frontend_official_race_result(
  requested_source_label text,
  requested_token text,
  requested_market_id text,
  requested_race_started_at timestamp with time zone,
  requested_race_finished_at timestamp with time zone,
  requested_first_place text,
  requested_second_place text,
  requested_third_place text,
  requested_fourth_place text,
  requested_compared_finish_elapsed_ms jsonb default '{}'::jsonb,
  requested_result_snapshot jsonb default '{}'::jsonb
) returns table (
  saved_id uuid,
  saved_market_id text,
  saved_race_started_at timestamp with time zone,
  saved_resolved_by text,
  saved_resolver_version text
)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  normalized_source_label text := left(coalesce(nullif(trim(requested_source_label), ''), 'vps-browser'), 64);
  normalized_market_id text := left(coalesce(nullif(trim(requested_market_id), ''), ''), 64);
  expected_token_sha256 text;
  actual_token_sha256 text;
  normalized_race_started_at timestamp with time zone;
  place_values text[];
  saved_row public.market_results_v2%rowtype;
begin
  select token_sha256 into expected_token_sha256
  from public.vps_official_result_tokens token_row
  where token_row.source_label = normalized_source_label
  limit 1;

  actual_token_sha256 := encode(digest(coalesce(requested_token, ''), 'sha256'), 'hex');
  if expected_token_sha256 is null or actual_token_sha256 <> expected_token_sha256 then
    raise exception 'Invalid VPS official result token.';
  end if;

  if normalized_market_id = '' then
    raise exception 'market_id is required.';
  end if;

  if requested_race_started_at is null or requested_race_finished_at is null then
    raise exception 'race timestamps are required.';
  end if;

  normalized_race_started_at := to_timestamp(floor(extract(epoch from requested_race_started_at) / 300) * 300);

  if requested_race_finished_at <= normalized_race_started_at then
    raise exception 'race_finished_at must be after race_started_at.';
  end if;

  if requested_race_finished_at > normalized_race_started_at + interval '3 minutes' then
    raise exception 'race_finished_at is outside the allowed race duration.';
  end if;

  place_values := array[
    nullif(trim(requested_first_place), ''),
    nullif(trim(requested_second_place), ''),
    nullif(trim(requested_third_place), ''),
    nullif(trim(requested_fourth_place), '')
  ];

  if array_position(place_values, null) is not null then
    raise exception 'all four places are required.';
  end if;

  if (
    select count(distinct place_value)
    from unnest(place_values) as place_value
  ) <> 4 then
    raise exception 'finish places must be distinct.';
  end if;

  update public.market_results_v2 result_row
  set race_finished_at = requested_race_finished_at,
      first_place = place_values[1],
      second_place = place_values[2],
      third_place = place_values[3],
      fourth_place = place_values[4],
      compared_finish_elapsed_ms = coalesce(requested_compared_finish_elapsed_ms, '{}'::jsonb),
      result_snapshot = coalesce(requested_result_snapshot, '{}'::jsonb) || jsonb_build_object(
        'official_source', normalized_source_label,
        'official_recorded_at', now()
      ),
      resolved_by = normalized_source_label,
      resolver_version = 'vps-frontend-v1'
  where result_row.market_id = normalized_market_id
    and result_row.race_started_at = normalized_race_started_at
  returning * into saved_row;

  if saved_row.id is null then
    insert into public.market_results_v2(
      market_id,
      race_started_at,
      race_finished_at,
      first_place,
      second_place,
      third_place,
      fourth_place,
      compared_finish_elapsed_ms,
      result_snapshot,
      resolved_by,
      resolver_version
    )
    values (
      normalized_market_id,
      normalized_race_started_at,
      requested_race_finished_at,
      place_values[1],
      place_values[2],
      place_values[3],
      place_values[4],
      coalesce(requested_compared_finish_elapsed_ms, '{}'::jsonb),
      coalesce(requested_result_snapshot, '{}'::jsonb) || jsonb_build_object(
        'official_source', normalized_source_label,
        'official_recorded_at', now()
      ),
      normalized_source_label,
      'vps-frontend-v1'
    )
    returning * into saved_row;
  end if;

  return query
    select
      saved_row.id,
      saved_row.market_id,
      saved_row.race_started_at,
      saved_row.resolved_by,
      saved_row.resolver_version;
end;
$$;

grant execute on function public.record_vps_frontend_official_race_result(
  text,
  text,
  text,
  timestamp with time zone,
  timestamp with time zone,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
) to anon, authenticated, service_role;

drop function if exists public.record_vps_frontend_official_race_results_from_finish_state_v2(
  text,
  text,
  integer
);

create or replace function public.record_vps_frontend_official_race_results_from_finish_state_v2(
  requested_source_label text,
  requested_token text,
  requested_limit integer default 80
) returns table (
  saved_market_id text,
  saved_race_started_at timestamp with time zone,
  saved_first_place text,
  saved_second_place text,
  saved_third_place text,
  saved_fourth_place text,
  saved_resolved_by text,
  saved_resolver_version text
)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  normalized_source_label text := left(coalesce(nullif(trim(requested_source_label), ''), 'vps-browser'), 64);
  expected_token_sha256 text;
  actual_token_sha256 text;
  result_group record;
  place_symbols text[];
  elapsed_payload jsonb;
  max_elapsed_ms double precision;
  saved_row public.market_results_v2%rowtype;
begin
  select token_sha256 into expected_token_sha256
  from public.vps_official_result_tokens token_row
  where token_row.source_label = normalized_source_label
  limit 1;

  actual_token_sha256 := encode(digest(coalesce(requested_token, ''), 'sha256'), 'hex');
  if expected_token_sha256 is null or actual_token_sha256 <> expected_token_sha256 then
    raise exception 'Invalid VPS official result token.';
  end if;

  for result_group in
    select
      finish_state.market_id as group_market_id,
      to_timestamp(floor(extract(epoch from finish_state.backend_race_start_at) / 300) * 300) as group_race_started_at
    from public.frontend_race_finish_state finish_state
    left join public.market_results_v2 existing_result
      on existing_result.market_id = finish_state.market_id
     and existing_result.race_started_at = to_timestamp(floor(extract(epoch from finish_state.backend_race_start_at) / 300) * 300)
    where finish_state.source_label = normalized_source_label
      and finish_state.backend_race_start_at >= now() - interval '2 hours'
      and (
        existing_result.id is null
        or existing_result.resolved_by is distinct from normalized_source_label
        or existing_result.resolver_version is distinct from 'vps-frontend-v1'
      )
    group by
      finish_state.market_id,
      to_timestamp(floor(extract(epoch from finish_state.backend_race_start_at) / 300) * 300)
    having count(distinct finish_state.symbol) >= 4
       and count(*) filter (
         where finish_state.actual_engine_elapsed_ms is not null
           and finish_state.actual_engine_elapsed_ms > 0
           and finish_state.actual_engine_elapsed_ms <= 180000
       ) >= 4
    order by group_race_started_at desc, finish_state.market_id
    limit least(greatest(coalesce(requested_limit, 80), 1), 200)
  loop
    select
      array_agg(ordered_rows.symbol order by ordered_rows.finish_rank),
      jsonb_object_agg(ordered_rows.symbol, round(ordered_rows.actual_engine_elapsed_ms)::integer),
      max(ordered_rows.actual_engine_elapsed_ms)
    into place_symbols, elapsed_payload, max_elapsed_ms
    from (
      select
        finish_state.symbol,
        finish_state.actual_engine_elapsed_ms,
        row_number() over (
          order by
            case
              when finish_state.frontend_finish_place between 1 and 4 then 0
              else 1
            end,
            finish_state.frontend_finish_place nulls last,
            finish_state.actual_engine_elapsed_ms nulls last,
            finish_state.symbol
        ) as finish_rank
      from public.frontend_race_finish_state finish_state
      where finish_state.source_label = normalized_source_label
        and finish_state.market_id = result_group.group_market_id
        and to_timestamp(floor(extract(epoch from finish_state.backend_race_start_at) / 300) * 300) = result_group.group_race_started_at
        and finish_state.actual_engine_elapsed_ms is not null
        and finish_state.actual_engine_elapsed_ms > 0
        and finish_state.actual_engine_elapsed_ms <= 180000
    ) ordered_rows
    where ordered_rows.finish_rank <= 4;

    if coalesce(array_length(place_symbols, 1), 0) <> 4 or max_elapsed_ms is null then
      continue;
    end if;

    update public.market_results_v2 result_row
    set race_finished_at = result_group.group_race_started_at + (max_elapsed_ms / 1000.0) * interval '1 second',
        first_place = place_symbols[1],
        second_place = place_symbols[2],
        third_place = place_symbols[3],
        fourth_place = place_symbols[4],
        compared_finish_elapsed_ms = coalesce(elapsed_payload, '{}'::jsonb),
        result_snapshot = coalesce(result_row.result_snapshot, '{}'::jsonb) || jsonb_build_object(
          'official_source', normalized_source_label,
          'official_recorded_at', now(),
          'official_from', 'frontend_race_finish_state'
        ),
        resolved_by = normalized_source_label,
        resolver_version = 'vps-frontend-v1'
    where result_row.market_id = result_group.group_market_id
      and result_row.race_started_at = result_group.group_race_started_at
    returning * into saved_row;

    if saved_row.id is null then
      insert into public.market_results_v2(
        market_id,
        race_started_at,
        race_finished_at,
        first_place,
        second_place,
        third_place,
        fourth_place,
        compared_finish_elapsed_ms,
        result_snapshot,
        resolved_by,
        resolver_version
      )
      values (
        result_group.group_market_id,
        result_group.group_race_started_at,
        result_group.group_race_started_at + (max_elapsed_ms / 1000.0) * interval '1 second',
        place_symbols[1],
        place_symbols[2],
        place_symbols[3],
        place_symbols[4],
        coalesce(elapsed_payload, '{}'::jsonb),
        jsonb_build_object(
          'official_source', normalized_source_label,
          'official_recorded_at', now(),
          'official_from', 'frontend_race_finish_state'
        ),
        normalized_source_label,
        'vps-frontend-v1'
      )
      returning * into saved_row;
    end if;

    return query
      select
        saved_row.market_id,
        saved_row.race_started_at,
        saved_row.first_place,
        saved_row.second_place,
        saved_row.third_place,
        saved_row.fourth_place,
        saved_row.resolved_by,
        saved_row.resolver_version;
  end loop;
end;
$$;

grant execute on function public.record_vps_frontend_official_race_results_from_finish_state_v2(
  text,
  text,
  integer
) to anon, authenticated, service_role;

create or replace function public.protect_vps_official_market_result()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if old.resolved_by = 'vps-browser'
     and old.resolver_version = 'vps-frontend-v1'
     and new.resolved_by is distinct from 'vps-browser' then
    new.race_finished_at := old.race_finished_at;
    new.first_place := old.first_place;
    new.second_place := old.second_place;
    new.third_place := old.third_place;
    new.fourth_place := old.fourth_place;
    new.compared_finish_elapsed_ms := old.compared_finish_elapsed_ms;
    new.resolved_by := old.resolved_by;
    new.resolver_version := old.resolver_version;
    new.result_snapshot := coalesce(new.result_snapshot, '{}'::jsonb) || jsonb_build_object(
      'official_source', 'vps-browser',
      'official_from', coalesce(old.result_snapshot->>'official_from', 'frontend_race_finish_state'),
      'official_recorded_at', coalesce(old.result_snapshot->>'official_recorded_at', now()::text),
      'official_protected_at', now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists protect_vps_official_market_result_trigger on public.market_results_v2;

create trigger protect_vps_official_market_result_trigger
before update on public.market_results_v2
for each row
execute function public.protect_vps_official_market_result();
