-- Create coupons table
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
    discount_value NUMERIC(10, 2) NOT NULL,
    min_order_cents INTEGER DEFAULT 0,
    max_uses INTEGER DEFAULT NULL,
    uses_count INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Politiche: I coupon attivi sono leggibili da tutti (per la validazione a carrello)
CREATE POLICY "Coupons are viewable by everyone if active."
    ON public.coupons FOR SELECT
    USING (active = true);

-- Gli admin possono fare tutto
CREATE POLICY "Admins can manage coupons"
    ON public.coupons FOR ALL
    USING (is_admin());

-- Aggiungo un trigger per updated_at
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);
