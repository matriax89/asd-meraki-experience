-- Event commerce is isolated from legacy tickets. All mutations are server-only.
alter table public.events add column commerce_config jsonb;

create table public.commerce_orders (
  id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
  event_id uuid not null references public.events(id) on delete restrict,
  buyer_email text not null, locale text not null check (locale in ('it','en','de')),
  state text not null default 'reserved' check (state in ('reserved','awaiting_payment','fulfilled','expired','payment_failed','refund_required','refund_pending','refunded')),
  amount_cents integer not null check(amount_cents >= 0), quote jsonb not null,
  participants jsonb not null, demand jsonb not null, event_snapshot jsonb not null,
  upgrade_pass_id uuid, upgrade_snapshot jsonb,
  expires_at timestamptz not null default now() + interval '35 minutes',
  stripe_session_id text unique, stripe_payment_intent text unique,
  refund_id text, refund_status text, failure_reason text,
  email_sent_at timestamptz, email_claimed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index commerce_orders_holds on public.commerce_orders(event_id,state,expires_at);
create table public.commerce_passes (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
  order_id uuid not null references public.commerce_orders(id), first_name text not null, last_name text not null,
  package_id text not null, package_name text not null, package_paid_cents integer not null check(package_paid_cents>=0),
  package_activity_ids text[] not null, original_package_paid_cents integer not null check(original_package_paid_cents>=0),
  qr_code text not null unique default gen_random_uuid()::text,
  status text not null default 'paid' check(status in ('paid','refunded','canceled')),
  created_at timestamptz not null default now()
);
alter table public.commerce_orders add constraint commerce_upgrade_pass_fk foreign key(upgrade_pass_id) references public.commerce_passes(id);
create index commerce_passes_event on public.commerce_passes(event_id,status);
create table public.commerce_entitlements (
  id uuid primary key default gen_random_uuid(), pass_id uuid not null references public.commerce_passes(id),
  event_id uuid not null references public.events(id), order_id uuid not null references public.commerce_orders(id),
  activity_id text not null, activity_name text not null, kind text not null check(kind in ('workshop','masterclass','dinner','extra')),
  menu_choice text, status text not null default 'valid' check(status in ('valid','used','refunded','canceled')),
  checked_in_at timestamptz, created_at timestamptz not null default now()
);
create unique index commerce_active_pass_activity on public.commerce_entitlements(pass_id,activity_id) where status in ('valid','used');
create index commerce_entitlements_capacity on public.commerce_entitlements(event_id,activity_id,status);
create table public.commerce_waitlist (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
  email text not null, first_name text not null, last_name text not null, package_id text not null,
  activity_ids text[] not null, status text not null default 'waiting' check(status in ('waiting','notified','removed')),
  created_at timestamptz not null default now()
);
create unique index commerce_waitlist_one_waiting on public.commerce_waitlist(event_id,lower(email),package_id) where status='waiting';
create table public.commerce_payment_refunds (
  payment_intent text primary key, refund_id text, status text not null,
  created_at timestamptz not null default now()
);

alter table public.commerce_orders enable row level security;
alter table public.commerce_passes enable row level security;
alter table public.commerce_entitlements enable row level security;
alter table public.commerce_waitlist enable row level security;
alter table public.commerce_payment_refunds enable row level security;
revoke all on public.commerce_orders,public.commerce_passes,public.commerce_entitlements,public.commerce_waitlist,public.commerce_payment_refunds from public,anon,authenticated;
grant all on public.commerce_orders,public.commerce_passes,public.commerce_entitlements,public.commerce_waitlist,public.commerce_payment_refunds to service_role;

-- Validate even server-originated configuration; never cast malformed JSON outside a guarded block.
create function public.commerce_config_valid(p_config jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare a jsonb; p jsonb; x jsonb; y jsonb; v_id text;
begin
  if p_config is null or jsonb_typeof(p_config) is distinct from 'object' or p_config->>'version' is distinct from '1'
    or jsonb_typeof(p_config->'enabled') is distinct from 'boolean' or jsonb_typeof(p_config->'waitlistEnabled') is distinct from 'boolean'
    or jsonb_typeof(p_config->'upgradesEnabled') is distinct from 'boolean'
    or jsonb_typeof(p_config->'activities') is distinct from 'array' or jsonb_typeof(p_config->'packages') is distinct from 'array'
    or jsonb_typeof(p_config->'addons') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_config->'activities')>30 or jsonb_array_length(p_config->'packages')>30 or jsonb_array_length(p_config->'addons')>30 then return false; end if;
  if (p_config->>'enabled')::boolean and (jsonb_array_length(p_config->'activities')=0 or jsonb_array_length(p_config->'packages')=0) then return false; end if;
  foreach v_id in array array['activities','packages','addons'] loop
    if exists(select 1 from jsonb_array_elements(p_config->v_id) z group by z->>'id' having count(*)>1) then return false; end if;
    for x in select value from jsonb_array_elements(p_config->v_id) loop
      if coalesce(x->>'id','') !~ '^[a-z0-9_-]{1,64}$' or length(btrim(coalesce(x->>'name','')))=0 or length(x->>'name')>120 then return false; end if;
    end loop;
  end loop;
  for a in select value from jsonb_array_elements(p_config->'activities') loop
    if coalesce(a->>'kind','') not in ('workshop','masterclass','dinner','extra') or jsonb_typeof(a->'menuOptions') is distinct from 'array' then return false; end if;
    if a->>'capacity' is not null and ((a->>'capacity')::integer<0 or (a->>'capacity')::integer>100000 or (a->>'capacity')::numeric<>(a->>'capacity')::integer) then return false; end if;
    if a->>'startsAt' is not null then perform (a->>'startsAt')::timestamptz; end if;
    if a->>'salesEnd' is not null then perform (a->>'salesEnd')::timestamptz; end if;
    if (a->>'salesEnd')::timestamptz>(a->>'startsAt')::timestamptz then return false; end if;
    if jsonb_array_length(a->'menuOptions')>30 or exists(select 1 from jsonb_array_elements(a->'menuOptions') z where jsonb_typeof(z)<>'string' or length(btrim(z#>>'{}'))=0 or length(z#>>'{}')>120) then return false; end if;
    if exists(select 1 from jsonb_array_elements(a->'menuOptions') z group by z having count(*)>1) then return false; end if;
  end loop;
  for p in select value from jsonb_array_elements(p_config->'packages') loop
    if jsonb_typeof(p->'prices')<>'array' or jsonb_array_length(p->'prices') not between 1 and 20 or jsonb_typeof(p->'activityIds')<>'array' or jsonb_array_length(p->'activityIds') not between 1 and 30 then return false; end if;
    if length(coalesce(p->>'description',''))>1000 then return false; end if;
    if exists(select 1 from jsonb_array_elements_text(p->'activityIds') z where not exists(select 1 from jsonb_array_elements(p_config->'activities') aa where aa->>'id'=z)) then return false; end if;
    if exists(select 1 from jsonb_array_elements_text(p->'activityIds') z group by z having count(*)>1) then return false; end if;
    if exists(select 1 from jsonb_array_elements(p->'prices') z group by z->>'id' having count(*)>1) then return false; end if;
    for x in select value from jsonb_array_elements(p->'prices') loop
      if coalesce(x->>'id','') !~ '^[a-z0-9_-]{1,64}$' or length(btrim(coalesce(x->>'label','')))=0 then return false; end if;
      if x->>'amountCents' is null or (x->>'amountCents')::numeric<>(x->>'amountCents')::integer or (x->>'amountCents')::integer not between 0 and 10000000 then return false; end if;
      if x->>'startsAt' is not null then perform (x->>'startsAt')::timestamptz; end if;
      if x->>'endsAt' is not null then perform (x->>'endsAt')::timestamptz; end if;
      if coalesce((x->>'startsAt')::timestamptz,'-infinity') >= coalesce((x->>'endsAt')::timestamptz,'infinity') then return false; end if;
      for y in select value from jsonb_array_elements(p->'prices') where value->>'id'<>x->>'id' loop
        if coalesce((x->>'startsAt')::timestamptz,'-infinity')<coalesce((y->>'endsAt')::timestamptz,'infinity') and coalesce((y->>'startsAt')::timestamptz,'-infinity')<coalesce((x->>'endsAt')::timestamptz,'infinity') then return false; end if;
      end loop;
    end loop;
  end loop;
  for x in select value from jsonb_array_elements(p_config->'addons') loop
    if not exists(select 1 from jsonb_array_elements(p_config->'activities') aa where aa->>'id'=x->>'activityId') or x->>'amountCents' is null or (x->>'amountCents')::numeric<>(x->>'amountCents')::integer or (x->>'amountCents')::integer not between 0 and 10000000 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

-- Caller holds the event row. Counts both legacy and commerce inventory.
create function public.commerce_availability(p_event_id uuid, p_exclude_order uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; a jsonb; result jsonb:='{}'; sold integer; held integer;
begin
  select * into e from public.events where id=p_event_id for update;
  if not found then return '{}'::jsonb; end if;
  select count(*) into sold from public.commerce_passes where event_id=e.id and status='paid';
  sold:=sold+(select count(*) from public.tickets where event_id=e.id and status in ('paid','used'));
  sold:=greatest(sold,coalesce(e.posti_venduti,0));
  select coalesce(sum((demand->>'_passes')::integer),0) into held from public.commerce_orders where event_id=e.id and id is distinct from p_exclude_order and (state='awaiting_payment' or (state='reserved' and expires_at>now()));
  held:=held+(select count(*) from public.ticket_reservations where event_id=e.id and (state='awaiting_payment' or (state='reserved' and expires_at>now())));
  result:=jsonb_build_object('_event',case when e.capacity is null then null else greatest(0,e.capacity-sold-held) end);
  for a in select value from jsonb_array_elements(coalesce(e.commerce_config->'activities','[]')) loop
    select count(*) into sold from public.commerce_entitlements where event_id=e.id and activity_id=a->>'id' and status in ('valid','used');
    select coalesce(sum(coalesce((demand->>(a->>'id'))::integer,0)),0) into held from public.commerce_orders where event_id=e.id and id is distinct from p_exclude_order and (state='awaiting_payment' or (state='reserved' and expires_at>now()));
    result:=result||jsonb_build_object(a->>'id',case when a->>'capacity' is null then null else greatest(0,(a->>'capacity')::integer-sold-held) end);
  end loop;
  return result;
end;
$$;

create function public.quote_event_commerce(p_event_id uuid,p_participants jsonb,p_upgrade_pass_id uuid default null,p_upgrade_token text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; pass public.commerce_passes%rowtype; person jsonb; pkg jsonb; tier jsonb; addon jsonb; activity jsonb;
  lines jsonb:='[]'; clean_people jsonb:='[]'; person_clean jsonb; selected text[]; old_activities text[]:='{}'; activity_id text; addon_id text; menu text;
  total integer:=0; price integer; upgrade boolean:=p_upgrade_pass_id is not null; snapshot jsonb:=null; demand jsonb:='{}'; old_count integer; t_count integer;
begin
  select * into e from public.events where id=p_event_id for update;
  if not found or not coalesce(e.attivo,false) or coalesce(e.cta_tipo,'stripe')<>'stripe' or (not upgrade and e.data_inizio<=now()) then return jsonb_build_object('error','event_unavailable'); end if;
  if not public.commerce_config_valid(e.commerce_config) or not coalesce((e.commerce_config->>'enabled')::boolean,false) then return jsonb_build_object('error','commerce_unavailable'); end if;
  if jsonb_typeof(p_participants)<>'array' or jsonb_array_length(p_participants) not between 1 and 20 then return jsonb_build_object('error','invalid_participants'); end if;
  if upgrade then
    select * into pass from public.commerce_passes where id=p_upgrade_pass_id and event_id=e.id and qr_code=p_upgrade_token for update;
    if not found or pass.status<>'paid' or not (e.commerce_config->>'upgradesEnabled')::boolean or jsonb_array_length(p_participants)<>1 then return jsonb_build_object('error','upgrade_unavailable'); end if;
    if exists(select 1 from public.commerce_orders where upgrade_pass_id=pass.id and (state='awaiting_payment' or (state='reserved' and expires_at>now()) or state in ('refund_required','refund_pending'))) then return jsonb_build_object('error','upgrade_pending'); end if;
    select coalesce(array_agg(ce.activity_id),'{}') into old_activities from public.commerce_entitlements ce where ce.pass_id=pass.id and ce.status in ('valid','used');
    -- Refunding an ancestor upgrade can leave a later package dependent on a revoked admission.
    -- Keep remaining access valid, but require organizer review before another upgrade.
    if not pass.package_activity_ids<@old_activities then return jsonb_build_object('error','invalid_upgrade'); end if;
    snapshot:=jsonb_build_object('package_id',pass.package_id,'package_name',pass.package_name,'package_paid_cents',pass.package_paid_cents,'package_activity_ids',pass.package_activity_ids);
  end if;
  for person in select value from jsonb_array_elements(p_participants) loop
    if jsonb_typeof(person)<>'object' or length(btrim(coalesce(person->>'firstName','')))=0 or length(btrim(coalesce(person->>'lastName','')))=0 or length(person->>'firstName')>100 or length(person->>'lastName')>100 or jsonb_typeof(person->'addonIds')<>'array' or jsonb_array_length(person->'addonIds')>30 or jsonb_typeof(person->'menuChoices')<>'object' then return jsonb_build_object('error','invalid_participants'); end if;
    if upgrade and (btrim(person->>'firstName')<>pass.first_name or btrim(person->>'lastName')<>pass.last_name) then return jsonb_build_object('error','invalid_participants'); end if;
    select value into pkg from jsonb_array_elements(e.commerce_config->'packages') where value->>'id'=person->>'packageId';
    if pkg is null then return jsonb_build_object('error','invalid_package'); end if;
    if upgrade and pass.package_id=pkg->>'id' then
      -- Adding dinner later never reprices the already purchased workshop.
      selected:=pass.package_activity_ids;
      pkg:=jsonb_set(pkg,'{activityIds}',to_jsonb(selected));
      tier:=jsonb_build_object('id','owned','label','Acquistato','amountCents',pass.package_paid_cents);
    else
      select count(*) into t_count from jsonb_array_elements(pkg->'prices') where coalesce((value->>'startsAt')::timestamptz,'-infinity')<=now() and now()<coalesce((value->>'endsAt')::timestamptz,'infinity');
      if t_count<>1 then return jsonb_build_object('error','sales_closed'); end if;
      select value into tier from jsonb_array_elements(pkg->'prices') where coalesce((value->>'startsAt')::timestamptz,'-infinity')<=now() and now()<coalesce((value->>'endsAt')::timestamptz,'infinity');
      select array_agg(value) into selected from jsonb_array_elements_text(pkg->'activityIds');
    end if;
    if upgrade and (not pass.package_activity_ids<@selected) then return jsonb_build_object('error','invalid_upgrade'); end if;
    if upgrade and pass.package_id=pkg->>'id' and jsonb_array_length(person->'addonIds')=0 then return jsonb_build_object('error','invalid_upgrade'); end if;
    price:=greatest(0,(tier->>'amountCents')::integer-case when upgrade then pass.package_paid_cents else 0 end);
    lines:=lines||jsonb_build_array(jsonb_build_object('label',pkg->>'name'||' · '||(tier->>'label'),'quantity',1,'unitAmountCents',price,'totalCents',price,'kind',case when upgrade then 'upgrade' else 'package' end,'packageId',pkg->>'id','tierId',tier->>'id','activityIds',pkg->'activityIds'));
    total:=total+price;
    if exists(select 1 from jsonb_array_elements_text(person->'addonIds') z group by z having count(*)>1) then return jsonb_build_object('error','invalid_addon'); end if;
    for addon_id in select value from jsonb_array_elements_text(person->'addonIds') loop
      select value into addon from jsonb_array_elements(e.commerce_config->'addons') where value->>'id'=addon_id;
      if addon is null or addon->>'activityId'=any(selected) or addon->>'activityId'=any(old_activities) then return jsonb_build_object('error','invalid_addon'); end if;
      selected:=array_append(selected,addon->>'activityId'); price:=(addon->>'amountCents')::integer;
      total:=total+price;
      lines:=lines||jsonb_build_array(jsonb_build_object('label',addon->>'name','quantity',1,'unitAmountCents',price,'totalCents',price,'kind','addon','activityIds',jsonb_build_array(addon->>'activityId')));
    end loop;
    for activity_id in select unnest(selected) loop
      select value into activity from jsonb_array_elements(e.commerce_config->'activities') where value->>'id'=activity_id;
      -- Already-owned admissions retain their original deadline/menu when upgrading.
      if not activity_id=any(old_activities) then
        if (activity->>'salesEnd')::timestamptz<=now() or coalesce((activity->>'startsAt')::timestamptz,e.data_inizio)<=now() then return jsonb_build_object('error','sales_closed'); end if;
        menu:=person->'menuChoices'->>activity_id;
        if (jsonb_array_length(activity->'menuOptions')>0 and not coalesce(activity->'menuOptions' ? menu,false)) or (jsonb_array_length(activity->'menuOptions')=0 and menu is not null) then return jsonb_build_object('error','invalid_menu'); end if;
        demand:=jsonb_set(demand,array[activity_id],to_jsonb(coalesce((demand->>activity_id)::integer,0)+1));
      end if;
    end loop;
    if exists(select 1 from jsonb_object_keys(person->'menuChoices') k where not k=any(selected) and not k=any(old_activities)) then return jsonb_build_object('error','invalid_menu'); end if;
    person_clean:=jsonb_build_object('firstName',btrim(person->>'firstName'),'lastName',btrim(person->>'lastName'),'packageId',pkg->>'id','addonIds',person->'addonIds','menuChoices',person->'menuChoices');
    clean_people:=clean_people||jsonb_build_array(person_clean);
  end loop;
  if upgrade and not exists(select 1 from jsonb_object_keys(demand)) then return jsonb_build_object('error','invalid_upgrade'); end if;
  if total>10000000 or (total<=0 and not upgrade) then return jsonb_build_object('error','invalid_price'); end if;
  demand:=demand||jsonb_build_object('_passes',case when upgrade then 0 else jsonb_array_length(clean_people) end);
  return jsonb_build_object('quote',jsonb_build_object('totalCents',total,'lines',lines,'participants',clean_people),'demand',demand,'upgrade_snapshot',snapshot);
exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then return jsonb_build_object('error','invalid_request');
end;
$$;

create function public.reserve_event_commerce(p_event_id uuid,p_request_id uuid,p_buyer_email text,p_locale text,p_participants jsonb,p_upgrade_pass_id uuid default null,p_upgrade_token text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; o public.commerce_orders%rowtype; result jsonb; availability jsonb; k text; v integer;
begin
  if p_request_id is not null then perform pg_advisory_xact_lock(hashtextextended('commerce-request:'||p_request_id::text,0)); end if;
  select * into e from public.events where id=p_event_id for update;
  if not found then return jsonb_build_object('error','event_unavailable'); end if;
  if p_request_id is null or p_locale not in ('it','en','de') or p_buyer_email is null or length(p_buyer_email)>254 or p_buyer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return jsonb_build_object('error','invalid_request'); end if;
  select * into o from public.commerce_orders where request_id=p_request_id;
  if found then
    if o.event_id<>p_event_id or o.buyer_email<>lower(btrim(p_buyer_email)) or o.locale<>p_locale or o.participants<>p_participants or o.upgrade_pass_id is distinct from p_upgrade_pass_id then return jsonb_build_object('error','invalid_request'); end if;
    if p_upgrade_pass_id is not null and not exists(select 1 from public.commerce_passes where id=p_upgrade_pass_id and qr_code=p_upgrade_token) then return jsonb_build_object('error','invalid_request'); end if;
    if o.state not in ('reserved','awaiting_payment','fulfilled') or (o.state='reserved' and o.expires_at<=now() and o.stripe_session_id is null) then return jsonb_build_object('error','request_expired'); end if;
    return jsonb_build_object('order',to_jsonb(o));
  end if;
  if p_upgrade_pass_id is not null and not exists(select 1 from public.commerce_passes p join public.commerce_orders original on original.id=p.order_id where p.id=p_upgrade_pass_id and original.buyer_email=lower(btrim(p_buyer_email))) then return jsonb_build_object('error','email_mismatch'); end if;
  result:=public.quote_event_commerce(p_event_id,p_participants,p_upgrade_pass_id,p_upgrade_token);
  if result ? 'error' then return result; end if;
  availability:=public.commerce_availability(p_event_id);
  for k,v in select key,value::integer from jsonb_each_text(result->'demand') loop
    if (availability->>case when k='_passes' then '_event' else k end)::integer<v then return jsonb_build_object('error','sold_out','activityId',case when k='_passes' then null else k end); end if;
  end loop;
  insert into public.commerce_orders(request_id,event_id,buyer_email,locale,amount_cents,quote,participants,demand,event_snapshot,upgrade_pass_id,upgrade_snapshot)
  values(p_request_id,p_event_id,lower(btrim(p_buyer_email)),p_locale,(result->'quote'->>'totalCents')::integer,result->'quote',p_participants,result->'demand',jsonb_build_object('slug',e.slug,'titolo',e.titolo,'data_inizio',e.data_inizio,'location',e.location,'commerce_config',e.commerce_config),p_upgrade_pass_id,result->'upgrade_snapshot') returning * into o;
  return jsonb_build_object('order',to_jsonb(o));
end;
$$;

create function public.transition_commerce_order(p_order_id uuid,p_session_id text,p_state text) returns void
language plpgsql security definer set search_path='' as $$
declare event_id uuid;
begin
  if p_state not in ('awaiting_payment','expired','payment_failed','refund_pending','refunded') then raise exception 'Invalid commerce transition'; end if;
  select o.event_id into event_id from public.commerce_orders o where o.id=p_order_id;
  perform 1 from public.events where id=event_id for update;
  update public.commerce_orders set state=p_state,stripe_session_id=coalesce(stripe_session_id,p_session_id),updated_at=now()
  where id=p_order_id and (stripe_session_id is null or stripe_session_id=p_session_id)
    and ((state in ('reserved','awaiting_payment') and p_state in ('awaiting_payment','expired','payment_failed') and not(p_state='expired' and state='awaiting_payment'))
      or (state='refund_required' and p_state='refund_pending')
      or (state='refund_required' and amount_cents=0 and p_state='expired'));
end;
$$;

create function public.fulfill_event_commerce(p_order_id uuid,p_session_id text,p_payment_intent text,p_amount_cents integer,p_buyer_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; o public.commerce_orders%rowtype; pass public.commerce_passes%rowtype; participant jsonb; activity jsonb; line jsonb;
  availability jsonb; k text; v integer; ids text[]; package_ids text[]; package_price integer; package_label text; outpasses jsonb:='[]'; existing_refund text;
begin
  if p_session_id is null or p_session_id='' then raise exception 'Payment identity required'; end if;
  if p_payment_intent is not null then perform pg_advisory_xact_lock(hashtextextended(p_payment_intent,0)); end if;
  select * into o from public.commerce_orders where id=p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if (p_payment_intent is null or p_payment_intent='') and not coalesce((o.upgrade_pass_id is not null and o.amount_cents=0 and p_amount_cents=0 and o.stripe_session_id=p_session_id),false) then raise exception 'Payment identity required'; end if;
  select * into e from public.events where id=o.event_id for update;
  select * into o from public.commerce_orders where id=p_order_id for update;
  if o.buyer_email<>lower(btrim(p_buyer_email)) or (o.stripe_session_id is not null and o.stripe_session_id<>p_session_id) or (o.stripe_payment_intent is not null and o.stripe_payment_intent<>p_payment_intent) then raise exception 'Order mismatch'; end if;
  select status into existing_refund from public.commerce_payment_refunds where payment_intent=p_payment_intent and status in ('succeeded','pending','requires_action');
  if found then
    update public.commerce_orders set state=case when existing_refund='succeeded' then 'refunded' else 'refund_pending' end,stripe_session_id=p_session_id,stripe_payment_intent=p_payment_intent,refund_status=existing_refund,updated_at=now() where id=o.id;
    return jsonb_build_object('outcome',case when existing_refund='succeeded' then 'refunded' else 'refund_pending' end,'passes','[]'::jsonb);
  end if;
  if o.state in ('refunded','refund_required','refund_pending') then return jsonb_build_object('outcome',o.state,'passes','[]'::jsonb); end if;
  if o.state='fulfilled' then
    select coalesce(jsonb_agg(to_jsonb(p)),'[]') into outpasses from public.commerce_passes p where p.order_id=o.id or p.id=o.upgrade_pass_id;
    return jsonb_build_object('outcome','fulfilled','passes',outpasses);
  end if;
  availability:=public.commerce_availability(o.event_id,o.id);
  for k,v in select key,value::integer from jsonb_each_text(o.demand) loop
    if (k<>'_passes' and not availability ? k) or (availability->>case when k='_passes' then '_event' else k end)::integer<v then
      update public.commerce_orders set state='refund_required',failure_reason='capacity_unavailable',stripe_session_id=p_session_id,stripe_payment_intent=p_payment_intent,updated_at=now() where id=o.id;
      return jsonb_build_object('outcome','refund_required','passes','[]'::jsonb);
    end if;
  end loop;
  if o.amount_cents<>p_amount_cents or (o.upgrade_pass_id is not null and not exists(select 1 from public.commerce_passes where id=o.upgrade_pass_id and status='paid' and package_id=o.upgrade_snapshot->>'package_id' and package_paid_cents=(o.upgrade_snapshot->>'package_paid_cents')::integer and package_activity_ids<@array(select ce.activity_id from public.commerce_entitlements ce where ce.pass_id=o.upgrade_pass_id and ce.status in ('valid','used')))) then
    update public.commerce_orders set state='refund_required',failure_reason=case when o.amount_cents<>p_amount_cents then 'amount_mismatch' else 'upgrade_unavailable' end,stripe_session_id=p_session_id,stripe_payment_intent=p_payment_intent,updated_at=now() where id=o.id;
    return jsonb_build_object('outcome','refund_required','passes','[]'::jsonb);
  end if;
  for participant in select value from jsonb_array_elements(o.participants) loop
    select value into line from jsonb_array_elements(o.quote->'lines') where value->>'packageId'=participant->>'packageId' and value->>'kind' in ('package','upgrade') limit 1;
    select array_agg(value) into package_ids from jsonb_array_elements_text(line->'activityIds');
    package_price:=(line->>'unitAmountCents')::integer;
    -- Labels are frozen in the quote; edited configuration never changes a paid package.
    package_label:=split_part(line->>'label',' · ',1);
    if o.upgrade_pass_id is null then
      insert into public.commerce_passes(event_id,order_id,first_name,last_name,package_id,package_name,package_paid_cents,package_activity_ids,original_package_paid_cents)
      values(o.event_id,o.id,btrim(participant->>'firstName'),btrim(participant->>'lastName'),participant->>'packageId',package_label,package_price,package_ids,package_price) returning * into pass;
    else
      update public.commerce_passes set package_id=participant->>'packageId',package_name=package_label,package_paid_cents=package_paid_cents+package_price,package_activity_ids=package_ids where id=o.upgrade_pass_id returning * into pass;
    end if;
    ids:=package_ids;
    for k in select value from jsonb_array_elements_text(participant->'addonIds') loop
      select value into activity from jsonb_array_elements(o.event_snapshot->'commerce_config'->'addons') where value->>'id'=k;
      -- Add-on identities are frozen in the corresponding quote line when present.
      if activity is not null then ids:=array_append(ids,activity->>'activityId'); end if;
    end loop;
    -- The demand is authoritative for new admissions, including removed/renamed add-ons.
    -- Per-person add-on IDs remain stable while there are live holds (save RPC enforces this).
    for k in select distinct unnest(ids) loop
      if exists(select 1 from public.commerce_entitlements where pass_id=pass.id and activity_id=k and status in ('valid','used')) then continue; end if;
      select value into activity from jsonb_array_elements(o.event_snapshot->'commerce_config'->'activities') where value->>'id'=k;
      if activity is null then raise exception 'Reserved activity removed'; end if;
      insert into public.commerce_entitlements(pass_id,event_id,order_id,activity_id,activity_name,kind,menu_choice)
      values(pass.id,o.event_id,o.id,k,activity->>'name',activity->>'kind',participant->'menuChoices'->>k);
    end loop;
    outpasses:=outpasses||jsonb_build_array(to_jsonb(pass));
  end loop;
  update public.events set posti_venduti=coalesce(posti_venduti,0)+(o.demand->>'_passes')::integer where id=o.event_id;
  update public.commerce_orders set state='fulfilled',stripe_session_id=p_session_id,stripe_payment_intent=p_payment_intent,updated_at=now() where id=o.id;
  return jsonb_build_object('outcome','fulfilled','passes',outpasses);
end;
$$;

create function public.revoke_commerce_payment(p_payment_intent text,p_refund_id text default null,p_refund_status text default 'succeeded') returns void
language plpgsql security definer set search_path='' as $$
declare o public.commerce_orders%rowtype; released integer; delta integer;
begin
  if p_payment_intent is null or p_payment_intent='' or p_refund_status not in ('pending','requires_action','succeeded','failed','canceled') then raise exception 'Invalid refund'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_payment_intent,0));
  insert into public.commerce_payment_refunds(payment_intent,refund_id,status) values(p_payment_intent,p_refund_id,p_refund_status)
    on conflict(payment_intent) do update set refund_id=coalesce(excluded.refund_id,public.commerce_payment_refunds.refund_id),status=case when public.commerce_payment_refunds.status='succeeded' then 'succeeded' else excluded.status end;
  select * into o from public.commerce_orders where stripe_payment_intent=p_payment_intent;
  if not found then return; end if;
  perform 1 from public.events where id=o.event_id for update;
  select * into o from public.commerce_orders where id=o.id for update;
  if o.state='refunded' then return; end if;
  if p_refund_status in ('failed','canceled') then
    -- An automatic refund can retry; a failed voluntary refund leaves paid access valid.
    update public.commerce_orders set refund_status=p_refund_status,refund_id=coalesce(p_refund_id,refund_id),state=case when failure_reason is not null then 'refund_required' when exists(select 1 from public.commerce_entitlements where order_id=o.id) then 'fulfilled' else 'expired' end,updated_at=now() where id=o.id;
    return;
  end if;
  if p_refund_status in ('pending','requires_action') then
    update public.commerce_orders set state='refund_pending',refund_status=p_refund_status,refund_id=coalesce(p_refund_id,refund_id),updated_at=now() where id=o.id;
    return;
  end if;
  -- Every payment owns only its incremental admissions. Refunding the original
  -- workshop does not invalidate a dinner purchased in a separate later order.
  update public.commerce_entitlements set status='refunded' where order_id=o.id;
  if o.upgrade_pass_id is null then
    update public.commerce_passes set package_paid_cents=greatest(0,package_paid_cents-original_package_paid_cents) where order_id=o.id;
  else
    select coalesce(sum((value->>'unitAmountCents')::integer),0) into delta from jsonb_array_elements(o.quote->'lines') where value->>'kind'='upgrade';
    update public.commerce_passes set package_paid_cents=greatest(0,package_paid_cents-delta),
      package_id=case when package_id=o.participants->0->>'packageId' then o.upgrade_snapshot->>'package_id' else package_id end,
      package_name=case when package_id=o.participants->0->>'packageId' then o.upgrade_snapshot->>'package_name' else package_name end,
      package_activity_ids=case when package_id=o.participants->0->>'packageId' then array(select jsonb_array_elements_text(o.upgrade_snapshot->'package_activity_ids')) else package_activity_ids end
      where id=o.upgrade_pass_id;
  end if;
  select count(*) into released from public.commerce_passes p where (p.order_id=o.id or p.id=o.upgrade_pass_id) and p.status='paid'
    and not exists(select 1 from public.commerce_entitlements ce where ce.pass_id=p.id and ce.status in ('valid','used'));
  update public.commerce_passes p set status=case when p.status='canceled' then 'canceled'
    when exists(select 1 from public.commerce_entitlements ce where ce.pass_id=p.id and ce.status in ('valid','used')) then 'paid' else 'refunded' end
    where p.order_id=o.id or p.id=o.upgrade_pass_id;
  update public.events set posti_venduti=greatest(0,coalesce(posti_venduti,0)-released) where id=o.event_id;
  update public.commerce_orders set state='refunded',refund_id=coalesce(p_refund_id,refund_id),refund_status='succeeded',updated_at=now() where id=o.id;
end;
$$;

create function public.save_commerce_config(p_event_id uuid,p_config jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; a jsonb; olda jsonb; occupied integer; activity_id text;
begin
  select * into e from public.events where id=p_event_id for update;
  if not found then return jsonb_build_object('error','event_unavailable'); end if;
  if not public.commerce_config_valid(p_config) then return jsonb_build_object('error','invalid_config'); end if;
  if (p_config->>'enabled')::boolean and not coalesce((e.commerce_config->>'enabled')::boolean,false) and exists(select 1 from public.ticket_reservations where event_id=e.id and (state='awaiting_payment' or(state='reserved' and expires_at>now()))) then return jsonb_build_object('error','legacy_checkouts_pending'); end if;
  -- Freeze structure during live Checkout holds. Prices can be edited; existing orders keep their quote.
  if exists(select 1 from public.commerce_orders where event_id=e.id and (state='awaiting_payment' or (state='reserved' and expires_at>now()))) then
    if (e.commerce_config->'activities') is distinct from (p_config->'activities') or (e.commerce_config->'addons') is distinct from (p_config->'addons') or
       (select jsonb_agg(x-'prices') from jsonb_array_elements(e.commerce_config->'packages') x) is distinct from (select jsonb_agg(x-'prices') from jsonb_array_elements(p_config->'packages') x) then return jsonb_build_object('error','active_checkouts'); end if;
  end if;
  for activity_id in select distinct ce.activity_id from public.commerce_entitlements ce where event_id=e.id and status in ('valid','used') loop
    select value into a from jsonb_array_elements(p_config->'activities') where value->>'id'=activity_id;
    if a is null then return jsonb_build_object('error','issued_activity_removed'); end if;
  end loop;
  if (p_config->>'upgradesEnabled')::boolean and exists(select 1 from public.commerce_passes cp where cp.event_id=e.id and cp.status='paid'
    and not exists(select 1 from jsonb_array_elements(p_config->'packages') package where package->>'id'=cp.package_id)) then return jsonb_build_object('error','issued_package_removed'); end if;
  if (p_config->>'upgradesEnabled')::boolean and exists(select 1 from public.commerce_passes cp
    join lateral jsonb_array_elements(p_config->'packages') package on package->>'id'=cp.package_id
    where cp.event_id=e.id and cp.status='paid' and not (
      (package->'activityIds') @> to_jsonb(cp.package_activity_ids)
      and to_jsonb(cp.package_activity_ids) @> (package->'activityIds'))) then return jsonb_build_object('error','issued_package_changed'); end if;
  for a in select value from jsonb_array_elements(p_config->'activities') loop
    select count(*) into occupied from public.commerce_entitlements ce where event_id=e.id and ce.activity_id=a->>'id' and status in ('valid','used');
    occupied:=occupied+(select coalesce(sum(coalesce((demand->>(a->>'id'))::integer,0)),0) from public.commerce_orders where event_id=e.id and (state='awaiting_payment' or(state='reserved' and expires_at>now())));
    if (a->>'capacity')::integer<occupied then return jsonb_build_object('error','capacity_below_occupancy','activityId',a->>'id'); end if;
  end loop;
  update public.events set commerce_config=p_config,updated_at=now() where id=e.id;
  return jsonb_build_object('saved',true);
end;
$$;

create function public.check_in_commerce_pass(p_value text,p_event_id uuid,p_activity_id text,p_column text default 'qr_code') returns jsonb
language plpgsql security definer set search_path='' as $$
declare pass public.commerce_passes%rowtype; entitlement public.commerce_entitlements%rowtype;
begin
  if p_column not in ('qr_code','id') then return jsonb_build_object('outcome','not_found','message','Biglietto non trovato'); end if;
  select * into pass from public.commerce_passes where case when p_column='id' then id::text=p_value else qr_code=p_value end;
  if not found then return jsonb_build_object('outcome','not_found','message','Biglietto non trovato'); end if;
  if pass.event_id is distinct from p_event_id then return jsonb_build_object('outcome','invalid_event','message','Biglietto per un altro evento'); end if;
  perform 1 from public.events where id=pass.event_id for update;
  select * into pass from public.commerce_passes where id=pass.id for update;
  if pass.status<>'paid' then return jsonb_build_object('outcome','refunded','message','Biglietto non valido'); end if;
  if p_activity_id is null or p_activity_id='' then return jsonb_build_object('outcome','invalid_activity','message','Seleziona attività','pass',to_jsonb(pass)); end if;
  select * into entitlement from public.commerce_entitlements where pass_id=pass.id and activity_id=p_activity_id and status in ('valid','used') for update;
  if not found then return jsonb_build_object('outcome','invalid_activity','message','Attività non inclusa nel biglietto','pass',to_jsonb(pass),'entitlements',(select coalesce(jsonb_agg(to_jsonb(ce)),'[]') from public.commerce_entitlements ce where ce.pass_id=pass.id)); end if;
  if entitlement.status='used' then return jsonb_build_object('outcome','already_used','message','Ingresso già utilizzato','pass',to_jsonb(pass),'entitlement',to_jsonb(entitlement),'entitlements',(select coalesce(jsonb_agg(to_jsonb(ce)),'[]') from public.commerce_entitlements ce where ce.pass_id=pass.id)); end if;
  update public.commerce_entitlements set status='used',checked_in_at=now() where id=entitlement.id returning * into entitlement;
  return jsonb_build_object('outcome','success','message','Ingresso confermato','pass',to_jsonb(pass),'entitlement',to_jsonb(entitlement),'entitlements',(select coalesce(jsonb_agg(to_jsonb(ce)),'[]') from public.commerce_entitlements ce where ce.pass_id=pass.id));
end;
$$;

create function public.claim_commerce_email(p_order_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.commerce_orders set email_claimed_at=now() where id=p_order_id and state='fulfilled' and email_sent_at is null and (email_claimed_at is null or email_claimed_at<now()-interval '5 minutes');
  return found;
end;
$$;
create function public.complete_commerce_email(p_order_id uuid,p_success boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.commerce_orders set email_sent_at=case when p_success then now() else email_sent_at end,email_claimed_at=null where id=p_order_id;
end;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default; explicitly close every helper too.
revoke all on function public.commerce_config_valid(jsonb),public.commerce_availability(uuid,uuid),public.quote_event_commerce(uuid,jsonb,uuid,text),public.reserve_event_commerce(uuid,uuid,text,text,jsonb,uuid,text),public.transition_commerce_order(uuid,text,text),public.fulfill_event_commerce(uuid,text,text,integer,text),public.revoke_commerce_payment(text,text,text),public.save_commerce_config(uuid,jsonb),public.check_in_commerce_pass(text,uuid,text,text),public.claim_commerce_email(uuid),public.complete_commerce_email(uuid,boolean) from public,anon,authenticated;
grant execute on function public.commerce_config_valid(jsonb),public.commerce_availability(uuid,uuid),public.quote_event_commerce(uuid,jsonb,uuid,text),public.reserve_event_commerce(uuid,uuid,text,text,jsonb,uuid,text),public.transition_commerce_order(uuid,text,text),public.fulfill_event_commerce(uuid,text,text,integer,text),public.revoke_commerce_payment(text,text,text),public.save_commerce_config(uuid,jsonb),public.check_in_commerce_pass(text,uuid,text,text),public.claim_commerce_email(uuid),public.complete_commerce_email(uuid,boolean) to service_role;

-- Keep legacy Checkout links safe while advanced commerce is enabled.
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
  if coalesce((v_event.commerce_config->>'enabled')::boolean,false) then return jsonb_build_object('error','advanced_checkout_required'); end if;
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
  v_held:=v_held+(select coalesce(sum((demand->>'_passes')::integer),0) from public.commerce_orders where event_id=p_event_id and (state='awaiting_payment' or(state='reserved' and expires_at>now())));
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


-- Capacity edits use the same event row serialization as reservations. The
-- published counter may contain imported historical sales, so use its maximum
-- with actual paid passes instead of counting both representations twice.
create function public.enforce_commerce_event_capacity() returns trigger
language plpgsql security definer set search_path='' as $$
declare sold integer; held integer;
begin
  if new.capacity is null then return new; end if;
  if new.capacity<0 then raise exception 'capacity_below_occupancy' using errcode='23514'; end if;
  select count(*) into sold from public.tickets where event_id=new.id and status in ('paid','used');
  sold:=sold+(select count(*) from public.commerce_passes where event_id=new.id and status='paid');
  sold:=greatest(sold,coalesce(old.posti_venduti,0),coalesce(new.posti_venduti,0));
  select count(*) into held from public.ticket_reservations where event_id=new.id and (state='awaiting_payment' or(state='reserved' and expires_at>now()));
  held:=held+(select coalesce(sum((demand->>'_passes')::integer),0) from public.commerce_orders where event_id=new.id and (state='awaiting_payment' or(state='reserved' and expires_at>now())));
  if new.capacity<sold+held then raise exception 'capacity_below_occupancy' using errcode='23514'; end if;
  return new;
end;
$$;
revoke all on function public.enforce_commerce_event_capacity() from public,anon,authenticated;
grant execute on function public.enforce_commerce_event_capacity() to service_role;
create trigger protect_event_capacity_before_update before update of capacity on public.events
for each row when(old.capacity is distinct from new.capacity) execute function public.enforce_commerce_event_capacity();
