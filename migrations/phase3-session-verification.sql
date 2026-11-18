-- STAGING FIRST. No application startup migration. Requires the migration role
-- to read Supabase auth.sessions. Do not grant the application role raw access.
BEGIN;
CREATE FUNCTION public.threadcore_session_is_active(p_user_id uuid, p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.sessions s
    WHERE s.id = p_session_id AND s.user_id = p_user_id
      AND (s.not_after IS NULL OR s.not_after > now())
  );
$$;
REVOKE ALL ON FUNCTION public.threadcore_session_is_active(uuid, uuid) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.threadcore_session_is_active(uuid, uuid) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.threadcore_session_is_active(uuid, uuid) FROM authenticated;
  END IF;
END $$;
-- If the application role differs from the function owner, grant EXECUTE only
-- to that reviewed server role. Do not grant this function to browser roles.
COMMIT;
