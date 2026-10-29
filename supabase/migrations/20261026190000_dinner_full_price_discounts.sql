-- Dinner always keeps its full price. General order coupons apply to packages;
-- explicit non-dinner activity/add-on promotions retain their existing behavior.

create or replace function public.commerce_quote_details(p_quote jsonb,p_config jsonb) returns jsonb
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
  return p_quote||jsonb_build_object('lines',lines,'subtotalCents',(p_quote->>'totalCents')::integer,'discountCents',0,
    'discountExcludedActivityIds',(select coalesce(jsonb_agg(value->>'id'),'[]'::jsonb) from jsonb_array_elements(p_config->'activities') where value->>'kind'='dinner'));
end;
$$;

create or replace function public.commerce_apply_discount(p_quote jsonb,p_discount jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare line jsonb; lines jsonb:='[]'; eligible integer[]:='{}'; cents integer; eligible_total integer:=0; subtotal integer:=(p_quote->>'totalCents')::integer;
  discount_amount integer; cumulative bigint:=0; allocated integer:=0; next_allocated integer; i integer:=1; target text:=p_discount->>'target_type';
  excluded jsonb:=coalesce(p_quote->'discountExcludedActivityIds','[]'::jsonb); excluded_cents integer; non_dinner integer;
begin
  if exists(select 1 from jsonb_array_elements(p_quote->'lines') value where value->>'kind'='upgrade') then return jsonb_build_object('error','discount_upgrade_unsupported'); end if;
  if subtotal<(p_discount->>'min_subtotal_cents')::integer then return jsonb_build_object('error','discount_minimum_subtotal'); end if;
  for line in select value from jsonb_array_elements(p_quote->'lines') loop
    cents:=0;
    select coalesce(sum(coalesce((line->'activityAmounts'->>activity_id)::integer,(line->>'totalCents')::integer)),0) into excluded_cents
      from jsonb_array_elements_text(line->'activityIds') activity_id where excluded ? activity_id;
    non_dinner:=greatest(0,(line->>'totalCents')::integer-excluded_cents);
    if jsonb_array_length(p_discount->'allowed_tier_ids')=0 or p_discount->'allowed_tier_ids' ? (line->>'tierId') then
      if (target='order' and line->>'kind'='package')
        or (target='package' and line->>'kind'='package' and p_discount->'target_ids' ? (line->>'packageId'))
        or (target='addon' and line->>'kind'='addon' and p_discount->'target_ids' ? (line->>'addonId')) then cents:=non_dinner;
      elsif target='activity' then
        select least(non_dinner,coalesce(sum(value::integer),0)) into cents from jsonb_each_text(line->'activityAmounts') where p_discount->'target_ids' ? key and not(excluded ? key);
      end if;
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

create or replace function public.save_event_discount_code(p_event_id uuid,p_discount jsonb) returns jsonb
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
  -- A dinner activity or its add-on cannot become a coupon target. Mixed
  -- packages remain available, but their dinner allocation is never eligible.
  if (target='activity' and exists(select 1 from jsonb_array_elements(e.commerce_config->'activities') activity where activity->>'kind'='dinner' and activity->>'id'=any(ids)))
    or (target='addon' and exists(select 1 from jsonb_array_elements(e.commerce_config->'addons') addon join jsonb_array_elements(e.commerce_config->'activities') activity on activity->>'id'=addon->>'activityId' where addon->>'id'=any(ids) and activity->>'kind'='dinner'))
    or (target='package' and exists(select 1 from jsonb_array_elements(e.commerce_config->'packages') pkg where pkg->>'id'=any(ids) and not exists(select 1 from jsonb_array_elements(e.commerce_config->'activities') activity where pkg->'activityIds' ? (activity->>'id') and activity->>'kind'<>'dinner'))) then return jsonb_build_object('error','invalid_discount_target'); end if;
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

-- Reporting-only corrections for three reviewed paid orders. The immutable
-- financial quote, charged amount, customer and payment/refund identity stay
-- untouched. Any drift in a reviewed order aborts the migration for inspection.
alter table public.commerce_orders add column reporting_quote jsonb
  check(reporting_quote is null or jsonb_typeof(reporting_quote)='object');
comment on column public.commerce_orders.reporting_quote is 'Private reporting allocation only; quote and amount_cents remain the original financial record.';

do $$
declare reviewed_event_id constant uuid:='30da43c2-3ee7-4e7d-97b4-28c789e366de';
  reviewed constant uuid[]:=array['0b15b70f-8957-4a53-af3b-9d6e7c38afaf','630f4111-c2f3-4b9e-995c-76637b709085','b400e4b7-4271-4edd-baf9-0cdf605a2e32']::uuid[];
  o public.commerce_orders%rowtype; config jsonb; package_ids jsonb; dinner_ids jsonb; gross_lines jsonb; corrected jsonb; reviewed_count integer;
begin
  -- The event lock matches checkout lock ordering and prevents pricing changes
  -- while the two codes and historical reporting allocations are normalized.
  perform 1 from public.events where id=reviewed_event_id for update;
  if not found then return; end if;
  if exists(select 1 from public.commerce_orders where event_id=reviewed_event_id and state in ('reserved','awaiting_payment')) then raise exception 'Dinner policy: checkout holds require review'; end if;
  select commerce_config into config from public.events where id=reviewed_event_id;
  if (config->'addons' @> '[{"id":"aggiungi-cena","activityId":"cena","amountCents":2000}]'::jsonb) is not true
    or (config->'activities' @> '[{"id":"cena","kind":"dinner"}]'::jsonb) is not true then raise exception 'Dinner policy: event dinner changed'; end if;
  select coalesce(jsonb_agg(value->>'id'),'[]'::jsonb) into package_ids from jsonb_array_elements(config->'packages');
  if package_ids is distinct from '["solo-ws","solo-mc","ws-mc"]'::jsonb then raise exception 'Dinner policy: event packages changed'; end if;
  if (select count(*) from public.event_discount_codes discount where discount.event_id=reviewed_event_id and discount.code in ('SCUB','ILPRESIDENTE') and discount.discount_type='fixed_amount' and discount.discount_value=500 and discount.target_type='order' and discount.target_ids='{}'::text[])<>2 then raise exception 'Dinner policy: reviewed discount codes changed'; end if;
  update public.event_discount_codes discount set target_type='package',target_ids=array(select jsonb_array_elements_text(package_ids)),updated_at=now()
    where discount.event_id=reviewed_event_id and discount.code in ('SCUB','ILPRESIDENTE') and discount.discount_type='fixed_amount' and discount.discount_value=500 and discount.target_type='order';
  select count(*) into reviewed_count from public.commerce_orders where id=any(reviewed);
  if reviewed_count<>3 then raise exception 'Dinner policy: incomplete reviewed orders'; end if;
  for o in select * from public.commerce_orders where id=any(reviewed) order by id for update loop
    config:=o.event_snapshot->'commerce_config';
    if o.event_id is distinct from reviewed_event_id or o.state not in ('fulfilled','refunded') or o.upgrade_pass_id is not null or o.amount_cents<>8000
      or o.reporting_quote is not null or o.quote->>'totalCents' is distinct from '8000' or o.quote->>'subtotalCents' is distinct from '8500' or o.quote->>'discountCents' is distinct from '500'
      or o.quote->'discount'->>'targetType' is distinct from 'order' or o.quote->'discount'->>'discountType' is distinct from 'fixed_amount'
      or o.quote->'discount'->>'discountValue' is distinct from '500' or o.quote->'discount'->>'eligibleCents' is distinct from '8500'
      or coalesce(o.quote->'discount'->>'code','') not in ('SCUB','ILPRESIDENTE') or o.quote->'discount'->'targetIds' is distinct from '[]'::jsonb
      or o.discount_code_id is distinct from (o.quote->'discount'->>'id')::uuid or jsonb_array_length(o.quote->'lines') is distinct from 2 or jsonb_array_length(o.quote->'participants') is distinct from 1
      or nullif(o.stripe_session_id,'') is null or nullif(o.stripe_payment_intent,'') is null
      or (o.quote->'lines'->0 @> '{"kind":"package","packageId":"ws-mc","quantity":1,"participantIndex":0,"subtotalCents":6500,"discountCents":382,"totalCents":6118,"unitAmountCents":6118,"activityIds":["workshop","masterclass"],"activityAmounts":{"workshop":3500,"masterclass":3000}}'::jsonb) is not true
      or (o.quote->'lines'->1 @> '{"kind":"addon","addonId":"aggiungi-cena","quantity":1,"participantIndex":0,"subtotalCents":2000,"discountCents":118,"totalCents":1882,"unitAmountCents":1882,"activityIds":["cena"],"activityAmounts":{"cena":2000}}'::jsonb) is not true
      or o.quote->'lines'->0->'activityAmounts' is distinct from '{"workshop":3500,"masterclass":3000}'::jsonb
      or o.quote->'lines'->1->'activityAmounts' is distinct from '{"cena":2000}'::jsonb
      or o.quote->'lines'->0->'activityIds' is distinct from '["workshop","masterclass"]'::jsonb
      or o.quote->'lines'->1->'activityIds' is distinct from '["cena"]'::jsonb
      or (config->'addons' @> '[{"id":"aggiungi-cena","activityId":"cena","amountCents":2000}]'::jsonb) is not true
      or (config->'activities' @> '[{"id":"cena","kind":"dinner"}]'::jsonb) is not true then raise exception 'Dinner policy: reviewed order changed (%)',o.id; end if;
    select coalesce(jsonb_agg(value->>'id'),'[]'::jsonb) into package_ids from jsonb_array_elements(config->'packages');
    if package_ids is distinct from '["solo-ws","solo-mc","ws-mc"]'::jsonb then raise exception 'Dinner policy: reviewed package snapshot changed (%)',o.id; end if;
    select coalesce(jsonb_agg(value->>'id'),'[]'::jsonb) into dinner_ids from jsonb_array_elements(config->'activities') where value->>'kind'='dinner';
    select jsonb_agg(value||jsonb_build_object('totalCents',(value->>'subtotalCents')::integer,'unitAmountCents',(value->>'subtotalCents')::integer,'discountCents',0) order by ordinality) into gross_lines from jsonb_array_elements(o.quote->'lines') with ordinality;
    corrected:=public.commerce_apply_discount(o.quote||jsonb_build_object('lines',gross_lines,'totalCents',8500,'discountExcludedActivityIds',dinner_ids),
      jsonb_build_object('id',o.quote->'discount'->>'id','code',o.quote->'discount'->>'code','discount_type','fixed_amount','discount_value',500,'min_subtotal_cents',0,'allowed_tier_ids','[]'::jsonb,'target_type','package','target_ids',package_ids));
    if corrected ? 'error' or corrected->>'totalCents' is distinct from o.amount_cents::text or corrected->'lines'->0->>'totalCents' is distinct from '6000'
      or corrected->'lines'->1->>'totalCents' is distinct from '2000' or corrected->'lines'->1->>'discountCents' is distinct from '0'
      or (select sum((value->>'totalCents')::integer) from jsonb_array_elements(corrected->'lines'))<>o.amount_cents then raise exception 'Dinner policy: allocation invariant failed (%)',o.id; end if;
    corrected:=corrected||jsonb_build_object('reportingAdjustment',jsonb_build_object('version',1,'reason','dinner_full_price','originalDiscountTargetType','order','preservedTotalCents',o.amount_cents));
    update public.commerce_orders set reporting_quote=corrected where id=o.id;
  end loop;
end;
$$;

revoke all on function public.commerce_quote_details(jsonb,jsonb),public.commerce_apply_discount(jsonb,jsonb),public.save_event_discount_code(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.commerce_quote_details(jsonb,jsonb),public.commerce_apply_discount(jsonb,jsonb),public.save_event_discount_code(uuid,jsonb) to service_role;
