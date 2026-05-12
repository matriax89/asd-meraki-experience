create extension if not exists "uuid-ossp";

-- =========================================================
-- ENUMS
-- =========================================================
create type sede_enum as enum ('bolzano', 'appiano', 'altro');
create type weekday_enum as enum ('lun','mar','mer','gio','ven','sab','dom');
create type lead_status_enum as enum ('nuovo','contattato','convertito','archiviato');
create type document_type_enum as enum ('mog','codice_condotta','segnalazione','regolamento','altro');
create type role_enum as enum ('admin','editor','viewer');
create type event_tipo_enum as enum ('evento','masterclass','workshop');
create type product_categoria_enum as enum ('abbigliamento','accessori','altro');
create type order_status_enum as enum ('pending','paid','processing','shipped','delivered','cancelled','refunded');
create type ticket_status_enum as enum ('pending','paid','used','refunded');

-- =========================================================
-- PROFILES (admin allowlist)
-- =========================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role role_enum not null default 'viewer',
  created_at timestamptz default now()
);

-- =========================================================
-- DIRETTIVO + ISTRUTTORI
-- =========================================================
create table team_members (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome text not null,
  cognome text not null,
  ruolo text not null,
  bio text,
  foto_url text,
  ordine_display int default 0,
  is_direttivo boolean default false,
  is_istruttore boolean default false,
  email text,
  instagram text,
  created_at timestamptz default now()
);

-- =========================================================
-- CORSI
-- =========================================================
create table courses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome text not null,
  disciplina text not null,
  descrizione_breve text,
  descrizione_lunga text,
  benefici text[],
  copertina_url text,
  galleria_urls text[],
  instructor_id uuid references team_members(id),
  livello text,
  durata_minuti int,
  prezzo_indicativo_cents int,
  cta_url text,
  attivo boolean default true,
  ordine_display int default 0,
  meta_title text,
  meta_description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =========================================================
-- CALENDARIO SETTIMANALE
-- =========================================================
create table schedule_slots (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  giorno weekday_enum not null,
  ora_inizio time not null,
  ora_fine time not null,
  sede sede_enum not null default 'bolzano',
  indirizzo text,
  istruttore_id uuid references team_members(id),
  note text,
  attivo boolean default true,
  valido_da date,
  valido_fino date,
  created_at timestamptz default now()
);

create index idx_schedule_slots_giorno on schedule_slots(giorno) where attivo = true;
create index idx_schedule_slots_sede on schedule_slots(sede) where attivo = true;

-- =========================================================
-- EVENTI + WORKSHOP (stessa tabella, tipo discriminator)
-- =========================================================
create table events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  tipo event_tipo_enum not null default 'evento',
  titolo text not null,
  sottotitolo text,
  descrizione text,
  copertina_url text,
  galleria_urls text[],
  data_inizio timestamptz not null,
  data_fine timestamptz,
  location text,
  indirizzo text,
  prezzo_cents int,
  capacity int,
  posti_venduti int default 0,
  cta_tipo text default 'stripe',          -- 'stripe' | 'external_url' | 'info_only'
  cta_url text,
  stripe_price_id text,
  attivo boolean default true,
  in_evidenza boolean default false,
  meta_title text,
  meta_description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_events_data_inizio on events(data_inizio) where attivo = true;
create index idx_events_tipo on events(tipo) where attivo = true;

-- =========================================================
-- TICKETS (eventi + workshop)
-- =========================================================
create table tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete restrict,
  buyer_email text not null,
  buyer_nome text,
  buyer_cognome text,
  buyer_telefono text,
  qr_code text unique,
  stripe_session_id text unique,
  stripe_payment_intent text,
  amount_cents int,
  status ticket_status_enum default 'pending',
  used_at timestamptz,
  created_at timestamptz default now()
);

create index idx_tickets_event on tickets(event_id);
create index idx_tickets_email on tickets(buyer_email);
create index idx_tickets_status on tickets(status);

-- =========================================================
-- SHOP — PRODOTTI
-- =========================================================
create table products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome text not null,
  categoria product_categoria_enum not null,
  sottocategoria text,                     -- "T-shirt", "Felpa", "Borraccia", "Cap"...
  descrizione_breve text,
  descrizione_lunga text,
  copertina_url text,
  immagini_urls text[],                    -- galleria prodotto
  prezzo_base_cents int not null,          -- IVA 22% inclusa
  in_vendita boolean default true,
  in_evidenza boolean default false,
  ordine_display int default 0,
  peso_grammi int,                         -- per calcolo spedizione futuro
  meta_title text,
  meta_description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_products_categoria on products(categoria) where in_vendita = true;
create index idx_products_evidenza on products(in_evidenza) where in_vendita = true;

-- Varianti (taglia + colore + stock)
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  sku text unique not null,
  taglia text,                             -- 'XS','S','M','L','XL','XXL' o null per accessori
  colore text,                             -- nome colore o null
  colore_hex text,                         -- per swatch UI
  prezzo_cents int,                        -- override prezzo_base_cents se diverso
  stock int not null default 0,
  stock_alert_threshold int default 3,
  stripe_price_id text,
  immagini_urls text[],                    -- override immagini se variante ha foto specifiche
  attivo boolean default true,
  ordine_display int default 0,
  created_at timestamptz default now()
);

create index idx_variants_product on product_variants(product_id) where attivo = true;
create index idx_variants_stock_low on product_variants(stock) where stock <= stock_alert_threshold;

-- =========================================================
-- ORDINI SHOP
-- =========================================================
create table orders (
  id uuid primary key default gen_random_uuid(),
  numero_ordine text unique not null,      -- es. "ME-2026-00001"
  buyer_email text not null,
  buyer_nome text not null,
  buyer_cognome text not null,
  buyer_telefono text,
  -- Indirizzo spedizione
  ship_address_line1 text not null,
  ship_address_line2 text,
  ship_city text not null,
  ship_postal_code text not null,
  ship_state text,                         -- provincia
  ship_country text not null default 'IT',
  -- Note ordine
  note_cliente text,
  -- Stripe
  stripe_session_id text unique,
  stripe_payment_intent text,
  -- Importi (centesimi, IVA inclusa)
  subtotal_cents int not null,
  shipping_cents int not null default 0,
  total_cents int not null,
  -- Stato
  status order_status_enum default 'pending',
  tracking_number text,
  tracking_url text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  -- Marketing
  consenso_marketing boolean default false,
  utm_source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_orders_status on orders(status);
create index idx_orders_email on orders(buyer_email);
create index idx_orders_created on orders(created_at desc);

-- Sequence per numero_ordine leggibile
create sequence order_number_seq start 1;
create or replace function generate_order_number() returns text as $$
  select 'ME-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 5, '0');
$$ language sql;

-- Righe ordine
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  variant_id uuid references product_variants(id),
  -- Snapshot al momento dell'ordine (anche se prodotto cambia)
  product_nome text not null,
  variant_descrizione text,                -- es. "Taglia M, Nero"
  sku text not null,
  quantita int not null check (quantita > 0),
  prezzo_unitario_cents int not null,
  totale_cents int not null,
  created_at timestamptz default now()
);

create index idx_order_items_order on order_items(order_id);

-- =========================================================
-- METODI DI SPEDIZIONE
-- =========================================================
create table shipping_methods (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome text not null,                      -- "Standard Italia", "Express", "Ritiro in sede"
  descrizione text,
  prezzo_cents int not null,
  soglia_gratis_cents int,                 -- es. 5000 = gratis sopra €50
  giorni_consegna_min int,
  giorni_consegna_max int,
  attivo boolean default true,
  ordine_display int default 0
);

-- =========================================================
-- PIANI TESSERAMENTO (display)
-- =========================================================
create table pricing_plans (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  titolo text not null,
  prezzo_cents int not null,
  valuta text default 'EUR',
  periodo text not null,
  descrizione text,
  features text[],
  cta_label text default 'Iscriviti',
  cta_url text,                            -- link al SaaS esterno
  in_evidenza boolean default false,
  ordine_display int default 0,
  attivo boolean default true,
  created_at timestamptz default now()
);

-- =========================================================
-- DOCUMENTI ISTITUZIONALI
-- =========================================================
create table documents (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  titolo text not null,
  descrizione text,
  tipo document_type_enum not null,
  file_path text not null,
  versione text default '1.0',
  pubblicato boolean default true,
  ordine_display int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =========================================================
-- BLOG
-- =========================================================
create table posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  titolo text not null,
  sommario text,
  contenuto_mdx text not null,
  copertina_url text,
  autore_id uuid references team_members(id),
  tags text[],
  pubblicato boolean default false,
  pubblicato_at timestamptz,
  meta_title text,
  meta_description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_posts_pubblicato on posts(pubblicato_at desc) where pubblicato = true;

-- =========================================================
-- SPONSOR
-- =========================================================
create table sponsors (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome text not null,
  logo_url text not null,
  descrizione text,
  link text,
  tier text default 'standard',
  ordine_display int default 0,
  attivo boolean default true,
  created_at timestamptz default now()
);

-- =========================================================
-- LEAD (isolata, niente sync esterno)
-- =========================================================
create table leads (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'meraki-website',
  nome text,
  cognome text,
  email text,
  telefono text not null,
  interesse text,
  messaggio text,
  consenso_privacy boolean not null default false,
  consenso_marketing boolean default false,
  status lead_status_enum default 'nuovo',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz default now()
);

create index idx_leads_created on leads(created_at desc);
create index idx_leads_status on leads(status);

-- =========================================================
-- RLS
-- =========================================================
alter table profiles enable row level security;
alter table team_members enable row level security;
alter table courses enable row level security;
alter table schedule_slots enable row level security;
alter table events enable row level security;
alter table tickets enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table shipping_methods enable row level security;
alter table pricing_plans enable row level security;
alter table documents enable row level security;
alter table posts enable row level security;
alter table sponsors enable row level security;
alter table leads enable row level security;

create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin', 'editor')
  );
$$ language sql security definer stable;

-- Public read
create policy "public read team" on team_members for select using (true);
create policy "public read courses" on courses for select using (attivo = true);
create policy "public read slots" on schedule_slots for select using (attivo = true);
create policy "public read events" on events for select using (attivo = true);
create policy "public read products" on products for select using (in_vendita = true);
create policy "public read variants" on product_variants for select using (attivo = true);
create policy "public read shipping" on shipping_methods for select using (attivo = true);
create policy "public read pricing" on pricing_plans for select using (attivo = true);
create policy "public read documents" on documents for select using (pubblicato = true);
create policy "public read posts" on posts for select using (pubblicato = true);
create policy "public read sponsors" on sponsors for select using (attivo = true);

-- Admin full access
create policy "admin all team" on team_members for all using (is_admin());
create policy "admin all courses" on courses for all using (is_admin());
create policy "admin all slots" on schedule_slots for all using (is_admin());
create policy "admin all events" on events for all using (is_admin());
create policy "admin all tickets" on tickets for all using (is_admin());
create policy "admin all products" on products for all using (is_admin());
create policy "admin all variants" on product_variants for all using (is_admin());
create policy "admin all orders" on orders for all using (is_admin());
create policy "admin all order_items" on order_items for all using (is_admin());
create policy "admin all shipping" on shipping_methods for all using (is_admin());
create policy "admin all pricing" on pricing_plans for all using (is_admin());
create policy "admin all documents" on documents for all using (is_admin());
create policy "admin all posts" on posts for all using (is_admin());
create policy "admin all sponsors" on sponsors for all using (is_admin());
create policy "admin all leads" on leads for all using (is_admin());

-- Insert pubblici controllati
create policy "public insert leads" on leads for insert with check (consenso_privacy = true);
-- Tickets e orders vengono creati dal webhook Stripe usando service role, nessuna policy public insert

-- Storage buckets
insert into storage.buckets (id, name, public) values
  ('public-assets', 'public-assets', true),
  ('product-images', 'product-images', true),
  ('documents', 'documents', true)
on conflict do nothing;
