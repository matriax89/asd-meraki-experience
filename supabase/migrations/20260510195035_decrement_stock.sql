create or replace function decrement_stock(variant_id uuid, quantity_to_subtract int)
returns void as $$
begin
  update product_variants
  set stock = stock - quantity_to_subtract
  where id = variant_id;
end;
$$ language plpgsql;
