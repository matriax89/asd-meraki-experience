-- Application-owned discounts: the amount reserved, charged and fulfilled is identical.
-- All code validation, holds and redemption counters are private to the service role.
create table public.event_discount_codes (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete restrict,
  code text not null check(code=upper(btrim(code)) and code ~ '^[A-Z0-9_-]{1,50}$'),
  name text not null check(length(btrim(name)) between 1 and 120), active boolean not null default true,
  starts_at timestamptz, ends_at timestamptz,
  discount_type text not null check(discount_type in ('percentage','fixed_amount')),
  discount_value integer not null check(discount_value between 1 and 10000000),
  min_subtotal_cents integer not null default 0 check(min_subtotal_cents between 0 and 10000000),
  max_uses integer check(max_uses between 1 and 1000000),
  target_type text not null check(target_type in ('order','package','activity','addon')),
  target_ids text[] not null default '{}', allowed_tier_ids text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(event_id,code), check(starts_at is null or ends_at is null or starts_at<ends_at),
  check(discount_type<>'percentage' or discount_value<=99),
  check((target_type='order' and cardinality(target_ids)=0) or (target_type<>'order' and cardinality(target_ids) between 1 and 30)),
  check(cardinality(allowed_tier_ids)<=30)
);
alter table public.commerce_orders add column discount_code_id uuid references public.event_discount_codes(id);
alter table public.ticket_reservations add column discount_code_id uuid references public.event_discount_codes(id);
alter table public.ticket_reservations add column discount_quote jsonb;
create table public.event_discount_redemptions (
  id uuid primary key default gen_random_uuid(), discount_code_id uuid not null references public.event_discount_codes(id),
  commerce_order_id uuid unique references public.commerce_orders(id), ticket_reservation_id uuid unique references public.ticket_reservations(id),
  consumed_at timestamptz, created_at timestamptz not null default now(),
  check((commerce_order_id is null)<>(ticket_reservation_id is null))
);
create index event_discount_redemptions_code on public.event_discount_redemptions(discount_code_id);
alter table public.event_discount_codes enable row level security;
alter table public.event_discount_redemptions enable row level security;
revoke all on public.event_discount_codes,public.event_discount_redemptions from public,anon,authenticated;
grant all on public.event_discount_codes,public.event_discount_redemptions to service_role;

create function public.commerce_translations_valid(p_value jsonb,p_max integer,p_empty boolean default false) returns boolean
language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(p_value) is distinct from 'object' then return false; end if;
  return not exists(select 1 from jsonb_each(p_value) x where x.key not in ('it','en','de','es')
    or jsonb_typeof(x.value)<>'string' or length(btrim(x.value#>>'{}'))>p_max
    or (not p_empty and length(btrim(x.value#>>'{}'))=0));
end;
$$;
alter function public.commerce_config_valid(jsonb) rename to commerce_config_valid_base;
create function public.commerce_config_valid(p_config jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb; pkg jsonb; tier jsonb; allocation jsonb; entry record;
begin
  if not public.commerce_config_valid_base(p_config) then return false; end if;
  for item in select value from jsonb_array_elements(p_config->'activities') union all select value from jsonb_array_elements(p_config->'packages') union all select value from jsonb_array_elements(p_config->'addons') loop
    if item ? 'nameTranslations' and not public.commerce_translations_valid(item->'nameTranslations',120) then return false; end if;
    if item ? 'descriptionTranslations' and not public.commerce_translations_valid(item->'descriptionTranslations',1000,true) then return false; end if;
    if item ? 'menuTranslations' then
      if jsonb_typeof(item->'menuTranslations') is distinct from 'object' then return false; end if;
      for entry in select * from jsonb_each(item->'menuTranslations') loop
        if not (item->'menuOptions' ? entry.key) or not public.commerce_translations_valid(entry.value,120) then return false; end if;
      end loop;
    end if;
  end loop;
  for pkg in select value from jsonb_array_elements(p_config->'packages') loop
    for tier in select value from jsonb_array_elements(pkg->'prices') loop
      if tier ? 'labelTranslations' and not public.commerce_translations_valid(tier->'labelTranslations',120) then return false; end if;
      if tier ? 'activityAmounts' then
        allocation:=tier->'activityAmounts';
        if jsonb_typeof(allocation) is distinct from 'object' then return false; end if;
        if (select count(*) from jsonb_object_keys(allocation))<>jsonb_array_length(pkg->'activityIds') then return false; end if;
        for entry in select * from jsonb_each(allocation) loop
          if not (pkg->'activityIds' ? entry.key) or jsonb_typeof(entry.value)<>'number'
            or (entry.value#>>'{}')::numeric<>(entry.value#>>'{}')::integer or (entry.value#>>'{}')::integer not between 0 and 10000000 then return false; end if;
        end loop;
        if (select sum((value#>>'{}')::integer) from jsonb_each(allocation))<>(tier->>'amountCents')::integer then return false; end if;
      end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end;
$$;

-- Explicit cents are frozen in quotes. Old configurations use an equal ordered split.
create function public.commerce_activity_amounts(p_activity_ids jsonb,p_amount integer,p_explicit jsonb default null) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb:='{}'; activity text; i integer:=0; n integer:=jsonb_array_length(p_activity_ids);
begin
  if p_explicit is not null then return p_explicit; end if;
  if n=0 then return result; end if;
  for activity in select value from jsonb_array_elements_text(p_activity_ids) loop
    result:=result||jsonb_build_object(activity,p_amount/n+case when i<p_amount%n then 1 else 0 end); i:=i+1;
  end loop;
  return result;
end;
$$;
create function public.commerce_quote_details(p_quote jsonb,p_config jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare line jsonb; lines jsonb:='[]'; pkg jsonb; tier jsonb; addon jsonb; person jsonb; participant integer:=-1; addon_index integer:=0; tier_id text;
begin
  for line in select value from jsonb_array_elements(p_quote->'lines') loop
    if line->>'kind' in ('package','upgrade') then
      participant:=participant+1; addon_index:=0; person:=p_quote->'participants'->participant;
      select value into pkg from jsonb_array_elements(p_config->'packages') where value->>'id'=line->>'packageId';
      select value into tier from jsonb_array_elements(pkg->'prices') where value->>'id'=line->>'tierId';
      tier_id:=line->>'tierId';
      line:=line||jsonb_build_object('activityAmounts',public.commerce_activity_amounts(line->'activityIds',(line->>'unitAmountCents')::integer,
        case when line->>'kind'='package' then tier->'activityAmounts' else null end));
    else
      select value into addon from jsonb_array_elements(p_config->'addons') where value->>'id'=person->'addonIds'->>addon_index;
      addon_index:=addon_index+1;
      line:=line||jsonb_build_object('addonId',addon->>'id','tierId',tier_id,'activityAmounts',jsonb_build_object(addon->>'activityId',(line->>'unitAmountCents')::integer));
    end if;
    line:=line||jsonb_build_object('participantIndex',participant,'subtotalCents',(line->>'totalCents')::integer,'discountCents',0);
    lines:=lines||jsonb_build_array(line);
  end loop;
  return p_quote||jsonb_build_object('lines',lines,'subtotalCents',(p_quote->>'totalCents')::integer,'discountCents',0);
end;
$$;
alter function public.quote_event_commerce(uuid,jsonb,uuid,text) rename to quote_event_commerce_base;
create function public.quote_event_commerce(p_event_id uuid,p_participants jsonb,p_upgrade_pass_id uuid default null,p_upgrade_token text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; config jsonb;
begin
  result:=public.quote_event_commerce_base(p_event_id,p_participants,p_upgrade_pass_id,p_upgrade_token);
  if result ? 'error' then return result; end if;
  select commerce_config into config from public.events where id=p_event_id;
  return jsonb_set(result,'{quote}',public.commerce_quote_details(result->'quote',config));
end;
$$;

-- The count is evaluated while holding the code row. Consumed uses survive refunds.
create function public.event_discount_usage(p_code_id uuid,p_exclude_redemption uuid default null) returns jsonb
language sql volatile security definer set search_path='' as $$
  select jsonb_build_object('redeemed_uses',count(*) filter(where r.consumed_at is not null),
    'reserved_uses',count(*) filter(where r.consumed_at is null and
      (co.state='awaiting_payment' or(co.state='reserved' and co.expires_at>now()) or tr.state='awaiting_payment' or(tr.state='reserved' and tr.expires_at>now()))))
  from public.event_discount_redemptions r
  left join public.commerce_orders co on co.id=r.commerce_order_id
  left join public.ticket_reservations tr on tr.id=r.ticket_reservation_id
  where r.discount_code_id=p_code_id and r.id is distinct from p_exclude_redemption;
$$;
create function public.event_discount_lookup(p_event_id uuid,p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare discount public.event_discount_codes%rowtype; usage jsonb;
begin
  select * into discount from public.event_discount_codes where event_id=p_event_id and code=upper(btrim(p_code)) for update;
  if not found then return jsonb_build_object('error','discount_invalid'); end if;
  if not discount.active or (discount.starts_at is not null and now()<discount.starts_at) or(discount.ends_at is not null and now()>=discount.ends_at) then return jsonb_build_object('error','discount_unavailable'); end if;
  usage:=public.event_discount_usage(discount.id);
  if discount.max_uses is not null and (usage->>'reserved_uses')::integer+(usage->>'redeemed_uses')::integer>=discount.max_uses then return jsonb_build_object('error','discount_exhausted'); end if;
  return jsonb_build_object('discount',to_jsonb(discount));
end;
$$;
create function public.commerce_apply_discount(p_quote jsonb,p_discount jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare line jsonb; lines jsonb:='[]'; eligible integer[]:='{}'; cents integer; eligible_total integer:=0; subtotal integer:=(p_quote->>'totalCents')::integer;
  discount_amount integer; cumulative bigint:=0; allocated integer:=0; next_allocated integer; i integer:=1; target text:=p_discount->>'target_type';
begin
  if subtotal<(p_discount->>'min_subtotal_cents')::integer then return jsonb_build_object('error','discount_minimum_subtotal'); end if;
  for line in select value from jsonb_array_elements(p_quote->'lines') loop
    cents:=0;
    if jsonb_array_length(p_discount->'allowed_tier_ids')=0 or p_discount->'allowed_tier_ids' ? (line->>'tierId') then
      if target='order' or (target='package' and line->>'kind'='package' and p_discount->'target_ids' ? (line->>'packageId')) or(target='addon' and p_discount->'target_ids' ? (line->>'addonId')) then cents:=(line->>'totalCents')::integer;
      elsif target='activity' then select coalesce(sum(value::integer),0) into cents from jsonb_each_text(line->'activityAmounts') where p_discount->'target_ids' ? key; end if;
    end if;
    eligible:=array_append(eligible,cents); eligible_total:=eligible_total+cents;
  end loop;
  if eligible_total=0 then return jsonb_build_object('error','discount_not_applicable'); end if;
  discount_amount:=case when p_discount->>'discount_type'='percentage' then round(eligible_total::numeric*(p_discount->>'discount_value')::integer/100)::integer else least(eligible_total,(p_discount->>'discount_value')::integer) end;
  if discount_amount=0 then return jsonb_build_object('error','discount_not_applicable'); end if;
  if subtotal-discount_amount<50 then return jsonb_build_object('error','discount_minimum_payment'); end if;
  for line in select value from jsonb_array_elements(p_quote->'lines') loop
    cumulative:=cumulative+eligible[i]; next_allocated:=(discount_amount::bigint*cumulative/eligible_total)::integer; cents:=next_allocated-allocated;
    line:=line||jsonb_build_object('subtotalCents',(line->>'totalCents')::integer,'discountCents',cents,'unitAmountCents',(line->>'unitAmountCents')::integer-cents,'totalCents',(line->>'totalCents')::integer-cents);
    allocated:=next_allocated; i:=i+1; lines:=lines||jsonb_build_array(line);
  end loop;
  return p_quote||jsonb_build_object('lines',lines,'subtotalCents',subtotal,'discountCents',discount_amount,'totalCents',subtotal-discount_amount,
    'discount',jsonb_build_object('id',p_discount->>'id','code',p_discount->>'code','discountType',p_discount->>'discount_type','discountValue',(p_discount->>'discount_value')::integer,'targetType',target,'targetIds',p_discount->'target_ids','eligibleCents',eligible_total));
end;
$$;
create function public.quote_event_commerce_discount(p_event_id uuid,p_participants jsonb,p_upgrade_pass_id uuid default null,p_upgrade_token text default null,p_discount_code text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; discount jsonb; quote jsonb;
begin
  if nullif(btrim(p_discount_code),'') is null then return public.quote_event_commerce(p_event_id,p_participants,p_upgrade_pass_id,p_upgrade_token); end if;
  if p_upgrade_pass_id is not null then return jsonb_build_object('error','discount_upgrade_unsupported'); end if;
  result:=public.quote_event_commerce(p_event_id,p_participants,p_upgrade_pass_id,p_upgrade_token);
  if result ? 'error' then return result; end if;
  discount:=public.event_discount_lookup(p_event_id,p_discount_code); if discount ? 'error' then return discount; end if;
  quote:=public.commerce_apply_discount(result->'quote',discount->'discount'); if quote ? 'error' then return quote; end if;
  return jsonb_set(result,'{quote}',quote);
end;
$$;

create function public.reserve_event_commerce_discount(
  p_event_id uuid,p_request_id uuid,p_buyer_email text,p_locale text,p_participants jsonb,
  p_upgrade_pass_id uuid,p_upgrade_token text,p_attendees jsonb,p_privacy_version text,p_discount_code text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; priced jsonb; o public.commerce_orders%rowtype; code text:=nullif(upper(btrim(p_discount_code)),'');
begin
  if code is not null and p_upgrade_pass_id is not null then return jsonb_build_object('error','discount_upgrade_unsupported'); end if;
  if p_request_id is not null then perform pg_advisory_xact_lock(hashtextextended('commerce-request:'||p_request_id::text,0)); end if;
  perform 1 from public.events where id=p_event_id for update;
  select * into o from public.commerce_orders where request_id=p_request_id;
  if found then
    if nullif(o.quote->'discount'->>'code','') is distinct from code then return jsonb_build_object('error','invalid_request'); end if;
  elsif code is not null then
    priced:=public.quote_event_commerce_discount(p_event_id,p_participants,p_upgrade_pass_id,p_upgrade_token,code);
    if priced ? 'error' then return priced; end if;
  end if;
  if p_upgrade_pass_id is not null then result:=public.reserve_event_commerce(p_event_id,p_request_id,p_buyer_email,p_locale,p_participants,p_upgrade_pass_id,p_upgrade_token);
  else result:=public.reserve_event_commerce_attendees(p_event_id,p_request_id,p_buyer_email,p_locale,p_participants,p_upgrade_pass_id,p_upgrade_token,p_attendees,p_privacy_version); end if;
  if result ? 'error' or priced is null then return result; end if;
  update public.commerce_orders set quote=priced->'quote',amount_cents=(priced->'quote'->>'totalCents')::integer,
    discount_code_id=(priced->'quote'->'discount'->>'id')::uuid where id=(result->'order'->>'id')::uuid returning * into o;
  insert into public.event_discount_redemptions(discount_code_id,commerce_order_id) values(o.discount_code_id,o.id);
  return jsonb_build_object('order',to_jsonb(o));
end;
$$;

create function public.quote_event_ticket_discount(p_event_id uuid,p_discount_code text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; quote jsonb; discount jsonb;
begin
  select * into e from public.events where id=p_event_id for update;
  if not found or not coalesce(e.attivo,false) or e.data_inizio<=now() or coalesce(e.cta_tipo,'stripe')<>'stripe' then return jsonb_build_object('error','event_unavailable'); end if;
  if coalesce((e.commerce_config->>'enabled')::boolean,false) then return jsonb_build_object('error','advanced_checkout_required'); end if;
  if e.prezzo_cents is null or e.prezzo_cents<=0 then return jsonb_build_object('error','invalid_price'); end if;
  quote:=jsonb_build_object('subtotalCents',e.prezzo_cents,'discountCents',0,'totalCents',e.prezzo_cents,'participants','[]'::jsonb,
    'lines',jsonb_build_array(jsonb_build_object('label','Biglietto','kind','package','quantity',1,'unitAmountCents',e.prezzo_cents,'totalCents',e.prezzo_cents,'activityIds','[]'::jsonb)));
  if nullif(btrim(p_discount_code),'') is not null then
    discount:=public.event_discount_lookup(p_event_id,p_discount_code); if discount ? 'error' then return discount; end if;
    quote:=public.commerce_apply_discount(quote,discount->'discount'); if quote ? 'error' then return quote; end if;
  end if;
  return jsonb_build_object('quote',quote);
end;
$$;
create function public.reserve_event_ticket_discount(
  p_request_id uuid,p_event_id uuid,p_buyer_email text,p_buyer_nome text,p_buyer_cognome text,p_locale text,
  p_attendee jsonb,p_privacy_version text,p_discount_code text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; priced jsonb; reservation public.ticket_reservations%rowtype; code text:=nullif(upper(btrim(p_discount_code)),'');
begin
  if p_request_id is not null then perform pg_advisory_xact_lock(hashtextextended('legacy-request:'||p_request_id::text,0)); end if;
  perform 1 from public.events where id=p_event_id for update;
  select * into reservation from public.ticket_reservations where id=p_request_id;
  if found then
    if nullif(reservation.discount_quote->'discount'->>'code','') is distinct from code then return jsonb_build_object('error','invalid_request'); end if;
  elsif code is not null then
    priced:=public.quote_event_ticket_discount(p_event_id,code); if priced ? 'error' then return priced; end if;
  end if;
  result:=public.reserve_event_ticket_attendee(p_request_id,p_event_id,p_buyer_email,p_buyer_nome,p_buyer_cognome,p_locale,p_attendee,p_privacy_version);
  if result ? 'error' or priced is null then return result; end if;
  update public.ticket_reservations set discount_quote=priced->'quote',amount_cents=(priced->'quote'->>'totalCents')::integer,
    discount_code_id=(priced->'quote'->'discount'->>'id')::uuid where id=p_request_id returning * into reservation;
  insert into public.event_discount_redemptions(discount_code_id,ticket_reservation_id) values(reservation.discount_code_id,reservation.id);
  return jsonb_build_object('reservation',reservation.event_snapshot||to_jsonb(reservation));
end;
$$;

-- Keep per-person package money correct when a fixed discount is spread over
-- different baskets. Older frozen quotes without indices retain their fallback.
do $$
declare definition text; original text:='where value->>''packageId''=participant->>''packageId'' and value->>''kind'' in (''package'',''upgrade'') limit 1';
begin
  definition:=pg_get_functiondef('public.fulfill_event_commerce(uuid,text,text,integer,text)'::regprocedure);
  if strpos(definition,original)=0 then raise exception 'Unexpected commerce fulfillment mapping'; end if;
  definition:=replace(definition,'for participant in select value from jsonb_array_elements(o.participants) loop',
    'for participant in select value||jsonb_build_object(''_quoteIndex'',ordinality-1) from jsonb_array_elements(o.participants) with ordinality loop');
  definition:=replace(definition,original,'where value->>''packageId''=participant->>''packageId'' and value->>''kind'' in (''package'',''upgrade'') and (not(value ? ''participantIndex'') or (value->>''participantIndex'')::integer=(participant->>''_quoteIndex'')::integer) limit 1');
  execute definition;
end;
$$;

-- Late payments re-check the cap under the same event -> code locks as reserve.
-- Successful redemption is durable even if the purchase is later refunded.
alter function public.fulfill_event_commerce(uuid,text,text,integer,text) rename to fulfill_event_commerce_base;
create function public.fulfill_event_commerce(p_order_id uuid,p_session_id text,p_payment_intent text,p_amount_cents integer,p_buyer_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.commerce_orders%rowtype; redemption public.event_discount_redemptions%rowtype; discount public.event_discount_codes%rowtype; usage jsonb; result jsonb;
begin
  if p_payment_intent is not null then perform pg_advisory_xact_lock(hashtextextended(p_payment_intent,0)); end if;
  select * into o from public.commerce_orders where id=p_order_id;
  if o.discount_code_id is null then return public.fulfill_event_commerce_base(p_order_id,p_session_id,p_payment_intent,p_amount_cents,p_buyer_email); end if;
  perform 1 from public.events where id=o.event_id for update;
  select * into discount from public.event_discount_codes where id=o.discount_code_id for update;
  select * into o from public.commerce_orders where id=p_order_id for update;
  if o.buyer_email<>lower(btrim(p_buyer_email)) or (o.stripe_session_id is not null and o.stripe_session_id<>p_session_id) or(o.stripe_payment_intent is not null and o.stripe_payment_intent<>p_payment_intent) then raise exception 'Order mismatch'; end if;
  select * into redemption from public.event_discount_redemptions where commerce_order_id=o.id;
  if redemption.id is null then raise exception 'Discount reservation missing'; end if;
  usage:=public.event_discount_usage(discount.id,redemption.id);
  if redemption.consumed_at is null and o.state not in ('fulfilled','refund_required','refund_pending','refunded')
    and not exists(select 1 from public.commerce_payment_refunds where payment_intent=p_payment_intent and status in ('succeeded','pending','requires_action'))
    and discount.max_uses is not null and (usage->>'reserved_uses')::integer+(usage->>'redeemed_uses')::integer>=discount.max_uses then
    update public.commerce_orders set state='refund_required',failure_reason='discount_exhausted',stripe_session_id=p_session_id,stripe_payment_intent=p_payment_intent,updated_at=now() where id=o.id;
    return jsonb_build_object('outcome','refund_required','passes','[]'::jsonb);
  end if;
  result:=public.fulfill_event_commerce_base(p_order_id,p_session_id,p_payment_intent,p_amount_cents,p_buyer_email);
  if result->>'outcome'='fulfilled' then update public.event_discount_redemptions set consumed_at=coalesce(consumed_at,now()) where id=redemption.id; end if;
  return result;
end;
$$;
alter function public.fulfill_event_ticket(uuid,uuid,text,text,text,integer) rename to fulfill_event_ticket_base;
create function public.fulfill_event_ticket(p_reservation_id uuid,p_event_id uuid,p_session_id text,p_payment_intent text,p_buyer_email text,p_amount_cents integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare reservation public.ticket_reservations%rowtype; redemption public.event_discount_redemptions%rowtype; discount public.event_discount_codes%rowtype; usage jsonb; result jsonb;
begin
  if p_payment_intent is not null then perform pg_advisory_xact_lock(hashtextextended(p_payment_intent,0)); end if;
  select * into reservation from public.ticket_reservations where id=p_reservation_id;
  if reservation.discount_code_id is null then return public.fulfill_event_ticket_base(p_reservation_id,p_event_id,p_session_id,p_payment_intent,p_buyer_email,p_amount_cents); end if;
  perform 1 from public.events where id=p_event_id for update;
  select * into discount from public.event_discount_codes where id=reservation.discount_code_id for update;
  select * into reservation from public.ticket_reservations where id=p_reservation_id for update;
  if reservation.event_id<>p_event_id or reservation.buyer_email<>p_buyer_email or (reservation.stripe_session_id is not null and reservation.stripe_session_id<>p_session_id) then raise exception 'Reservation mismatch'; end if;
  select * into redemption from public.event_discount_redemptions where ticket_reservation_id=reservation.id;
  if redemption.id is null then raise exception 'Discount reservation missing'; end if;
  usage:=public.event_discount_usage(discount.id,redemption.id);
  if redemption.consumed_at is null and reservation.state not in ('fulfilled','refund_required','refund_pending','refunded')
    and not exists(select 1 from public.ticket_payment_refunds where payment_intent=p_payment_intent)
    and discount.max_uses is not null and (usage->>'reserved_uses')::integer+(usage->>'redeemed_uses')::integer>=discount.max_uses then
    update public.ticket_reservations set state='refund_required',failure_reason='discount_exhausted',stripe_session_id=p_session_id where id=reservation.id;
    return jsonb_build_object('outcome','refund_required','reservation_id',reservation.id);
  end if;
  result:=public.fulfill_event_ticket_base(p_reservation_id,p_event_id,p_session_id,p_payment_intent,p_buyer_email,p_amount_cents);
  if result->>'outcome'='fulfilled' then update public.event_discount_redemptions set consumed_at=coalesce(consumed_at,now()) where id=redemption.id; end if;
  return result;
end;
$$;

create function public.save_event_discount_code(p_event_id uuid,p_discount jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; discount public.event_discount_codes%rowtype; discount_id uuid; target text; ids text[]; tiers text[]; identifier text; usage jsonb;
begin
  select * into e from public.events where id=p_event_id for update;
  if not found then return jsonb_build_object('error','event_unavailable'); end if;
  if jsonb_typeof(p_discount) is distinct from 'object' or jsonb_typeof(p_discount->'active') is distinct from 'boolean'
    or coalesce(upper(btrim(p_discount->>'code')),'') !~ '^[A-Z0-9_-]{1,50}$'
    or length(btrim(coalesce(p_discount->>'name',''))) not between 1 and 120
    or coalesce(p_discount->>'discountType','') not in ('percentage','fixed_amount')
    or coalesce(p_discount->>'targetType','') not in ('order','package','activity','addon')
    or jsonb_typeof(p_discount->'targetIds') is distinct from 'array' or jsonb_typeof(p_discount->'allowedTierIds') is distinct from 'array'
    or jsonb_typeof(p_discount->'discountValue') is distinct from 'number' or (p_discount->>'discountValue')::numeric<>(p_discount->>'discountValue')::integer
    or (p_discount->>'discountValue')::integer not between 1 and 10000000
    or (p_discount->>'discountType'='percentage' and (p_discount->>'discountValue')::integer>99)
    or jsonb_typeof(p_discount->'minSubtotalCents') is distinct from 'number' or (p_discount->>'minSubtotalCents')::numeric<>(p_discount->>'minSubtotalCents')::integer
    or (p_discount->>'minSubtotalCents')::integer not between 0 and 10000000 then return jsonb_build_object('error','invalid_discount'); end if;
  if p_discount->>'maxUses' is not null and (jsonb_typeof(p_discount->'maxUses')<>'number' or (p_discount->>'maxUses')::numeric<>(p_discount->>'maxUses')::integer or (p_discount->>'maxUses')::integer not between 1 and 1000000) then return jsonb_build_object('error','invalid_discount'); end if;
  target:=p_discount->>'targetType';
  select coalesce(array_agg(value),'{}') into ids from jsonb_array_elements_text(p_discount->'targetIds');
  select coalesce(array_agg(value),'{}') into tiers from jsonb_array_elements_text(p_discount->'allowedTierIds');
  if (target='order' and cardinality(ids)<>0) or (target<>'order' and cardinality(ids) not between 1 and 30) or cardinality(tiers)>30
    or (select count(distinct value) from unnest(ids) value)<>cardinality(ids) or(select count(distinct value) from unnest(tiers) value)<>cardinality(tiers) then return jsonb_build_object('error','invalid_discount'); end if;
  foreach identifier in array ids||tiers loop
    if identifier is null or identifier !~ '^[a-z0-9_-]{1,64}$' then return jsonb_build_object('error','invalid_discount'); end if;
  end loop;
  foreach identifier in array ids loop
    if target='package' and not exists(select 1 from jsonb_array_elements(e.commerce_config->'packages') x where x->>'id'=identifier)
      or target='activity' and not exists(select 1 from jsonb_array_elements(e.commerce_config->'activities') x where x->>'id'=identifier)
      or target='addon' and not exists(select 1 from jsonb_array_elements(e.commerce_config->'addons') x where x->>'id'=identifier) then return jsonb_build_object('error','invalid_discount_target'); end if;
  end loop;
  foreach identifier in array tiers loop
    if not exists(select 1 from jsonb_array_elements(e.commerce_config->'packages') pkg cross join lateral jsonb_array_elements(pkg->'prices') tier where tier->>'id'=identifier) then return jsonb_build_object('error','invalid_discount_target'); end if;
  end loop;
  if p_discount->>'startsAt' is not null and p_discount->>'endsAt' is not null and (p_discount->>'startsAt')::timestamptz>=(p_discount->>'endsAt')::timestamptz then return jsonb_build_object('error','invalid_discount'); end if;
  discount_id:=coalesce((p_discount->>'id')::uuid,gen_random_uuid());
  if p_discount->>'id' is not null then
    select * into discount from public.event_discount_codes where id=discount_id and event_id=p_event_id for update;
    if not found then return jsonb_build_object('error','discount_not_found'); end if;
    usage:=public.event_discount_usage(discount_id);
    if p_discount->>'maxUses' is not null and (p_discount->>'maxUses')::integer<(usage->>'reserved_uses')::integer+(usage->>'redeemed_uses')::integer then return jsonb_build_object('error','discount_limit_below_usage'); end if;
  end if;
  insert into public.event_discount_codes(id,event_id,code,name,active,starts_at,ends_at,discount_type,discount_value,min_subtotal_cents,max_uses,target_type,target_ids,allowed_tier_ids)
  values(discount_id,p_event_id,upper(btrim(p_discount->>'code')),btrim(p_discount->>'name'),(p_discount->>'active')::boolean,(p_discount->>'startsAt')::timestamptz,(p_discount->>'endsAt')::timestamptz,p_discount->>'discountType',(p_discount->>'discountValue')::integer,(p_discount->>'minSubtotalCents')::integer,(p_discount->>'maxUses')::integer,target,ids,tiers)
  on conflict(id) do update set code=excluded.code,name=excluded.name,active=excluded.active,starts_at=excluded.starts_at,ends_at=excluded.ends_at,discount_type=excluded.discount_type,discount_value=excluded.discount_value,min_subtotal_cents=excluded.min_subtotal_cents,max_uses=excluded.max_uses,target_type=excluded.target_type,target_ids=excluded.target_ids,allowed_tier_ids=excluded.allowed_tier_ids,updated_at=now()
  returning * into discount;
  return jsonb_build_object('discount',to_jsonb(discount));
exception when unique_violation then return jsonb_build_object('error','discount_code_exists');
  when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format or invalid_parameter_value or check_violation then return jsonb_build_object('error','invalid_discount');
end;
$$;
create function public.event_discount_code_stats(p_event_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('discounts',coalesce(jsonb_agg(to_jsonb(d)||public.event_discount_usage(d.id) order by d.created_at desc),'[]'::jsonb)) from public.event_discount_codes d where d.event_id=p_event_id;
$$;

revoke all on function public.commerce_translations_valid(jsonb,integer,boolean),public.commerce_config_valid(jsonb),public.commerce_config_valid_base(jsonb),public.commerce_activity_amounts(jsonb,integer,jsonb),public.commerce_quote_details(jsonb,jsonb),public.quote_event_commerce(uuid,jsonb,uuid,text),public.quote_event_commerce_base(uuid,jsonb,uuid,text),public.event_discount_usage(uuid,uuid),public.event_discount_lookup(uuid,text),public.commerce_apply_discount(jsonb,jsonb),public.quote_event_commerce_discount(uuid,jsonb,uuid,text,text),public.reserve_event_commerce_discount(uuid,uuid,text,text,jsonb,uuid,text,jsonb,text,text),public.quote_event_ticket_discount(uuid,text),public.reserve_event_ticket_discount(uuid,uuid,text,text,text,text,jsonb,text,text),public.fulfill_event_commerce(uuid,text,text,integer,text),public.fulfill_event_commerce_base(uuid,text,text,integer,text),public.fulfill_event_ticket(uuid,uuid,text,text,text,integer),public.fulfill_event_ticket_base(uuid,uuid,text,text,text,integer),public.save_event_discount_code(uuid,jsonb),public.event_discount_code_stats(uuid) from public,anon,authenticated;
grant execute on function public.commerce_translations_valid(jsonb,integer,boolean),public.commerce_config_valid(jsonb),public.commerce_activity_amounts(jsonb,integer,jsonb),public.commerce_quote_details(jsonb,jsonb),public.quote_event_commerce(uuid,jsonb,uuid,text),public.event_discount_usage(uuid,uuid),public.event_discount_lookup(uuid,text),public.commerce_apply_discount(jsonb,jsonb),public.quote_event_commerce_discount(uuid,jsonb,uuid,text,text),public.reserve_event_commerce_discount(uuid,uuid,text,text,jsonb,uuid,text,jsonb,text,text),public.quote_event_ticket_discount(uuid,text),public.reserve_event_ticket_discount(uuid,uuid,text,text,text,text,jsonb,text,text),public.fulfill_event_commerce(uuid,text,text,integer,text),public.fulfill_event_ticket(uuid,uuid,text,text,text,integer),public.save_event_discount_code(uuid,jsonb),public.event_discount_code_stats(uuid) to service_role;
