-- Increment ticket count for events
CREATE OR REPLACE FUNCTION increment_ticket_count(row_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE events
  SET posti_venduti = posti_venduti + 1
  WHERE id = row_id;
END;
$$;

-- Decrement stock for product variants
CREATE OR REPLACE FUNCTION decrement_stock(variant_id uuid, quantity_to_subtract int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE product_variants
  SET stock = stock - quantity_to_subtract
  WHERE id = variant_id;
END;
$$;
