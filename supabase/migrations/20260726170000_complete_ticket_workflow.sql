alter table public.tickets
  add column if not exists access_token uuid not null default gen_random_uuid(),
  add column if not exists locale text not null default 'it',
  add column if not exists customer_email_sent_at timestamptz,
  add column if not exists admin_email_sent_at timestamptz;

create unique index if not exists tickets_access_token_key
  on public.tickets(access_token);

alter table public.tickets
  drop constraint if exists tickets_locale_check;

alter table public.tickets
  add constraint tickets_locale_check check (locale in ('it', 'en', 'de'));

create or replace function public.reserve_event_ticket(
  p_event_id uuid,
  p_buyer_email text,
  p_amount_cents integer default 0,
  p_locale text default 'it',
  p_stripe_session_id text default null,
  p_stripe_payment_intent text default null,
  p_buyer_nome text default null,
  p_buyer_cognome text default null
)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_event public.events;
  existing_ticket public.tickets;
  created_ticket public.tickets;
begin
  if p_stripe_session_id is not null then
    select * into existing_ticket
    from public.tickets
    where stripe_session_id = p_stripe_session_id;
    if found then return existing_ticket; end if;
  end if;

  select * into selected_event
  from public.events
  where id = p_event_id
  for update;

  if not found or selected_event.attivo is not true then
    raise exception 'EVENT_NOT_AVAILABLE';
  end if;

  if selected_event.data_inizio <= now() then
    raise exception 'EVENT_ALREADY_STARTED';
  end if;

  if p_stripe_session_id is null then
    select * into existing_ticket
    from public.tickets
    where event_id = p_event_id
      and lower(buyer_email) = lower(trim(p_buyer_email))
      and stripe_session_id is null;
    if found then return existing_ticket; end if;
  end if;

  if selected_event.capacity is not null
     and coalesce(selected_event.posti_venduti, 0) >= selected_event.capacity then
    raise exception 'EVENT_SOLD_OUT';
  end if;

  insert into public.tickets (
    event_id,
    buyer_email,
    buyer_nome,
    buyer_cognome,
    qr_code,
    stripe_session_id,
    stripe_payment_intent,
    amount_cents,
    status,
    locale
  ) values (
    p_event_id,
    lower(trim(p_buyer_email)),
    nullif(trim(p_buyer_nome), ''),
    nullif(trim(p_buyer_cognome), ''),
    'ticket_' || gen_random_uuid()::text,
    p_stripe_session_id,
    p_stripe_payment_intent,
    greatest(coalesce(p_amount_cents, 0), 0),
    'paid',
    case when p_locale in ('it', 'en', 'de') then p_locale else 'it' end
  )
  returning * into created_ticket;

  update public.events
  set posti_venduti = coalesce(posti_venduti, 0) + 1,
      updated_at = now()
  where id = p_event_id;

  return created_ticket;
end;
$$;

revoke all on function public.reserve_event_ticket(uuid, text, integer, text, text, text, text, text) from public;
grant execute on function public.reserve_event_ticket(uuid, text, integer, text, text, text, text, text) to service_role;
