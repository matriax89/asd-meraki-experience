-- Restore public catalogue access. Anonymous policies must never invoke
-- private.is_admin(), because anon intentionally has no private-schema access.

alter policy "public read team" on public.team_members
  to anon
  using (true);
create policy "authenticated read team" on public.team_members
  for select to authenticated
  using (true);

alter policy "public read courses" on public.courses
  to anon
  using (attivo = true);
create policy "authenticated read courses" on public.courses
  for select to authenticated
  using (attivo = true or (select private.is_admin()));

alter policy "public read slots" on public.schedule_slots
  to anon
  using (attivo = true);
create policy "authenticated read slots" on public.schedule_slots
  for select to authenticated
  using (attivo = true or (select private.is_admin()));

alter policy "public read events" on public.events
  to anon
  using (attivo = true);
create policy "authenticated read events" on public.events
  for select to authenticated
  using (attivo = true or (select private.is_admin()));

alter policy "public read products" on public.products
  to anon
  using (in_vendita = true);
create policy "authenticated read products" on public.products
  for select to authenticated
  using (in_vendita = true or (select private.is_admin()));

alter policy "public read variants" on public.product_variants
  to anon
  using (attivo = true);
create policy "authenticated read variants" on public.product_variants
  for select to authenticated
  using (attivo = true or (select private.is_admin()));

alter policy "public read shipping" on public.shipping_methods
  to anon
  using (attivo = true);
create policy "authenticated read shipping" on public.shipping_methods
  for select to authenticated
  using (attivo = true or (select private.is_admin()));

alter policy "public read pricing" on public.pricing_plans
  to anon
  using (attivo = true);
create policy "authenticated read pricing" on public.pricing_plans
  for select to authenticated
  using (attivo = true or (select private.is_admin()));

alter policy "public read documents" on public.documents
  to anon
  using (pubblicato = true);
create policy "authenticated read documents" on public.documents
  for select to authenticated
  using (pubblicato = true or (select private.is_admin()));

alter policy "public read posts" on public.posts
  to anon
  using (pubblicato = true);
create policy "authenticated read posts" on public.posts
  for select to authenticated
  using (pubblicato = true or (select private.is_admin()));

alter policy "public read sponsors" on public.sponsors
  to anon
  using (attivo = true);
create policy "authenticated read sponsors" on public.sponsors
  for select to authenticated
  using (attivo = true or (select private.is_admin()));

alter policy "Coupons are viewable by everyone if active." on public.coupons
  to anon
  using (active = true);
create policy "authenticated read coupons" on public.coupons
  for select to authenticated
  using (active = true or (select private.is_admin()));
