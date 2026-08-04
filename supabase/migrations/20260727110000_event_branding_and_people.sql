alter table public.events
  add column if not exists logo_url text,
  add column if not exists instructor_id uuid references public.team_members(id) on delete set null;

create index if not exists idx_events_instructor_id
  on public.events(instructor_id);

create table if not exists public.event_guests (
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.team_members(id) on delete restrict,
  ordine_display integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

create index if not exists idx_event_guests_member_id
  on public.event_guests(member_id);

alter table public.event_guests enable row level security;

create policy "public read guests of active events"
  on public.event_guests for select to anon
  using (
    exists (
      select 1 from public.events
      where events.id = event_guests.event_id
        and events.attivo is true
    )
  );

create policy "authenticated read event guests"
  on public.event_guests for select to authenticated
  using (
    exists (
      select 1 from public.events
      where events.id = event_guests.event_id
        and (events.attivo is true or (select private.is_admin()))
    )
  );

create policy "admin insert event guests"
  on public.event_guests for insert to authenticated
  with check ((select private.is_admin()));

create policy "admin update event guests"
  on public.event_guests for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "admin delete event guests"
  on public.event_guests for delete to authenticated
  using ((select private.is_admin()));

grant select on public.event_guests to anon, authenticated;
grant insert, update, delete on public.event_guests to authenticated;
grant all on public.event_guests to service_role;
