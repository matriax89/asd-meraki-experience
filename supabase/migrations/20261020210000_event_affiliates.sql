-- Affiliate attribution belongs to the event and is frozen at reservation time.
-- It never changes prices, payment metadata, QR contents or admission rights.
create function public.event_affiliates_valid(p_affiliates jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare a jsonb; ids text[]:='{}'; names text[]:='{}'; name text; identifier text;
begin
  if jsonb_typeof(p_affiliates) is distinct from 'array' or jsonb_array_length(p_affiliates)>100 then return false; end if;
  for a in select value from jsonb_array_elements(p_affiliates) loop
    if jsonb_typeof(a) is distinct from 'object' or (select count(*) from jsonb_object_keys(a))<>3
      or jsonb_typeof(a->'id') is distinct from 'string' or jsonb_typeof(a->'name') is distinct from 'string'
      or jsonb_typeof(a->'active') is distinct from 'boolean' then return false; end if;
    identifier:=lower(a->>'id'); name:=btrim(a->>'name');
    if identifier !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or length(name) not between 1 and 120 or name<>(a->>'name') or name ~ '[[:cntrl:]]'
      or identifier=any(ids) then return false; end if;
    ids:=array_append(ids,identifier);
    if (a->>'active')::boolean then
      if lower(name)=any(names) then return false; end if;
      names:=array_append(names,lower(name));
    end if;
  end loop;
  return true;
end;
$$;
alter table public.events add column affiliates jsonb not null default '[]'::jsonb;
alter table public.events add constraint events_affiliates_valid check(public.event_affiliates_valid(affiliates));

alter table public.commerce_orders add column affiliate_id uuid;
alter table public.commerce_orders add column affiliate_name text;
alter table public.commerce_passes add column affiliate_id uuid;
alter table public.commerce_passes add column affiliate_name text;
alter table public.ticket_reservations add column affiliate_id uuid;
alter table public.ticket_reservations add column affiliate_name text;
alter table public.tickets add column affiliate_id uuid;
alter table public.tickets add column affiliate_name text;
alter table public.commerce_orders add constraint commerce_orders_affiliate_snapshot check((affiliate_id is null)=(affiliate_name is null));
alter table public.commerce_passes add constraint commerce_passes_affiliate_snapshot check((affiliate_id is null)=(affiliate_name is null));
alter table public.ticket_reservations add constraint ticket_reservations_affiliate_snapshot check((affiliate_id is null)=(affiliate_name is null));
alter table public.tickets add constraint tickets_affiliate_snapshot check((affiliate_id is null)=(affiliate_name is null));
create index commerce_passes_affiliate on public.commerce_passes(event_id,affiliate_id);
create index tickets_affiliate on public.tickets(event_id,affiliate_id);

-- Request lock precedes the existing event lock, exactly as discount reservations.
-- A retry keeps its name snapshot even after an affiliate has been renamed/disabled.
create function public.reserve_event_commerce_affiliate(
  p_event_id uuid,p_request_id uuid,p_buyer_email text,p_locale text,p_participants jsonb,
  p_upgrade_pass_id uuid,p_upgrade_token text,p_attendees jsonb,p_privacy_version text,
  p_discount_code text default null,p_affiliate_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; o public.commerce_orders%rowtype; e public.events%rowtype; a jsonb; existing boolean; snapshot_name text;
begin
  if p_request_id is null then return jsonb_build_object('error','invalid_request'); end if;
  perform pg_advisory_xact_lock(hashtextextended('commerce-request:'||p_request_id::text,0));
  select * into e from public.events where id=p_event_id for update;
  if not found then return jsonb_build_object('error','event_unavailable'); end if;
  select * into o from public.commerce_orders where request_id=p_request_id; existing:=found;
  if p_upgrade_pass_id is null then
    if existing then
      if o.affiliate_id is distinct from p_affiliate_id then return jsonb_build_object('error','invalid_request'); end if;
      snapshot_name:=o.affiliate_name;
    elsif p_affiliate_id is not null then
      select value into a from jsonb_array_elements(e.affiliates) where lower(value->>'id')=p_affiliate_id::text and (value->>'active')::boolean;
      if not found then return jsonb_build_object('error','affiliate_unavailable'); end if;
      snapshot_name:=a->>'name';
    end if;
  end if;
  result:=public.reserve_event_commerce_discount(p_event_id,p_request_id,p_buyer_email,p_locale,p_participants,
    p_upgrade_pass_id,p_upgrade_token,p_attendees,p_privacy_version,p_discount_code);
  if result ? 'error' then return result; end if;
  if p_upgrade_pass_id is not null then
    -- Base reservation validates the QR credential before any original data is used.
    update public.commerce_orders orders set affiliate_id=p.affiliate_id,affiliate_name=p.affiliate_name
      from public.commerce_passes p where orders.id=(result->'order'->>'id')::uuid and p.id=p_upgrade_pass_id returning orders.* into o;
  elsif not existing then
    update public.commerce_orders set affiliate_id=p_affiliate_id,affiliate_name=snapshot_name
      where id=(result->'order'->>'id')::uuid returning * into o;
  else select * into o from public.commerce_orders where id=(result->'order'->>'id')::uuid; end if;
  return jsonb_build_object('order',to_jsonb(o));
end;
$$;

create function public.reserve_event_ticket_affiliate(
  p_request_id uuid,p_event_id uuid,p_buyer_email text,p_buyer_nome text,p_buyer_cognome text,p_locale text,
  p_attendee jsonb,p_privacy_version text,p_discount_code text default null,p_affiliate_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; r public.ticket_reservations%rowtype; e public.events%rowtype; a jsonb; existing boolean; snapshot_name text;
begin
  if p_request_id is null then return jsonb_build_object('error','invalid_request'); end if;
  perform pg_advisory_xact_lock(hashtextextended('legacy-request:'||p_request_id::text,0));
  select * into e from public.events where id=p_event_id for update;
  if not found then return jsonb_build_object('error','event_unavailable'); end if;
  select * into r from public.ticket_reservations where id=p_request_id; existing:=found;
  if existing then
    if r.affiliate_id is distinct from p_affiliate_id then return jsonb_build_object('error','invalid_request'); end if;
    snapshot_name:=r.affiliate_name;
  elsif p_affiliate_id is not null then
    select value into a from jsonb_array_elements(e.affiliates) where lower(value->>'id')=p_affiliate_id::text and (value->>'active')::boolean;
    if not found then return jsonb_build_object('error','affiliate_unavailable'); end if;
    snapshot_name:=a->>'name';
  end if;
  result:=public.reserve_event_ticket_discount(p_request_id,p_event_id,p_buyer_email,p_buyer_nome,p_buyer_cognome,p_locale,p_attendee,p_privacy_version,p_discount_code);
  if result ? 'error' then return result; end if;
  if not existing then
    update public.ticket_reservations set affiliate_id=p_affiliate_id,affiliate_name=snapshot_name where id=p_request_id returning * into r;
  else select * into r from public.ticket_reservations where id=p_request_id; end if;
  return jsonb_build_object('reservation',r.event_snapshot||to_jsonb(r));
end;
$$;

-- New passes inherit one attribution for the entire group. Upgrades update the
-- original pass in place, leaving these columns unchanged.
create function public.assign_commerce_pass_affiliate() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  select affiliate_id,affiliate_name into new.affiliate_id,new.affiliate_name from public.commerce_orders where id=new.order_id;
  return new;
end;
$$;
create trigger assign_commerce_pass_affiliate before insert on public.commerce_passes for each row execute function public.assign_commerce_pass_affiliate();

-- Wrap the existing fulfillment and copy only its verified reservation. No
-- payment/capacity/refund or delivery behavior is reimplemented here.
alter function public.fulfill_event_ticket(uuid,uuid,text,text,text,integer) rename to fulfill_event_ticket_affiliate_base;
create function public.fulfill_event_ticket(p_reservation_id uuid,p_event_id uuid,p_session_id text,p_payment_intent text,p_buyer_email text,p_amount_cents integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; ticket public.tickets%rowtype;
begin
  result:=public.fulfill_event_ticket_affiliate_base(p_reservation_id,p_event_id,p_session_id,p_payment_intent,p_buyer_email,p_amount_cents);
  if result->>'outcome'='fulfilled' and result->'ticket'->>'id' is not null then
    update public.tickets t set affiliate_id=r.affiliate_id,affiliate_name=r.affiliate_name from public.ticket_reservations r
      where t.id=(result->'ticket'->>'id')::uuid and r.event_id=t.event_id and r.stripe_session_id=t.stripe_session_id
      and r.buyer_email=t.buyer_email and (p_reservation_id is null or r.id=p_reservation_id) returning t.* into ticket;
    if found then result:=jsonb_set(result,'{ticket}',to_jsonb(ticket)); end if;
  end if;
  return result;
end;
$$;

-- Browser roles can validate event writes, but all order attribution stays
-- within service-role RPCs and the existing private ticket/order tables.
revoke all on function public.event_affiliates_valid(jsonb) from public;
grant execute on function public.event_affiliates_valid(jsonb) to anon,authenticated,service_role;
revoke all on function public.reserve_event_commerce_affiliate(uuid,uuid,text,text,jsonb,uuid,text,jsonb,text,text,uuid),public.reserve_event_ticket_affiliate(uuid,uuid,text,text,text,text,jsonb,text,text,uuid),public.assign_commerce_pass_affiliate(),public.fulfill_event_ticket(uuid,uuid,text,text,text,integer),public.fulfill_event_ticket_affiliate_base(uuid,uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_event_commerce_affiliate(uuid,uuid,text,text,jsonb,uuid,text,jsonb,text,text,uuid),public.reserve_event_ticket_affiliate(uuid,uuid,text,text,text,text,jsonb,text,text,uuid),public.fulfill_event_ticket(uuid,uuid,text,text,text,integer) to service_role;
notify pgrst, 'reload schema';
