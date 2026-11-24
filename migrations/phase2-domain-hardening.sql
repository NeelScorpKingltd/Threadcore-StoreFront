-- Apply to isolated staging first; never auto-run from application startup.
-- NOT VALID checks protect new writes without rewriting legacy records.
BEGIN;
CREATE TABLE public.mutation_receipts (
  user_id text NOT NULL,
  operation text NOT NULL,
  request_id uuid NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, operation, request_id)
);
ALTER TABLE public.mutation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mutation_receipts FROM PUBLIC;
-- Supabase roles do not exist on a fresh local PostgreSQL instance.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.mutation_receipts FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.mutation_receipts FROM authenticated;
  END IF;
END $$;

ALTER TABLE public.cart_items ADD CONSTRAINT cart_quantity_bounds CHECK (quantity BETWEEN 1 AND 99) NOT VALID;
ALTER TABLE public.products ADD CONSTRAINT product_nonnegative CHECK (inventory_count >= 0 AND price_cents >= 0) NOT VALID;
ALTER TABLE public.order_items ADD CONSTRAINT order_item_positive CHECK (quantity > 0 AND unit_price_cents >= 0) NOT VALID;
ALTER TABLE public.orders ADD CONSTRAINT order_total_nonnegative CHECK (total_amount_cents >= 0) NOT VALID;

-- This intentionally fails/rolls back if existing data has duplicate defaults.
-- Audit and resolve with the owner; do not silently rewrite customer addresses.
CREATE UNIQUE INDEX unique_default_address ON public.addresses(user_id) WHERE is_default;
CREATE INDEX orders_customer_page ON public.orders(user_id, created_at DESC, id DESC);
CREATE INDEX order_items_order_lookup ON public.order_items(order_id);
COMMIT;
