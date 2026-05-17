-- Add applicable_product_ids array to coupons table
-- If the array is empty, the coupon applies to all products
ALTER TABLE public.coupons
ADD COLUMN applicable_product_ids UUID[] DEFAULT '{}';
