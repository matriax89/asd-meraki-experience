alter type public.order_status_enum add value if not exists 'ready_for_pickup';

alter table public.orders
  add column if not exists locale text not null default 'it',
  add column if not exists customer_confirmation_sent_at timestamptz,
  add column if not exists admin_notification_sent_at timestamptz;

alter table public.orders
  drop constraint if exists orders_locale_check;

alter table public.orders
  add constraint orders_locale_check check (locale in ('it', 'en', 'de'));
