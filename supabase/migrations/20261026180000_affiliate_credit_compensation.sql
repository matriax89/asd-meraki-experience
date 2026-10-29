-- Every existing rate and default remains denominated in euro cents.
-- Credits are whole units, independent of money and never converted to euros.
alter table public.event_affiliate_commissions
  add column commission_type text not null default 'eur' check(commission_type in ('eur','credits')),
  add column commission_credits integer not null default 0 check(commission_credits between 0 and 1000000),
  add constraint event_affiliate_commissions_single_unit check(
    (commission_type='eur' and commission_credits=0) or (commission_type='credits' and commission_cents=0));
alter table public.affiliates
  add column default_commission_type text not null default 'eur' check(default_commission_type in ('eur','credits')),
  add column default_commission_credits integer not null default 0 check(default_commission_credits between 0 and 1000000),
  add constraint affiliates_default_single_unit check(
    (default_commission_type='eur' and default_commission_credits=0) or (default_commission_type='credits' and default_commission_cents=0));

create function public.normalize_affiliate_commission(p_value jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare unit text; cents jsonb; credits jsonb;
begin
  if jsonb_typeof(p_value)='number' then
    unit:='eur'; cents:=p_value; credits:='0'::jsonb;
  elsif jsonb_typeof(p_value)='object' then
    if exists(select 1 from jsonb_object_keys(p_value) k where k not in ('commissionType','commissionCents','commissionCredits'))
      or (p_value ? 'commissionType' and jsonb_typeof(p_value->'commissionType') is distinct from 'string') then
      raise exception 'Invalid affiliate compensation' using errcode='22023';
    end if;
    unit:=coalesce(p_value->>'commissionType','eur');
    cents:=coalesce(p_value->'commissionCents','0'::jsonb); credits:=coalesce(p_value->'commissionCredits','0'::jsonb);
  else raise exception 'Invalid affiliate compensation' using errcode='22023'; end if;
  if unit not in ('eur','credits') or jsonb_typeof(cents) is distinct from 'number' or jsonb_typeof(credits) is distinct from 'number'
    or cents::text !~ '^[0-9]+$' or credits::text !~ '^[0-9]+$'
    or cents::text::numeric>10000000 or credits::text::numeric>1000000
    or (unit='eur' and credits::text::numeric<>0) or (unit='credits' and cents::text::numeric<>0) then
    raise exception 'Invalid affiliate compensation' using errcode='22023';
  end if;
  return jsonb_build_object('commissionType',unit,'commissionCents',cents::text::integer,'commissionCredits',credits::text::integer);
end;
$$;
revoke all on function public.normalize_affiliate_commission(jsonb) from public,anon,authenticated;

create or replace function public.set_event_affiliate_commissions(p_event_id uuid,p_rates jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; entry record; normalized jsonb:='{}'::jsonb; normalized_value jsonb;
begin
  select * into e from public.events where id=p_event_id for update;
  if not found then raise exception 'Event unavailable' using errcode='22023'; end if;
  if jsonb_typeof(p_rates) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_rates))>100 then
    raise exception 'Invalid affiliate compensation' using errcode='22023';
  end if;
  for entry in select key,value from jsonb_each(p_rates) loop
    if entry.key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or not exists(select 1 from jsonb_array_elements(e.affiliates) a where lower(a->>'id')=entry.key) then
      raise exception 'Invalid affiliate compensation' using errcode='22023';
    end if;
    normalized_value:=public.normalize_affiliate_commission(entry.value);
    normalized:=jsonb_set(normalized,array[entry.key],normalized_value);
  end loop;
  insert into public.event_affiliate_commissions(event_id,affiliate_id,commission_type,commission_cents,commission_credits)
    select p_event_id,key::uuid,value->>'commissionType',(value->>'commissionCents')::integer,(value->>'commissionCredits')::integer from jsonb_each(normalized)
    on conflict(event_id,affiliate_id) do update set commission_type=excluded.commission_type,commission_cents=excluded.commission_cents,
      commission_credits=excluded.commission_credits,updated_at=now();
end;
$$;
revoke all on function public.set_event_affiliate_commissions(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.set_event_affiliate_commissions(uuid,jsonb) to service_role;

create or replace function public.seed_affiliate_default_commissions() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous jsonb;
begin
  previous:=case when tg_op='INSERT' then '[]'::jsonb else old.affiliates end;
  insert into public.event_affiliate_commissions(event_id,affiliate_id,commission_type,commission_cents,commission_credits)
  select new.id,r.id,r.default_commission_type,r.default_commission_cents,r.default_commission_credits from jsonb_array_elements(new.affiliates) a
    join public.affiliates r on r.id=(a->>'id')::uuid
  where a->'active'='true'::jsonb and r.deleted_at is null
    and not exists(select 1 from jsonb_array_elements(previous) old_a where old_a->>'id'=a->>'id' and old_a->'active'='true'::jsonb)
  on conflict(event_id,affiliate_id) do nothing;
  return new;
end;
$$;
revoke all on function public.seed_affiliate_default_commissions() from public,anon,authenticated;

create or replace function public.save_affiliate_profile(p_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result public.affiliates%rowtype; normalized text; contact text; mail text; telephone text; memo text;
  default_rate integer; default_value jsonb; assignment_value jsonb; normalized_choices jsonb:='[]'; choices jsonb; assignment jsonb; event_ids uuid[]:='{}'; e public.events%rowtype;
  next_choices jsonb; desired boolean; existed boolean; previous_name text;
begin
  if jsonb_typeof(p_input) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('name','contactName','email','phone','notes','defaultCommissionType','defaultCommissionCents','defaultCommissionCredits','assignments'))
    or jsonb_typeof(p_input->'name') is distinct from 'string'
    or exists(select 1 from jsonb_each(p_input) field where field.key in ('contactName','email','phone','notes') and jsonb_typeof(field.value)<>'string') then raise exception 'Invalid affiliate profile' using errcode='22023'; end if;
  normalized:=btrim(regexp_replace(p_input->>'name','[[:space:]]+',' ','g'));
  contact:=btrim(coalesce(p_input->>'contactName','')); mail:=btrim(coalesce(p_input->>'email',''));
  telephone:=btrim(coalesce(p_input->>'phone','')); memo:=btrim(coalesce(p_input->>'notes',''));
  if length(normalized) not between 1 and 120 or p_input->>'name' ~ '[[:cntrl:]]'
    or length(contact)>120 or contact ~ '[[:cntrl:]]' or length(mail)>254
    or (mail<>'' and mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    or length(telephone)>40 or telephone ~ '[[:cntrl:]]'
    or (telephone<>'' and (telephone !~ '^[+0-9 ()./-]+$' or telephone !~ '[0-9]'))
    or length(memo)>2000 or memo ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' then
    raise exception 'Invalid affiliate profile' using errcode='22023';
  end if;
  default_value:=public.normalize_affiliate_commission(jsonb_build_object(
    'commissionType',coalesce(p_input->'defaultCommissionType','"eur"'::jsonb),
    'commissionCents',coalesce(p_input->'defaultCommissionCents','0'::jsonb),
    'commissionCredits',coalesce(p_input->'defaultCommissionCredits','0'::jsonb)));
  default_rate:=(default_value->>'commissionCents')::integer;
  if p_input ? 'assignments' then
    choices:=p_input->'assignments';
    if jsonb_typeof(choices) is distinct from 'array' or jsonb_array_length(choices)>100 then raise exception 'Invalid affiliate events' using errcode='22023'; end if;
    for assignment in select value from jsonb_array_elements(choices) loop
      if jsonb_typeof(assignment) is distinct from 'object'
        or jsonb_typeof(assignment->'eventId') is distinct from 'string'
        or assignment->>'eventId' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or (assignment->>'eventId')::uuid=any(event_ids) then raise exception 'Invalid affiliate events' using errcode='22023'; end if;
      assignment_value:=public.normalize_affiliate_commission(assignment-'eventId');
      event_ids:=array_append(event_ids,(assignment->>'eventId')::uuid);
      normalized_choices:=normalized_choices||jsonb_build_array(assignment_value||jsonb_build_object('eventId',(assignment->>'eventId')::uuid));
    end loop;
    choices:=normalized_choices;
  end if;
  -- All event changes and private compensation updates commit together. Lock
  -- existing associations in stable order before the registry record.
  perform 1 from public.events where id=any(event_ids) or (p_id is not null and affiliates @> jsonb_build_array(jsonb_build_object('id',p_id::text))) order by id for update;
  if (select count(*) from public.events where id=any(event_ids))<>cardinality(event_ids) then raise exception 'Event unavailable' using errcode='22023'; end if;
  if p_id is not null then
    select * into result from public.affiliates where id=p_id for update;
    if not found or result.deleted_at is not null then raise exception 'Affiliate unavailable' using errcode='22023'; end if;
    previous_name:=result.name;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('affiliate-name:'||lower(normalized),0));
  if (p_id is null or normalized is distinct from previous_name)
    and exists(select 1 from public.affiliates where id is distinct from p_id and lower(btrim(regexp_replace(name,'[[:space:]]+',' ','g')))=lower(normalized)) then
    raise exception 'Affiliate already exists' using errcode='23505';
  end if;
  if p_id is null then
    insert into public.affiliates(name,contact_name,email,phone,notes,default_commission_type,default_commission_cents,default_commission_credits)
      values(normalized,contact,mail,telephone,memo,default_value->>'commissionType',default_rate,(default_value->>'commissionCredits')::integer) returning * into result;
  else
    update public.affiliates set name=normalized,contact_name=contact,email=mail,phone=telephone,notes=memo,default_commission_type=default_value->>'commissionType',default_commission_cents=default_rate,default_commission_credits=(default_value->>'commissionCredits')::integer
      where id=p_id returning * into result;
  end if;
  if choices is not null then
    for e in select * from public.events where id=any(event_ids) or affiliates @> jsonb_build_array(jsonb_build_object('id',result.id::text)) order by id for update loop
      desired:=e.id=any(event_ids);
      existed:=exists(select 1 from jsonb_array_elements(e.affiliates) a where a->>'id'=result.id::text);
      select coalesce(jsonb_agg(case when a->>'id'=result.id::text then case when desired then jsonb_set(jsonb_set(a,'{active}','true'::jsonb),'{name}',to_jsonb(result.name)) else jsonb_set(a,'{active}','false'::jsonb) end else a end order by ord),'[]'::jsonb)
        into next_choices from jsonb_array_elements(e.affiliates) with ordinality t(a,ord);
      if desired and not existed then next_choices:=next_choices||jsonb_build_array(jsonb_build_object('id',result.id,'name',result.name,'active',true)); end if;
      if next_choices is distinct from e.affiliates then update public.events set affiliates=next_choices where id=e.id; end if;
    end loop;
    insert into public.event_affiliate_commissions(event_id,affiliate_id,commission_type,commission_cents,commission_credits)
      select (a->>'eventId')::uuid,result.id,a->>'commissionType',(a->>'commissionCents')::integer,(a->>'commissionCredits')::integer from jsonb_array_elements(choices) a
      on conflict(event_id,affiliate_id) do update set commission_type=excluded.commission_type,commission_cents=excluded.commission_cents,commission_credits=excluded.commission_credits,updated_at=now();
  elsif p_id is not null and result.name is distinct from previous_name then
    -- Only current public choices follow a renamed dossier. Already issued
    -- ticket/order/reservation names remain frozen for historical attribution.
    update public.events target_event set affiliates=(select jsonb_agg(case when a->>'id'=result.id::text and a->'active'='true'::jsonb then jsonb_set(a,'{name}',to_jsonb(result.name)) else a end order by ord)
      from jsonb_array_elements(target_event.affiliates) with ordinality t(a,ord))
      where affiliates @> jsonb_build_array(jsonb_build_object('id',result.id::text,'active',true));
  end if;
  return to_jsonb(result);
end;
$$;
revoke all on function public.save_affiliate_profile(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_affiliate_profile(uuid,jsonb) to service_role;

notify pgrst,'reload schema';
