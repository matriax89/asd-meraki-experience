-- Staff records payments already received outside online checkout. Online orders
-- keep their existing fulfillment chain and never acquire synthetic Stripe IDs.
alter table public.commerce_orders
  add column payment_method text not null default 'online' check(payment_method in ('online','cash','pos')),
  add column paid_at timestamptz,
  add column manual_recorded_by uuid references auth.users(id),
  add column manual_payment_reference text,
  add column manual_fee_cents integer check(manual_fee_cents>=0),
  add column manual_note text,
  add column manual_request_fingerprint text;
alter table public.commerce_orders add constraint commerce_manual_payment_metadata check(
  payment_method='online' or (manual_recorded_by is not null and paid_at is not null
    and manual_request_fingerprint is not null and stripe_session_id is null and stripe_payment_intent is null
    and (manual_fee_cents is null or manual_fee_cents<=amount_cents)
    and (payment_method<>'cash' or manual_fee_cents=0))
);

create table public.manual_commerce_refunds (
  id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
  event_id uuid not null references public.events(id), order_id uuid not null references public.commerce_orders(id),
  amount_cents integer not null check(amount_cents>0), status text not null default 'succeeded' check(status='succeeded'),
  reason text not null, refunded_at timestamptz not null, payment_reference text,
  recorded_by uuid not null references auth.users(id), revoke_entitlement_ids uuid[] not null default '{}',
  requested_entitlement_ids uuid[] not null default '{}', full_remaining boolean not null,
  request_fingerprint text not null, created_at timestamptz not null default now()
);
create index manual_commerce_refunds_order on public.manual_commerce_refunds(order_id);
alter table public.manual_commerce_refunds enable row level security;
revoke all on public.manual_commerce_refunds from public,anon,authenticated;
grant all on public.manual_commerce_refunds to service_role;

-- Refunds with no admission revocation still invalidate the credit for later
-- upgrades, just like online refunds. No stale paid credit can be reused.
create or replace function public.meraki_pass_refund_blocked(p_pass_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.commerce_entitlements where pass_id=p_pass_id and status='refunded')
    or exists(select 1 from public.meraki_refunds r join public.commerce_orders o on o.id=r.order_id
      join public.commerce_passes p on p.order_id=o.id or p.id=o.upgrade_pass_id
      where p.id=p_pass_id and r.status in ('preparing','pending','requires_action','unknown','succeeded'))
    or exists(select 1 from public.manual_commerce_refunds r join public.commerce_orders o on o.id=r.order_id
      join public.commerce_passes p on p.order_id=o.id or p.id=o.upgrade_pass_id where p.id=p_pass_id);
$$;

create function public.record_manual_commerce_enrollment(
 p_actor_id uuid,p_request_id uuid,p_event_id uuid,p_buyer_email text,p_locale text,
 p_participants jsonb,p_attendees jsonb,p_expected_total_cents integer,p_payment_method text,
 p_paid_at timestamptz,p_payment_reference text,p_fee_cents integer,p_note text,
 p_discount_code text default null,p_affiliate_id uuid default null,p_upgrade_pass_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.commerce_orders%rowtype; e public.events%rowtype; pass public.commerce_passes%rowtype;
 result jsonb; fingerprint text; buyer text:=lower(btrim(p_buyer_email)); token text; participant jsonb; line jsonb; activity jsonb;
 package_ids text[]; ids text[]; k text; package_price integer; package_label text; pass_ids uuid[]:='{}';
 reference text:=nullif(btrim(p_payment_reference),''); note text:=nullif(btrim(p_note),'');
begin
 if p_actor_id is null or not exists(select 1 from public.profiles where id=p_actor_id and role in ('admin','editor')) then raise exception 'Staff authorization required'; end if;
 if p_request_id is null or p_event_id is null or p_payment_method is null or p_payment_method not in ('cash','pos')
   or p_expected_total_cents is null or p_expected_total_cents<0 or p_paid_at is null or p_paid_at>now()+interval '5 minutes' or p_paid_at<'2000-01-01'::timestamptz
   or length(coalesce(reference,''))>200 or length(coalesce(note,''))>2000 or p_fee_cents<0 or p_fee_cents>p_expected_total_cents
   or (p_payment_method='cash' and p_fee_cents is distinct from 0)
   or p_locale is null or p_locale not in ('it','en','de','es')
   or jsonb_typeof(p_participants) is distinct from 'array' or jsonb_array_length(p_participants) not between 1 and 10 then
   return jsonb_build_object('error','invalid_manual_payment');
 end if;
 fingerprint:=md5(jsonb_build_object('actor',p_actor_id,'event',p_event_id,'buyer',buyer,'locale',p_locale,'participants',p_participants,'attendees',p_attendees,
   'total',p_expected_total_cents,'method',p_payment_method,'paidAt',p_paid_at,'reference',reference,'fee',p_fee_cents,'note',note,
   'discount',nullif(upper(btrim(p_discount_code)),''),'affiliate',p_affiliate_id,'upgrade',p_upgrade_pass_id)::text);
 perform pg_advisory_xact_lock(hashtextextended('commerce-request:'||p_request_id::text,0));
 select * into e from public.events where id=p_event_id for update;
 if not found then return jsonb_build_object('error','event_unavailable'); end if;
 select * into o from public.commerce_orders where request_id=p_request_id;
 if found then
   if o.payment_method='online' or o.manual_request_fingerprint is distinct from fingerprint then return jsonb_build_object('error','request_conflict'); end if;
   if o.state not in ('fulfilled','refunded') then return jsonb_build_object('error','request_conflict'); end if;
   select coalesce(array_agg(p.id order by p.participant_index),'{}') into pass_ids from public.commerce_passes p where p.order_id=o.id or p.id=o.upgrade_pass_id;
   return jsonb_build_object('orderId',o.id,'passIds',pass_ids,'replayed',true);
 end if;
 if e.canceled_at is not null then return jsonb_build_object('error','event_unavailable'); end if;
 if p_upgrade_pass_id is not null then
   select * into pass from public.commerce_passes where id=p_upgrade_pass_id and event_id=p_event_id for update;
   if not found or pass.status<>'paid' or public.meraki_pass_refund_blocked(pass.id) or jsonb_array_length(p_participants)<>1
     or p_attendees is not null or p_affiliate_id is not null
     or p_participants->0->>'firstName' is distinct from pass.first_name or p_participants->0->>'lastName' is distinct from pass.last_name then
     return jsonb_build_object('error','invalid_upgrade');
   end if;
   token:=pass.qr_code;
   select buyer_email into buyer from public.commerce_orders where id=pass.order_id;
 else
   if jsonb_typeof(p_attendees) is distinct from 'array' or jsonb_array_length(p_attendees)<>jsonb_array_length(p_participants) then return jsonb_build_object('error','invalid_attendees'); end if;
   -- Staff cannot assert third-party marketing consent while recording a payment.
   if exists(select 1 from jsonb_array_elements(p_attendees) a where not public.commerce_attendee_valid(a)
     or coalesce(a->>'documentNumber','')!~'[^[:space:]]' or (a->>'marketingConsent')::boolean) then return jsonb_build_object('error','invalid_attendees'); end if;
 end if;
 -- This subtransaction also removes a reservation/discount hold if the displayed
 -- price changed before confirmation. Nothing survives an unsuccessful record.
 begin
   result:=public.reserve_event_commerce_affiliate(p_event_id,p_request_id,buyer,p_locale,p_participants,p_upgrade_pass_id,token,
     p_attendees,case when p_upgrade_pass_id is null then '2026-10-18-v1' else null end,p_discount_code,p_affiliate_id);
   if result ? 'error' then return result; end if;
   select * into o from public.commerce_orders where id=(result->'order'->>'id')::uuid for update;
   if o.amount_cents<>p_expected_total_cents then raise exception using errcode='M0001',message='Price changed'; end if;
   update public.commerce_orders set payment_method=p_payment_method,paid_at=p_paid_at,manual_recorded_by=p_actor_id,
     manual_payment_reference=reference,manual_fee_cents=p_fee_cents,manual_note=note,manual_request_fingerprint=fingerprint where id=o.id;
   -- Reservation has already serialized capacity, discount usage, sales windows,
   -- affiliate snapshots and upgrades. Issue exactly its frozen admissions.
   for participant in select value||jsonb_build_object('_quoteIndex',ordinality-1) from jsonb_array_elements(o.participants) with ordinality loop
     select value into line from jsonb_array_elements(o.quote->'lines') where value->>'packageId'=participant->>'packageId'
       and value->>'kind' in ('package','upgrade') and (not(value ? 'participantIndex') or (value->>'participantIndex')::integer=(participant->>'_quoteIndex')::integer) limit 1;
     if line is null then raise exception 'Reserved package missing'; end if;
     select array_agg(value) into package_ids from jsonb_array_elements_text(line->'activityIds');
     package_price:=(line->>'unitAmountCents')::integer; package_label:=split_part(line->>'label',' · ',1);
     if o.upgrade_pass_id is null then
       insert into public.commerce_passes(event_id,order_id,first_name,last_name,package_id,package_name,package_paid_cents,package_activity_ids,original_package_paid_cents)
       values(o.event_id,o.id,btrim(participant->>'firstName'),btrim(participant->>'lastName'),participant->>'packageId',package_label,package_price,package_ids,package_price) returning * into pass;
     else
       update public.commerce_passes set package_id=participant->>'packageId',package_name=package_label,
         package_paid_cents=package_paid_cents+package_price,package_activity_ids=package_ids where id=o.upgrade_pass_id returning * into pass;
     end if;
     ids:=package_ids;
     for k in select value from jsonb_array_elements_text(participant->'addonIds') loop
       select value into activity from jsonb_array_elements(o.event_snapshot->'commerce_config'->'addons') where value->>'id'=k;
       if activity is not null then ids:=array_append(ids,activity->>'activityId'); end if;
     end loop;
     for k in select distinct unnest(ids) loop
       if exists(select 1 from public.commerce_entitlements where pass_id=pass.id and activity_id=k and status in ('valid','used')) then continue; end if;
       select value into activity from jsonb_array_elements(o.event_snapshot->'commerce_config'->'activities') where value->>'id'=k;
       if activity is null then raise exception 'Reserved activity missing'; end if;
       insert into public.commerce_entitlements(pass_id,event_id,order_id,activity_id,activity_name,kind,menu_choice)
       values(pass.id,o.event_id,o.id,k,activity->>'name',activity->>'kind',participant->'menuChoices'->>k);
     end loop;
     pass_ids:=array_append(pass_ids,pass.id);
   end loop;
   update public.events set posti_venduti=coalesce(posti_venduti,0)+(o.demand->>'_passes')::integer where id=o.event_id;
   update public.commerce_orders set state='fulfilled',updated_at=now() where id=o.id;
   update public.event_discount_redemptions set consumed_at=coalesce(consumed_at,now()) where commerce_order_id=o.id;
   return jsonb_build_object('orderId',o.id,'passIds',pass_ids,'replayed',false);
 exception when sqlstate 'M0001' then return jsonb_build_object('error','price_changed'); end;
end;
$$;

create function public.record_manual_commerce_refund(
 p_actor_id uuid,p_request_id uuid,p_order_id uuid,p_amount_cents integer,p_reason text,p_refunded_at timestamptz,
 p_payment_reference text,p_revoke_entitlement_ids uuid[],p_expected_available_cents integer,p_confirm_used boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.commerce_orders%rowtype; r public.manual_commerce_refunds%rowtype; remaining integer; targets uuid[]; released integer; delta integer;
 full_refund boolean; fingerprint text; requested uuid[]; reference text:=nullif(btrim(p_payment_reference),'');
begin
 if p_actor_id is null or not exists(select 1 from public.profiles where id=p_actor_id and role in ('admin','editor')) then raise exception 'Staff authorization required'; end if;
 if p_request_id is null or p_order_id is null or p_amount_cents is null or p_amount_cents<=0
   or length(btrim(coalesce(p_reason,''))) not between 1 and 2000 or length(coalesce(reference,''))>200
   or p_refunded_at is null or p_refunded_at>now()+interval '5 minutes' or p_refunded_at<'2000-01-01'::timestamptz then raise exception 'Invalid refund request'; end if;
 select coalesce(array_agg(distinct id order by id),'{}') into requested from unnest(coalesce(p_revoke_entitlement_ids,'{}')) id;
 fingerprint:=md5(jsonb_build_object('actor',p_actor_id,'order',p_order_id,'amount',p_amount_cents,'reason',btrim(p_reason),'date',p_refunded_at,'reference',reference,'ids',requested,'expected',p_expected_available_cents,'confirmUsed',p_confirm_used)::text);
 perform pg_advisory_xact_lock(hashtextextended('manual-refund-request:'||p_request_id::text,0));
 select * into r from public.manual_commerce_refunds where request_id=p_request_id;
 if found then
   if r.request_fingerprint<>fingerprint then raise exception 'Refund request mismatch'; end if;
   select amount_cents-coalesce((select sum(amount_cents) from public.manual_commerce_refunds where order_id=p_order_id),0)::integer into remaining from public.commerce_orders where id=p_order_id;
   return jsonb_build_object('refund',to_jsonb(r),'orderId',p_order_id,'availableCents',remaining,'replayed',true);
 end if;
 select * into o from public.commerce_orders where id=p_order_id;
 if not found or o.payment_method not in ('cash','pos') or o.state not in ('fulfilled','refunded') then raise exception 'Payment not refundable'; end if;
 perform 1 from public.events where id=o.event_id for update;
 select * into o from public.commerce_orders where id=p_order_id for update;
 if p_refunded_at<o.paid_at then raise exception 'Refund predates payment'; end if;
 if exists(select 1 from public.commerce_orders up where up.upgrade_pass_id in (
   select id from public.commerce_passes where order_id=o.id or id=o.upgrade_pass_id
   union select pass_id from public.commerce_entitlements where order_id=o.id)
   and (up.state='awaiting_payment' or(up.state='reserved' and up.expires_at>now()))) then raise exception 'An upgrade payment is in progress'; end if;
 select o.amount_cents-coalesce(sum(amount_cents),0)::integer into remaining from public.manual_commerce_refunds where order_id=o.id;
 if p_expected_available_cents is null or p_expected_available_cents<>remaining then raise exception 'Refund balance changed: review the updated payment'; end if;
 if p_amount_cents>remaining then raise exception 'Refund exceeds remaining payment'; end if;
 full_refund:=p_amount_cents=remaining;
 if exists(select 1 from unnest(requested) chosen(id) where not exists(select 1 from public.commerce_entitlements ce where ce.id=chosen.id and ce.order_id=o.id)) then raise exception 'Invalid refund admissions'; end if;
 if not full_refund and exists(select 1 from public.commerce_entitlements where id=any(requested) and status not in ('valid','used','canceled')) then raise exception 'Admission already revoked'; end if;
 select coalesce(array_agg(id),'{}') into targets from public.commerce_entitlements where order_id=o.id and (full_refund or id=any(requested));
 if not coalesce(p_confirm_used,false) and exists(select 1 from public.commerce_entitlements where id=any(targets) and status='used') then raise exception 'Confirm used admission revocation'; end if;
 insert into public.manual_commerce_refunds(request_id,event_id,order_id,amount_cents,reason,refunded_at,payment_reference,recorded_by,revoke_entitlement_ids,requested_entitlement_ids,full_remaining,request_fingerprint)
 values(p_request_id,o.event_id,o.id,p_amount_cents,btrim(p_reason),p_refunded_at,reference,p_actor_id,targets,requested,full_refund,fingerprint) returning * into r;
 update public.commerce_entitlements set status='refunded' where order_id=o.id and id=any(targets);
 if full_refund then
   if o.upgrade_pass_id is null then
     update public.commerce_passes set package_paid_cents=greatest(0,package_paid_cents-original_package_paid_cents) where order_id=o.id;
   else
     select coalesce(sum((value->>'unitAmountCents')::integer),0) into delta from jsonb_array_elements(o.quote->'lines') where value->>'kind'='upgrade';
     update public.commerce_passes set package_paid_cents=greatest(0,package_paid_cents-delta),
       package_id=case when package_id=o.participants->0->>'packageId' then o.upgrade_snapshot->>'package_id' else package_id end,
       package_name=case when package_id=o.participants->0->>'packageId' then o.upgrade_snapshot->>'package_name' else package_name end,
       package_activity_ids=case when package_id=o.participants->0->>'packageId' then array(select jsonb_array_elements_text(o.upgrade_snapshot->'package_activity_ids')) else package_activity_ids end where id=o.upgrade_pass_id;
   end if;
   update public.commerce_orders set state='refunded',refund_status='succeeded',refund_id=r.id::text,updated_at=now() where id=o.id;
 end if;
 select count(*) into released from public.commerce_passes p where (p.order_id=o.id or p.id=o.upgrade_pass_id) and p.status='paid'
   and not exists(select 1 from public.commerce_entitlements ce where ce.pass_id=p.id and ce.status in ('valid','used'));
 update public.commerce_passes p set status=case when p.status='canceled' then 'canceled'
   when exists(select 1 from public.commerce_entitlements ce where ce.pass_id=p.id and ce.status in ('valid','used')) then 'paid' else 'refunded' end where p.order_id=o.id or p.id=o.upgrade_pass_id;
 update public.events set posti_venduti=greatest(0,coalesce(posti_venduti,0)-released) where id=o.event_id;
 return jsonb_build_object('refund',to_jsonb(r),'orderId',o.id,'availableCents',remaining-p_amount_cents,'replayed',false);
end;
$$;
revoke all on function public.record_manual_commerce_enrollment(uuid,uuid,uuid,text,text,jsonb,jsonb,integer,text,timestamptz,text,integer,text,text,uuid,uuid),public.record_manual_commerce_refund(uuid,uuid,uuid,integer,text,timestamptz,text,uuid[],integer,boolean) from public,anon,authenticated;
grant execute on function public.record_manual_commerce_enrollment(uuid,uuid,uuid,text,text,jsonb,jsonb,integer,text,timestamptz,text,integer,text,text,uuid,uuid),public.record_manual_commerce_refund(uuid,uuid,uuid,integer,text,timestamptz,text,uuid[],integer,boolean) to service_role;
