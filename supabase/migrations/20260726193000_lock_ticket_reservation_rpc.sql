-- Ticket reservation is an internal fulfillment primitive. Only the service
-- role used by the trusted Next.js server may execute it.
revoke all on function public.reserve_event_ticket(
  uuid, text, integer, text, text, text, text, text
) from public;

revoke all on function public.reserve_event_ticket(
  uuid, text, integer, text, text, text, text, text
) from anon;

revoke all on function public.reserve_event_ticket(
  uuid, text, integer, text, text, text, text, text
) from authenticated;

grant execute on function public.reserve_event_ticket(
  uuid, text, integer, text, text, text, text, text
) to service_role;
