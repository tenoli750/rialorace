create table if not exists public.base_usdc_point_orders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.login_accounts(id) on delete cascade,
  wallet_address text not null,
  package_id text not null,
  expected_amount_units bigint not null,
  points_awarded bigint not null,
  status text not null default 'pending',
  tx_hash text unique,
  created_at timestamp with time zone not null default now(),
  paid_at timestamp with time zone
);

create index if not exists base_usdc_point_orders_account_id_created_at_idx
  on public.base_usdc_point_orders (account_id, created_at desc);

create index if not exists base_usdc_point_orders_status_created_at_idx
  on public.base_usdc_point_orders (status, created_at desc);

drop function if exists public.mark_base_usdc_point_order_paid(uuid, uuid, text);

create or replace function public.mark_base_usdc_point_order_paid(
  requested_order_id uuid,
  requested_account_id uuid,
  requested_tx_hash text
)
returns table (
  order_id uuid,
  account_id uuid,
  points_balance bigint,
  points_awarded bigint,
  already_processed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.base_usdc_point_orders%rowtype;
  current_balance bigint;
begin
  if requested_order_id is null then
    raise exception 'Missing order id.';
  end if;

  if requested_account_id is null then
    raise exception 'Missing account id.';
  end if;

  if nullif(trim(requested_tx_hash), '') is null then
    raise exception 'Missing transaction hash.';
  end if;

  select *
    into order_row
    from public.base_usdc_point_orders
    where id = requested_order_id
      and account_id = requested_account_id
    for update;

  if order_row.id is null then
    raise exception 'Base USDC order not found.';
  end if;

  if order_row.status = 'paid' then
    select la.points_balance::bigint
      into current_balance
      from public.login_accounts la
      where la.id = requested_account_id;

    return query
      select
        order_row.id,
        order_row.account_id,
        coalesce(current_balance, 0),
        order_row.points_awarded,
        true;
    return;
  end if;

  update public.base_usdc_point_orders as o
    set status = 'paid',
        tx_hash = lower(requested_tx_hash),
        paid_at = now()
    where o.id = requested_order_id;

  update public.login_accounts as la
    set points_balance = la.points_balance + order_row.points_awarded::integer,
        updated_at = now()
    where la.id = requested_account_id
    returning la.points_balance::bigint into current_balance;

  if current_balance is null then
    raise exception 'Login account not found.';
  end if;

  return query
    select
      order_row.id,
      order_row.account_id,
      current_balance,
      order_row.points_awarded,
      false;
end;
$$;

grant execute on function public.mark_base_usdc_point_order_paid(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
