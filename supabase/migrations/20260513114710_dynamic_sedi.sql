alter table schedule_slots alter column sede type text using sede::text;
drop type if exists sede_enum cascade;
insert into site_settings (key, value) values ('locations', '["Bolzano", "Appiano", "Postal", "Altro"]'::jsonb) on conflict (key) do nothing;
