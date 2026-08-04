create or replace function public.cancel_event_ticket(p_ticket_id uuid)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  cancelled_ticket public.tickets;
begin
  select * into cancelled_ticket
  from public.tickets
  where id = p_ticket_id
  for update;

  if not found then
    raise exception 'TICKET_NOT_FOUND';
  end if;

  if cancelled_ticket.status <> 'paid' then
    raise exception 'TICKET_NOT_CANCELLABLE';
  end if;

  update public.tickets
  set status = 'refunded'
  where id = p_ticket_id
  returning * into cancelled_ticket;

  update public.events
  set posti_venduti = greatest(coalesce(posti_venduti, 0) - 1, 0),
      updated_at = now()
  where id = cancelled_ticket.event_id;

  delete from public.event_trial_claims
  where ticket_id = p_ticket_id;

  return cancelled_ticket;
end;
$$;

revoke all on function public.cancel_event_ticket(uuid) from public, anon, authenticated;
grant execute on function public.cancel_event_ticket(uuid) to service_role;
