
-- Add columns for direct Google OAuth 2.0 (encrypted tokens + metadata)
ALTER TABLE public.google_calendar_connections
  ADD COLUMN IF NOT EXISTS oauth_provider text NOT NULL DEFAULT 'lovable_connector',
  ADD COLUMN IF NOT EXISTS access_token_ciphertext bytea,
  ADD COLUMN IF NOT EXISTS access_token_iv bytea,
  ADD COLUMN IF NOT EXISTS access_token_tag bytea,
  ADD COLUMN IF NOT EXISTS refresh_token_ciphertext bytea,
  ADD COLUMN IF NOT EXISTS refresh_token_iv bytea,
  ADD COLUMN IF NOT EXISTS refresh_token_tag bytea,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_subject text;

-- Track state -> attempt mapping (state random is stored only as SHA-256 in provider_state_hash)
-- ensure the index exists for fast callback lookup by state
CREATE INDEX IF NOT EXISTS google_calendar_oauth_attempts_state_hash_idx
  ON public.google_calendar_oauth_attempts (provider_state_hash)
  WHERE status = 'waiting_authorization';

-- Restrict access to sensitive connection table (tokens): only service_role reads/writes.
REVOKE ALL ON public.google_calendar_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.google_calendar_connections TO service_role;

-- Sensitive attempts table is also service-role only.
REVOKE ALL ON public.google_calendar_oauth_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.google_calendar_oauth_attempts TO service_role;

-- Public safe view exposes only non-sensitive fields to the authenticated role.
CREATE OR REPLACE VIEW public.google_calendar_connections_public
  WITH (security_invoker = on) AS
SELECT
  user_id,
  org_id,
  google_email,
  secondary_calendar_id,
  status,
  last_sync_at,
  error_code,
  backfill_total,
  backfill_done,
  connected_at,
  verified_at,
  connection_generation,
  oauth_provider
FROM public.google_calendar_connections
WHERE user_id = auth.uid();

GRANT SELECT ON public.google_calendar_connections_public TO authenticated;

-- Invalidate old Lovable Connector connections so users must reconnect via the direct flow.
UPDATE public.google_calendar_connections
   SET status = 'reconnect_required',
       error_code = 'migrated_to_direct_oauth',
       last_error = 'migrated_to_direct_oauth',
       connection_key = NULL,
       active_oauth_attempt_id = NULL
 WHERE oauth_provider IS DISTINCT FROM 'google_direct'
   AND status NOT IN ('disconnected', 'reconnect_required');
