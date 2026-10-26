-- Compensation is private business data, separate from publicly readable affiliates.
create table public.event_affiliate_commissions (
  event_id uuid not null references public.events(id) on delete cascade,
  affiliate_id uuid not null,
  commission_cents integer not null check (commission_cents between 0 and 10000000),
  updated_at timestamptz not null default now(),
  primary key (event_id, affiliate_id)
);
alter table public.event_affiliate_commissions enable row level security;
revoke all on public.event_affiliate_commissions from public, anon, authenticated;
grant select, insert, update, delete on public.event_affiliate_commissions to service_role;

create function public.set_event_affiliate_commissions(p_event_id uuid, p_rates jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.events%rowtype; entry record;
begin
  select * into e from public.events where id = p_event_id for update;
  if not found then raise exception 'Event unavailable' using errcode = '22023'; end if;
  if jsonb_typeof(p_rates) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_rates)) > 100 then
    raise exception 'Invalid affiliate compensation' using errcode = '22023';
  end if;
  -- Validate the entire submission before making any change; omitted historical
  -- affiliates keep their rates rather than silently being reset to zero.
  for entry in select key, value from jsonb_each(p_rates) loop
    if entry.key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(entry.value) is distinct from 'number'
      or entry.value::text !~ '^[0-9]+$'
      or (entry.value::text)::numeric not between 0 and 10000000
      or not exists(select 1 from jsonb_array_elements(e.affiliates) a where lower(a->>'id') = entry.key) then
      raise exception 'Invalid affiliate compensation' using errcode = '22023';
    end if;
  end loop;
  insert into public.event_affiliate_commissions(event_id, affiliate_id, commission_cents)
  select p_event_id, key::uuid, value::text::integer from jsonb_each(p_rates)
  on conflict (event_id, affiliate_id) do update
    set commission_cents = excluded.commission_cents, updated_at = now();
end;
$$;
revoke all on function public.set_event_affiliate_commissions(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_event_affiliate_commissions(uuid, jsonb) to service_role;
notify pgrst, 'reload schema';
