-- ==========================
-- COURSES
-- ==========================
ALTER TABLE courses RENAME COLUMN nome TO nome_old;
ALTER TABLE courses ADD COLUMN nome JSONB;
UPDATE courses SET nome = jsonb_build_object('it', nome_old);
ALTER TABLE courses DROP COLUMN nome_old;
ALTER TABLE courses ALTER COLUMN nome SET NOT NULL;

ALTER TABLE courses RENAME COLUMN descrizione_breve TO descrizione_breve_old;
ALTER TABLE courses ADD COLUMN descrizione_breve JSONB;
UPDATE courses SET descrizione_breve = jsonb_build_object('it', descrizione_breve_old);
ALTER TABLE courses DROP COLUMN descrizione_breve_old;

ALTER TABLE courses RENAME COLUMN descrizione_lunga TO descrizione_lunga_old;
ALTER TABLE courses ADD COLUMN descrizione_lunga JSONB;
UPDATE courses SET descrizione_lunga = jsonb_build_object('it', descrizione_lunga_old);
ALTER TABLE courses DROP COLUMN descrizione_lunga_old;

ALTER TABLE courses RENAME COLUMN meta_title TO meta_title_old;
ALTER TABLE courses ADD COLUMN meta_title JSONB;
UPDATE courses SET meta_title = jsonb_build_object('it', meta_title_old);
ALTER TABLE courses DROP COLUMN meta_title_old;

ALTER TABLE courses RENAME COLUMN meta_description TO meta_description_old;
ALTER TABLE courses ADD COLUMN meta_description JSONB;
UPDATE courses SET meta_description = jsonb_build_object('it', meta_description_old);
ALTER TABLE courses DROP COLUMN meta_description_old;

ALTER TABLE courses RENAME COLUMN benefici TO benefici_old;
ALTER TABLE courses ADD COLUMN benefici JSONB;
UPDATE courses SET benefici = jsonb_build_object('it', to_jsonb(benefici_old));
ALTER TABLE courses DROP COLUMN benefici_old;

ALTER TABLE courses RENAME COLUMN attrezzatura_richiesta TO attrezzatura_richiesta_old;
ALTER TABLE courses ADD COLUMN attrezzatura_richiesta JSONB;
UPDATE courses SET attrezzatura_richiesta = jsonb_build_object('it', attrezzatura_richiesta_old);
ALTER TABLE courses DROP COLUMN attrezzatura_richiesta_old;

-- ==========================
-- PRODUCTS
-- ==========================
ALTER TABLE products RENAME COLUMN nome TO nome_old;
ALTER TABLE products ADD COLUMN nome JSONB;
UPDATE products SET nome = jsonb_build_object('it', nome_old);
ALTER TABLE products DROP COLUMN nome_old;
ALTER TABLE products ALTER COLUMN nome SET NOT NULL;

ALTER TABLE products RENAME COLUMN descrizione_breve TO descrizione_breve_old;
ALTER TABLE products ADD COLUMN descrizione_breve JSONB;
UPDATE products SET descrizione_breve = jsonb_build_object('it', descrizione_breve_old);
ALTER TABLE products DROP COLUMN descrizione_breve_old;

ALTER TABLE products RENAME COLUMN descrizione_lunga TO descrizione_lunga_old;
ALTER TABLE products ADD COLUMN descrizione_lunga JSONB;
UPDATE products SET descrizione_lunga = jsonb_build_object('it', descrizione_lunga_old);
ALTER TABLE products DROP COLUMN descrizione_lunga_old;

ALTER TABLE products RENAME COLUMN meta_title TO meta_title_old;
ALTER TABLE products ADD COLUMN meta_title JSONB;
UPDATE products SET meta_title = jsonb_build_object('it', meta_title_old);
ALTER TABLE products DROP COLUMN meta_title_old;

ALTER TABLE products RENAME COLUMN meta_description TO meta_description_old;
ALTER TABLE products ADD COLUMN meta_description JSONB;
UPDATE products SET meta_description = jsonb_build_object('it', meta_description_old);
ALTER TABLE products DROP COLUMN meta_description_old;

-- ==========================
-- EVENTS
-- ==========================
ALTER TABLE events RENAME COLUMN titolo TO titolo_old;
ALTER TABLE events ADD COLUMN titolo JSONB;
UPDATE events SET titolo = jsonb_build_object('it', titolo_old);
ALTER TABLE events DROP COLUMN titolo_old;
ALTER TABLE events ALTER COLUMN titolo SET NOT NULL;

ALTER TABLE events RENAME COLUMN sottotitolo TO sottotitolo_old;
ALTER TABLE events ADD COLUMN sottotitolo JSONB;
UPDATE events SET sottotitolo = jsonb_build_object('it', sottotitolo_old);
ALTER TABLE events DROP COLUMN sottotitolo_old;

ALTER TABLE events RENAME COLUMN descrizione TO descrizione_old;
ALTER TABLE events ADD COLUMN descrizione JSONB;
UPDATE events SET descrizione = jsonb_build_object('it', descrizione_old);
ALTER TABLE events DROP COLUMN descrizione_old;

ALTER TABLE events RENAME COLUMN meta_title TO meta_title_old;
ALTER TABLE events ADD COLUMN meta_title JSONB;
UPDATE events SET meta_title = jsonb_build_object('it', meta_title_old);
ALTER TABLE events DROP COLUMN meta_title_old;

ALTER TABLE events RENAME COLUMN meta_description TO meta_description_old;
ALTER TABLE events ADD COLUMN meta_description JSONB;
UPDATE events SET meta_description = jsonb_build_object('it', meta_description_old);
ALTER TABLE events DROP COLUMN meta_description_old;

-- ==========================
-- PRICING_PLANS
-- ==========================
ALTER TABLE pricing_plans RENAME COLUMN titolo TO titolo_old;
ALTER TABLE pricing_plans ADD COLUMN titolo JSONB;
UPDATE pricing_plans SET titolo = jsonb_build_object('it', titolo_old);
ALTER TABLE pricing_plans DROP COLUMN titolo_old;
ALTER TABLE pricing_plans ALTER COLUMN titolo SET NOT NULL;

ALTER TABLE pricing_plans RENAME COLUMN descrizione TO descrizione_old;
ALTER TABLE pricing_plans ADD COLUMN descrizione JSONB;
UPDATE pricing_plans SET descrizione = jsonb_build_object('it', descrizione_old);
ALTER TABLE pricing_plans DROP COLUMN descrizione_old;

ALTER TABLE pricing_plans RENAME COLUMN cta_label TO cta_label_old;
ALTER TABLE pricing_plans ADD COLUMN cta_label JSONB;
UPDATE pricing_plans SET cta_label = jsonb_build_object('it', cta_label_old);
ALTER TABLE pricing_plans DROP COLUMN cta_label_old;
