-- Guest contact details are private and separate from pricing, QR and public tickets.
alter table public.commerce_orders add column attendees jsonb;
alter table public.commerce_orders add column attendee_privacy_version text;
alter table public.ticket_reservations add column attendee jsonb;
alter table public.ticket_reservations add column attendee_privacy_version text;
alter table public.commerce_passes add column participant_index integer check(participant_index >= 0);
create unique index commerce_pass_participant on public.commerce_passes(order_id,participant_index) where participant_index is not null;
alter table public.commerce_orders drop constraint commerce_orders_locale_check;
alter table public.commerce_orders add constraint commerce_orders_locale_check check(locale in ('it','en','de','es'));
alter table public.ticket_reservations drop constraint ticket_reservations_locale_check;
alter table public.ticket_reservations add constraint ticket_reservations_locale_check check(locale in ('it','en','de','es'));

-- Extend only the existing locale allow-list, preserving its locking/refund logic.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.reserve_event_commerce(uuid,uuid,text,text,jsonb,uuid,text)'::regprocedure);
  if strpos(definition, '(''it'',''en'',''de'')')=0 then raise exception 'Unexpected commerce reservation definition'; end if;
  execute replace(definition, '(''it'',''en'',''de'')', '(''it'',''en'',''de'',''es'')');
end;
$$;

create table public.commerce_attendee_contacts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.commerce_orders(id),
  pass_id uuid not null references public.commerce_passes(id),
  participant_index integer not null check(participant_index >= 0),
  first_name text not null, last_name text not null, email text not null, phone text not null,
  document_type text not null check(document_type in ('codice_fiscale','foreign_id')),
  document_country text not null, document_number text not null,
  privacy_version text not null, created_at timestamptz not null default now(),
  unique(order_id,participant_index)
);
create table public.legacy_ticket_attendee_contacts (
  ticket_id uuid primary key references public.tickets(id),
  reservation_id uuid not null unique references public.ticket_reservations(id),
  first_name text not null, last_name text not null, email text not null, phone text not null,
  document_type text not null check(document_type in ('codice_fiscale','foreign_id')),
  document_country text not null, document_number text not null,
  privacy_version text not null, created_at timestamptz not null default now()
);
create index commerce_attendee_contact_pass on public.commerce_attendee_contacts(pass_id,created_at desc);
-- A verified pass recipient may purchase an upgrade as well as the original buyer.
do $$
declare definition text; guard text:='original.buyer_email=lower(btrim(p_buyer_email))';
begin
  definition:=pg_get_functiondef('public.reserve_event_commerce(uuid,uuid,text,text,jsonb,uuid,text)'::regprocedure);
  if strpos(definition,guard)=0 then raise exception 'Unexpected upgrade email guard'; end if;
  execute replace(definition,guard,'(original.buyer_email=lower(btrim(p_buyer_email)) or exists(select 1 from public.commerce_attendee_contacts ac where ac.pass_id=p.id and ac.email=lower(btrim(p_buyer_email))))');
end;
$$;
create table public.marketing_contacts (
  id uuid primary key default gen_random_uuid(), email text not null unique check(email=lower(btrim(email))),
  first_name text not null, last_name text not null,
  locale text not null check(locale in ('it','en','de','es')),
  status text not null check(status in ('pending','subscribed','unsubscribed')),
  consent_version text not null, source text not null default 'guest_checkout',
  order_id uuid references public.commerce_orders(id), reservation_id uuid references public.ticket_reservations(id),
  participant_index integer not null default 0, consent_cycle_id uuid not null default gen_random_uuid(),
  granted_at timestamptz not null default now(), confirmed_at timestamptz, unsubscribed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.marketing_consent_events (
  id uuid primary key default gen_random_uuid(), contact_id uuid not null references public.marketing_contacts(id),
  action text not null check(action in ('requested','confirmed','unsubscribed')),
  consent_version text not null, locale text not null, source text not null,
  order_id uuid references public.commerce_orders(id), reservation_id uuid references public.ticket_reservations(id),
  participant_index integer, consent_cycle_id uuid not null,
  request_key text unique, created_at timestamptz not null default now()
);
create table public.marketing_consent_tokens (
  token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
  contact_id uuid not null references public.marketing_contacts(id), consent_cycle_id uuid not null,
  purpose text not null check(purpose in ('confirm','unsubscribe')),
  expires_at timestamptz, consumed_at timestamptz, created_at timestamptz not null default now()
);
create index marketing_contacts_campaigns on public.marketing_contacts(status,locale);
alter table public.commerce_attendee_contacts enable row level security;
alter table public.legacy_ticket_attendee_contacts enable row level security;
alter table public.marketing_contacts enable row level security;
alter table public.marketing_consent_events enable row level security;
alter table public.marketing_consent_tokens enable row level security;
revoke all on public.commerce_attendee_contacts,public.legacy_ticket_attendee_contacts,public.marketing_contacts,public.marketing_consent_events,public.marketing_consent_tokens from public,anon,authenticated;
grant all on public.commerce_attendee_contacts,public.legacy_ticket_attendee_contacts,public.marketing_contacts,public.marketing_consent_tokens to service_role;
revoke all on public.marketing_consent_events from service_role;
grant select,insert on public.marketing_consent_events to service_role;

create function public.attendee_tax_code_valid(p_code text) returns boolean
language plpgsql immutable set search_path='' as $$
declare code text:=upper(replace(p_code,' ','')); total integer:=0; digit integer; n integer; i integer;
  odds integer[]:=array[1,0,5,7,9,13,15,17,19,21,2,4,18,20,11,3,6,8,12,14,16,10,22,25,24,23]; c text;
begin
  if code ~ '^[0-9]{11}$' then
    for i in 1..10 loop
      digit:=substr(code,i,1)::integer;
      if i%2=0 then digit:=digit*2; if digit>9 then digit:=digit-9; end if; end if;
      total:=total+digit;
    end loop;
    return (10-total%10)%10=substr(code,11,1)::integer;
  end if;
  if code !~ '^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$' then return false; end if;
  for i in 1..15 loop
    c:=substr(code,i,1); n:=case when c ~ '^[0-9]$' then c::integer else ascii(c)-65 end;
    total:=total+case when i%2=1 then odds[n+1] else n end;
  end loop;
  return chr(65+total%26)=substr(code,16,1);
end;
$$;

create function public.commerce_attendee_valid(p_attendee jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare a jsonb:=p_attendee; key text; countries text:=' AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW ';
begin
  if a is null or jsonb_typeof(a) is distinct from 'object' or (select count(*) from jsonb_object_keys(a))<>8 then return false; end if;
  foreach key in array array['firstName','lastName','email','phone','documentType','documentCountry','documentNumber'] loop
    if jsonb_typeof(a->key) is distinct from 'string' then return false; end if;
  end loop;
  if jsonb_typeof(a->'marketingConsent') is distinct from 'boolean' then return false; end if;
  if length(btrim(a->>'firstName')) not between 1 and 100 or length(btrim(a->>'lastName')) not between 1 and 100
    or (a->>'firstName') ~ '[[:cntrl:]]' or (a->>'lastName') ~ '[[:cntrl:]]'
    or length(a->>'email')>254 or a->>'email'<>lower(btrim(a->>'email'))
    or a->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or a->>'phone' !~ '^\+[1-9][0-9]{6,14}$'
    or length(a->>'documentCountry')<>2 or strpos(countries,' '||(a->>'documentCountry')||' ')=0 then return false; end if;
  if a->>'documentType'='codice_fiscale' then
    return a->>'documentCountry'='IT' and public.attendee_tax_code_valid(a->>'documentNumber') and a->>'documentNumber'=upper(replace(a->>'documentNumber',' ',''));
  elsif a->>'documentType'='foreign_id' then
    return a->>'documentCountry'<>'IT' and a->>'documentNumber' ~ '^[A-Z0-9][A-Z0-9 -]{1,30}[A-Z0-9]$';
  end if;
  return false;
end;
$$;

create function public.reserve_event_commerce_attendees(
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
  result:=public.reserve_event_commerce(p_event_id,p_request_id,p_buyer_email,p_locale,p_participants,p_upgrade_pass_id,p_upgrade_token);
  if result ? 'error' then return result; end if;
  update public.commerce_orders set attendees=p_attendees,attendee_privacy_version=p_privacy_version where id=(result->'order'->>'id')::uuid returning * into o;
  return jsonb_build_object('order',to_jsonb(o));
end;
$$;

create function public.reserve_event_ticket_attendee(
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
  result:=public.reserve_event_ticket(p_request_id,p_event_id,lower(btrim(p_buyer_email)),p_buyer_nome,p_buyer_cognome,p_locale);
  if result ? 'error' then return result; end if;
  update public.ticket_reservations set attendee=p_attendee,attendee_privacy_version=p_privacy_version where id=p_request_id returning * into reservation;
  return jsonb_build_object('reservation',reservation.event_snapshot||to_jsonb(reservation));
end;
$$;

-- Fulfillment already serializes each order. Indexing at insertion handles identical names.
create function public.commerce_assign_participant_index() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.participant_index is null then select count(*)::integer into new.participant_index from public.commerce_passes where order_id=new.order_id; end if;
  return new;
end;
$$;
create trigger commerce_assign_participant_index before insert on public.commerce_passes for each row execute function public.commerce_assign_participant_index();

create function public.record_guest_marketing_request(p_attendee jsonb,p_locale text,p_order_id uuid,p_reservation_id uuid,p_index integer) returns void
language plpgsql security definer set search_path='' as $$
declare c public.marketing_contacts%rowtype; v_request_key text;
begin
  if not coalesce((p_attendee->>'marketingConsent')::boolean,false) then return; end if;
  v_request_key:=coalesce('commerce:'||p_order_id::text,'ticket:'||p_reservation_id::text)||':'||p_index::text;
  perform pg_advisory_xact_lock(hashtextextended('marketing:'||(p_attendee->>'email'),0));
  if exists(select 1 from public.marketing_consent_events ev where ev.request_key=v_request_key) then return; end if;
  select * into c from public.marketing_contacts where email=p_attendee->>'email' for update;
  if not found then
    insert into public.marketing_contacts(email,first_name,last_name,locale,status,consent_version,order_id,reservation_id,participant_index)
    values(p_attendee->>'email',p_attendee->>'firstName',p_attendee->>'lastName',p_locale,'pending','2026-10-18-v1',p_order_id,p_reservation_id,p_index) returning * into c;
  elsif c.status<>'subscribed' then
    update public.marketing_contacts set first_name=p_attendee->>'firstName',last_name=p_attendee->>'lastName',locale=p_locale,status='pending',consent_version='2026-10-18-v1',
      order_id=p_order_id,reservation_id=p_reservation_id,participant_index=p_index,consent_cycle_id=gen_random_uuid(),granted_at=now(),confirmed_at=null,updated_at=now()
      where id=c.id returning * into c;
  end if;
  insert into public.marketing_consent_events(contact_id,action,consent_version,locale,source,order_id,reservation_id,participant_index,consent_cycle_id,request_key)
  values(c.id,'requested','2026-10-18-v1',p_locale,'guest_checkout',p_order_id,p_reservation_id,p_index,c.consent_cycle_id,v_request_key);
end;
$$;

create function public.persist_commerce_attendee_contacts() returns trigger
language plpgsql security definer set search_path='' as $$
declare a jsonb; i integer:=0; pass_id uuid; consent_email text;
begin
  if new.state<>'fulfilled' or old.state='fulfilled' or new.attendees is null then return new; end if;
  -- Acquire shared email locks in a fixed order across simultaneous group purchases.
  for consent_email in select distinct value->>'email' from jsonb_array_elements(new.attendees) where (value->>'marketingConsent')::boolean order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended('marketing:'||consent_email,0));
  end loop;
  for a in select value from jsonb_array_elements(new.attendees) loop
    if new.upgrade_pass_id is not null then pass_id:=new.upgrade_pass_id;
    else select p.id into pass_id from public.commerce_passes p where p.order_id=new.id and p.participant_index=i; end if;
    if pass_id is null then raise exception 'Attendee pass mapping failed'; end if;
    insert into public.commerce_attendee_contacts(order_id,pass_id,participant_index,first_name,last_name,email,phone,document_type,document_country,document_number,privacy_version)
    values(new.id,pass_id,i,a->>'firstName',a->>'lastName',a->>'email',a->>'phone',a->>'documentType',a->>'documentCountry',a->>'documentNumber',new.attendee_privacy_version) on conflict(order_id,participant_index) do nothing;
    perform public.record_guest_marketing_request(a,new.locale,new.id,null,i);
    i:=i+1;
  end loop;
  return new;
end;
$$;
create trigger persist_commerce_attendee_contacts after update of state on public.commerce_orders for each row execute function public.persist_commerce_attendee_contacts();

create function public.persist_legacy_attendee_contacts() returns trigger
language plpgsql security definer set search_path='' as $$
declare a jsonb:=new.attendee; v_ticket_id uuid;
begin
  if new.state<>'fulfilled' or old.state='fulfilled' or a is null then return new; end if;
  select t.id into v_ticket_id from public.tickets t where t.stripe_session_id=new.stripe_session_id;
  if v_ticket_id is null then raise exception 'Attendee ticket mapping failed'; end if;
  insert into public.legacy_ticket_attendee_contacts(ticket_id,reservation_id,first_name,last_name,email,phone,document_type,document_country,document_number,privacy_version)
  values(v_ticket_id,new.id,a->>'firstName',a->>'lastName',a->>'email',a->>'phone',a->>'documentType',a->>'documentCountry',a->>'documentNumber',new.attendee_privacy_version) on conflict(ticket_id) do nothing;
  perform public.record_guest_marketing_request(a,new.locale,null,new.id,0);
  return new;
end;
$$;
create trigger persist_legacy_attendee_contacts after update of state on public.ticket_reservations for each row execute function public.persist_legacy_attendee_contacts();

-- Raw tokens exist only in the email worker. Several hashes allow delivery retries.
create function public.prepare_guest_marketing_tokens(p_email text,p_confirmation_token text,p_unsubscribe_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.marketing_contacts%rowtype;
begin
  if p_confirmation_token is null or p_unsubscribe_token is null or p_confirmation_token !~ '^[0-9a-f]{64}$' or p_unsubscribe_token !~ '^[0-9a-f]{64}$' or p_confirmation_token=p_unsubscribe_token then return jsonb_build_object('error','invalid_token'); end if;
  select * into c from public.marketing_contacts where email=p_email for update;
  if not found then return jsonb_build_object('status','not_requested'); end if;
  if c.status='pending' then
    insert into public.marketing_consent_tokens(token_hash,contact_id,consent_cycle_id,purpose,expires_at)
    values(encode(sha256(convert_to(p_confirmation_token,'UTF8')),'hex'),c.id,c.consent_cycle_id,'confirm',now()+interval '30 days') on conflict do nothing;
  end if;
  if c.status in ('pending','subscribed') then
    insert into public.marketing_consent_tokens(token_hash,contact_id,consent_cycle_id,purpose)
    values(encode(sha256(convert_to(p_unsubscribe_token,'UTF8')),'hex'),c.id,c.consent_cycle_id,'unsubscribe') on conflict do nothing;
  end if;
  return jsonb_build_object('status',c.status);
end;
$$;

create function public.prepare_marketing_consent(p_order_id uuid,p_participant_index integer,p_confirmation_token text,p_unsubscribe_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.commerce_orders%rowtype; a jsonb;
begin
  select * into o from public.commerce_orders where id=p_order_id and state='fulfilled';
  if not found or p_participant_index<0 or p_participant_index>=jsonb_array_length(o.attendees) then return jsonb_build_object('status','not_requested'); end if;
  a:=o.attendees->p_participant_index;
  if not coalesce((a->>'marketingConsent')::boolean,false) then return jsonb_build_object('status','not_requested'); end if;
  return public.prepare_guest_marketing_tokens(a->>'email',p_confirmation_token,p_unsubscribe_token);
end;
$$;
create function public.prepare_legacy_marketing_consent(p_reservation_id uuid,p_confirmation_token text,p_unsubscribe_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.ticket_reservations%rowtype;
begin
  select * into r from public.ticket_reservations where id=p_reservation_id and state='fulfilled';
  if not found or not coalesce((r.attendee->>'marketingConsent')::boolean,false) then return jsonb_build_object('status','not_requested'); end if;
  return public.prepare_guest_marketing_tokens(r.attendee->>'email',p_confirmation_token,p_unsubscribe_token);
end;
$$;

create function public.lookup_marketing_preference(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.marketing_consent_tokens%rowtype; c public.marketing_contacts%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','invalid_token'); end if;
  select * into t from public.marketing_consent_tokens where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if not found or (t.expires_at is not null and t.expires_at<=now()) then return jsonb_build_object('error','invalid_token'); end if;
  select * into c from public.marketing_contacts where id=t.contact_id;
  if t.purpose='confirm' and t.consent_cycle_id<>c.consent_cycle_id then return jsonb_build_object('error','invalid_token'); end if;
  return jsonb_build_object('status',c.status,'locale',c.locale,'can_confirm',t.purpose='confirm' and c.status='pending' and t.consumed_at is null,
    'can_unsubscribe',t.purpose='unsubscribe' and c.status<>'unsubscribed');
end;
$$;

create function public.confirm_marketing_consent(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.marketing_consent_tokens%rowtype; c public.marketing_contacts%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','invalid_token'); end if;
  select * into t from public.marketing_consent_tokens where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and purpose='confirm';
  if not found or t.expires_at<=now() then return jsonb_build_object('error','invalid_token'); end if;
  select * into c from public.marketing_contacts where id=t.contact_id for update;
  if t.consent_cycle_id<>c.consent_cycle_id then return jsonb_build_object('error','invalid_token'); end if;
  if c.status='pending' and t.consumed_at is null then
    update public.marketing_contacts set status='subscribed',confirmed_at=now(),unsubscribed_at=null,updated_at=now() where id=c.id;
    update public.marketing_consent_tokens set consumed_at=now() where token_hash=t.token_hash;
    insert into public.marketing_consent_events(contact_id,action,consent_version,locale,source,order_id,reservation_id,participant_index,consent_cycle_id)
    values(c.id,'confirmed',c.consent_version,c.locale,'email_confirmation',c.order_id,c.reservation_id,c.participant_index,c.consent_cycle_id);
    return jsonb_build_object('status','subscribed');
  end if;
  return jsonb_build_object('status',c.status);
end;
$$;
create function public.unsubscribe_marketing_consent(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.marketing_consent_tokens%rowtype; c public.marketing_contacts%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','invalid_token'); end if;
  select * into t from public.marketing_consent_tokens where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and purpose='unsubscribe';
  if not found then return jsonb_build_object('error','invalid_token'); end if;
  select * into c from public.marketing_contacts where id=t.contact_id for update;
  if c.status<>'unsubscribed' then
    update public.marketing_contacts set status='unsubscribed',unsubscribed_at=now(),updated_at=now() where id=c.id;
    insert into public.marketing_consent_events(contact_id,action,consent_version,locale,source,order_id,reservation_id,participant_index,consent_cycle_id)
    values(c.id,'unsubscribed',c.consent_version,c.locale,'email_unsubscribe',c.order_id,c.reservation_id,c.participant_index,c.consent_cycle_id);
  end if;
  return jsonb_build_object('status','unsubscribed');
end;
$$;

revoke all on function public.attendee_tax_code_valid(text),public.commerce_attendee_valid(jsonb),public.reserve_event_commerce_attendees(uuid,uuid,text,text,jsonb,uuid,text,jsonb,text),public.reserve_event_ticket_attendee(uuid,uuid,text,text,text,text,jsonb,text),public.commerce_assign_participant_index(),public.record_guest_marketing_request(jsonb,text,uuid,uuid,integer),public.persist_commerce_attendee_contacts(),public.persist_legacy_attendee_contacts(),public.prepare_guest_marketing_tokens(text,text,text),public.prepare_marketing_consent(uuid,integer,text,text),public.prepare_legacy_marketing_consent(uuid,text,text),public.lookup_marketing_preference(text),public.confirm_marketing_consent(text),public.unsubscribe_marketing_consent(text) from public,anon,authenticated;
grant execute on function public.attendee_tax_code_valid(text),public.commerce_attendee_valid(jsonb),public.reserve_event_commerce_attendees(uuid,uuid,text,text,jsonb,uuid,text,jsonb,text),public.reserve_event_ticket_attendee(uuid,uuid,text,text,text,text,jsonb,text),public.prepare_marketing_consent(uuid,integer,text,text),public.prepare_legacy_marketing_consent(uuid,text,text),public.lookup_marketing_preference(text),public.confirm_marketing_consent(text),public.unsubscribe_marketing_consent(text) to service_role;
