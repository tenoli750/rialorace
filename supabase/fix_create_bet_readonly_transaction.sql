-- Fix create_bet_with_login_session failing with:
-- cannot execute UPDATE in a read-only transaction
--
-- The bet RPC deducts points and inserts a bet, so it must be VOLATILE.
-- If PostgREST has this function cached as STABLE/read-only, the UPDATE fails.

drop function if exists public.create_bet_with_login_session(
  text,
  integer,
  text,
  text,
  text,
  jsonb,
  text,
  timestamp with time zone
);

drop function if exists public.create_bet_with_login_session(
  text,
  integer,
  text,
  text,
  text,
  jsonb,
  text,
  timestamp with time zone,
  text,
  integer,
  text
);

drop function if exists public.create_bet_with_login_session(
  text,
  integer,
  text,
  text,
  text,
  jsonb,
  text,
  timestamp with time zone,
  text,
  integer,
  text,
  text
);

create or replace function public.create_bet_with_login_session(
  requested_session_token text,
  requested_stake_points integer,
  requested_first_pick text,
  requested_second_pick text,
  requested_third_pick text,
  requested_ratio_snapshot jsonb default '{}'::jsonb,
  requested_market_id text default null::text,
  requested_target_race_started_at timestamp with time zone default null::timestamp with time zone,
  requested_bet_type text default 'podium'::text,
  requested_finish_threshold_seconds integer default null::integer,
  requested_finish_time_pick text default null::text,
  requested_finish_time_symbol text default null::text
) returns table(bet_id uuid, points_balance integer)
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  account_row record;
  clean_bet_type text;
  clean_finish_time_pick text;
  clean_finish_time_symbol text;
  clean_finish_threshold_seconds integer;
  new_bet_id uuid;
  new_balance integer;
begin
  select * into account_row
  from public.session_account(requested_session_token)
  limit 1;

  if account_row.account_id is null then
    raise exception 'Login required.';
  end if;

  if requested_stake_points is null or requested_stake_points <= 0 then
    raise exception 'Stake must be greater than zero.';
  end if;

  clean_bet_type := coalesce(nullif(trim(requested_bet_type), ''), 'podium');
  if clean_bet_type not in ('podium', 'finish_time') then
    raise exception 'Unknown bet type.';
  end if;

  if clean_bet_type = 'podium' and
    requested_first_pick is null and
    requested_second_pick is null and
    requested_third_pick is null
  then
    raise exception 'At least one pick is required.';
  end if;

  clean_finish_time_pick := nullif(trim(coalesce(requested_finish_time_pick, '')), '');
  clean_finish_time_symbol := upper(nullif(trim(coalesce(requested_finish_time_symbol, '')), ''));
  clean_finish_threshold_seconds := requested_finish_threshold_seconds;

  if clean_bet_type = 'finish_time' then
    if clean_finish_threshold_seconds is null or clean_finish_threshold_seconds <= 0 then
      raise exception 'Finish time threshold is required.';
    end if;
    if clean_finish_time_pick not in ('under', 'over') then
      raise exception 'Finish time pick is required.';
    end if;
    if clean_finish_time_symbol is null then
      raise exception 'Finish time symbol is required.';
    end if;
  else
    clean_finish_time_pick := null;
    clean_finish_time_symbol := null;
    clean_finish_threshold_seconds := null;
  end if;

  update public.login_accounts
  set points_balance = public.login_accounts.points_balance - requested_stake_points,
      updated_at = now()
  where id = account_row.account_id
    and public.login_accounts.points_balance >= requested_stake_points
  returning public.login_accounts.points_balance into new_balance;

  if new_balance is null then
    raise exception 'Insufficient points.';
  end if;

  insert into public.bets(
    account_id,
    market_id,
    target_race_started_at,
    stake_points,
    first_pick,
    second_pick,
    third_pick,
    ratio_snapshot,
    bet_type,
    finish_threshold_seconds,
    finish_time_pick,
    finish_time_symbol
  )
  values (
    account_row.account_id,
    requested_market_id,
    requested_target_race_started_at,
    requested_stake_points,
    case when clean_bet_type = 'podium' then requested_first_pick else null end,
    case when clean_bet_type = 'podium' then requested_second_pick else null end,
    case when clean_bet_type = 'podium' then requested_third_pick else null end,
    coalesce(requested_ratio_snapshot, '{}'::jsonb),
    clean_bet_type,
    clean_finish_threshold_seconds,
    clean_finish_time_pick,
    clean_finish_time_symbol
  )
  returning id into new_bet_id;

  return query select new_bet_id, new_balance;
end;
$$;

grant execute on function public.create_bet_with_login_session(
  text,
  integer,
  text,
  text,
  text,
  jsonb,
  text,
  timestamp with time zone,
  text,
  integer,
  text,
  text
) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
