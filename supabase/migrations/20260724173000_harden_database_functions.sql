-- Harden functions reported by the Supabase Security Advisor.
-- Privileged stock/ticket mutations are server-only (service_role).

alter function public.increment_ticket_count(uuid)
  set search_path = pg_catalog, public;

alter function public.decrement_stock(uuid, integer)
  set search_path = pg_catalog, public;

alter function public.generate_order_number()
  set search_path = pg_catalog, public;

alter function public.is_admin()
  set search_path = pg_catalog, public;

revoke all on function public.increment_ticket_count(uuid) from public, anon, authenticated;
revoke all on function public.decrement_stock(uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_ticket_count(uuid) to service_role;
grant execute on function public.decrement_stock(uuid, integer) to service_role;

-- Keep the RLS helper out of the API-exposed public schema. Existing RLS
-- policies retain their dependency on the same function after it is moved.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter function public.is_admin() set schema private;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;
