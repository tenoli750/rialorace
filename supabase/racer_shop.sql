-- Racer model shop.
-- Apply this file in Supabase before using the Shop page.

create table if not exists public.racer_shop_purchases (
  account_id uuid not null references public.login_accounts(id) on delete cascade,
  item_id text not null,
  purchased_at timestamp with time zone not null default now(),
  primary key (account_id, item_id)
);

create table if not exists public.racer_shop_equipment (
  account_id uuid not null references public.login_accounts(id) on delete cascade,
  token_symbol text not null,
  item_id text not null,
  updated_at timestamp with time zone not null default now(),
  primary key (account_id, token_symbol)
);

create index if not exists racer_shop_equipment_account_idx
  on public.racer_shop_equipment(account_id);

create or replace function public.get_racer_shop_state(requested_session_token text)
returns table(items jsonb, equipment jsonb, points_balance integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  account_row record;
  item_id_value text := 'ada_sloth';
  item_price integer := 5000;
  is_purchased boolean := false;
  is_equipped boolean := false;
begin
  select * into account_row
  from public.session_account(requested_session_token)
  limit 1;

  if account_row.account_id is null then
    raise exception 'Login required.';
  end if;

  select exists(
    select 1
    from public.racer_shop_purchases p
    where p.account_id = account_row.account_id
      and p.item_id = item_id_value
  ) into is_purchased;

  select exists(
    select 1
    from public.racer_shop_equipment e
    where e.account_id = account_row.account_id
      and e.token_symbol = 'ADA'
      and e.item_id = item_id_value
  ) into is_equipped;

  return query select
    jsonb_build_array(
      jsonb_build_object(
        'id', item_id_value,
        'name', 'Shasta Ground Sloth',
        'token_symbol', 'ADA',
        'model_key', 'sloth',
        'price_points', item_price,
        'asset_url', '/legacy-race/assets/sloth.glb',
        'purchased', is_purchased,
        'equipped', is_equipped
      )
    ),
    coalesce(
      (
        select jsonb_object_agg(e.token_symbol, e.item_id)
        from public.racer_shop_equipment e
        where e.account_id = account_row.account_id
      ),
      '{}'::jsonb
    ),
    account_row.points_balance::integer;
end;
$$;

drop function if exists public.buy_racer_shop_item(text, text);

create or replace function public.buy_racer_shop_item(
  requested_session_token text,
  requested_item_id text
) returns table(purchased_item_id text, points_balance integer, purchased boolean, equipped boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  account_row record;
  item_price integer := 5000;
  new_balance integer;
  is_equipped boolean := false;
begin
  if requested_item_id <> 'ada_sloth' then
    raise exception 'Shop item not found.';
  end if;

  select * into account_row
  from public.session_account(requested_session_token)
  limit 1;

  if account_row.account_id is null then
    raise exception 'Login required.';
  end if;

  if exists (
    select 1
    from public.racer_shop_purchases p
    where p.account_id = account_row.account_id
      and p.item_id = requested_item_id
  ) then
    return query select requested_item_id, account_row.points_balance::integer, true, exists(
      select 1
      from public.racer_shop_equipment e
      where e.account_id = account_row.account_id
        and e.token_symbol = 'ADA'
        and e.item_id = requested_item_id
    );
    return;
  end if;

  update public.login_accounts as la
  set points_balance = la.points_balance - item_price,
      updated_at = now()
  where la.id = account_row.account_id
    and la.points_balance >= item_price
  returning la.points_balance into new_balance;

  if new_balance is null then
    raise exception 'Not enough points.';
  end if;

  insert into public.racer_shop_purchases(account_id, item_id)
  values (account_row.account_id, requested_item_id)
  on conflict on constraint racer_shop_purchases_pkey do nothing;

  select exists(
    select 1
    from public.racer_shop_equipment e
    where e.account_id = account_row.account_id
      and e.token_symbol = 'ADA'
      and e.item_id = requested_item_id
  ) into is_equipped;

  return query select requested_item_id, new_balance, true, is_equipped;
end;
$$;

create or replace function public.equip_racer_shop_item(
  requested_session_token text,
  requested_token_symbol text,
  requested_item_id text default null::text
) returns table(equipment jsonb)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  account_row record;
  clean_token text;
begin
  clean_token := upper(trim(coalesce(requested_token_symbol, '')));
  if clean_token <> 'ADA' then
    raise exception 'This shop item can only be equipped on ADA.';
  end if;

  select * into account_row
  from public.session_account(requested_session_token)
  limit 1;

  if account_row.account_id is null then
    raise exception 'Login required.';
  end if;

  if requested_item_id is null or requested_item_id = '' or requested_item_id = 'default' then
    delete from public.racer_shop_equipment e
    where e.account_id = account_row.account_id
      and e.token_symbol = clean_token;
  else
    if requested_item_id <> 'ada_sloth' then
      raise exception 'Shop item not found.';
    end if;

    if not exists (
      select 1
      from public.racer_shop_purchases p
      where p.account_id = account_row.account_id
        and p.item_id = requested_item_id
    ) then
      raise exception 'Buy this model before equipping it.';
    end if;

    insert into public.racer_shop_equipment(account_id, token_symbol, item_id, updated_at)
    values (account_row.account_id, clean_token, requested_item_id, now())
    on conflict (account_id, token_symbol) do update
      set item_id = excluded.item_id,
          updated_at = now();
  end if;

  return query select coalesce(
    (
      select jsonb_object_agg(e.token_symbol, e.item_id)
      from public.racer_shop_equipment e
      where e.account_id = account_row.account_id
    ),
    '{}'::jsonb
  );
end;
$$;

grant execute on function public.get_racer_shop_state(text) to anon, authenticated;
grant execute on function public.buy_racer_shop_item(text, text) to anon, authenticated;
grant execute on function public.equip_racer_shop_item(text, text, text) to anon, authenticated;
