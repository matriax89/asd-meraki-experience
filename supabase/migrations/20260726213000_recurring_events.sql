alter table public.events
  add column if not exists recurrence_series_id uuid,
  add column if not exists recurrence_index integer;

create index if not exists idx_events_recurrence_series
  on public.events(recurrence_series_id, recurrence_index)
  where recurrence_series_id is not null;

comment on column public.events.recurrence_series_id is
  'Identifier shared by every occurrence generated from the same recurring event.';
comment on column public.events.recurrence_index is
  'Zero-based position of an event inside its recurrence series.';
