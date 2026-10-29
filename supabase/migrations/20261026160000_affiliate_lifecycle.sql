-- Private contact data, reusable default compensation and reversible removal.
alter table public.affiliates
  add column contact_name text not null default '' check(length(contact_name)<=120 and contact_name !~ '[[:cntrl:]]'),
  add column email text not null default '' check(length(email)<=254),
  add column phone text not null default '' check(length(phone)<=40 and phone !~ '[[:cntrl:]]'),
  add column notes text not null default '' check(length(notes)<=2000),
  add column default_commission_cents integer not null default 0 check(default_commission_cents between 0 and 10000000),
  add column deleted_at timestamptz;
-- A unanimous historical rate is a useful default; varying event rates remain
-- independent and are never overwritten by this backfill.
update public.affiliates a set default_commission_cents=r.amount
from (select affiliate_id,min(commission_cents) amount from public.event_affiliate_commissions
  group by affiliate_id having min(commission_cents)=max(commission_cents)) r where r.affiliate_id=a.id;

create function public.enforce_affiliate_registry_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
declare identifier uuid; removed_at timestamptz;
begin
  for identifier in select (a->>'id')::uuid from jsonb_array_elements(new.affiliates) a
    where a->'active'='true'::jsonb order by a->>'id' loop
    select deleted_at into removed_at from public.affiliates where id=identifier for share;
    -- Unknown legacy/import snapshots remain supported; app actions validate
    -- new selections. A known removed affiliate can never be reactivated.
    if found and removed_at is not null then raise exception 'Affiliate unavailable' using errcode='22023'; end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.enforce_affiliate_registry_lifecycle() from public,anon,authenticated;
create trigger enforce_affiliate_registry_lifecycle before insert or update of affiliates on public.events
for each row execute function public.enforce_affiliate_registry_lifecycle();

create function public.seed_affiliate_default_commissions() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous jsonb;
begin
  previous:=case when tg_op='INSERT' then '[]'::jsonb else old.affiliates end;
  insert into public.event_affiliate_commissions(event_id,affiliate_id,commission_cents)
  select new.id,r.id,r.default_commission_cents from jsonb_array_elements(new.affiliates) a
    join public.affiliates r on r.id=(a->>'id')::uuid
  where a->'active'='true'::jsonb and r.deleted_at is null
    and not exists(select 1 from jsonb_array_elements(previous) old_a where old_a->>'id'=a->>'id' and old_a->'active'='true'::jsonb)
  on conflict(event_id,affiliate_id) do nothing;
  return new;
end;
$$;
revoke all on function public.seed_affiliate_default_commissions() from public,anon,authenticated;
create trigger seed_affiliate_default_commissions after insert or update of affiliates on public.events
for each row execute function public.seed_affiliate_default_commissions();

create function public.save_affiliate_profile(p_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result public.affiliates%rowtype; normalized text; contact text; mail text; telephone text; memo text;
  default_rate integer; choices jsonb; assignment jsonb; event_ids uuid[]:='{}'; e public.events%rowtype;
  next_choices jsonb; desired boolean; existed boolean; previous_name text;
begin
  if jsonb_typeof(p_input) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('name','contactName','email','phone','notes','defaultCommissionCents','assignments'))
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
    or length(memo)>2000 or memo ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'
    or (p_input ? 'defaultCommissionCents' and (jsonb_typeof(p_input->'defaultCommissionCents') is distinct from 'number'
      or p_input->>'defaultCommissionCents' !~ '^[0-9]+$' or (p_input->>'defaultCommissionCents')::numeric>10000000)) then
    raise exception 'Invalid affiliate profile' using errcode='22023';
  end if;
  default_rate:=coalesce((p_input->>'defaultCommissionCents')::integer,0);
  if p_input ? 'assignments' then
    choices:=p_input->'assignments';
    if jsonb_typeof(choices) is distinct from 'array' or jsonb_array_length(choices)>100 then raise exception 'Invalid affiliate events' using errcode='22023'; end if;
    for assignment in select value from jsonb_array_elements(choices) loop
      if jsonb_typeof(assignment) is distinct from 'object' or (select count(*) from jsonb_object_keys(assignment))<>2
        or assignment->>'eventId' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or jsonb_typeof(assignment->'commissionCents') is distinct from 'number'
        or assignment->>'commissionCents' !~ '^[0-9]+$' or (assignment->>'commissionCents')::numeric>10000000
        or (assignment->>'eventId')::uuid=any(event_ids) then raise exception 'Invalid affiliate events' using errcode='22023'; end if;
      event_ids:=array_append(event_ids,(assignment->>'eventId')::uuid);
    end loop;
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
    insert into public.affiliates(name,contact_name,email,phone,notes,default_commission_cents)
      values(normalized,contact,mail,telephone,memo,default_rate) returning * into result;
  else
    update public.affiliates set name=normalized,contact_name=contact,email=mail,phone=telephone,notes=memo,default_commission_cents=default_rate
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
    insert into public.event_affiliate_commissions(event_id,affiliate_id,commission_cents)
      select (a->>'eventId')::uuid,result.id,(a->>'commissionCents')::integer from jsonb_array_elements(choices) a
      on conflict(event_id,affiliate_id) do update set commission_cents=excluded.commission_cents,updated_at=now();
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

-- Preserve the already deployed name-only action during the rolling release.
create or replace function public.create_affiliate(p_name text) returns jsonb
language sql security definer set search_path='' as $$
  select public.save_affiliate_profile(null,jsonb_build_object('name',p_name));
$$;
revoke all on function public.create_affiliate(text) from public,anon,authenticated;
grant execute on function public.create_affiliate(text) to service_role;

create function public.set_affiliate_deleted(p_id uuid,p_deleted boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result public.affiliates%rowtype;
begin
  if p_id is null or p_deleted is null then raise exception 'Invalid affiliate' using errcode='22023'; end if;
  perform 1 from public.events where affiliates @> jsonb_build_array(jsonb_build_object('id',p_id::text)) order by id for update;
  select * into result from public.affiliates where id=p_id for update;
  if not found then raise exception 'Affiliate unavailable' using errcode='22023'; end if;
  if p_deleted then
    -- Repeat the association predicate after taking the registry lock to catch
    -- event links committed while the first lock query was waiting. Concurrent
    -- stale saves acquire a registry share lock and cannot reactivate removal.
    update public.events target_event set affiliates=(select jsonb_agg(case when a->>'id'=p_id::text then jsonb_set(a,'{active}','false'::jsonb) else a end order by ord)
      from jsonb_array_elements(target_event.affiliates) with ordinality t(a,ord))
      where affiliates @> jsonb_build_array(jsonb_build_object('id',p_id::text,'active',true));
    update public.affiliates set deleted_at=coalesce(deleted_at,now()) where id=p_id returning * into result;
  else
    update public.affiliates set deleted_at=null where id=p_id returning * into result;
  end if;
  return to_jsonb(result);
end;
$$;
revoke all on function public.set_affiliate_deleted(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_affiliate_deleted(uuid,boolean) to service_role;
notify pgrst,'reload schema';
