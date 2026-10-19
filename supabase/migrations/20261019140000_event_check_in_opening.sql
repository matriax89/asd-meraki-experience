-- Optional, explicit opening time for entry checks. No time is invented for
-- existing events: NULL means the organizer has not specified an opening time.
alter table public.events
  add column if not exists check_in_starts_at timestamptz;

comment on column public.events.check_in_starts_at is
  'Optional check-in opening instant, entered and displayed in Europe/Rome.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_check_in_starts_before_event'
  ) then
    alter table public.events
      add constraint events_check_in_starts_before_event
      check (check_in_starts_at is null or check_in_starts_at <= data_inizio);
  end if;
end;
$$;
