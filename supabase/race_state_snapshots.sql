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

alter table public.race_state_snapshots
  add column if not exists race_started_at timestamp with time zone,
  add column if not exists price numeric,
  add column if not exists speed_factor numeric,
  add column if not exists target_speed_factor numeric,
  add column if not exists distance_meters numeric,
  add column if not exists change_percent numeric,
  add column if not exists speed_effect_percent numeric,
  add column if not exists finish_place integer,
  add column if not exists finished_at timestamp with time zone;

create unique index if not exists race_state_snapshots_market_race_bucket_symbol_idx
  on public.race_state_snapshots(market_id, race_started_at, bucket_at, symbol);

create index if not exists race_state_snapshots_market_race_bucket_idx
  on public.race_state_snapshots(market_id, race_started_at, bucket_at desc);

grant select on public.race_state_snapshots to anon, authenticated, service_role;

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

grant execute on function public.record_race_state_snapshots(
  text,
  timestamp with time zone,
  timestamp with time zone,
  text,
  jsonb
) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
