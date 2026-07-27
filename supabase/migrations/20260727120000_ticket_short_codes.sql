alter table public.tickets
  add column if not exists short_code text;

create unique index if not exists tickets_short_code_unique
  on public.tickets(short_code)
  where short_code is not null;

create or replace function public.generate_ticket_short_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidate text;
  attempt integer;
  position integer;
begin
  for attempt in 1..100 loop
    candidate := 'MK-';
    for position in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    if not exists (select 1 from public.tickets where short_code = candidate) then
      return candidate;
    end if;
  end loop;
  raise exception 'SHORT_CODE_GENERATION_FAILED';
end;
$$;

create or replace function public.assign_ticket_short_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.short_code is null or trim(new.short_code) = '' then
    new.short_code := public.generate_ticket_short_code();
  end if;
  return new;
end;
$$;

drop trigger if exists assign_ticket_short_code_before_insert on public.tickets;
create trigger assign_ticket_short_code_before_insert
before insert on public.tickets
for each row execute function public.assign_ticket_short_code();

do $$
declare
  ticket_row record;
begin
  for ticket_row in
    select id from public.tickets where short_code is null
  loop
    update public.tickets
    set short_code = public.generate_ticket_short_code()
    where id = ticket_row.id;
  end loop;
end;
$$;

alter table public.tickets
  alter column short_code set not null;

revoke all on function public.generate_ticket_short_code() from public, anon, authenticated;
