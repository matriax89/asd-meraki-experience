-- Modify column to be text instead of sede_enum so that dynamic locations work
ALTER TABLE schedule_slots ALTER COLUMN sede TYPE text;

-- We can drop the enum type if we want, but since it might be used elsewhere (though currently it isn't), 
-- let's just leave the type in the DB but use text in this column.
-- We must drop the default value first
ALTER TABLE schedule_slots ALTER COLUMN sede DROP DEFAULT;
ALTER TABLE schedule_slots ALTER COLUMN sede TYPE text USING sede::text;
ALTER TABLE schedule_slots ALTER COLUMN sede SET DEFAULT 'bolzano';
