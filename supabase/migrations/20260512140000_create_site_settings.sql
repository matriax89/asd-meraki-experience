-- Create site_settings table
CREATE TABLE IF NOT EXISTS public.site_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on site_settings"
    ON public.site_settings
    FOR SELECT
    USING (true);

-- Allow admin write access (only users with role 'admin' in profiles)
CREATE POLICY "Allow admin write access on site_settings"
    ON public.site_settings
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Insert initial homepage_content
INSERT INTO public.site_settings (key, value) VALUES (
    'homepage_content',
    '{
        "hero_headline": "ENTRA NEL FITNESS",
        "hero_subheadline": "IL FITNESS DOVREBBE ESSERE PASSIONE. Un team professionale per un''esperienza completa. Passione e fitness in un''unica realtà, pronti ad accoglierti e a farti sentire al sicuro.",
        "mission_desc": "Istruttori che non solo insegnano, ma educano. Corsi adatti a tutti, dove l''attenzione alla sicurezza e alla disciplina incontrano la passione e l''allegria.",
        "vision_desc": "Far crescere le discipline e i propri atleti, insegnando lo spirito sportivo e i valori del rispetto e dedizione.",
        "banner1_text": "PASSION IS EVERYTHING . #DANCE NEVER FELT SO GOOD",
        "banner2_text": "FITNESS IS DREAM FOR EVERYONE . #FITNESS"
    }'::jsonb
) ON CONFLICT (key) DO NOTHING;
