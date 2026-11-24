-- One-time conversion of legacy USD catalogue minor units to INR paise.
-- Frozen 2026-11-19 at INR 93.322 / USD.
-- Source: https://www.investing.com/currencies/usd-inr-historical-data
-- Run only against the verified staging project initially.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE IF NOT EXISTS public.catalog_currency_migrations (
  id text PRIMARY KEY,
  rate numeric NOT NULL,
  product_prices jsonb NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.catalog_currency_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_currency_migrations FROM PUBLIC, anon, authenticated;
LOCK TABLE public.catalog_currency_migrations IN EXCLUSIVE MODE;
LOCK TABLE public.products IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.catalog_currency_migrations WHERE id='usd-inr-2026-11-19') THEN
    INSERT INTO public.catalog_currency_migrations(id,rate,product_prices)
      SELECT 'usd-inr-2026-11-19',93.322,
        COALESCE(jsonb_agg(jsonb_build_object('id',id,'usd_cents',price_cents,
          'inr_paise',round(price_cents::numeric * 93.322))), '[]'::jsonb)
      FROM public.products;
    UPDATE public.products SET price_cents=round(price_cents::numeric * 93.322)::integer;
  END IF;
END $$;
COMMIT;
