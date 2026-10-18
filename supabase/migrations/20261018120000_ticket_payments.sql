-- Checkout holds, one-time fulfillment and email delivery. No public access to buyers.
create table public.ticket_reservations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  buyer_email text not null,
  buyer_nome text not null default '',
  buyer_cognome text not null default '',
  locale text not null default 'it' check (locale in ('it', 'en', 'de')),
  amount_cents integer not null check (amount_cents > 0),
  event_snapshot jsonb not null,
  stripe_session_id text unique,
  expires_at timestamptz not null,
  state text not null default 'reserved' check (state in (
    'reserved', 'awaiting_payment', 'fulfilled', 'expired', 'payment_failed',
    'refund_required', 'refund_pending', 'refunded'
  )),
  refund_id text unique,
  refund_status text,
  failure_reason text,
  created_at timestamptz not null default now()
);

create index ticket_reservations_capacity on public.ticket_reservations(event_id, state, expires_at);
alter table public.ticket_reservations enable row level security;
revoke all on public.ticket_reservations from anon, authenticated;
grant all on public.ticket_reservations to service_role;
-- Refund notifications can arrive before Checkout fulfillment. Persist them
-- independently of tickets so a delayed paid webhook cannot issue a new QR.
create table public.ticket_payment_refunds (
  payment_intent text primary key,
  refunded_at timestamptz not null default now()
);
alter table public.ticket_payment_refunds enable row level security;
revoke all on public.ticket_payment_refunds from public, anon, authenticated;
grant all on public.ticket_payment_refunds to service_role;
alter table public.tickets add column email_sent_at timestamptz;
alter table public.tickets add column email_claimed_at timestamptz;

-- Legacy webhook writes updated the counter separately. Never make existing
-- paid/used tickets disappear from the capacity calculation during the upgrade.
update public.events e set posti_venduti = greatest(coalesce(e.posti_venduti, 0), (
  select count(*)::integer from public.tickets t
  where t.event_id = e.id and t.status in ('paid', 'used')
));

create or replace function public.reserve_event_ticket(
  p_request_id uuid, p_event_id uuid, p_buyer_email text,
  p_buyer_nome text, p_buyer_cognome text, p_locale text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events%rowtype;
  v_hold public.ticket_reservations%rowtype;
  v_held integer;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then return jsonb_build_object('error', 'event_unavailable'); end if;
  select * into v_hold from public.ticket_reservations where id = p_request_id;
  if found then
    if v_hold.event_id <> p_event_id or v_hold.buyer_email <> p_buyer_email
      or v_hold.buyer_nome <> p_buyer_nome or v_hold.buyer_cognome <> p_buyer_cognome then
      return jsonb_build_object('error', 'invalid_request');
    end if;
    if (v_hold.state <> 'reserved' or v_hold.expires_at <= now()) and v_hold.stripe_session_id is null then
      return jsonb_build_object('error', 'request_expired');
    end if;
    return jsonb_build_object('reservation', v_hold.event_snapshot || to_jsonb(v_hold));
  end if;
  if not coalesce(v_event.attivo, false) or v_event.data_inizio <= now()
    or coalesce(v_event.cta_tipo, 'stripe') <> 'stripe' then
    return jsonb_build_object('error', 'event_unavailable');
  end if;
  if v_event.prezzo_cents is null or v_event.prezzo_cents <= 0 then
    return jsonb_build_object('error', 'invalid_price');
  end if;
  select count(*) into v_held from public.ticket_reservations
    where event_id = p_event_id and
      (state = 'awaiting_payment' or (state = 'reserved' and expires_at > now()));
  if v_event.capacity is not null and coalesce(v_event.posti_venduti, 0) + v_held >= v_event.capacity then
    return jsonb_build_object('error', 'sold_out');
  end if;
  insert into public.ticket_reservations (
    id, event_id, buyer_email, buyer_nome, buyer_cognome, locale, amount_cents,
    event_snapshot, expires_at
  ) values (
    p_request_id, p_event_id, p_buyer_email, p_buyer_nome, p_buyer_cognome, p_locale,
    v_event.prezzo_cents,
    jsonb_build_object('slug', v_event.slug, 'titolo', v_event.titolo, 'tipo', v_event.tipo),
    now() + interval '35 minutes'
  ) returning * into v_hold;
  return jsonb_build_object('reservation', v_hold.event_snapshot || to_jsonb(v_hold));
end;
$$;

create or replace function public.transition_ticket_reservation(
  p_reservation_id uuid, p_session_id text, p_state text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_event_id uuid;
begin
  if p_state not in ('awaiting_payment', 'expired', 'payment_failed') then
    raise exception 'Invalid reservation transition';
  end if;
  select event_id into v_event_id from public.ticket_reservations where id = p_reservation_id;
  perform 1 from public.events where id = v_event_id for update;
  update public.ticket_reservations set state = p_state,
    stripe_session_id = coalesce(stripe_session_id, p_session_id)
  where id = p_reservation_id
    and (stripe_session_id is null or stripe_session_id = p_session_id)
    and state in ('reserved', 'awaiting_payment')
    -- Out-of-order completed events must not resurrect an expired/failed hold.
    and not (p_state = 'expired' and state = 'awaiting_payment');
end;
$$;

create or replace function public.fulfill_event_ticket(
  p_reservation_id uuid, p_event_id uuid, p_session_id text, p_payment_intent text,
  p_buyer_email text, p_amount_cents integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events%rowtype;
  v_hold public.ticket_reservations%rowtype;
  v_ticket public.tickets%rowtype;
  v_held integer;
begin
  -- Refund and fulfillment share this lock before touching any event or ticket.
  -- Either ordering leaves no valid ticket for a fully refunded payment.
  if p_payment_intent is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_payment_intent, 0));
  end if;
  -- Every reservation/fulfillment for an event takes this same lock.
  select * into v_event from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  select * into v_ticket from public.tickets where stripe_session_id = p_session_id;
  if found then return jsonb_build_object('outcome', 'fulfilled', 'ticket', to_jsonb(v_ticket)); end if;
  if p_reservation_id is not null then
    select * into v_hold from public.ticket_reservations where id = p_reservation_id for update;
    if not found then raise exception 'Reservation not found'; end if;
    if v_hold.event_id <> p_event_id or v_hold.buyer_email <> p_buyer_email
      or (v_hold.stripe_session_id is not null and v_hold.stripe_session_id <> p_session_id) then
      raise exception 'Reservation mismatch';
    end if;
  else
    -- Honor old Checkout Sessions created before reservation support, subject to capacity.
    insert into public.ticket_reservations(event_id, buyer_email, amount_cents, event_snapshot, stripe_session_id, expires_at)
      values (p_event_id, p_buyer_email, p_amount_cents, '{}'::jsonb, p_session_id, now())
      on conflict (stripe_session_id) do update set stripe_session_id = excluded.stripe_session_id
      returning * into v_hold;
  end if;
  if exists (select 1 from public.ticket_payment_refunds where payment_intent = p_payment_intent) then
    update public.ticket_reservations set state = 'refunded', stripe_session_id = p_session_id,
      refund_status = 'succeeded' where id = v_hold.id;
    return jsonb_build_object('outcome', 'refunded', 'reservation_id', v_hold.id);
  end if;
  if v_hold.state in ('refund_required', 'refund_pending', 'refunded') then
    return jsonb_build_object('outcome', v_hold.state, 'reservation_id', v_hold.id);
  end if;
  select count(*) into v_held from public.ticket_reservations
    where event_id = p_event_id and id <> v_hold.id and
      (state = 'awaiting_payment' or (state = 'reserved' and expires_at > now()));
  -- A late payment cannot take a seat already sold or held for another buyer.
  if p_amount_cents <> v_hold.amount_cents
    or (v_event.capacity is not null and coalesce(v_event.posti_venduti, 0) + v_held >= v_event.capacity) then
    update public.ticket_reservations set state = 'refund_required', stripe_session_id = p_session_id,
      failure_reason = case when p_amount_cents <> v_hold.amount_cents then 'amount_mismatch' else 'capacity_unavailable' end
      where id = v_hold.id;
    return jsonb_build_object('outcome', 'refund_required', 'reservation_id', v_hold.id);
  end if;
  insert into public.tickets(event_id, buyer_email, buyer_nome, buyer_cognome,
    stripe_session_id, stripe_payment_intent, amount_cents, status, qr_code)
  values (p_event_id, p_buyer_email, v_hold.buyer_nome, v_hold.buyer_cognome,
    p_session_id, p_payment_intent, p_amount_cents, 'paid', gen_random_uuid()::text)
  returning * into v_ticket;
  update public.events set posti_venduti = coalesce(posti_venduti, 0) + 1 where id = p_event_id;
  update public.ticket_reservations set state = 'fulfilled', stripe_session_id = p_session_id where id = v_hold.id;
  return jsonb_build_object('outcome', 'fulfilled', 'ticket', to_jsonb(v_ticket));
end;
$$;

create or replace function public.revoke_event_ticket(p_payment_intent text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_payment_intent is null or p_payment_intent = '' then
    raise exception 'Payment intent required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_payment_intent, 0));
  insert into public.ticket_payment_refunds(payment_intent) values (p_payment_intent)
    on conflict (payment_intent) do nothing;
  update public.tickets set status = 'refunded'
    where stripe_payment_intent = p_payment_intent and status <> 'refunded';
  update public.ticket_reservations r set state = 'refunded', refund_status = 'succeeded'
    where exists (select 1 from public.tickets t
      where t.stripe_payment_intent = p_payment_intent and t.stripe_session_id = r.stripe_session_id);
end;
$$;

revoke all on function public.reserve_event_ticket(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.transition_ticket_reservation(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fulfill_event_ticket(uuid, uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_event_ticket(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.transition_ticket_reservation(uuid, text, text) to service_role;
grant execute on function public.fulfill_event_ticket(uuid, uuid, text, text, text, integer) to service_role;
revoke all on function public.revoke_event_ticket(text) from public, anon, authenticated;
grant execute on function public.revoke_event_ticket(text) to service_role;

create or replace function public.claim_ticket_email(p_ticket_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.tickets set email_claimed_at = now()
  where id = p_ticket_id and email_sent_at is null
    and (email_claimed_at is null or email_claimed_at < now() - interval '5 minutes');
  return found;
end;
$$;
revoke all on function public.claim_ticket_email(uuid) from public, anon, authenticated;
grant execute on function public.claim_ticket_email(uuid) to service_role;

-- Existing SECURITY DEFINER inventory helpers must not be callable by visitors.
revoke all on function public.increment_ticket_count(uuid) from public, anon, authenticated;
revoke all on function public.decrement_stock(uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_ticket_count(uuid) to service_role;
grant execute on function public.decrement_stock(uuid, integer) to service_role;
