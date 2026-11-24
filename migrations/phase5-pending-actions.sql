-- Staging only. Review grants for the actual application role before deployment.
BEGIN;
CREATE TABLE public.pending_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 action jsonb NOT NULL,
 preview jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CONSTRAINT pending_action_status CHECK(status IN ('pending','approved','rejected','executed','expired')),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes'
);
ALTER TABLE public.pending_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pending_actions FROM PUBLIC, anon, authenticated;
COMMIT;
