alter table public.events
  add column if not exists trial_campaign_key text;

create index if not exists idx_events_trial_campaign_key
  on public.events(trial_campaign_key)
  where trial_campaign_key is not null;

create table if not exists public.event_trial_claims (
  campaign_key text not null,
  normalized_email text not null,
  event_id uuid not null references public.events(id) on delete restrict,
  ticket_id uuid unique references public.tickets(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (campaign_key, normalized_email)
);

alter table public.event_trial_claims enable row level security;
revoke all on public.event_trial_claims from public, anon, authenticated;
grant all on public.event_trial_claims to service_role;

create index if not exists idx_event_trial_claims_event
  on public.event_trial_claims(event_id);

create or replace function public.reserve_trial_event_ticket(
  p_event_id uuid,
  p_buyer_email text,
  p_locale text default 'it',
  p_buyer_nome text default null,
  p_buyer_cognome text default null,
  p_registration_answers jsonb default '{}'::jsonb
)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_event public.events;
  existing_claim public.event_trial_claims;
  existing_ticket public.tickets;
  created_ticket public.tickets;
  clean_email text := lower(trim(p_buyer_email));
begin
  select * into selected_event
  from public.events
  where id = p_event_id
  for update;

  if not found
     or selected_event.attivo is not true
     or selected_event.trial_campaign_key is null then
    raise exception 'TRIAL_EVENT_NOT_AVAILABLE';
  end if;

  select * into existing_claim
  from public.event_trial_claims
  where campaign_key = selected_event.trial_campaign_key
    and normalized_email = clean_email;

  if found then
    if existing_claim.event_id <> p_event_id then
      raise exception 'TRIAL_ALREADY_USED';
    end if;
    if existing_claim.ticket_id is not null then
      select * into existing_ticket
      from public.tickets
      where id = existing_claim.ticket_id;
      if found then return existing_ticket; end if;
    end if;
  else
    begin
      insert into public.event_trial_claims (
        campaign_key,
        normalized_email,
        event_id
      ) values (
        selected_event.trial_campaign_key,
        clean_email,
        p_event_id
      );
    exception when unique_violation then
      raise exception 'TRIAL_ALREADY_USED';
    end;
  end if;

  created_ticket := public.reserve_event_ticket(
    p_event_id,
    clean_email,
    0,
    p_locale,
    null,
    null,
    p_buyer_nome,
    p_buyer_cognome
  );

  update public.tickets
  set registration_answers = coalesce(p_registration_answers, '{}'::jsonb)
  where id = created_ticket.id
  returning * into created_ticket;

  update public.event_trial_claims
  set ticket_id = created_ticket.id
  where campaign_key = selected_event.trial_campaign_key
    and normalized_email = clean_email;

  return created_ticket;
end;
$$;

revoke all on function public.reserve_trial_event_ticket(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.reserve_trial_event_ticket(uuid, text, text, text, text, jsonb) to service_role;
