alter table public.bets
  add column if not exists bet_type text not null default 'podium',
  add column if not exists finish_threshold_seconds integer,
  add column if not exists finish_time_pick text;

alter table public.bets
  drop constraint if exists bets_bet_type_check;

alter table public.bets
  add constraint bets_bet_type_check
  check (bet_type in ('podium', 'finish_time'));

alter table public.bets
  drop constraint if exists bets_finish_time_pick_check;

alter table public.bets
  add constraint bets_finish_time_pick_check
  check (finish_time_pick is null or finish_time_pick in ('under', 'over'));

create or replace function public.settle_bets_for_account(requested_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  won_row record;
begin
  update public.bets b
  set
    matched_places =
      case
        when coalesce(b.bet_type, 'podium') = 'finish_time' then
          case
            when (
              mr.race_finished_at is not null and
              b.finish_threshold_seconds is not null and
              (
                (b.finish_time_pick = 'under' and extract(epoch from (mr.race_finished_at - mr.race_started_at)) <= b.finish_threshold_seconds) or
                (b.finish_time_pick = 'over' and extract(epoch from (mr.race_finished_at - mr.race_started_at)) > b.finish_threshold_seconds)
              )
            ) then 1
            else 0
          end
        else
          (case when b.first_pick is not null and b.first_pick = mr.first_place then 1 else 0 end) +
          (case when b.second_pick is not null and b.second_pick = mr.second_place then 1 else 0 end) +
          (case when b.third_pick is not null and b.third_pick = mr.third_place then 1 else 0 end)
      end,
    payout_points =
      case
        when coalesce(b.bet_type, 'podium') = 'finish_time' and
          mr.race_finished_at is not null and
          b.finish_threshold_seconds is not null and
          (
            (b.finish_time_pick = 'under' and extract(epoch from (mr.race_finished_at - mr.race_started_at)) <= b.finish_threshold_seconds) or
            (b.finish_time_pick = 'over' and extract(epoch from (mr.race_finished_at - mr.race_started_at)) > b.finish_threshold_seconds)
          )
          then round(
            b.stake_points::numeric *
            coalesce(
              (b.ratio_snapshot->'finishTime'->>(case when b.finish_time_pick = 'under' then 'under60' else 'over60' end))::numeric,
              2
            )
          )::integer
        when coalesce(b.bet_type, 'podium') = 'podium' and (
          (b.first_pick is null or b.first_pick = mr.first_place) and
          (b.second_pick is null or b.second_pick = mr.second_place) and
          (b.third_pick is null or b.third_pick = mr.third_place) and
          (b.first_pick is not null or b.second_pick is not null or b.third_pick is not null)
        )
          then round(
            b.stake_points::numeric *
            public.compute_bet_payout_multiplier(
              b.first_pick,
              b.second_pick,
              b.third_pick,
              b.ratio_snapshot
            )
          )::integer
        else 0
      end,
    status =
      case
        when coalesce(b.bet_type, 'podium') = 'finish_time' and
          mr.race_finished_at is not null and
          b.finish_threshold_seconds is not null and
          (
            (b.finish_time_pick = 'under' and extract(epoch from (mr.race_finished_at - mr.race_started_at)) <= b.finish_threshold_seconds) or
            (b.finish_time_pick = 'over' and extract(epoch from (mr.race_finished_at - mr.race_started_at)) > b.finish_threshold_seconds)
          )
          then 'won'
        when coalesce(b.bet_type, 'podium') = 'podium' and (
          (b.first_pick is null or b.first_pick = mr.first_place) and
          (b.second_pick is null or b.second_pick = mr.second_place) and
          (b.third_pick is null or b.third_pick = mr.third_place) and
          (b.first_pick is not null or b.second_pick is not null or b.third_pick is not null)
        )
          then 'won'
        else 'lost'
      end,
    settled_at = coalesce(b.settled_at, now())
  from public.market_results_v2 mr
  where coalesce(b.account_id, b.user_id) = requested_account_id
    and b.status = 'placed'
    and b.market_id = mr.market_id
    and b.target_race_started_at = mr.race_started_at;

  for won_row in
    select id, payout_points
    from public.bets
    where coalesce(account_id, user_id) = requested_account_id
      and status = 'won'
      and settled_at is not null
      and balance_delta_applied_at is null
  loop
    update public.login_accounts as la
    set
      points_balance = la.points_balance + won_row.payout_points,
      updated_at = now()
    where la.id = requested_account_id;

    update public.bets
    set balance_delta_applied_at = now()
    where id = won_row.id;
  end loop;

  update public.bets
  set balance_delta_applied_at = coalesce(balance_delta_applied_at, now())
  where coalesce(account_id, user_id) = requested_account_id
    and status = 'lost'
    and settled_at is not null
    and balance_delta_applied_at is null;
end;
$$;

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
  requested_finish_time_pick text default null::text
) returns table(bet_id uuid, points_balance integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  account_row record;
  clean_bet_type text;
  clean_finish_time_pick text;
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
  clean_finish_threshold_seconds := requested_finish_threshold_seconds;
  if clean_bet_type = 'finish_time' then
    if clean_finish_threshold_seconds is null or clean_finish_threshold_seconds <= 0 then
      raise exception 'Finish time threshold is required.';
    end if;
    if clean_finish_time_pick not in ('under', 'over') then
      raise exception 'Finish time pick is required.';
    end if;
  else
    clean_finish_time_pick := null;
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
    finish_time_pick
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
    clean_finish_time_pick
  )
  returning id into new_bet_id;

  return query select new_bet_id, new_balance;
end;
$$;

drop function if exists public.list_current_race_bets_with_login_session(
  text,
  text,
  timestamp with time zone
);

drop function if exists public.list_bets_with_login_session(text);

create or replace function public.list_bets_with_login_session(requested_session_token text)
returns table (
  bet_id uuid,
  market_id text,
  target_race_started_at timestamp with time zone,
  stake_points integer,
  bet_type text,
  first_pick text,
  second_pick text,
  third_pick text,
  finish_threshold_seconds integer,
  finish_time_pick text,
  status text,
  payout_points integer,
  matched_places integer,
  settled_at timestamp with time zone,
  created_at timestamp with time zone,
  race_finished_at timestamp with time zone,
  finish_duration_seconds numeric,
  first_place text,
  second_place text,
  third_place text,
  fourth_place text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  account_row record;
begin
  select * into account_row
  from public.session_account(requested_session_token)
  limit 1;

  if account_row.account_id is null then
    raise exception 'Login required.';
  end if;

  perform public.settle_bets_for_account(account_row.account_id);

  return query
  select
    b.id,
    b.market_id,
    b.target_race_started_at,
    b.stake_points,
    coalesce(b.bet_type, 'podium'),
    b.first_pick,
    b.second_pick,
    b.third_pick,
    b.finish_threshold_seconds,
    b.finish_time_pick,
    b.status,
    b.payout_points,
    b.matched_places,
    b.settled_at,
    b.created_at,
    r.race_finished_at,
    case
      when r.race_finished_at is null then null
      else extract(epoch from (r.race_finished_at - r.race_started_at))
    end,
    r.first_place,
    r.second_place,
    r.third_place,
    r.fourth_place
  from public.bets b
  left join public.market_results_v2 r
    on r.market_id = b.market_id
   and r.race_started_at = b.target_race_started_at
  where coalesce(b.account_id, b.user_id) = account_row.account_id
  order by b.created_at desc;
end;
$$;

create or replace function public.list_current_race_bets_with_login_session(
  requested_session_token text,
  requested_market_id text,
  requested_target_race_started_at timestamp with time zone
)
returns table (
  bet_id uuid,
  market_id text,
  target_race_started_at timestamp with time zone,
  stake_points integer,
  bet_type text,
  first_pick text,
  second_pick text,
  third_pick text,
  finish_threshold_seconds integer,
  finish_time_pick text,
  status text,
  payout_points integer,
  matched_places integer,
  settled_at timestamp with time zone,
  created_at timestamp with time zone,
  race_finished_at timestamp with time zone,
  finish_duration_seconds numeric,
  first_place text,
  second_place text,
  third_place text,
  fourth_place text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select *
  from public.list_bets_with_login_session(requested_session_token) b
  where b.market_id = requested_market_id
    and b.target_race_started_at = requested_target_race_started_at
  order by b.created_at desc;
$$;

grant execute on function public.settle_bets_for_account(uuid) to anon, authenticated, service_role;
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
  text
) to anon, authenticated, service_role;
grant execute on function public.list_bets_with_login_session(text) to anon, authenticated, service_role;
grant execute on function public.list_current_race_bets_with_login_session(text, text, timestamp with time zone) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
