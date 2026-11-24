-- Apply to staging before deploying the rate-limit code. No browser grants.
BEGIN;
CREATE TABLE public.mcp_rate_limits (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits > 0)
);
ALTER TABLE public.mcp_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_rate_limits FROM PUBLIC, anon, authenticated;
-- Grant SELECT/INSERT/UPDATE only to the reviewed server role if not the owner.
-- Non-owner roles also require a reviewed server-only RLS policy.
COMMIT;
