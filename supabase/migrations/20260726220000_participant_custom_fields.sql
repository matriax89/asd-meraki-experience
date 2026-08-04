alter table public.events
  add column if not exists registration_fields jsonb not null default '[]'::jsonb;

alter table public.tickets
  add column if not exists registration_answers jsonb not null default '{}'::jsonb;

create table if not exists public.ticket_checkout_answers (
  stripe_session_id text primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ticket_checkout_answers enable row level security;
revoke all on public.ticket_checkout_answers from public, anon, authenticated;
grant all on public.ticket_checkout_answers to service_role;

create index if not exists idx_ticket_checkout_answers_created
  on public.ticket_checkout_answers(created_at);
