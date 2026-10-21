-- Optional, translated introduction for the public event card.
-- Existing events retain NULL and keep their full description unchanged.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS descrizione_breve jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_short_description_object'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events ADD CONSTRAINT events_short_description_object CHECK (
      descrizione_breve IS NULL OR jsonb_typeof(descrizione_breve) = 'object'
    );
  END IF;
END;
$$;
