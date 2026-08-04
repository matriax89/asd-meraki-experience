drop policy if exists "event_communications_admin_read"
  on public.event_communications;

create policy "event_communications_admin_read"
on public.event_communications
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role in ('admin', 'editor')
  )
);
