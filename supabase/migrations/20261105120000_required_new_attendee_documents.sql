-- Identity is required for new registrations only. Keep the historical contact
-- validator and fulfillment paths unchanged: previously reserved/paid orders may
-- contain empty document fields and must retain their exact snapshots/retries.
create or replace function public.reserve_event_commerce_attendees(
  p_event_id uuid,p_request_id uuid,p_buyer_email text,p_locale text,p_participants jsonb,
  p_upgrade_pass_id uuid,p_upgrade_token text,p_attendees jsonb,p_privacy_version text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; o public.commerce_orders%rowtype; a jsonb; i integer:=0;
begin
  if p_request_id is null or p_privacy_version is distinct from '2026-10-18-v1'
    or jsonb_typeof(p_attendees) is distinct from 'array' or jsonb_typeof(p_participants) is distinct from 'array'
    or jsonb_array_length(p_attendees) not between 1 and 20 or jsonb_array_length(p_attendees)<>jsonb_array_length(p_participants) then return jsonb_build_object('error','invalid_attendees'); end if;
  for a in select value from jsonb_array_elements(p_attendees) loop
    if not public.commerce_attendee_valid(a) or a->>'firstName' is distinct from p_participants->i->>'firstName'
      or a->>'lastName' is distinct from p_participants->i->>'lastName' then return jsonb_build_object('error','invalid_attendees'); end if;
    i:=i+1;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('commerce-request:'||p_request_id::text,0));
  select * into o from public.commerce_orders where request_id=p_request_id;
  if found and (o.attendees is distinct from p_attendees or o.attendee_privacy_version is distinct from p_privacy_version) then return jsonb_build_object('error','invalid_request'); end if;
  if not found and p_upgrade_pass_id is null and exists(
    select 1 from jsonb_array_elements(p_attendees) entry
    where coalesce(entry->>'documentNumber','') !~ '[^[:space:]]'
  ) then return jsonb_build_object('error','invalid_attendees'); end if;
  result:=public.reserve_event_commerce(p_event_id,p_request_id,p_buyer_email,p_locale,p_participants,p_upgrade_pass_id,p_upgrade_token);
  if result ? 'error' then return result; end if;
  update public.commerce_orders set attendees=p_attendees,attendee_privacy_version=p_privacy_version where id=(result->'order'->>'id')::uuid returning * into o;
  return jsonb_build_object('order',to_jsonb(o));
end;
$$;

create or replace function public.reserve_event_ticket_attendee(
  p_request_id uuid,p_event_id uuid,p_buyer_email text,p_buyer_nome text,p_buyer_cognome text,p_locale text,
  p_attendee jsonb,p_privacy_version text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; reservation public.ticket_reservations%rowtype;
begin
  if p_request_id is null or p_locale not in ('it','en','de','es') or p_privacy_version is distinct from '2026-10-18-v1' or not public.commerce_attendee_valid(p_attendee)
    or p_attendee->>'firstName' is distinct from p_buyer_nome or p_attendee->>'lastName' is distinct from p_buyer_cognome
    or p_attendee->>'email' is distinct from lower(btrim(p_buyer_email)) then return jsonb_build_object('error','invalid_attendees'); end if;
  perform pg_advisory_xact_lock(hashtextextended('legacy-request:'||p_request_id::text,0));
  select * into reservation from public.ticket_reservations where id=p_request_id;
  if found and (reservation.attendee is distinct from p_attendee or reservation.attendee_privacy_version is distinct from p_privacy_version or reservation.locale<>p_locale) then return jsonb_build_object('error','invalid_request'); end if;
  if not found and coalesce(p_attendee->>'documentNumber','') !~ '[^[:space:]]' then return jsonb_build_object('error','invalid_attendees'); end if;
  result:=public.reserve_event_ticket(p_request_id,p_event_id,lower(btrim(p_buyer_email)),p_buyer_nome,p_buyer_cognome,p_locale);
  if result ? 'error' then return result; end if;
  update public.ticket_reservations set attendee=p_attendee,attendee_privacy_version=p_privacy_version where id=p_request_id returning * into reservation;
  return jsonb_build_object('reservation',reservation.event_snapshot||to_jsonb(reservation));
end;
$$;

revoke all on function public.reserve_event_commerce_attendees(uuid,uuid,text,text,jsonb,uuid,text,jsonb,text),public.reserve_event_ticket_attendee(uuid,uuid,text,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.reserve_event_commerce_attendees(uuid,uuid,text,text,jsonb,uuid,text,jsonb,text),public.reserve_event_ticket_attendee(uuid,uuid,text,text,text,text,jsonb,text) to service_role;
notify pgrst,'reload schema';
