alter type public.order_status_enum add value if not exists 'completed';

alter table public.orders
  add column if not exists delivery_method text not null default 'shipping',
  add column if not exists completed_at timestamptz;

alter table public.orders
  drop constraint if exists orders_delivery_method_check;

alter table public.orders
  add constraint orders_delivery_method_check
  check (delivery_method in ('shipping', 'hand_delivery'));
