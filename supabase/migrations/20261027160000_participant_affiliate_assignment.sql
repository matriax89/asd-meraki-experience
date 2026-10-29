-- Staff can correct the current affiliate of one issued participant. Purchase
-- snapshots, prices, payment/refund identities and other group members remain
-- untouched. Audit history also prevents webhook retries undoing corrections.
create table public.participant_affiliate_audit (
  id uuid primary key default gen_random_uuid(),
  source text not null check(source in ('legacy','commerce')),
  participant_id uuid not null,
  event_id uuid not null references public.events(id),
  actor_id uuid not null,
  old_affiliate_id uuid,
  old_affiliate_name text,
  new_affiliate_id uuid,
  new_affiliate_name text,
  created_at timestamptz not null default clock_timestamp(),
  check((old_affiliate_id is null)=(old_affiliate_name is null)),
  check((new_affiliate_id is null)=(new_affiliate_name is null)),
  check(old_affiliate_id is distinct from new_affiliate_id)
);
create index participant_affiliate_audit_participant on public.participant_affiliate_audit(source,participant_id,created_at,id);
alter table public.participant_affiliate_audit enable row level security;
revoke all on public.participant_affiliate_audit from public,anon,authenticated,service_role;
grant select on public.participant_affiliate_audit to service_role;

create function public.assign_participant_affiliate(
  p_source text,p_event_id uuid,p_participant_id uuid,p_affiliate_id uuid,p_expected_affiliate_id uuid,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare previous_id uuid; previous_name text; next_name text; participant_status text; actor_role text;
begin
  if p_source is null or p_source not in ('legacy','commerce') or p_event_id is null or p_participant_id is null or p_actor_id is null then
    raise exception 'Invalid participant assignment' using errcode='22023';
  end if;
  -- Same event-first ordering as fulfillment, refunds and affiliate lifecycle.
  perform 1 from public.events where id=p_event_id for update;
  if not found then raise exception 'Participant unavailable' using errcode='22023'; end if;
  select role::text into actor_role from public.profiles where id=p_actor_id for share;
  if actor_role is null or actor_role not in ('admin','editor') then raise exception 'Staff required' using errcode='42501'; end if;

  if p_source='legacy' then
    select affiliate_id,affiliate_name,status::text into previous_id,previous_name,participant_status
      from public.tickets where id=p_participant_id and event_id=p_event_id for update;
  else
    select affiliate_id,affiliate_name,status into previous_id,previous_name,participant_status
      from public.commerce_passes where id=p_participant_id and event_id=p_event_id for update;
  end if;
  if not found or participant_status is null or participant_status not in ('paid','used') then
    raise exception 'Participant unavailable' using errcode='22023';
  end if;
  if previous_id is distinct from p_expected_affiliate_id then raise exception 'Participant attribution changed' using errcode='40001'; end if;
  if p_affiliate_id is not null then
    select name into next_name from public.affiliates where id=p_affiliate_id and deleted_at is null for share;
    if not found or not exists(select 1 from public.events event_row cross join lateral jsonb_array_elements(event_row.affiliates) choice
      where event_row.id=p_event_id and choice->>'id'=p_affiliate_id::text and choice->'active'='true'::jsonb) then
      raise exception 'Affiliate unavailable' using errcode='22023';
    end if;
  end if;
  if previous_id is not distinct from p_affiliate_id then
    return jsonb_build_object('changed',false,'participant',jsonb_build_object('source',p_source,'id',p_participant_id,'eventId',p_event_id,'affiliateId',previous_id,'affiliateName',previous_name));
  end if;
  if p_source='legacy' then
    update public.tickets set affiliate_id=p_affiliate_id,affiliate_name=next_name where id=p_participant_id;
  else
    update public.commerce_passes set affiliate_id=p_affiliate_id,affiliate_name=next_name where id=p_participant_id;
  end if;
  insert into public.participant_affiliate_audit(source,participant_id,event_id,actor_id,old_affiliate_id,old_affiliate_name,new_affiliate_id,new_affiliate_name)
    values(p_source,p_participant_id,p_event_id,p_actor_id,previous_id,previous_name,p_affiliate_id,next_name);
  return jsonb_build_object('changed',true,'participant',jsonb_build_object('source',p_source,'id',p_participant_id,'eventId',p_event_id,'affiliateId',p_affiliate_id,'affiliateName',next_name));
end;
$$;
revoke all on function public.assign_participant_affiliate(text,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.assign_participant_affiliate(text,uuid,uuid,uuid,uuid,uuid) to service_role;

-- This internal affiliate wrapper is called by the existing cancellation and
-- refund guards. Keep those guards and all payment checks in their current chain.
create or replace function public.fulfill_event_ticket_before_cancellation(p_reservation_id uuid,p_event_id uuid,p_session_id text,p_payment_intent text,p_buyer_email text,p_amount_cents integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; ticket public.tickets%rowtype;
begin
  result:=public.fulfill_event_ticket_affiliate_base(p_reservation_id,p_event_id,p_session_id,p_payment_intent,p_buyer_email,p_amount_cents);
  if result->>'outcome'='fulfilled' and result->'ticket'->>'id' is not null then
    update public.tickets t set affiliate_id=r.affiliate_id,affiliate_name=r.affiliate_name from public.ticket_reservations r
      where t.id=(result->'ticket'->>'id')::uuid and r.event_id=t.event_id and r.stripe_session_id=t.stripe_session_id
      and r.buyer_email=t.buyer_email and (p_reservation_id is null or r.id=p_reservation_id)
      and not exists(select 1 from public.participant_affiliate_audit audit where audit.source='legacy' and audit.participant_id=t.id);
    select * into ticket from public.tickets where id=(result->'ticket'->>'id')::uuid;
    if found then result:=jsonb_set(result,'{ticket}',to_jsonb(ticket)); end if;
  end if;
  return result;
end;
$$;
revoke all on function public.fulfill_event_ticket_before_cancellation(uuid,uuid,text,text,text,integer) from public,anon,authenticated,service_role;
-- Replaying an existing upgrade never rewrites its purchase attribution after
-- a participant correction. Only a newly reserved upgrade takes the current pass.
create or replace function public.reserve_event_commerce_affiliate(
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
  if p_upgrade_pass_id is not null and not existing then
    -- A newly created upgrade inherits the participant's current affiliate.
    -- Idempotent retries retain their original pending/paid purchase snapshot.
    -- Base reservation validates the QR credential before any original data is used.
    update public.commerce_orders orders set affiliate_id=p.affiliate_id,affiliate_name=p.affiliate_name
      from public.commerce_passes p where orders.id=(result->'order'->>'id')::uuid and p.id=p_upgrade_pass_id returning orders.* into o;
  elsif p_upgrade_pass_id is null and not existing then
    update public.commerce_orders set affiliate_id=p_affiliate_id,affiliate_name=snapshot_name
      where id=(result->'order'->>'id')::uuid returning * into o;
  else select * into o from public.commerce_orders where id=(result->'order'->>'id')::uuid; end if;
  return jsonb_build_object('order',to_jsonb(o));
end;
$$;
revoke all on function public.reserve_event_commerce_affiliate(uuid,uuid,text,text,jsonb,uuid,text,jsonb,text,text,uuid) from public,anon,authenticated;
grant execute on function public.reserve_event_commerce_affiliate(uuid,uuid,text,text,jsonb,uuid,text,jsonb,text,text,uuid) to service_role;
notify pgrst,'reload schema';
