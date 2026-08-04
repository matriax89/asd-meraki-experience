alter table public.events
  add column if not exists cancelled_at timestamptz,
  add column if not exists duplicated_from uuid references public.events(id) on delete set null;

create table if not exists public.event_communications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  communication_type text not null check (communication_type in ('reminder', 'update', 'cancelled', 'thank_you')),
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_event_communications_event_created
  on public.event_communications(event_id, created_at desc);

alter table public.event_communications enable row level security;

drop policy if exists "event_communications_admin_read" on public.event_communications;
create policy "event_communications_admin_read"
on public.event_communications for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'editor')
  )
);

revoke all on public.event_communications from anon;
grant select on public.event_communications to authenticated;
grant all on public.event_communications to service_role;
