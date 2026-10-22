-- Direct event videos are optional and take precedence over the YouTube link.
-- The application additionally verifies the configured project's exact origin.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS video_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_native_video_public_archive'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events ADD CONSTRAINT events_native_video_public_archive CHECK (
      video_url IS NULL OR (
        length(video_url) <= 2048
        AND video_url ~ '^https://[a-z0-9-]+[.]supabase[.]co/storage/v1/object/public/public-assets/event-videos/([A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+[.]mp4$'
      )
    );
  END IF;
END;
$$;
