-- Optional travel information. Existing events retain NULL and their behavior.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS logistics jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_logistics_v1_object'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events ADD CONSTRAINT events_logistics_v1_object CHECK (
      logistics IS NULL OR (
        jsonb_typeof(logistics) = 'object'
        AND logistics ? 'version'
        AND logistics->'version' = '1'::jsonb
      )
    );
  END IF;
END;
$$;
