-- Financial operations are server-only. A reservation of refundable cents is
-- committed before contacting Stripe; an uncertain network outcome stays held.
alter table public.events add column canceled_at timestamptz;
alter table public.events add column cancellation_reason text;
alter table public.ticket_reservations add column stripe_payment_intent text;
update public.ticket_reservations r set stripe_payment_intent=t.stripe_payment_intent
from public.tickets t where t.stripe_session_id=r.stripe_session_id;
-- Older issued tickets predate checkout holds. Give their existing payment a
-- source row so the refund panel/cancellation queue cannot silently omit them.
insert into public.ticket_reservations(event_id,buyer_email,buyer_nome,buyer_cognome,locale,amount_cents,event_snapshot,stripe_session_id,stripe_payment_intent,expires_at,state,created_at)
select t.event_id,t.buyer_email,coalesce(t.buyer_nome,''),coalesce(t.buyer_cognome,''),'it',t.amount_cents,
  jsonb_build_object('slug',e.slug,'titolo',e.titolo,'tipo',e.tipo),t.stripe_session_id,t.stripe_payment_intent,coalesce(t.created_at,now()),
  case when t.status='refunded' then 'refunded' else 'fulfilled' end,coalesce(t.created_at,now())
from public.tickets t join public.events e on e.id=t.event_id
where t.status in ('paid','used','refunded') and t.amount_cents>0 and coalesce(t.stripe_payment_intent,'')<>'' and coalesce(t.stripe_session_id,'')<>''
  and not exists(select 1 from public.ticket_reservations r where r.stripe_session_id=t.stripe_session_id);

create table public.meraki_event_cancellations (
  id uuid primary key default gen_random_uuid(), event_id uuid not null unique references public.events(id),
  reason text not null check(length(btrim(reason)) between 1 and 2000),
  created_by uuid not null, created_at timestamptz not null default now(),
  status text not null default 'processing' check(status in ('processing','complete','attention'))
);
create table public.meraki_refunds (
  id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
  event_id uuid not null references public.events(id),
  order_id uuid references public.commerce_orders(id),
  ticket_reservation_id uuid references public.ticket_reservations(id),
  payment_intent text not null check(length(payment_intent)>0),
  amount_cents integer not null check(amount_cents>0),
  reason text not null check(length(btrim(reason)) between 1 and 2000),
  status text not null default 'preparing' check(status in ('preparing','pending','requires_action','succeeded','failed','canceled','unknown')),
  stripe_refund_id text unique, revoke_entitlement_ids uuid[] not null default '{}',
  requested_entitlement_ids uuid[] not null default '{}', revoke_ticket boolean not null default false,
  full_remaining boolean not null default false, created_by uuid,
  cancellation_id uuid references public.meraki_event_cancellations(id), failure_reason text,
  email_sent_at timestamptz, email_claimed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(num_nonnulls(order_id,ticket_reservation_id)=1)
);
create index meraki_refunds_payment on public.meraki_refunds(payment_intent,status);
create index meraki_refunds_event on public.meraki_refunds(event_id,created_at);
alter table public.meraki_event_cancellations enable row level security;
alter table public.meraki_refunds enable row level security;
revoke all on public.meraki_event_cancellations,public.meraki_refunds from public,anon,authenticated;
grant all on public.meraki_event_cancellations,public.meraki_refunds to service_role;

create table public.meraki_cancellation_emails (
  id uuid primary key default gen_random_uuid(), cancellation_id uuid not null references public.meraki_event_cancellations(id),
  event_id uuid not null references public.events(id), email text not null,
  locale text not null check(locale in ('it','en','de','es')), refund_expected boolean not null default false,
  email_sent_at timestamptz, email_claimed_at timestamptz, failure_reason text,
  unique(cancellation_id,email)
);
alter table public.meraki_cancellation_emails enable row level security;
revoke all on public.meraki_cancellation_emails from public,anon,authenticated;
grant all on public.meraki_cancellation_emails to service_role;

create function public.meraki_pass_refund_blocked(p_pass_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.commerce_entitlements where pass_id=p_pass_id and status='refunded')
    or exists(select 1 from public.meraki_refunds r join public.commerce_orders o on o.id=r.order_id
      join public.commerce_passes p on p.order_id=o.id or p.id=o.upgrade_pass_id
      where p.id=p_pass_id and r.status in ('preparing','pending','requires_action','unknown','succeeded'));
$$;

create function public.reserve_meraki_refund(
  p_request_id uuid,p_order_id uuid,p_ticket_reservation_id uuid,p_amount_cents integer,
  p_reason text,p_entitlement_ids uuid[],p_created_by uuid,p_cancellation_id uuid default null,
  p_confirm_used boolean default false,p_expected_available_cents integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.meraki_refunds%rowtype; o public.commerce_orders%rowtype; t public.ticket_reservations%rowtype;
  v_event uuid; pi text; paid integer; settled integer; remaining integer; targets uuid[]; full_refund boolean;
begin
  if p_request_id is null or num_nonnulls(p_order_id,p_ticket_reservation_id)<>1 or p_amount_cents is null or p_amount_cents<=0
    or p_created_by is null or length(btrim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'Invalid refund request'; end if;
  perform pg_advisory_xact_lock(hashtextextended('refund-request:'||p_request_id::text,0));
  select * into r from public.meraki_refunds where request_id=p_request_id;
  if found then
    if r.order_id is distinct from p_order_id or r.ticket_reservation_id is distinct from p_ticket_reservation_id
      or r.amount_cents<>p_amount_cents or r.reason<>btrim(p_reason) or r.created_by<>p_created_by
      or r.cancellation_id is distinct from p_cancellation_id
      or not(r.requested_entitlement_ids @> coalesce(p_entitlement_ids,'{}') and r.requested_entitlement_ids <@ coalesce(p_entitlement_ids,'{}'))
      then raise exception 'Refund request mismatch'; end if;
    return to_jsonb(r);
  end if;
  if p_order_id is not null then
    select * into o from public.commerce_orders where id=p_order_id;
    if not found or o.state not in ('fulfilled','refund_required','refund_pending') then raise exception 'Payment not refundable'; end if;
    pi:=o.stripe_payment_intent; paid:=o.amount_cents; v_event:=o.event_id;
  else
    select * into t from public.ticket_reservations where id=p_ticket_reservation_id;
    if not found or t.state not in ('fulfilled','refund_required','refund_pending') then raise exception 'Payment not refundable'; end if;
    pi:=t.stripe_payment_intent;
    if pi is null then select stripe_payment_intent into pi from public.tickets where stripe_session_id=t.stripe_session_id; end if;
    paid:=t.amount_cents; v_event:=t.event_id;
  end if;
  if pi is null or pi='' then raise exception 'Payment identity missing'; end if;
  perform pg_advisory_xact_lock(hashtextextended(pi,0));
  perform 1 from public.events where id=v_event for update;
  -- Recheck after obtaining the common payment/event locks.
  if p_order_id is not null then
    select * into o from public.commerce_orders where id=p_order_id for update;
    if o.state='refunded' or exists(select 1 from public.commerce_payment_refunds where payment_intent=pi and status='succeeded') then raise exception 'Payment already refunded'; end if;
    if exists(select 1 from public.commerce_orders up where up.upgrade_pass_id in (
      select p.id from public.commerce_passes p where p.order_id=p_order_id or p.id=o.upgrade_pass_id
      union select ce.pass_id from public.commerce_entitlements ce where ce.order_id=p_order_id
    ) and (up.state='awaiting_payment' or(up.state='reserved' and up.expires_at>now()))) then raise exception 'An upgrade payment is in progress'; end if;
  else
    select * into t from public.ticket_reservations where id=p_ticket_reservation_id for update;
    if t.state='refunded' or exists(select 1 from public.ticket_payment_refunds where payment_intent=pi) then raise exception 'Payment already refunded'; end if;
  end if;
  if p_cancellation_id is not null and not exists(select 1 from public.meraki_event_cancellations where id=p_cancellation_id and event_id=v_event) then raise exception 'Cancellation mismatch'; end if;
  if exists(select 1 from public.meraki_refunds where payment_intent=pi and status in ('preparing','pending','requires_action','unknown')) then raise exception 'Refund already in progress'; end if;
  select coalesce(sum(amount_cents),0)::integer into settled from public.meraki_refunds where payment_intent=pi and status='succeeded';
  remaining:=paid-settled;
  if p_expected_available_cents is not null and p_expected_available_cents<>remaining then raise exception 'Refund balance changed: review the updated payment'; end if;
  if p_amount_cents>remaining then raise exception 'Refund exceeds remaining payment'; end if;
  full_refund:=p_amount_cents=remaining;
  if p_order_id is null and cardinality(coalesce(p_entitlement_ids,'{}'))>0 then raise exception 'Invalid refund admissions'; end if;
  if p_order_id is not null then
    if exists(select 1 from unnest(coalesce(p_entitlement_ids,'{}')) chosen(target_id) where not exists(select 1 from public.commerce_entitlements ce where ce.id=chosen.target_id and ce.order_id=p_order_id)) then raise exception 'Invalid refund admissions'; end if;
    if not full_refund and exists(select 1 from public.commerce_entitlements where id=any(coalesce(p_entitlement_ids,'{}')) and status not in ('valid','used','canceled')) then raise exception 'Admission already revoked'; end if;
    select coalesce(array_agg(id),'{}') into targets from public.commerce_entitlements where order_id=p_order_id
      and (full_refund or id=any(coalesce(p_entitlement_ids,'{}')));
    if not coalesce(p_confirm_used,false) and exists(select 1 from public.commerce_entitlements where id=any(targets) and status='used') then raise exception 'Confirm used admission revocation'; end if;
  else targets:='{}'; end if;
  if p_ticket_reservation_id is not null and full_refund and not coalesce(p_confirm_used,false) and exists(select 1 from public.tickets where stripe_session_id=t.stripe_session_id and status='used') then raise exception 'Confirm used admission revocation'; end if;
  insert into public.meraki_refunds(request_id,event_id,order_id,ticket_reservation_id,payment_intent,amount_cents,reason,revoke_entitlement_ids,requested_entitlement_ids,revoke_ticket,full_remaining,created_by,cancellation_id)
  values(p_request_id,v_event,p_order_id,p_ticket_reservation_id,pi,p_amount_cents,btrim(p_reason),targets,coalesce(p_entitlement_ids,'{}'),p_ticket_reservation_id is not null and full_refund,full_refund,p_created_by,p_cancellation_id) returning * into r;
  return to_jsonb(r);
end;
$$;

-- The old legacy revocation never returned its seat. Lock and count only live
-- tickets before revocation so repeated/out-of-order full-refund events are safe.
create or replace function public.revoke_event_ticket(p_payment_intent text)
returns void language plpgsql security definer set search_path='' as $$
declare e uuid; released integer;
begin
  if p_payment_intent is null or p_payment_intent='' then raise exception 'Payment intent required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_payment_intent,0));
  insert into public.ticket_payment_refunds(payment_intent) values(p_payment_intent) on conflict do nothing;
  for e in select distinct event_id from public.tickets where stripe_payment_intent=p_payment_intent loop
    perform 1 from public.events where id=e for update;
    select count(*) into released from public.tickets where event_id=e and stripe_payment_intent=p_payment_intent and status in ('paid','used');
    update public.tickets set status='refunded' where event_id=e and stripe_payment_intent=p_payment_intent and status<>'refunded';
    update public.events set posti_venduti=greatest(0,coalesce(posti_venduti,0)-released) where id=e;
  end loop;
  update public.ticket_reservations r set state='refunded',refund_status='succeeded'
  where r.stripe_payment_intent=p_payment_intent or exists(select 1 from public.tickets t where t.stripe_payment_intent=p_payment_intent and t.stripe_session_id=r.stripe_session_id);
end;
$$;

create function public.complete_meraki_refund(p_refund_id uuid,p_stripe_refund_id text,p_status text,p_failure_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.meraki_refunds%rowtype; released integer;
begin
  if p_status is null or p_status not in ('pending','requires_action','succeeded','failed','canceled','unknown') then raise exception 'Invalid refund status'; end if;
  if p_status in ('pending','requires_action','succeeded') and coalesce(p_stripe_refund_id,'')='' then raise exception 'Refund identity required'; end if;
  select * into r from public.meraki_refunds where id=p_refund_id;
  if not found then raise exception 'Refund not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(r.payment_intent,0));
  perform 1 from public.events where id=r.event_id for update;
  select * into r from public.meraki_refunds where id=p_refund_id for update;
  if r.stripe_refund_id is not null and p_stripe_refund_id is not null and r.stripe_refund_id<>p_stripe_refund_id then raise exception 'Refund identity mismatch'; end if;
  if r.status='succeeded' then return to_jsonb(r); end if;
  -- Terminal failures cannot be resurrected by an older pending webhook. A
  -- canonical succeeded status still wins if Stripe corrects a prior failure.
  if r.status in ('failed','canceled') and p_status in ('pending','requires_action','unknown') then return to_jsonb(r); end if;
  update public.meraki_refunds set stripe_refund_id=coalesce(p_stripe_refund_id,stripe_refund_id),status=p_status,
    failure_reason=left(p_failure_reason,1000),updated_at=now() where id=r.id returning * into r;
  if p_status<>'succeeded' then return to_jsonb(r); end if;
  if r.order_id is not null then
    if r.full_remaining then
      perform public.revoke_commerce_payment(r.payment_intent,r.stripe_refund_id,'succeeded');
    else
      update public.commerce_entitlements set status='refunded' where order_id=r.order_id and id=any(r.revoke_entitlement_ids);
      select count(*) into released from public.commerce_passes p where p.event_id=r.event_id and p.status='paid'
        and exists(select 1 from public.commerce_entitlements ce where ce.pass_id=p.id and ce.id=any(r.revoke_entitlement_ids))
        and not exists(select 1 from public.commerce_entitlements ce where ce.pass_id=p.id and ce.status in ('valid','used'));
      update public.commerce_passes p set status='refunded' where p.event_id=r.event_id and p.status='paid'
        and exists(select 1 from public.commerce_entitlements ce where ce.pass_id=p.id and ce.id=any(r.revoke_entitlement_ids))
        and not exists(select 1 from public.commerce_entitlements ce where ce.pass_id=p.id and ce.status in ('valid','used'));
      update public.events set posti_venduti=greatest(0,coalesce(posti_venduti,0)-released) where id=r.event_id;
    end if;
  elsif r.revoke_ticket then perform public.revoke_event_ticket(r.payment_intent);
  end if;
  return to_jsonb(r);
end;
$$;

-- Dashboard-created refunds enter the same ledger. A partial refund imported
-- from Stripe has no admission selection; cumulative full refunds revoke all.
create function public.record_meraki_external_refund(p_payment_intent text,p_stripe_refund_id text,p_amount_cents integer,p_status text,p_failure_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.meraki_refunds%rowtype; o public.commerce_orders%rowtype; t public.ticket_reservations%rowtype;
  v_event uuid; paid integer; settled integer; targets uuid[]:='{}'; full_refund boolean;
begin
  if p_payment_intent is null or p_payment_intent='' or p_stripe_refund_id is null or p_stripe_refund_id='' or p_amount_cents is null or p_amount_cents<=0 then raise exception 'Invalid external refund'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_payment_intent,0));
  select * into r from public.meraki_refunds where stripe_refund_id=p_stripe_refund_id;
  if found then
    if r.payment_intent<>p_payment_intent or r.amount_cents<>p_amount_cents then raise exception 'Refund identity mismatch'; end if;
    return public.complete_meraki_refund(r.id,p_stripe_refund_id,p_status,p_failure_reason);
  end if;
  select * into o from public.commerce_orders where stripe_payment_intent=p_payment_intent;
  if found then v_event:=o.event_id; paid:=o.amount_cents;
  else
    select r0.* into t from public.ticket_reservations r0 left join public.tickets t0 on t0.stripe_session_id=r0.stripe_session_id
      where r0.stripe_payment_intent=p_payment_intent or t0.stripe_payment_intent=p_payment_intent limit 1;
    if not found then return null; end if;
    v_event:=t.event_id; paid:=t.amount_cents;
  end if;
  perform 1 from public.events where id=v_event for update;
  select coalesce(sum(amount_cents),0)::integer into settled from public.meraki_refunds where payment_intent=p_payment_intent and status='succeeded';
  full_refund:=p_amount_cents>=paid-settled;
  if o.id is not null and full_refund then select coalesce(array_agg(id),'{}') into targets from public.commerce_entitlements where order_id=o.id; end if;
  insert into public.meraki_refunds(request_id,event_id,order_id,ticket_reservation_id,payment_intent,amount_cents,reason,stripe_refund_id,revoke_entitlement_ids,revoke_ticket,full_remaining)
  values(gen_random_uuid(),v_event,o.id,t.id,p_payment_intent,p_amount_cents,'Rimborso da Stripe',p_stripe_refund_id,targets,t.id is not null and full_refund,full_refund) returning * into r;
  return public.complete_meraki_refund(r.id,p_stripe_refund_id,p_status,p_failure_reason);
end;
$$;

create function public.claim_meraki_refund_email(p_refund_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.meraki_refunds set email_claimed_at=now() where id=p_refund_id and status='succeeded'
    and email_sent_at is null and (email_claimed_at is null or email_claimed_at<now()-interval '5 minutes');
  return found;
end;
$$;
create function public.complete_meraki_refund_email(p_refund_id uuid,p_success boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.meraki_refunds set email_sent_at=case when p_success then now() else email_sent_at end,email_claimed_at=null where id=p_refund_id;
end;
$$;

create function public.begin_meraki_event_cancellation(p_event_id uuid,p_reason text,p_created_by uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.meraki_event_cancellations%rowtype; released integer;
begin
  if p_created_by is null or length(btrim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'Cancellation reason required'; end if;
  perform 1 from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  select * into c from public.meraki_event_cancellations where event_id=p_event_id;
  if found then return to_jsonb(c); end if;
  insert into public.meraki_event_cancellations(event_id,reason,created_by) values(p_event_id,btrim(p_reason),p_created_by) returning * into c;
  insert into public.meraki_cancellation_emails(cancellation_id,event_id,email,locale,refund_expected)
  select c.id,p_event_id,email,(array_agg(locale order by refund_expected desc,locale))[1],bool_or(refund_expected) from (
    select lower(btrim(o.buyer_email)) email,o.locale,o.amount_cents>coalesce((select sum(r.amount_cents) from public.meraki_refunds r where r.order_id=o.id and r.status='succeeded'),0) refund_expected
    from public.commerce_orders o where o.event_id=p_event_id and o.state in ('fulfilled','refund_required','refund_pending')
    union all
    select lower(btrim(ac.email)),o.locale,false from public.commerce_attendee_contacts ac join public.commerce_passes p on p.id=ac.pass_id join public.commerce_orders o on o.id=ac.order_id
      where p.event_id=p_event_id and p.status='paid'
    union all
    select lower(btrim(t.buyer_email)),coalesce(r.locale,'it'),coalesce(t.amount_cents,0)>coalesce((select sum(rr.amount_cents) from public.meraki_refunds rr where rr.ticket_reservation_id=r.id and rr.status='succeeded'),0)
    from public.tickets t left join public.ticket_reservations r on r.stripe_session_id=t.stripe_session_id where t.event_id=p_event_id and t.status in ('paid','used')
  ) recipients where email<>'' group by email;
  update public.events set canceled_at=now(),cancellation_reason=c.reason,attivo=false where id=p_event_id;
  select count(*) into released from public.commerce_passes where event_id=p_event_id and status='paid';
  update public.commerce_entitlements set status='canceled' where event_id=p_event_id and status in ('valid','used');
  update public.commerce_passes set status='canceled' where event_id=p_event_id and status='paid';
  update public.events set posti_venduti=greatest(0,coalesce(posti_venduti,0)-released) where id=p_event_id;
  update public.commerce_orders set state='expired',expires_at=least(expires_at,now()),failure_reason='event_canceled' where event_id=p_event_id and state in ('reserved','awaiting_payment');
  update public.ticket_reservations set state='expired',expires_at=least(expires_at,now()),failure_reason='event_canceled' where event_id=p_event_id and state in ('reserved','awaiting_payment');
  return to_jsonb(c);
end;
$$;

-- An ordinary event edit cannot accidentally reactivate a canceled event.
create function public.guard_meraki_canceled_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.canceled_at is not null and (new.canceled_at is distinct from old.canceled_at or new.cancellation_reason is distinct from old.cancellation_reason or coalesce(new.attivo,false)) then raise exception 'Canceled event cannot be reactivated'; end if;
  if old.canceled_at is null and new.canceled_at is not null and not exists(select 1 from public.meraki_event_cancellations where event_id=new.id and reason=new.cancellation_reason) then raise exception 'Use the event cancellation workflow'; end if;
  return new;
end;
$$;
create trigger guard_meraki_canceled_event before update on public.events for each row execute function public.guard_meraki_canceled_event();
create function public.guard_meraki_canceled_ticket() returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- Serialize manual legacy check-in with the same event lock as refund holds.
  if new.status='used' then perform 1 from public.events where id=new.event_id for update; end if;
  if new.status='used' and exists(select 1 from public.events where id=new.event_id and canceled_at is not null) then raise exception 'Event canceled'; end if;
  if new.status='used' and exists(select 1 from public.meraki_refunds where payment_intent=new.stripe_payment_intent and revoke_ticket and status in ('preparing','pending','requires_action','unknown')) then raise exception 'Refund in progress'; end if;
  return new;
end;
$$;
create trigger guard_meraki_canceled_ticket before update on public.tickets for each row execute function public.guard_meraki_canceled_ticket();

-- A selected admission cannot be consumed between refund review and Stripe's
-- asynchronous result. Failed/canceled requests automatically release this hold.
alter function public.check_in_commerce_pass(text,uuid,text,text) rename to check_in_commerce_pass_before_refunds;
create function public.check_in_commerce_pass(p_value text,p_event_id uuid,p_activity_id text,p_column text default 'qr_code') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_pass_id uuid;
begin
  perform 1 from public.events where id=p_event_id for update;
  if p_column not in ('qr_code','id') then return jsonb_build_object('outcome','not_found','message','Biglietto non trovato'); end if;
  select p.id into v_pass_id from public.commerce_passes p where case when p_column='id' then p.id::text=p_value else p.qr_code=p_value end and p.event_id=p_event_id;
  if exists(select 1 from public.commerce_entitlements ce join public.meraki_refunds r on ce.id=any(r.revoke_entitlement_ids)
    where ce.pass_id=v_pass_id and ce.activity_id=p_activity_id and r.status in ('preparing','pending','requires_action','unknown'))
    then return jsonb_build_object('outcome','refunded','message','Rimborso in corso: ingresso sospeso'); end if;
  return public.check_in_commerce_pass_before_refunds(p_value,p_event_id,p_activity_id,p_column);
end;
$$;

alter function public.quote_event_commerce(uuid,jsonb,uuid,text) rename to quote_event_commerce_before_cancellation;
create function public.quote_event_commerce(p_event_id uuid,p_participants jsonb,p_upgrade_pass_id uuid default null,p_upgrade_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.events where id=p_event_id and canceled_at is not null) then return jsonb_build_object('error','event_unavailable'); end if;
  if p_upgrade_pass_id is not null and public.meraki_pass_refund_blocked(p_upgrade_pass_id) then return jsonb_build_object('error','invalid_upgrade'); end if;
  return public.quote_event_commerce_before_cancellation(p_event_id,p_participants,p_upgrade_pass_id,p_upgrade_token);
end;
$$;
alter function public.reserve_event_commerce(uuid,uuid,text,text,jsonb,uuid,text) rename to reserve_event_commerce_before_cancellation;
create function public.reserve_event_commerce(p_event_id uuid,p_request_id uuid,p_buyer_email text,p_locale text,p_participants jsonb,p_upgrade_pass_id uuid default null,p_upgrade_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.events where id=p_event_id for update;
  if exists(select 1 from public.events where id=p_event_id and canceled_at is not null) then return jsonb_build_object('error','event_unavailable'); end if;
  if p_upgrade_pass_id is not null and public.meraki_pass_refund_blocked(p_upgrade_pass_id) then return jsonb_build_object('error','invalid_upgrade'); end if;
  return public.reserve_event_commerce_before_cancellation(p_event_id,p_request_id,p_buyer_email,p_locale,p_participants,p_upgrade_pass_id,p_upgrade_token);
end;
$$;
alter function public.reserve_event_ticket(uuid,uuid,text,text,text,text) rename to reserve_event_ticket_before_cancellation;
create function public.reserve_event_ticket(p_request_id uuid,p_event_id uuid,p_buyer_email text,p_buyer_nome text,p_buyer_cognome text,p_locale text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.events where id=p_event_id for update;
  if exists(select 1 from public.events where id=p_event_id and canceled_at is not null) then return jsonb_build_object('error','event_unavailable'); end if;
  return public.reserve_event_ticket_before_cancellation(p_request_id,p_event_id,p_buyer_email,p_buyer_nome,p_buyer_cognome,p_locale);
end;
$$;
alter function public.save_commerce_config(uuid,jsonb) rename to save_commerce_config_before_cancellation;
create function public.save_commerce_config(p_event_id uuid,p_config jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.events where id=p_event_id for update;
  if exists(select 1 from public.events where id=p_event_id and canceled_at is not null) then return jsonb_build_object('error','event_unavailable'); end if;
  return public.save_commerce_config_before_cancellation(p_event_id,p_config);
end;
$$;

alter function public.fulfill_event_commerce(uuid,text,text,integer,text) rename to fulfill_event_commerce_before_cancellation;
create function public.fulfill_event_commerce(p_order_id uuid,p_session_id text,p_payment_intent text,p_amount_cents integer,p_buyer_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.commerce_orders%rowtype;
begin
  if p_payment_intent is not null then perform pg_advisory_xact_lock(hashtextextended(p_payment_intent,0)); end if;
  select * into o from public.commerce_orders where id=p_order_id;
  perform 1 from public.events where id=o.event_id for update;
  select * into o from public.commerce_orders where id=p_order_id for update;
  if o.upgrade_pass_id is not null and o.state not in ('fulfilled','refunded','refund_pending') and public.meraki_pass_refund_blocked(o.upgrade_pass_id) then
    if o.buyer_email<>lower(btrim(p_buyer_email)) or ((p_payment_intent is null or p_payment_intent='') and not coalesce(o.upgrade_pass_id is not null and o.amount_cents=0 and p_amount_cents=0 and o.stripe_session_id=p_session_id,false)) or (o.stripe_session_id is not null and o.stripe_session_id<>p_session_id) or(o.stripe_payment_intent is not null and o.stripe_payment_intent<>p_payment_intent) then raise exception 'Order mismatch'; end if;
    update public.commerce_orders set state='refund_required',failure_reason='refund_conflict',stripe_session_id=p_session_id,stripe_payment_intent=p_payment_intent,updated_at=now() where id=o.id;
    return jsonb_build_object('outcome','refund_required','passes','[]'::jsonb);
  end if;
  if exists(select 1 from public.events where id=o.event_id and canceled_at is not null) and o.state not in ('refunded','refund_pending') then
    if o.buyer_email<>lower(btrim(p_buyer_email)) or ((p_payment_intent is null or p_payment_intent='') and not coalesce(o.upgrade_pass_id is not null and o.amount_cents=0 and p_amount_cents=0 and o.stripe_session_id=p_session_id,false)) or (o.stripe_session_id is not null and o.stripe_session_id<>p_session_id) or(o.stripe_payment_intent is not null and o.stripe_payment_intent<>p_payment_intent) then raise exception 'Order mismatch'; end if;
    update public.commerce_orders set state='refund_required',failure_reason='event_canceled',stripe_session_id=p_session_id,stripe_payment_intent=p_payment_intent,updated_at=now() where id=o.id;
    return jsonb_build_object('outcome','refund_required','passes','[]'::jsonb);
  end if;
  return public.fulfill_event_commerce_before_cancellation(p_order_id,p_session_id,p_payment_intent,p_amount_cents,p_buyer_email);
end;
$$;
alter function public.fulfill_event_ticket(uuid,uuid,text,text,text,integer) rename to fulfill_event_ticket_before_cancellation;
create function public.fulfill_event_ticket(p_reservation_id uuid,p_event_id uuid,p_session_id text,p_payment_intent text,p_buyer_email text,p_amount_cents integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.ticket_reservations%rowtype; result jsonb;
begin
  if p_payment_intent is not null then perform pg_advisory_xact_lock(hashtextextended(p_payment_intent,0)); end if;
  perform 1 from public.events where id=p_event_id for update;
  select * into t from public.ticket_reservations where id=p_reservation_id for update;
  if exists(select 1 from public.events where id=p_event_id and canceled_at is not null) and coalesce(t.state,'') not in ('refunded','refund_pending') then
    if t.id is null then
      insert into public.ticket_reservations(event_id,buyer_email,amount_cents,event_snapshot,stripe_session_id,stripe_payment_intent,expires_at,state,failure_reason)
      values(p_event_id,p_buyer_email,p_amount_cents,'{}',p_session_id,p_payment_intent,now(),'refund_required','event_canceled') returning * into t;
    else
      if t.event_id<>p_event_id or t.buyer_email<>p_buyer_email or (t.stripe_session_id is not null and t.stripe_session_id<>p_session_id) or(t.stripe_payment_intent is not null and t.stripe_payment_intent<>p_payment_intent) then raise exception 'Reservation mismatch'; end if;
      update public.ticket_reservations set state='refund_required',failure_reason='event_canceled',stripe_session_id=p_session_id,stripe_payment_intent=p_payment_intent where id=t.id;
    end if;
    return jsonb_build_object('outcome','refund_required','reservation_id',t.id);
  end if;
  result:=public.fulfill_event_ticket_before_cancellation(p_reservation_id,p_event_id,p_session_id,p_payment_intent,p_buyer_email,p_amount_cents);
  update public.ticket_reservations set stripe_payment_intent=p_payment_intent where stripe_session_id=p_session_id and event_id=p_event_id and buyer_email=p_buyer_email;
  return result;
end;
$$;

-- Wrappers retain the previous signatures. Renamed implementation functions are
-- deliberately unavailable even to service_role: only the guarded entry points.
revoke all on function public.quote_event_commerce_before_cancellation(uuid,jsonb,uuid,text),public.reserve_event_commerce_before_cancellation(uuid,uuid,text,text,jsonb,uuid,text),public.reserve_event_ticket_before_cancellation(uuid,uuid,text,text,text,text),public.save_commerce_config_before_cancellation(uuid,jsonb),public.fulfill_event_commerce_before_cancellation(uuid,text,text,integer,text),public.fulfill_event_ticket_before_cancellation(uuid,uuid,text,text,text,integer),public.check_in_commerce_pass_before_refunds(text,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.meraki_pass_refund_blocked(uuid) from public,anon,authenticated;
grant execute on function public.meraki_pass_refund_blocked(uuid) to service_role;
revoke all on function public.reserve_meraki_refund(uuid,uuid,uuid,integer,text,uuid[],uuid,uuid,boolean,integer),public.complete_meraki_refund(uuid,text,text,text),public.record_meraki_external_refund(text,text,integer,text,text),public.claim_meraki_refund_email(uuid),public.complete_meraki_refund_email(uuid,boolean),public.begin_meraki_event_cancellation(uuid,text,uuid),public.guard_meraki_canceled_event(),public.guard_meraki_canceled_ticket(),public.quote_event_commerce(uuid,jsonb,uuid,text),public.reserve_event_commerce(uuid,uuid,text,text,jsonb,uuid,text),public.reserve_event_ticket(uuid,uuid,text,text,text,text),public.save_commerce_config(uuid,jsonb),public.fulfill_event_commerce(uuid,text,text,integer,text),public.fulfill_event_ticket(uuid,uuid,text,text,text,integer),public.check_in_commerce_pass(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_meraki_refund(uuid,uuid,uuid,integer,text,uuid[],uuid,uuid,boolean,integer),public.complete_meraki_refund(uuid,text,text,text),public.record_meraki_external_refund(text,text,integer,text,text),public.claim_meraki_refund_email(uuid),public.complete_meraki_refund_email(uuid,boolean),public.begin_meraki_event_cancellation(uuid,text,uuid),public.quote_event_commerce(uuid,jsonb,uuid,text),public.reserve_event_commerce(uuid,uuid,text,text,jsonb,uuid,text),public.reserve_event_ticket(uuid,uuid,text,text,text,text),public.save_commerce_config(uuid,jsonb),public.fulfill_event_commerce(uuid,text,text,integer,text),public.fulfill_event_ticket(uuid,uuid,text,text,text,integer),public.check_in_commerce_pass(text,uuid,text,text) to service_role;
notify pgrst, 'reload schema';
