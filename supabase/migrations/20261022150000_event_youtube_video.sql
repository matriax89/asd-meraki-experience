-- Optional event video. Store a canonical single-video URL, never iframe HTML.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS youtube_url text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS video_titolo jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_youtube_url_canonical'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events ADD CONSTRAINT events_youtube_url_canonical CHECK (
      youtube_url IS NULL OR youtube_url ~ '^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}$'
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_video_title_object'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events ADD CONSTRAINT events_video_title_object CHECK (
      video_titolo IS NULL OR jsonb_typeof(video_titolo) = 'object'
    );
  END IF;
END;
$$;
