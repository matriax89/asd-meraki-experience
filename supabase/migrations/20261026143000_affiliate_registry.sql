-- Affiliates are created once in the private directory; events retain their
-- existing attribution snapshots and independently enable or disable a choice.
create table public.affiliates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120 and name = btrim(name) and name !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now()
);
alter table public.affiliates enable row level security;
revoke all on public.affiliates from public, anon, authenticated, service_role;
grant select on public.affiliates to service_role;

-- Never merge equal names with different identifiers: issued tickets and
-- private event compensation continue to refer to their original affiliate.
-- Prefer the latest configured name, falling back to historical attribution
-- for affiliates that are no longer present in any event configuration.
with sources as (
  select (a->>'id')::uuid id, a->>'name' name, e.created_at,
    coalesce(e.updated_at, e.created_at) named_at, 0 priority
  from public.events e cross join lateral jsonb_array_elements(e.affiliates) a
  union all
  select affiliate_id, affiliate_name, created_at, created_at, 1 from public.tickets where affiliate_id is not null
  union all
  select affiliate_id, affiliate_name, created_at, created_at, 1 from public.commerce_passes where affiliate_id is not null
  union all
  select affiliate_id, affiliate_name, created_at, created_at, 2 from public.ticket_reservations where affiliate_id is not null
  union all
  select affiliate_id, affiliate_name, created_at, created_at, 2 from public.commerce_orders where affiliate_id is not null
), named as (
  select distinct on (id) id, name
  from sources
  where name is not null and length(btrim(name)) between 1 and 120 and name !~ '[[:cntrl:]]'
  order by id, priority, named_at desc nulls last, name
), first_seen as (
  select id, min(created_at) created_at from sources group by id
)
insert into public.affiliates(id, name, created_at)
select named.id, btrim(named.name), coalesce(first_seen.created_at, now())
from named join first_seen using (id);

-- An advisory lock makes simultaneous equal-name creations atomic, while
-- allowing same-name historical identities to coexist after the backfill.
create function public.create_affiliate(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare normalized text; result public.affiliates%rowtype;
begin
  if p_name is null or p_name ~ '[[:cntrl:]]' then
    raise exception 'Invalid affiliate name' using errcode = '22023';
  end if;
  normalized := btrim(regexp_replace(p_name, '[[:space:]]+', ' ', 'g'));
  if length(normalized) not between 1 and 120 then
    raise exception 'Invalid affiliate name' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('affiliate-name:' || lower(normalized), 0));
  if exists(select 1 from public.affiliates where lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))) = lower(normalized)) then
    raise exception 'Affiliate already exists' using errcode = '23505';
  end if;
  insert into public.affiliates(name) values(normalized) returning * into result;
  return to_jsonb(result);
end;
$$;
revoke all on function public.create_affiliate(text) from public, anon, authenticated;
grant execute on function public.create_affiliate(text) to service_role;
notify pgrst, 'reload schema';
