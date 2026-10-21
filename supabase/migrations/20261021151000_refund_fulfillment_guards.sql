-- Never initiate a second automatic refund when an already-issued purchase is
-- replayed after cancellation. The persisted cancellation queue owns that money.
-- Validate the frozen purchase before any early cancellation/conflict return.
create or replace function public.fulfill_event_commerce(p_order_id uuid,p_session_id text,p_payment_intent text,p_amount_cents integer,p_buyer_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.commerce_orders%rowtype; canceled boolean; conflict boolean;
begin
  if p_payment_intent is not null then perform pg_advisory_xact_lock(hashtextextended(p_payment_intent,0)); end if;
  select * into o from public.commerce_orders where id=p_order_id;
  if not found then raise exception 'Order not found'; end if;
  select canceled_at is not null into canceled from public.events where id=o.event_id for update;
  if not found then raise exception 'Event not found'; end if;
  select * into o from public.commerce_orders where id=p_order_id for update;
  conflict:=o.upgrade_pass_id is not null and o.state not in ('fulfilled','refunded','refund_pending') and public.meraki_pass_refund_blocked(o.upgrade_pass_id);
  if canceled or conflict then
    if p_session_id is null or p_session_id='' or p_amount_cents is null or o.amount_cents<>p_amount_cents
      or p_buyer_email is null or o.buyer_email<>lower(btrim(p_buyer_email))
      or ((p_payment_intent is null or p_payment_intent='') and not coalesce(o.upgrade_pass_id is not null and o.amount_cents=0 and p_amount_cents=0 and o.stripe_session_id=p_session_id,false))
      or (o.stripe_session_id is not null and o.stripe_session_id<>p_session_id)
      or(o.stripe_payment_intent is not null and o.stripe_payment_intent is distinct from p_payment_intent) then raise exception 'Order mismatch'; end if;
    if canceled and o.state='fulfilled' then return jsonb_build_object('outcome','refund_pending','passes','[]'::jsonb); end if;
    if conflict or (canceled and o.state not in ('refunded','refund_pending')) then
      update public.commerce_orders set state='refund_required',failure_reason=case when canceled then 'event_canceled' else 'refund_conflict' end,
        stripe_session_id=p_session_id,stripe_payment_intent=p_payment_intent,updated_at=now() where id=o.id;
      return jsonb_build_object('outcome','refund_required','passes','[]'::jsonb);
    end if;
  end if;
  return public.fulfill_event_commerce_before_cancellation(p_order_id,p_session_id,p_payment_intent,p_amount_cents,p_buyer_email);
end;
$$;

create or replace function public.fulfill_event_ticket(p_reservation_id uuid,p_event_id uuid,p_session_id text,p_payment_intent text,p_buyer_email text,p_amount_cents integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.ticket_reservations%rowtype; issued public.tickets%rowtype; result jsonb; canceled boolean;
begin
  if p_payment_intent is not null then perform pg_advisory_xact_lock(hashtextextended(p_payment_intent,0)); end if;
  select canceled_at is not null into canceled from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if p_reservation_id is not null then
    select * into t from public.ticket_reservations where id=p_reservation_id for update;
    if not found then raise exception 'Reservation not found'; end if;
  else
    select * into t from public.ticket_reservations where stripe_session_id=p_session_id for update;
  end if;
  if canceled then
    if p_session_id is null or p_session_id='' or p_payment_intent is null or p_payment_intent=''
      or p_amount_cents is null or p_amount_cents<=0 or p_buyer_email is null then raise exception 'Reservation mismatch'; end if;
    if t.id is not null and (t.event_id is distinct from p_event_id or t.buyer_email<>p_buyer_email or t.amount_cents<>p_amount_cents
      or (t.stripe_session_id is not null and t.stripe_session_id<>p_session_id)
      or (t.stripe_payment_intent is not null and t.stripe_payment_intent is distinct from p_payment_intent)) then raise exception 'Reservation mismatch'; end if;
    -- Support original Checkout Sessions without a reservation identifier, but
    -- never associate somebody else's already-issued session with this event.
    select * into issued from public.tickets where stripe_session_id=p_session_id;
    if issued.id is not null and (issued.event_id is distinct from p_event_id or issued.buyer_email<>p_buyer_email
      or issued.amount_cents is distinct from p_amount_cents or issued.stripe_payment_intent is distinct from p_payment_intent) then raise exception 'Reservation mismatch'; end if;
    if t.id is null then
      insert into public.ticket_reservations(event_id,buyer_email,amount_cents,event_snapshot,stripe_session_id,stripe_payment_intent,expires_at,state,failure_reason)
      values(p_event_id,p_buyer_email,p_amount_cents,'{}',p_session_id,p_payment_intent,now(),
        case when issued.id is not null then case when issued.status='refunded' then 'refunded' else 'fulfilled' end else 'refund_required' end,'event_canceled') returning * into t;
    end if;
    if t.state='fulfilled' then return jsonb_build_object('outcome','refund_pending','reservation_id',t.id); end if;
    if t.state='refunded' then return jsonb_build_object('outcome','refunded','reservation_id',t.id); end if;
    if t.state='refund_pending' then return jsonb_build_object('outcome','refund_pending','reservation_id',t.id); end if;
    update public.ticket_reservations set state='refund_required',failure_reason='event_canceled',stripe_session_id=p_session_id,stripe_payment_intent=p_payment_intent where id=t.id;
    return jsonb_build_object('outcome','refund_required','reservation_id',t.id);
  end if;
  result:=public.fulfill_event_ticket_before_cancellation(p_reservation_id,p_event_id,p_session_id,p_payment_intent,p_buyer_email,p_amount_cents);
  update public.ticket_reservations set stripe_payment_intent=p_payment_intent where stripe_session_id=p_session_id and event_id=p_event_id and buyer_email=p_buyer_email;
  return result;
end;
$$;
revoke all on function public.fulfill_event_commerce(uuid,text,text,integer,text),public.fulfill_event_ticket(uuid,uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.fulfill_event_commerce(uuid,text,text,integer,text),public.fulfill_event_ticket(uuid,uuid,text,text,text,integer) to service_role;
notify pgrst, 'reload schema';
