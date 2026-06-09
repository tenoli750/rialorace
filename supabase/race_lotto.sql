-- Race-Lotto: six-race jackpot tickets.
-- A ticket costs 100 points. The jackpot starts at 400,000 points and includes
-- carryover plus all ticket stakes for the round.

create table if not exists public.race_lotto_carryover (
  singleton boolean primary key default true,
  current_carryover_points integer not null default 0,
  updated_at timestamp with time zone not null default now(),
  constraint race_lotto_carryover_singleton_check check (singleton)
);

insert into public.race_lotto_carryover(singleton, current_carryover_points)
values (true, 0)
on conflict (singleton) do nothing;

create table if not exists public.race_lotto_rounds (
  id uuid primary key default gen_random_uuid(),
  draw_key text not null unique,
  round_date date not null,
  draw_name text not null,
  draw_starts_at timestamp with time zone not null,
  sales_open_at timestamp with time zone not null,
  sales_close_at timestamp with time zone not null,
  base_jackpot_points integer not null default 400000,
  carried_points integer not null default 0,
  entry_pool_points integer not null default 0,
  status text not null default 'open',
  slots jsonb not null default '[]'::jsonb,
  winning_picks jsonb,
  winner_count integer not null default 0,
  jackpot_paid_points integer not null default 0,
  settled_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint race_lotto_rounds_status_check check (status in ('open', 'locked', 'settled')),
  constraint race_lotto_rounds_points_check check (
    base_jackpot_points >= 0 and carried_points >= 0 and entry_pool_points >= 0 and winner_count >= 0 and jackpot_paid_points >= 0
  )
);

create index if not exists race_lotto_rounds_draw_starts_at_idx
  on public.race_lotto_rounds(draw_starts_at desc);

alter table public.race_lotto_rounds
  add column if not exists sales_open_at timestamp with time zone;

update public.race_lotto_rounds
set sales_open_at = case
  when (draw_starts_at at time zone 'Asia/Seoul')::time >= make_time(16, 0, 0)
    then (((draw_starts_at at time zone 'Asia/Seoul')::date + make_time(10, 0, 0)) at time zone 'Asia/Seoul')
  else ((((draw_starts_at at time zone 'Asia/Seoul')::date - 1) + make_time(22, 0, 0)) at time zone 'Asia/Seoul')
end
where sales_open_at is null;

alter table public.race_lotto_rounds
  alter column sales_open_at set not null;

create index if not exists race_lotto_rounds_sales_window_idx
  on public.race_lotto_rounds(sales_open_at asc, sales_close_at asc);

create table if not exists public.race_lotto_tickets (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.race_lotto_rounds(id) on delete cascade,
  account_id uuid not null references public.login_accounts(id) on delete cascade,
  stake_points integer not null default 100,
  picks jsonb not null,
  matched_count integer not null default 0,
  payout_points integer not null default 0,
  status text not null default 'placed',
  settled_at timestamp with time zone,
  balance_delta_applied_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  constraint race_lotto_tickets_status_check check (status in ('placed', 'won', 'lost', 'refunded')),
  constraint race_lotto_tickets_stake_check check (stake_points = 100),
  constraint race_lotto_tickets_matched_check check (matched_count between 0 and 6),
  constraint race_lotto_tickets_points_check check (payout_points >= 0)
);

create unique index if not exists race_lotto_tickets_round_account_idx
  on public.race_lotto_tickets(round_id, account_id);

create index if not exists race_lotto_tickets_account_created_idx
  on public.race_lotto_tickets(account_id, created_at desc);

alter table public.race_lotto_tickets
  alter column stake_points set default 100;

alter table public.race_lotto_tickets
  drop constraint if exists race_lotto_tickets_stake_check;

alter table public.race_lotto_tickets
  add constraint race_lotto_tickets_stake_check check (stake_points = 100);

create or replace function public.get_race_lotto_market_coin_ids(requested_market_id text)
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  select case requested_market_id
    when 'market-01' then array['ETH', 'SOL', 'TRX', 'BNB']::text[]
    when 'market-02' then array['ETH', 'XRP', 'ADA', 'LTC']::text[]
    when 'market-03' then array['SOL', 'XRP', 'ADA', 'SUI']::text[]
    when 'market-04' then array['BTC', 'SOL', 'XRP', 'BNB']::text[]
    when 'market-05' then array['BTC', 'SOL', 'TRX', 'ADA']::text[]
    when 'market-06' then array['BTC', 'ETH', 'BNB', 'LTC']::text[]
    when 'market-07' then array['ETH', 'SOL', 'BNB', 'ADA']::text[]
    when 'market-08' then array['BTC', 'ETH', 'TRX', 'SUI']::text[]
    when 'market-09' then array['ETH', 'DOGE', 'ADA', 'SUI']::text[]
    when 'market-10' then array['BTC', 'ADA', 'SUI', 'LTC']::text[]
    when 'market-11' then array['BTC', 'ETH', 'DOGE', 'TRX']::text[]
    when 'market-12' then array['BTC', 'SOL', 'DOGE', 'XRP']::text[]
    when 'market-13' then array['DOGE', 'XRP', 'TRX', 'ADA']::text[]
    when 'market-14' then array['ETH', 'SOL', 'DOGE', 'LTC']::text[]
    when 'market-15' then array['DOGE', 'XRP', 'TRX', 'LTC']::text[]
    when 'market-16' then array['XRP', 'BNB', 'ADA', 'LTC']::text[]
    when 'market-17' then array['SOL', 'TRX', 'SUI', 'LTC']::text[]
    when 'market-18' then array['XRP', 'TRX', 'BNB', 'SUI']::text[]
    when 'market-19' then array['BTC', 'DOGE', 'BNB', 'SUI']::text[]
    when 'market-20' then array['DOGE', 'BNB', 'SUI', 'LTC']::text[]
    else array[]::text[]
  end;
$$;

create or replace function public.build_race_lotto_slots(requested_draw_starts_at timestamp with time zone)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $$
declare
  kst_date date;
  pack_index integer;
  market_numbers integer[];
  market_no integer;
  slot_no integer := 0;
  market_id text;
  slot_label text;
  slots jsonb := '[]'::jsonb;
begin
  kst_date := (requested_draw_starts_at at time zone 'Asia/Seoul')::date;
  pack_index := abs((kst_date - date '2026-01-01')::integer) % 3;

  market_numbers := case pack_index
    when 0 then array[1, 2, 8, 9, 12, 17]
    when 1 then array[3, 4, 6, 11, 13, 20]
    else array[5, 7, 10, 14, 16, 18]
  end;

  foreach market_no in array market_numbers loop
    slot_no := slot_no + 1;
    market_id := 'market-' || lpad(market_no::text, 2, '0');
    slot_label := array_to_string(public.get_race_lotto_market_coin_ids(market_id), ' / ');
    slots := slots || jsonb_build_array(
      jsonb_build_object(
        'slot', slot_no,
        'market_id', market_id,
        'market_number', market_no,
        'label', slot_label,
        'race_started_at', requested_draw_starts_at,
        'coin_ids', public.get_race_lotto_market_coin_ids(market_id)
      )
    );
  end loop;

  return slots;
end;
$$;

create or replace function public.ensure_race_lotto_round(requested_draw_starts_at timestamp with time zone)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  kst_started_at timestamp without time zone;
  draw_date date;
  draw_time time;
  normalized_draw_starts_at timestamp with time zone;
  normalized_sales_open_at timestamp with time zone;
  normalized_sales_close_at timestamp with time zone;
  current_carryover integer;
  draw_suffix text;
  draw_name_value text;
  round_id uuid;
begin
  if requested_draw_starts_at is null then
    raise exception 'Draw start is required.';
  end if;

  insert into public.race_lotto_carryover(singleton, current_carryover_points)
  values (true, 0)
  on conflict (singleton) do nothing;

  select current_carryover_points into current_carryover
  from public.race_lotto_carryover
  where singleton = true;

  kst_started_at := requested_draw_starts_at at time zone 'Asia/Seoul';
  draw_date := kst_started_at::date;
  draw_time := case
    when kst_started_at::time >= make_time(16, 0, 0) then make_time(22, 0, 0)
    else make_time(10, 0, 0)
  end;
  normalized_draw_starts_at := (draw_date + draw_time) at time zone 'Asia/Seoul';

  if draw_time = make_time(10, 0, 0) then
    normalized_sales_open_at := (((draw_date - 1) + make_time(22, 0, 0)) at time zone 'Asia/Seoul');
    normalized_sales_close_at := ((draw_date + make_time(9, 50, 0)) at time zone 'Asia/Seoul');
    draw_suffix := '10';
    draw_name_value := '10:00 KST Lotto';
  else
    normalized_sales_open_at := ((draw_date + make_time(10, 0, 0)) at time zone 'Asia/Seoul');
    normalized_sales_close_at := ((draw_date + make_time(21, 50, 0)) at time zone 'Asia/Seoul');
    draw_suffix := '22';
    draw_name_value := '22:00 KST Lotto';
  end if;

  insert into public.race_lotto_rounds(
    draw_key,
    round_date,
    draw_name,
    draw_starts_at,
    sales_open_at,
    sales_close_at,
    base_jackpot_points,
    carried_points,
    entry_pool_points,
    status,
    slots
  )
  values (
    to_char(draw_date, 'YYYY-MM-DD') || '-' || draw_suffix,
    draw_date,
    draw_name_value,
    normalized_draw_starts_at,
    normalized_sales_open_at,
    normalized_sales_close_at,
    400000,
    coalesce(current_carryover, 0),
    0,
    'open',
    public.build_race_lotto_slots(normalized_draw_starts_at)
  )
  on conflict (draw_key) do update
    set draw_name = excluded.draw_name,
        draw_starts_at = excluded.draw_starts_at,
        sales_open_at = excluded.sales_open_at,
        sales_close_at = excluded.sales_close_at,
        slots = excluded.slots,
        updated_at = now()
  returning id into round_id;

  return round_id;
end;
$$;

create or replace function public.ensure_race_lotto_rounds()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  kst_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  perform public.ensure_race_lotto_round((kst_today - 1 + make_time(22, 0, 0)) at time zone 'Asia/Seoul');
  perform public.ensure_race_lotto_round((kst_today + make_time(10, 0, 0)) at time zone 'Asia/Seoul');
  perform public.ensure_race_lotto_round((kst_today + make_time(22, 0, 0)) at time zone 'Asia/Seoul');
  perform public.ensure_race_lotto_round((kst_today + 1 + make_time(10, 0, 0)) at time zone 'Asia/Seoul');
  perform public.ensure_race_lotto_round((kst_today + 1 + make_time(22, 0, 0)) at time zone 'Asia/Seoul');

  update public.race_lotto_rounds
  set status = 'locked', updated_at = now()
  where status = 'open'
    and now() >= sales_close_at;
end;
$$;

create or replace function public.count_race_lotto_matches(ticket_picks jsonb, winning_picks jsonb)
returns integer
language sql
immutable
set search_path to 'public'
as $$
  select count(*)::integer
  from generate_series(1, 6) as slot_no
  where upper(coalesce(ticket_picks->>slot_no::text, '')) = upper(coalesce(winning_picks->>slot_no::text, ''));
$$;

create or replace function public.get_race_lotto_dashboard(requested_session_token text default null::text)
returns table(rounds jsonb, tickets jsonb, account_points_balance integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  account_id_value uuid;
  rounds_json jsonb;
  tickets_json jsonb := '[]'::jsonb;
  points_balance_value integer;
  active_round_id uuid;
  due_round_id uuid;
  latest_result_round_id uuid;
  next_round_id uuid;
  visible_round_ids uuid[];
begin
  perform public.ensure_race_lotto_rounds();
  perform public.settle_due_race_lotto_rounds();

  if requested_session_token is not null and length(trim(requested_session_token)) > 0 then
    select sa.account_id, sa.points_balance
      into account_id_value, points_balance_value
    from public.session_account(requested_session_token) sa
    limit 1;
  end if;

  select r.id into active_round_id
  from public.race_lotto_rounds r
  where r.status <> 'settled'
    and now() >= r.sales_open_at
    and now() < r.sales_close_at
  order by r.sales_close_at asc
  limit 1;

  select r.id into due_round_id
  from public.race_lotto_rounds r
  where r.status <> 'settled'
    and now() >= r.sales_close_at
  order by r.draw_starts_at desc
  limit 1;

  select r.id into latest_result_round_id
  from public.race_lotto_rounds r
  where r.status = 'settled'
  order by r.draw_starts_at desc
  limit 1;

  select r.id into next_round_id
  from public.race_lotto_rounds r
  where r.status <> 'settled'
    and now() < r.sales_open_at
  order by r.sales_open_at asc
  limit 1;

  select coalesce(array_agg(id order by priority), array[]::uuid[]) into visible_round_ids
  from (
    select id, min(priority) as priority
    from (
      values
        (active_round_id, 1),
        (due_round_id, 2),
        (latest_result_round_id, 3),
        (next_round_id, 4)
    ) as candidates(id, priority)
    where id is not null
    group by id
  ) ordered_candidates;

  select coalesce(jsonb_agg(round_payload order by sort_order), '[]'::jsonb) into rounds_json
  from (
    select
      array_position(visible_round_ids, r.id) as sort_order,
      r.draw_starts_at,
      jsonb_build_object(
        'id', r.id,
        'draw_key', r.draw_key,
        'round_date', r.round_date,
        'draw_name', r.draw_name,
        'draw_starts_at', r.draw_starts_at,
        'sales_open_at', r.sales_open_at,
        'sales_close_at', r.sales_close_at,
        'base_jackpot_points', r.base_jackpot_points,
        'carried_points', r.carried_points,
        'entry_pool_points', r.entry_pool_points,
        'current_jackpot_points', r.base_jackpot_points + r.carried_points + r.entry_pool_points,
        'ticket_price_points', 100,
        'status', case
          when r.status = 'settled' then 'settled'
          when now() < r.sales_open_at then 'upcoming'
          when now() >= r.draw_starts_at then 'ready'
          when now() >= r.sales_close_at then 'locked'
          else 'open'
        end,
        'slots', r.slots,
        'winning_picks', r.winning_picks,
        'winner_count', r.winner_count,
        'jackpot_paid_points', r.jackpot_paid_points,
        'settled_at', r.settled_at
      ) as round_payload
    from public.race_lotto_rounds r
    where r.id = any(visible_round_ids)
  ) payload;

  if account_id_value is not null then
    select coalesce(jsonb_agg(ticket_payload order by created_at desc), '[]'::jsonb) into tickets_json
    from (
      select
        t.created_at,
        jsonb_build_object(
          'id', t.id,
          'round_id', t.round_id,
          'stake_points', t.stake_points,
          'picks', t.picks,
          'matched_count', t.matched_count,
          'payout_points', t.payout_points,
          'status', t.status,
          'settled_at', t.settled_at,
          'created_at', t.created_at,
          'round_draw_key', r.draw_key,
          'round_draw_name', r.draw_name,
          'round_draw_starts_at', r.draw_starts_at,
          'round_status', r.status,
          'round_slots', r.slots,
          'round_winning_picks', r.winning_picks,
          'round_winner_count', r.winner_count
        ) as ticket_payload
      from public.race_lotto_tickets t
      join public.race_lotto_rounds r on r.id = t.round_id
      where t.account_id = account_id_value
      order by t.created_at desc
      limit 100
    ) payload;
  end if;

  return query select rounds_json, coalesce(tickets_json, '[]'::jsonb), points_balance_value;
end;
$$;

create or replace function public.create_race_lotto_ticket_with_login_session(
  requested_session_token text,
  requested_round_id uuid,
  requested_picks jsonb
) returns table(ticket_id uuid, points_balance integer, entry_pool_points integer, current_jackpot_points integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  account_row record;
  round_row public.race_lotto_rounds%rowtype;
  slot_entry jsonb;
  slot_no integer;
  clean_pick text;
  clean_picks jsonb := '{}'::jsonb;
  valid_coin_ids text[];
  new_ticket_id uuid;
  new_balance integer;
  new_entry_pool integer;
begin
  perform public.ensure_race_lotto_rounds();

  select * into account_row
  from public.session_account(requested_session_token)
  limit 1;

  if account_row.account_id is null then
    raise exception 'Login required.';
  end if;

  select * into round_row
  from public.race_lotto_rounds
  where id = requested_round_id
  for update;

  if round_row.id is null then
    raise exception 'Race-Lotto round not found.';
  end if;

  if round_row.status <> 'open' or now() < round_row.sales_open_at or now() >= round_row.sales_close_at then
    raise exception 'Race-Lotto entries are closed for this round.';
  end if;

  if exists (
    select 1 from public.race_lotto_tickets
    where race_lotto_tickets.round_id = requested_round_id
      and race_lotto_tickets.account_id = account_row.account_id
  ) then
    raise exception 'You already entered this Race-Lotto round.';
  end if;

  for slot_entry in select value from jsonb_array_elements(round_row.slots) loop
    slot_no := (slot_entry->>'slot')::integer;
    clean_pick := upper(nullif(trim(coalesce(requested_picks->>slot_no::text, '')), ''));
    select array_agg(value::text) into valid_coin_ids
    from jsonb_array_elements_text(slot_entry->'coin_ids') as value;

    if clean_pick is null then
      raise exception 'Pick all six Race-Lotto winners.';
    end if;

    if not clean_pick = any(coalesce(valid_coin_ids, array[]::text[])) then
      raise exception 'Invalid pick for Race-Lotto race %.', slot_no;
    end if;

    clean_picks := jsonb_set(clean_picks, array[slot_no::text], to_jsonb(clean_pick), true);
  end loop;

  update public.login_accounts as la
  set points_balance = la.points_balance - 100,
      updated_at = now()
  where la.id = account_row.account_id
    and la.points_balance >= 100
  returning la.points_balance into new_balance;

  if new_balance is null then
    raise exception 'Insufficient points.';
  end if;

  insert into public.race_lotto_tickets(round_id, account_id, stake_points, picks)
  values (requested_round_id, account_row.account_id, 100, clean_picks)
  returning id into new_ticket_id;

  update public.race_lotto_rounds as r
  set entry_pool_points = r.entry_pool_points + 100,
      updated_at = now()
  where r.id = requested_round_id
  returning r.entry_pool_points into new_entry_pool;

  return query select
    new_ticket_id,
    new_balance,
    new_entry_pool,
    round_row.base_jackpot_points + round_row.carried_points + new_entry_pool;
end;
$$;

create or replace function public.settle_race_lotto_round(requested_round_id uuid)
returns table(round_id uuid, status text, winner_count integer, jackpot_points integer, payout_per_winner integer, carried_points_after integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  round_row public.race_lotto_rounds%rowtype;
  slot_entry jsonb;
  slot_no integer;
  slot_market_id text;
  slot_race_started_at timestamp with time zone;
  first_place_value text;
  winning_picks_value jsonb := '{}'::jsonb;
  jackpot_value integer;
  winners integer;
  payout_value integer;
  new_carryover integer;
  winner_row record;
begin
  perform public.ensure_race_lotto_rounds();

  select * into round_row
  from public.race_lotto_rounds
  where id = requested_round_id
  for update;

  if round_row.id is null then
    raise exception 'Race-Lotto round not found.';
  end if;

  if round_row.status = 'settled' then
    jackpot_value := round_row.base_jackpot_points + round_row.carried_points + round_row.entry_pool_points;
    payout_value := case when round_row.winner_count > 0 then floor(jackpot_value::numeric / round_row.winner_count)::integer else 0 end;
    select current_carryover_points into new_carryover from public.race_lotto_carryover where singleton = true;
    return query select round_row.id, round_row.status, round_row.winner_count, jackpot_value, payout_value, coalesce(new_carryover, 0);
    return;
  end if;

  if now() < round_row.draw_starts_at then
    raise exception 'Race-Lotto results are not ready yet.';
  end if;

  for slot_entry in select value from jsonb_array_elements(round_row.slots) loop
    slot_no := (slot_entry->>'slot')::integer;
    slot_market_id := slot_entry->>'market_id';
    slot_race_started_at := (slot_entry->>'race_started_at')::timestamp with time zone;

    select mr.first_place into first_place_value
    from public.market_results_v2 mr
    where mr.market_id = slot_market_id
      and mr.race_started_at = slot_race_started_at
    limit 1;

    if first_place_value is null then
      raise exception 'Race-Lotto results are not ready yet.';
    end if;

    winning_picks_value := jsonb_set(winning_picks_value, array[slot_no::text], to_jsonb(first_place_value), true);
  end loop;

  jackpot_value := round_row.base_jackpot_points + round_row.carried_points + round_row.entry_pool_points;

  update public.race_lotto_tickets t
  set matched_count = public.count_race_lotto_matches(t.picks, winning_picks_value),
      status = case when public.count_race_lotto_matches(t.picks, winning_picks_value) = 6 then 'won' else 'lost' end,
      settled_at = now()
  where t.round_id = requested_round_id
    and t.status = 'placed';

  select count(*)::integer into winners
  from public.race_lotto_tickets as t
  where t.round_id = requested_round_id
    and t.status = 'won';

  payout_value := case when winners > 0 then floor(jackpot_value::numeric / winners)::integer else 0 end;

  if winners > 0 then
    update public.race_lotto_tickets as t
    set payout_points = payout_value
    where t.round_id = requested_round_id
      and t.status = 'won';

    for winner_row in
      select id, account_id, payout_points
      from public.race_lotto_tickets as t
      where t.round_id = requested_round_id
        and t.status = 'won'
        and t.balance_delta_applied_at is null
    loop
      update public.login_accounts as la
      set points_balance = la.points_balance + winner_row.payout_points,
          updated_at = now()
      where la.id = winner_row.account_id;

      update public.race_lotto_tickets as t
      set balance_delta_applied_at = now()
      where t.id = winner_row.id;
    end loop;

    new_carryover := 0;
  else
    new_carryover := round_row.carried_points + round_row.entry_pool_points;
  end if;

  update public.race_lotto_tickets as t
  set balance_delta_applied_at = coalesce(balance_delta_applied_at, now())
  where t.round_id = requested_round_id
    and t.status = 'lost';

  update public.race_lotto_carryover
  set current_carryover_points = new_carryover,
      updated_at = now()
  where singleton = true;

  update public.race_lotto_rounds as r
  set status = 'settled',
      winning_picks = winning_picks_value,
      winner_count = winners,
      jackpot_paid_points = case when winners > 0 then payout_value * winners else 0 end,
      settled_at = now(),
      updated_at = now()
  where r.id = requested_round_id;

  update public.race_lotto_rounds as r
  set carried_points = new_carryover,
      updated_at = now()
  where r.status <> 'settled'
    and r.draw_starts_at > round_row.draw_starts_at;

  return query select requested_round_id, 'settled'::text, winners, jackpot_value, payout_value, new_carryover;
end;
$$;

create or replace function public.settle_due_race_lotto_rounds()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  due_round record;
  settled_count integer := 0;
begin
  perform public.ensure_race_lotto_rounds();

  for due_round in
    select id
    from public.race_lotto_rounds
    where status <> 'settled'
      and now() >= draw_starts_at
    order by draw_starts_at asc
    limit 4
  loop
    begin
      perform 1 from public.settle_race_lotto_round(due_round.id);
      settled_count := settled_count + 1;
    exception when others then
      if SQLERRM <> 'Race-Lotto results are not ready yet.' then
        raise;
      end if;
    end;
  end loop;

  return settled_count;
end;
$$;

grant select on public.race_lotto_carryover to anon, authenticated;
grant select on public.race_lotto_rounds to anon, authenticated;
grant select on public.race_lotto_tickets to anon, authenticated;

grant execute on function public.get_race_lotto_market_coin_ids(text) to anon, authenticated;
grant execute on function public.build_race_lotto_slots(timestamp with time zone) to anon, authenticated;
grant execute on function public.ensure_race_lotto_round(timestamp with time zone) to anon, authenticated;
grant execute on function public.ensure_race_lotto_rounds() to anon, authenticated;
grant execute on function public.count_race_lotto_matches(jsonb, jsonb) to anon, authenticated;
grant execute on function public.get_race_lotto_dashboard(text) to anon, authenticated;
grant execute on function public.create_race_lotto_ticket_with_login_session(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.settle_race_lotto_round(uuid) to anon, authenticated;
grant execute on function public.settle_due_race_lotto_rounds() to anon, authenticated;
