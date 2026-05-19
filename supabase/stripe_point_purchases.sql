create table if not exists public.point_purchases (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.login_accounts(id) on delete cascade,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text,
  stripe_event_id text,
  package_id text,
  amount_total integer not null,
  currency text not null default 'usd',
  points_awarded bigint not null,
  status text not null default 'paid',
  created_at timestamp with time zone not null default now()
);

create index if not exists point_purchases_account_id_created_at_idx
  on public.point_purchases (account_id, created_at desc);

drop function if exists public.credit_points_purchase_from_stripe(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  text,
  bigint
);

create or replace function public.credit_points_purchase_from_stripe(
  requested_account_id uuid,
  requested_checkout_session_id text,
  requested_payment_intent_id text,
  requested_stripe_event_id text,
  requested_package_id text,
  requested_amount_total integer,
  requested_currency text,
  requested_points_awarded bigint
)
returns table (
  purchase_id uuid,
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
  inserted_purchase_id uuid;
  existing_purchase record;
  current_balance bigint;
begin
  if requested_account_id is null then
    raise exception 'Missing account id.';
  end if;

  if nullif(trim(requested_checkout_session_id), '') is null then
    raise exception 'Missing Stripe checkout session id.';
  end if;

  if requested_amount_total is null or requested_amount_total <= 0 then
    raise exception 'Invalid Stripe amount.';
  end if;

  if requested_points_awarded is null or requested_points_awarded <= 0 or requested_points_awarded > 100000000 then
    raise exception 'Invalid points amount.';
  end if;

  insert into public.point_purchases (
    account_id,
    stripe_checkout_session_id,
    stripe_payment_intent_id,
    stripe_event_id,
    package_id,
    amount_total,
    currency,
    points_awarded,
    status
  )
  values (
    requested_account_id,
    requested_checkout_session_id,
    requested_payment_intent_id,
    requested_stripe_event_id,
    requested_package_id,
    requested_amount_total,
    lower(coalesce(nullif(requested_currency, ''), 'usd')),
    requested_points_awarded,
    'paid'
  )
  on conflict (stripe_checkout_session_id) do nothing
  returning id into inserted_purchase_id;

  if inserted_purchase_id is null then
    select p.id, p.account_id, p.points_awarded
      into existing_purchase
      from public.point_purchases p
      where p.stripe_checkout_session_id = requested_checkout_session_id;

    select la.points_balance::bigint
      into current_balance
      from public.login_accounts la
      where la.id = existing_purchase.account_id;

    return query
      select
        existing_purchase.id,
        existing_purchase.account_id,
        coalesce(current_balance, 0),
        existing_purchase.points_awarded,
        true;
    return;
  end if;

  update public.login_accounts as la
    set points_balance = la.points_balance + requested_points_awarded::integer,
        updated_at = now()
    where la.id = requested_account_id
    returning la.points_balance::bigint into current_balance;

  if current_balance is null then
    raise exception 'Login account not found.';
  end if;

  return query
    select
      inserted_purchase_id,
      requested_account_id,
      current_balance,
      requested_points_awarded,
      false;
end;
$$;

grant execute on function public.credit_points_purchase_from_stripe(uuid, text, text, text, text, integer, text, bigint) to service_role;

notify pgrst, 'reload schema';
