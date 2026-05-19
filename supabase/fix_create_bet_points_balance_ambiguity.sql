-- Fix create_bet_with_login_session failing with:
-- column reference "points_balance" is ambiguous.
-- The function returns a column named points_balance, so table column reads
-- inside PL/pgSQL must be qualified.

create or replace function public.create_bet_with_login_session(
  requested_session_token text,
  requested_stake_points integer,
  requested_first_pick text,
  requested_second_pick text,
  requested_third_pick text,
  requested_ratio_snapshot jsonb default '{}'::jsonb,
  requested_market_id text default null::text,
  requested_target_race_started_at timestamp with time zone default null::timestamp with time zone
) returns table(bet_id uuid, points_balance integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  account_row record;
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
    ratio_snapshot
  )
  values (
    account_row.account_id,
    requested_market_id,
    requested_target_race_started_at,
    requested_stake_points,
    requested_first_pick,
    requested_second_pick,
    requested_third_pick,
    coalesce(requested_ratio_snapshot, '{}'::jsonb)
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
  timestamp with time zone
) to anon, authenticated, service_role;
