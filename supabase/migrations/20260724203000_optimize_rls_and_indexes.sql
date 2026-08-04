-- Resolve Security/Performance Advisor findings without weakening RLS.

-- Profiles are private: users can read their own row; admins/editors can read
-- the allowlist through the SECURITY DEFINER helper.
create policy "profiles read self or admin"
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_admin())
  );

-- Merge public and admin SELECT access into one policy per public catalogue
-- table. This avoids multiple permissive policies while retaining access to
-- inactive records for administrators.
alter policy "public read team" on public.team_members
  to anon, authenticated using (true);
alter policy "public read courses" on public.courses
  to anon, authenticated using (attivo = true or (select private.is_admin()));
alter policy "public read slots" on public.schedule_slots
  to anon, authenticated using (attivo = true or (select private.is_admin()));
alter policy "public read events" on public.events
  to anon, authenticated using (attivo = true or (select private.is_admin()));
alter policy "public read products" on public.products
  to anon, authenticated using (in_vendita = true or (select private.is_admin()));
alter policy "public read variants" on public.product_variants
  to anon, authenticated using (attivo = true or (select private.is_admin()));
alter policy "public read shipping" on public.shipping_methods
  to anon, authenticated using (attivo = true or (select private.is_admin()));
alter policy "public read pricing" on public.pricing_plans
  to anon, authenticated using (attivo = true or (select private.is_admin()));
alter policy "public read documents" on public.documents
  to anon, authenticated using (pubblicato = true or (select private.is_admin()));
alter policy "public read posts" on public.posts
  to anon, authenticated using (pubblicato = true or (select private.is_admin()));
alter policy "public read sponsors" on public.sponsors
  to anon, authenticated using (attivo = true or (select private.is_admin()));

-- Replace broad FOR ALL policies on public catalogue tables with write-only
-- policies. SELECT is already covered by the merged policies above.
do $$
declare
  item record;
begin
  for item in
    select *
    from (values
      ('team_members', 'admin all team'),
      ('courses', 'admin all courses'),
      ('schedule_slots', 'admin all slots'),
      ('events', 'admin all events'),
      ('products', 'admin all products'),
      ('product_variants', 'admin all variants'),
      ('shipping_methods', 'admin all shipping'),
      ('pricing_plans', 'admin all pricing'),
      ('documents', 'admin all documents'),
      ('posts', 'admin all posts'),
      ('sponsors', 'admin all sponsors')
    ) as policies(table_name, policy_name)
  loop
    execute format('drop policy if exists %I on public.%I', item.policy_name, item.table_name);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select private.is_admin()))',
      'admin insert ' || item.table_name, item.table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',
      'admin update ' || item.table_name, item.table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select private.is_admin()))',
      'admin delete ' || item.table_name, item.table_name
    );
  end loop;
end
$$;

-- Private admin-only tables: scope policies to authenticated and cache the
-- helper result once per statement.
alter policy "admin all tickets" on public.tickets
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
alter policy "admin all orders" on public.orders
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
alter policy "admin all order_items" on public.order_items
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
alter policy "admin all leads" on public.leads
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
alter policy "public insert leads" on public.leads
  to anon
  with check (consenso_privacy = true);

-- Site settings: public reads are already unrestricted, so admin access only
-- needs write policies.
drop policy if exists "Allow admin write access on site_settings" on public.site_settings;
create policy "site settings admin insert" on public.site_settings
  for insert to authenticated with check ((select private.is_admin()));
create policy "site settings admin update" on public.site_settings
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy "site settings admin delete" on public.site_settings
  for delete to authenticated using ((select private.is_admin()));

-- Coupons: combine active-public and admin reads, then keep writes separate.
drop policy if exists "Admins can manage coupons" on public.coupons;
alter policy "Coupons are viewable by everyone if active." on public.coupons
  to anon, authenticated
  using (active = true or (select private.is_admin()));
create policy "coupons admin insert" on public.coupons
  for insert to authenticated with check ((select private.is_admin()));
create policy "coupons admin update" on public.coupons
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy "coupons admin delete" on public.coupons
  for delete to authenticated using ((select private.is_admin()));

-- Cover the foreign keys reported by the performance advisor.
create index if not exists idx_courses_instructor_id
  on public.courses (instructor_id);
create index if not exists idx_order_items_variant_id
  on public.order_items (variant_id);
create index if not exists idx_posts_autore_id
  on public.posts (autore_id);
create index if not exists idx_schedule_slots_course_id
  on public.schedule_slots (course_id);
create index if not exists idx_schedule_slots_istruttore_id
  on public.schedule_slots (istruttore_id);
