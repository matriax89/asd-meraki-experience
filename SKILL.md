---
name: meraki-experience-website
description: Rifacimento integrale di merakiexperience.org — sito vetrina premium per ASD con CMS leggero su Supabase, calendario lezioni informativo, gestione eventi/workshop con biglietteria Stripe, e-commerce accessori e abbigliamento, lead capture interno. Stack: Next.js 15 App Router, shadcn/ui, Tailwind, Supabase, Vercel, Resend.
version: 2.0.0
author: Matias Lisio
---

# Meraki Experience — Rifacimento sito ASD

## 1. Obiettivo del progetto

Sostituire l'attuale sito WordPress + Elementor 4.0.7 di **ASD Meraki Experience** (merakiexperience.org) con una webapp moderna su stack Next.js + Supabase. Il sito è una **vetrina informativa con quattro flussi transazionali Stripe**: eventi, workshop, accessori e abbigliamento. Iscrizioni, tesseramenti e prenotazione lezioni restano sul SaaS esterno già in uso dall'associazione. I lead generati dal sito sono persistiti in un'istanza Supabase isolata, dedicata esclusivamente a Meraki — nessun sync esterno.

### Quattro flussi Stripe (da progettare insieme, ma con tabelle distinte)

| Flusso | Tipo | Tabella | Note |
|---|---|---|---|
| Eventi | Biglietto digitale | `events` + `tickets` | QR code, check-in evento |
| Workshop | Biglietto digitale | `events` + `tickets` | Sottotipo `event.tipo = 'workshop'` |
| Accessori | Prodotto fisico | `products` + `orders` | Spedizione, varianti minime |
| Abbigliamento | Prodotto fisico | `products` + `orders` | Spedizione, varianti taglia/colore |

**Eventi e workshop** condividono la stessa tabella `events` (con campo `tipo`) perché la logica è identica: data fissa, posti limitati, biglietto digitale, no spedizione. **Accessori e abbigliamento** condividono `products` (con campo `categoria`) perché entrambi hanno spedizione, varianti, inventario.

### Dati associazione (footer e meta)

- **Ragione sociale**: ASD Meraki Experience
- **P.IVA / C.F.**: IT03224340210
- **PEC**: merakiexperience@pec.it
- **Email**: info@merakiexperience.org
- **Sedi attività**: Bolzano, Appiano (BZ)
- **Social**: instagram.com/merakiexperience_official, facebook.com/asdmerakiexperience

## 2. Stack tecnico (vincolante)

```
Framework      Next.js 15 (App Router, RSC, Server Actions)
UI             shadcn/ui (NON HeroUI — migrazione completata)
Styling        Tailwind CSS v4
DB / Auth      Supabase (Postgres + Auth + Storage + RLS)
Email          Resend (form lead, conferme ordine, conferme biglietto, notifiche admin)
Payment        Stripe Checkout (eventi, workshop, accessori, abbigliamento)
Tax            Stripe Automatic Tax (IVA 22% inclusa nei prezzi)
Hosting        Vercel
Cron           Vercel Cron (newsletter eventi, alert inventario basso)
Analytics      Vercel Analytics + Plausible
Form val.      Zod + react-hook-form
Animazioni     Framer Motion (parsimonia, niente effetti Elementor-style)
SEO            next-sitemap, JSON-LD Schema.org per SportsClub/Event/Product
Carrello       Cookie-based (HTTP-only) + Server Actions, niente Redux/Zustand
i18n           Italiano principale, EN secondario opzionale fase 2
```

### Convenzioni

- TypeScript strict mode
- Server Components di default, Client Components solo per interattività vera (carrello, filtri, form)
- Form sempre via Server Actions con validazione Zod
- Niente librerie UI extra oltre shadcn/ui e Lucide React
- Nessun uso di Elementor, WordPress, jQuery, plugin esterni

## 3. Struttura cartelle

```
meraki-experience/
├── SKILL.md
├── .env.local.example
├── next.config.ts
├── tailwind.config.ts
├── components.json
│
├── app/
│   ├── (public)/
│   │   ├── layout.tsx              # Header + Footer pubblici
│   │   ├── page.tsx                # Home
│   │   ├── chi-siamo/page.tsx
│   │   ├── corsi/
│   │   │   ├── page.tsx
│   │   │   └── [slug]/page.tsx
│   │   ├── orario/page.tsx
│   │   ├── eventi/
│   │   │   ├── page.tsx
│   │   │   └── [slug]/page.tsx
│   │   ├── workshop/
│   │   │   ├── page.tsx            # Filtra events where tipo='workshop'
│   │   │   └── [slug]/page.tsx
│   │   ├── shop/
│   │   │   ├── page.tsx            # Grid prodotti, filtri categoria/taglia
│   │   │   ├── [slug]/page.tsx     # Dettaglio prodotto + selezione varianti
│   │   │   └── categoria/
│   │   │       └── [slug]/page.tsx # /shop/categoria/abbigliamento
│   │   ├── carrello/page.tsx
│   │   ├── checkout/page.tsx       # Fallback, default → redirect Stripe
│   │   ├── ordine/
│   │   │   └── [id]/
│   │   │       ├── conferma/page.tsx
│   │   │       └── stato/page.tsx
│   │   ├── biglietto/
│   │   │   └── [id]/page.tsx       # Pagina post-acquisto evento/workshop con QR
│   │   ├── tesseramento/page.tsx   # Display piani, CTA → SaaS esterno
│   │   ├── sponsor/page.tsx
│   │   ├── documenti/page.tsx
│   │   ├── blog/
│   │   │   ├── page.tsx
│   │   │   └── [slug]/page.tsx
│   │   ├── contatti/page.tsx
│   │   ├── prova-gratuita/page.tsx
│   │   ├── privacy/page.tsx
│   │   ├── termini/page.tsx        # Termini di vendita shop + biglietti
│   │   └── cookie/page.tsx
│   │
│   ├── admin/                      # Auth-protected
│   │   ├── layout.tsx
│   │   ├── page.tsx                # Dashboard KPI: ordini, biglietti, lead, inventario
│   │   ├── login/page.tsx
│   │   ├── corsi/
│   │   ├── orario/
│   │   ├── eventi/                 # Eventi + workshop (filtrabili per tipo)
│   │   ├── prodotti/
│   │   │   ├── page.tsx
│   │   │   ├── nuovo/page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx        # Edit prodotto + varianti + immagini
│   │   │       └── inventario/page.tsx
│   │   ├── ordini/
│   │   │   ├── page.tsx            # Tabella ordini con filtri status
│   │   │   └── [id]/page.tsx       # Dettaglio + cambio status + tracking
│   │   ├── biglietti/
│   │   │   └── page.tsx            # Lista biglietti emessi + check-in
│   │   ├── blog/
│   │   ├── lead/
│   │   ├── documenti/
│   │   ├── sponsor/
│   │   └── direttivo/
│   │
│   ├── api/
│   │   ├── lead/route.ts
│   │   ├── checkout/
│   │   │   ├── ticket/route.ts     # Crea Stripe session per evento/workshop
│   │   │   └── shop/route.ts       # Crea Stripe session per ordine shop
│   │   ├── webhook/
│   │   │   └── stripe/route.ts     # Gestisce entrambi i flussi via metadata
│   │   └── cron/
│   │       ├── newsletter/route.ts
│   │       ├── inventario-basso/route.ts
│   │       └── sitemap/route.ts
│   │
│   ├── sitemap.ts
│   ├── robots.ts
│   └── manifest.ts
│
├── components/
│   ├── ui/                         # shadcn/ui primitives
│   ├── public/
│   │   ├── header.tsx              # Include badge carrello con count
│   │   ├── footer.tsx
│   │   ├── hero.tsx
│   │   ├── course-card.tsx
│   │   ├── course-grid.tsx
│   │   ├── schedule-grid.tsx
│   │   ├── event-card.tsx
│   │   ├── product-card.tsx
│   │   ├── product-grid.tsx
│   │   ├── product-gallery.tsx     # Immagini prodotto con zoom
│   │   ├── variant-selector.tsx    # Taglia/colore picker
│   │   ├── add-to-cart-button.tsx
│   │   ├── cart-drawer.tsx         # Slide-over carrello da header
│   │   ├── cart-summary.tsx
│   │   ├── pricing-card.tsx
│   │   ├── sponsor-wall.tsx
│   │   ├── team-grid.tsx
│   │   ├── document-list.tsx
│   │   ├── lead-form.tsx
│   │   ├── contact-form.tsx
│   │   └── instagram-feed.tsx
│   └── admin/
│       ├── data-table.tsx
│       ├── form-fields/
│       ├── product-form.tsx        # Form complesso prodotto + varianti
│       ├── order-status-badge.tsx
│       └── markdown-editor.tsx
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── admin.ts
│   ├── stripe/
│   │   ├── client.ts
│   │   ├── checkout-ticket.ts      # Helper biglietti
│   │   ├── checkout-shop.ts        # Helper shop con shipping
│   │   └── webhook-handler.ts
│   ├── cart/
│   │   ├── actions.ts              # Server Actions: add, remove, update, clear
│   │   ├── cookie.ts               # Lettura/scrittura cookie carrello
│   │   └── types.ts
│   ├── resend/
│   │   ├── client.ts
│   │   └── templates/
│   │       ├── lead-confirmation.tsx
│   │       ├── ticket-confirmation.tsx
│   │       ├── order-confirmation.tsx
│   │       ├── order-shipped.tsx
│   │       └── admin-notification.tsx
│   ├── validators/
│   │   ├── lead.ts
│   │   ├── course.ts
│   │   ├── event.ts
│   │   ├── product.ts
│   │   └── order.ts
│   ├── utils.ts
│   └── seo.ts
│
├── supabase/
│   ├── migrations/
│   │   └── 0001_initial_schema.sql
│   └── seed.sql
│
└── public/
    ├── logos/
    ├── og/
    └── docs/
```

## 4. Schema Supabase (migration 0001)

```sql
-- =========================================================
-- 0001_initial_schema.sql
-- =========================================================

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
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
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
  id uuid primary key default uuid_generate_v4(),
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
```

## 5. Pagine pubbliche — specifiche per pagina

### 5.1 Home (`/`)

1. **Hero**: typewriter "benessere · fitness · cambiamento". CTA: "Prova gratuita".
2. **About breve**: claim + storia "meraki".
3. **Corsi in evidenza**: 6 card.
4. **Vision + Mission**.
5. **Eventi prossimi**: max 2.
6. **Shop in evidenza**: 4 prodotti `in_evidenza = true` con CTA "Scopri lo shop".
7. **Direttivo**: 4 card.
8. **Sponsor wall**.
9. **Lead form inline**.

JSON-LD: `Schema.org/SportsClub`.

### 5.2 Chi siamo (`/chi-siamo`)

Storia ASD, valori, direttivo (4 persone), istruttori, MOG e safeguarding.

### 5.3 Corsi (`/corsi`) e dettaglio (`/corsi/[slug]`)

Grid filtrabile per disciplina e sede. Dettaglio con descrizione, benefici, istruttore, slot calendario, CTA "Prova gratuita".

### 5.4 Orario (`/orario`)

Tabella settimanale 7 colonne. Filtri disciplina e sede. Server-rendered, sola consultazione.

### 5.5 Eventi (`/eventi`) e Workshop (`/workshop`)

Due indici separati ma stessa logica: query `events` filtrata per `tipo`. Lista futuri + sezione passati collassata. Tre comportamenti CTA: `stripe` (checkout interno), `external_url` (link esterno), `info_only` (form lead).

JSON-LD: `Schema.org/Event`.

### 5.6 Shop (`/shop`)

Grid prodotti con filtri laterali: categoria (abbigliamento / accessori), taglia, prezzo, "in stock". Sort: prezzo asc/desc, novità, popolarità (manuale via `ordine_display`). Ogni `ProductCard`: copertina, nome, prezzo, range varianti se applicabile (es. "Taglie disponibili: S, M, L"), badge "Esaurito" se tutte le varianti `stock = 0`.

Sottopagine categoria: `/shop/categoria/abbigliamento` e `/shop/categoria/accessori`.

### 5.7 Dettaglio prodotto (`/shop/[slug]`)

Layout due colonne desktop:

**Sinistra**: galleria immagini con thumbnails sotto, zoom hover.

**Destra**:
- Nome prodotto, prezzo (IVA inclusa)
- Descrizione breve
- Selettore variante: dropdown taglia + swatch colore
- Stock disponibile della variante selezionata ("3 disponibili" o "Esaurito")
- Pulsante "Aggiungi al carrello" (Server Action)
- Pulsante "Acquista subito" (skip carrello, va a checkout)
- Sezione "Spedizione": tempi e costi
- Sezione "Resi": link a termini di vendita

Sotto: descrizione lunga, tabella taglie se abbigliamento, prodotti correlati.

JSON-LD: `Schema.org/Product` con `Offer` per ogni variante in stock.

### 5.8 Carrello (`/carrello`)

Lista articoli con: thumbnail, nome, variante, quantità (input +/- con limite stock), prezzo riga, rimuovi.

Sidebar riepilogo: subtotale, spedizione (calcolata dopo selezione metodo o stimata), totale, CTA "Procedi al pagamento".

Carrello vuoto → messaggio + link a `/shop`.

Carrello persistente via cookie HTTP-only `meraki_cart` (JSON serializzato `{ items: [{variantId, qty}] }`).

### 5.9 Checkout (`/checkout`)

**Default**: redirect diretto a Stripe Checkout con `shipping_address_collection` e `shipping_options`. Il record `orders` viene creato in `pending` prima del redirect, e aggiornato a `paid` dal webhook. Niente pagina checkout custom.

La pagina `/checkout` esiste solo come fallback se Stripe Checkout non è raggiungibile.

### 5.10 Conferma ordine (`/ordine/[id]/conferma`)

Pagina post-pagamento (Stripe `success_url`). Mostra: numero ordine, riepilogo articoli, totale, indirizzo spedizione, "Riceverai una mail di conferma". CTA: "Continua lo shopping" + "Stato ordine".

### 5.11 Stato ordine (`/ordine/[id]/stato`)

Accesso via link firmato in email. Mostra status timeline (pending → paid → processing → shipped → delivered) e tracking number/url se disponibile.

### 5.12 Biglietto (`/biglietto/[id]`)

Pagina post-acquisto evento/workshop. Mostra: dettagli evento, QR code grande (per check-in), info acquirente, "Riceverai una mail con il biglietto in allegato". Stampa-friendly.

### 5.13 Tesseramento (`/tesseramento`)

Tre `PricingCard` con prezzi in **EUR**. CTA → portale SaaS esterno. Disclaimer: "Le iscrizioni si gestiscono sul nostro portale dedicato."

### 5.14 Sponsor (`/sponsor`)

Pagina dedicata, ROI tracciabile per i partner.

### 5.15 Documenti (`/documenti`)

Card per ogni documento istituzionale con bottone scarica. Niente link `#` placeholder.

### 5.16 Blog (`/blog`)

Lista paginata. Solo articoli reali, niente template.

### 5.17 Contatti (`/contatti`)

Form + info ASD + maps Bolzano e Appiano.

### 5.18 Prova gratuita (`/prova-gratuita`)

Form lead esteso. Submit → tabella `leads` interna + email Resend a `info@merakiexperience.org`.

### 5.19 Termini di vendita (`/termini`)

Obbligatorio per e-commerce. Da redigere con: identità venditore (ASD), modalità pagamento, spedizione, diritto di recesso 14 giorni, foro competente, garanzia conformità. Considera revisione legale.

## 6. Admin (`/admin/*`)

Mini-dashboard interna protetta da Supabase Auth + email allowlist nella tabella `profiles`.

**Dashboard root**: KPI cards — ordini ultimi 30 giorni, fatturato shop, biglietti emessi, lead settimana, prodotti con stock basso, ordini da spedire.

**Sezioni CRUD**: corsi, orario, eventi (filtro tipo evento/workshop), prodotti con varianti, ordini con cambio status e inserimento tracking, biglietti con check-in via scanner QR, blog, lead, documenti, sponsor, direttivo.

**Vista ordini**: tabella con colonne numero, data, cliente, totale, status, azioni. Filtro per status. Click → dettaglio ordine con timeline status, dati cliente, righe ordine, indirizzo spedizione, campi `tracking_number` e `tracking_url`, pulsante "Marca come spedito" (cambia status + invia email Resend).

**Vista prodotti**: lista con stock totale (somma varianti), categoria, badge "stock basso" se almeno una variante sotto soglia. Editor prodotto con tab: dettagli, immagini, varianti (DataTable inline editabile per taglia/colore/stock/prezzo), SEO.

**Export CSV**: ordini per il commercialista (campi: numero, data, cliente, P.IVA/CF se richiesto, imponibile, IVA, totale).

## 7. Integrazione Stripe — dettagli

### Setup

- Account Stripe in modalità **Italia / EUR**
- **Stripe Tax** attivo con `inclusive` pricing (IVA 22% inclusa nei prezzi mostrati)
- **Shipping** configurato in Stripe Dashboard o passato dinamicamente nei `shipping_options` del Checkout

### Distinzione flussi via metadata

Una sola route `/api/webhook/stripe` gestisce tutto. La Stripe Session ha sempre `metadata.flow_type` con valori:

- `ticket_event` → crea record in `tickets`
- `ticket_workshop` → crea record in `tickets`
- `shop_order` → aggiorna record `orders` esistente da `pending` a `paid`

Il webhook discrimina e instrada.

### Riferimenti negli oggetti Stripe

- Ticket: `metadata = { flow_type: 'ticket_event', event_id, buyer_email }`
- Ordine: `metadata = { flow_type: 'shop_order', order_id }` (l'ordine è già creato in `pending`, viene aggiornato a `paid`)

### Email post-acquisto via Resend

- Biglietto: PDF con QR allegato + link a `/biglietto/[id]`
- Ordine: HTML email con riepilogo + link a `/ordine/[id]/stato`
- Notifica admin: email a `info@merakiexperience.org` per ogni nuovo ordine/biglietto

## 8. Variabili ambiente

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@merakiexperience.org
RESEND_ADMIN_EMAIL=info@merakiexperience.org

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Site
NEXT_PUBLIC_SITE_URL=https://merakiexperience.org
NEXT_PUBLIC_SITE_NAME="ASD Meraki Experience"

# Cron secret
CRON_SECRET=
```

## 9. SEO + meta

- `next-sitemap` con sitemap dinamica per courses, events, products, posts, documents.
- JSON-LD: `SportsClub` (root), `Course`, `Event`, `Product` con `Offer`, `Article`.
- OG image dinamica via `app/opengraph-image.tsx`.
- `robots.ts` permissivo, eccetto `/admin/*`, `/carrello`, `/checkout`, `/ordine/*`, `/biglietto/*`.
- Meta titoli sempre `<Pagina> · ASD Meraki Experience`.

## 10. Migrazione contenuti dal vecchio sito

**Da NON migrare**:
- I 3 articoli blog demo (Meet George, We turn the spotlight, 7 tests)
- I prezzi in dollari
- I tag inglesi
- I link `#` dei documenti

**Da migrare**:
- Direttivo (Matias, Martina, Dajana, Adrian) — foto reali da fornire
- Corsi reali con istruttori (Salsation Bolzano/Appiano, Bootcamp, Krunch & Kore, Total Body, Energy Blast, Crossfit, Boxercise, Spinning)
- Documenti istituzionali (MOG, Codice di Condotta, Modulo Segnalazione, Regolamento) — PDF veri
- Sponsor (Europa Center, Hotel B&B)
- Eventi/workshop attivi al go-live

**Shop**: contenuto nuovo, da popolare ex novo. Almeno 1 prodotto demo per categoria al go-live, anche se non in vendita reale, per testare il flusso.

## 11. Deploy + DNS

1. Deploy iniziale su URL Vercel `meraki-experience-xyz.vercel.app`
2. Test completo Stripe in modalità test + popolamento contenuti
3. Switch a chiavi Stripe live
4. Aggiunta dominio `merakiexperience.org` su Vercel
5. Switch DNS — TTL basso prima dello switch
6. Vecchio WordPress mantenuto offline come backup per 30 giorni

## 12. Checklist verifica pre-go-live

**Performance e SEO**
- [ ] Lighthouse mobile ≥ 90 Performance, ≥ 95 SEO/A11y/Best Practices
- [ ] Sitemap.xml e robots.txt
- [ ] JSON-LD validato su Schema Markup Validator
- [ ] OG image visibili su Facebook Debugger e Twitter Card Validator

**Contenuti**
- [ ] Direttivo con foto reali
- [ ] Almeno 5 corsi popolati
- [ ] 4 documenti istituzionali scaricabili
- [ ] Sponsor con logo SVG/PNG ad alta risoluzione

**Form e lead**
- [ ] Form lead → DB + email Resend funzionante
- [ ] Form contatto idem
- [ ] Privacy policy + cookie banner GDPR

**Shop e Stripe**
- [ ] Almeno 1 prodotto pubblicato per categoria
- [ ] Test acquisto end-to-end con Stripe test card
- [ ] Webhook Stripe registrato e firma verificata
- [ ] Email conferma ordine con dati corretti
- [ ] Email "ordine spedito" testata
- [ ] Stock decrementa correttamente al pagamento
- [ ] Stock NON decrementa se pagamento fallisce
- [ ] Termini di vendita pubblicati e linkati al checkout

**Biglietti**
- [ ] Test acquisto biglietto evento + workshop
- [ ] QR code generato e visibile in `/biglietto/[id]`
- [ ] Email con biglietto allegato
- [ ] Posti venduti incrementati correttamente
- [ ] Capacity rispettata (no overselling)

**Operatività**
- [ ] Backup automatico Supabase attivo
- [ ] Vercel Analytics + Plausible attivi
- [ ] 404 e 500 custom pages
- [ ] Test responsive (iPhone SE, Pixel, iPad)
- [ ] Email transazionali con dominio Resend verificato (SPF/DKIM)

## 13. Out of scope (esplicito)

NON è incluso:

- Tesseramento online e gestione soci (SaaS esterno)
- Pagamenti tesseramento ricorrente (SaaS esterno)
- Prenotazione lezioni (SaaS esterno)
- Area soci personale
- Registro presenze digitale
- Dashboard tesoreria avanzata
- Sistema certificati medici
- Integrazioni CRM esterni — i lead restano nel DB Meraki, isolato

I flussi transazionali del sito sono **biglietteria eventi/workshop** ed **e-commerce shop (accessori + abbigliamento)**, tutti via Stripe.

## 14. Considerazioni fiscali (ASD + e-commerce)

Per memoria, da validare con il commercialista:

- Vendita merchandising = **attività commerciale connessa**, soggetta a IVA 22%, separata fiscalmente da tesseramenti istituzionali.
- Necessario emettere **scontrino elettronico** o **fattura elettronica** per ogni ordine. Non incluso nel codice — gestito esternamente dal commercialista via export CSV ordini, oppure via integrazione futura con Fatture in Cloud / Aruba.
- Limite ricavi commerciali per regime ASD/L.398: 400.000 €/anno. Da monitorare.
- Indicare sempre P.IVA in fattura, prezzo IVA inclusa nei display, dettaglio IVA in fattura.

## 15. Prompt iniziale per Antigravity

```
Apri questo SKILL.md come progetto principale.
Inizializza il repo Next.js 15 con App Router e TypeScript.
Installa shadcn/ui (init), Tailwind v4, Supabase JS client (@supabase/ssr e @supabase/supabase-js), Resend, Stripe, Zod, react-hook-form, framer-motion, lucide-react, qrcode.
Crea la struttura cartelle come da sezione 3.
Esegui la migration 0001_initial_schema.sql su Supabase.
Genera il layout pubblico con Header (incluso badge carrello), Footer e tema base coerente con il brand Meraki (palette: scuro premium con accenti gold/oro, tipografia Playfair Display per titoli e Plus Jakarta Sans per body).

Ordine di sviluppo:
1. Home → Chi siamo → Corsi → Orario
2. Eventi → Workshop → Biglietto + checkout Stripe biglietti
3. Shop → Dettaglio prodotto → Carrello → Checkout → Conferma ordine + checkout Stripe shop + webhook unificato
4. Tesseramento → Sponsor → Documenti → Contatti → Prova gratuita → Blog → Termini di vendita
5. Admin completo (corsi, orario, eventi, prodotti, ordini, biglietti, blog, lead, documenti, sponsor, direttivo)
6. Email transazionali Resend
7. SEO, sitemap, robots, OG images
8. Checklist pre-go-live

Non procedere a una nuova fase finché la precedente non è stata visivamente verificata e funzionalmente testata.
```

## 16. Brand guidelines

- **Palette**: nero/grafite (#0A0A0A, #1A1A1A) + accenti oro (#C9A961, #D4AF37) + bianco (#FAFAFA)
- **Tipografia**: Playfair Display (titoli) + Plus Jakarta Sans (body)
- **Tono**: caldo, premium, motivazionale ma non urlato. Niente caps lock se non come decorazione.
- **Lingua**: italiano nativo. "Corsi" non "classes", "tesseramento" non "membership". "Shop" si può mantenere come termine ormai acquisito.
- **Logo**: variante chiara su sfondo scuro nell'header, variante scura nel footer/sezioni light.

---

Fine SKILL.md v2.
