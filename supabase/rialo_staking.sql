create table if not exists public.rialo_staking_wallets (
  account_id uuid primary key references public.login_accounts(id) on delete cascade,
  available_rialo numeric(20, 6) not null default 100,
  staked_rialo numeric(20, 6) not null default 0,
  total_points_earned bigint not null default 0,
  last_claimed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rialo_staking_wallets_available_nonnegative check (available_rialo >= 0),
  constraint rialo_staking_wallets_staked_nonnegative check (staked_rialo >= 0)
);

create table if not exists public.rialo_staking_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.login_accounts(id) on delete cascade,
  event_type text not null check (event_type in ('stake', 'unstake', 'claim')),
  amount_rialo numeric(20, 6) not null check (amount_rialo > 0),
  points_awarded bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists rialo_staking_events_account_created_idx
  on public.rialo_staking_events (account_id, created_at desc);

alter table public.rialo_staking_wallets enable row level security;
alter table public.rialo_staking_events enable row level security;

alter table public.rialo_staking_wallets
  add column if not exists last_claimed_at timestamptz not null default now();

alter table public.rialo_staking_events
  drop constraint if exists rialo_staking_events_event_type_check;

alter table public.rialo_staking_events
  add constraint rialo_staking_events_event_type_check
  check (event_type in ('stake', 'unstake', 'claim'));

drop function if exists public.get_rialo_staking_status(text);
drop function if exists public.stake_rialo_with_login_session(text, numeric);
drop function if exists public.unstake_rialo_with_login_session(text, numeric);
drop function if exists public.claim_rialo_staking_points(text);

create or replace function public.ensure_rialo_staking_wallet(requested_account_id uuid)
returns public.rialo_staking_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_row public.rialo_staking_wallets;
begin
  insert into public.rialo_staking_wallets (account_id, available_rialo, staked_rialo)
  values (requested_account_id, 100, 0)
  on conflict (account_id) do nothing;

  select *
    into wallet_row
    from public.rialo_staking_wallets
    where account_id = requested_account_id;

  return wallet_row;
end;
$$;

create or replace function public.get_rialo_staking_status(requested_session_token text)
returns table (
  login_id text,
  available_rialo numeric,
  staked_rialo numeric,
  earning_rate_points_per_rialo_per_day bigint,
  projected_daily_points bigint,
  pending_points numeric,
  last_claimed_at timestamptz,
  total_points_earned bigint,
  current_points_balance bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  session_account_id uuid;
  wallet_row public.rialo_staking_wallets;
begin
  select ls.account_id
    into session_account_id
    from public.login_sessions ls
    where ls.session_token = requested_session_token
      and (ls.expires_at is null or ls.expires_at > now())
    limit 1;

  if session_account_id is null then
    raise exception 'Login required.';
  end if;

  wallet_row := public.ensure_rialo_staking_wallet(session_account_id);

  return query
  select
    la.login_id::text,
    wallet_row.available_rialo,
    wallet_row.staked_rialo,
    100::bigint,
    floor(wallet_row.staked_rialo * 100)::bigint,
    greatest(extract(epoch from (now() - wallet_row.last_claimed_at)), 0) * wallet_row.staked_rialo * 100 / 86400,
    wallet_row.last_claimed_at,
    wallet_row.total_points_earned,
    la.points_balance::bigint
  from public.login_accounts la
  where la.id = session_account_id;
end;
$$;

create or replace function public.stake_rialo_with_login_session(
  requested_session_token text,
  requested_amount_rialo numeric
)
returns table (
  login_id text,
  available_rialo numeric,
  staked_rialo numeric,
  points_awarded bigint,
  pending_points numeric,
  last_claimed_at timestamptz,
  total_points_earned bigint,
  current_points_balance bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  session_account_id uuid;
  clean_amount numeric(20, 6);
begin
  clean_amount := floor(coalesce(requested_amount_rialo, 0));

  if clean_amount <= 0 then
    raise exception 'Enter a positive $RIALO amount.';
  end if;

  select ls.account_id
    into session_account_id
    from public.login_sessions ls
    where ls.session_token = requested_session_token
      and (ls.expires_at is null or ls.expires_at > now())
    limit 1;

  if session_account_id is null then
    raise exception 'Login required.';
  end if;

  perform public.ensure_rialo_staking_wallet(session_account_id);

  if not exists (
    select 1
      from public.rialo_staking_wallets as w
      where w.account_id = session_account_id
        and w.available_rialo >= clean_amount
  ) then
    raise exception 'Not enough available $RIALO.';
  end if;

  update public.rialo_staking_wallets as w
    set available_rialo = w.available_rialo - clean_amount,
        staked_rialo = w.staked_rialo + clean_amount,
        updated_at = now()
    where w.account_id = session_account_id;

  insert into public.rialo_staking_events (account_id, event_type, amount_rialo, points_awarded)
  values (session_account_id, 'stake', clean_amount, 0);

  return query
  select
    la.login_id::text,
    w.available_rialo,
    w.staked_rialo,
    0::bigint,
    greatest(extract(epoch from (now() - w.last_claimed_at)), 0) * w.staked_rialo * 100 / 86400,
    w.last_claimed_at,
    w.total_points_earned,
    la.points_balance::bigint
  from public.rialo_staking_wallets w
  join public.login_accounts la on la.id = w.account_id
  where w.account_id = session_account_id;
end;
$$;

create or replace function public.unstake_rialo_with_login_session(
  requested_session_token text,
  requested_amount_rialo numeric
)
returns table (
  login_id text,
  available_rialo numeric,
  staked_rialo numeric,
  points_awarded bigint,
  pending_points numeric,
  last_claimed_at timestamptz,
  total_points_earned bigint,
  current_points_balance bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  session_account_id uuid;
  clean_amount numeric(20, 6);
begin
  clean_amount := floor(coalesce(requested_amount_rialo, 0));

  if clean_amount <= 0 then
    raise exception 'Enter a positive $RIALO amount.';
  end if;

  select ls.account_id
    into session_account_id
    from public.login_sessions ls
    where ls.session_token = requested_session_token
      and (ls.expires_at is null or ls.expires_at > now())
    limit 1;

  if session_account_id is null then
    raise exception 'Login required.';
  end if;

  perform public.ensure_rialo_staking_wallet(session_account_id);

  if not exists (
    select 1
      from public.rialo_staking_wallets as w
      where w.account_id = session_account_id
        and w.staked_rialo >= clean_amount
  ) then
    raise exception 'You cannot unstake more than your staked $RIALO.';
  end if;

  update public.rialo_staking_wallets as w
    set available_rialo = w.available_rialo + clean_amount,
        staked_rialo = w.staked_rialo - clean_amount,
        updated_at = now()
    where w.account_id = session_account_id;

  insert into public.rialo_staking_events (account_id, event_type, amount_rialo, points_awarded)
  values (session_account_id, 'unstake', clean_amount, 0);

  return query
  select
    la.login_id::text,
    w.available_rialo,
    w.staked_rialo,
    0::bigint,
    greatest(extract(epoch from (now() - w.last_claimed_at)), 0) * w.staked_rialo * 100 / 86400,
    w.last_claimed_at,
    w.total_points_earned,
    la.points_balance::bigint
  from public.rialo_staking_wallets w
  join public.login_accounts la on la.id = w.account_id
  where w.account_id = session_account_id;
end;
$$;

create or replace function public.claim_rialo_staking_points(requested_session_token text)
returns table (
  login_id text,
  available_rialo numeric,
  staked_rialo numeric,
  points_awarded bigint,
  pending_points numeric,
  last_claimed_at timestamptz,
  total_points_earned bigint,
  current_points_balance bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  session_account_id uuid;
  claim_points bigint;
begin
  select ls.account_id
    into session_account_id
    from public.login_sessions ls
    where ls.session_token = requested_session_token
      and (ls.expires_at is null or ls.expires_at > now())
    limit 1;

  if session_account_id is null then
    raise exception 'Login required.';
  end if;

  perform public.ensure_rialo_staking_wallet(session_account_id);

  select floor(greatest(extract(epoch from (now() - w.last_claimed_at)), 0) * w.staked_rialo * 100 / 86400)::bigint
    into claim_points
    from public.rialo_staking_wallets as w
    where w.account_id = session_account_id;

  if claim_points <= 0 then
    raise exception 'No staking rewards ready to claim yet.';
  end if;

  update public.rialo_staking_wallets as w
    set total_points_earned = w.total_points_earned + claim_points,
        last_claimed_at = now(),
        updated_at = now()
    where w.account_id = session_account_id;

  update public.login_accounts as la
    set points_balance = la.points_balance + claim_points
    where la.id = session_account_id;

  insert into public.rialo_staking_events (account_id, event_type, amount_rialo, points_awarded)
  values (session_account_id, 'claim', 0.000001, claim_points);

  return query
  select
    la.login_id::text,
    w.available_rialo,
    w.staked_rialo,
    claim_points,
    0::numeric,
    w.last_claimed_at,
    w.total_points_earned,
    la.points_balance::bigint
  from public.rialo_staking_wallets w
  join public.login_accounts la on la.id = w.account_id
  where w.account_id = session_account_id;
end;
$$;

grant execute on function public.get_rialo_staking_status(text) to anon, authenticated;
grant execute on function public.stake_rialo_with_login_session(text, numeric) to anon, authenticated;
grant execute on function public.unstake_rialo_with_login_session(text, numeric) to anon, authenticated;
grant execute on function public.claim_rialo_staking_points(text) to anon, authenticated;
