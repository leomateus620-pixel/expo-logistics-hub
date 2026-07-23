UPDATE public.google_calendar_connections
SET status = 'disconnected',
    error_code = NULL,
    last_error = NULL,
    active_oauth_attempt_id = NULL,
    access_token_ciphertext = NULL,
    refresh_token_ciphertext = NULL,
    secondary_calendar_id = NULL,
    verified_at = NULL,
    connected_at = NULL,
    backfill_total = 0,
    backfill_done = 0
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'leomateus620@gmail.com'
);

UPDATE public.google_calendar_oauth_attempts
SET status = 'cancelled', consumed_at = now()
WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'leomateus620@gmail.com')
  AND status IN ('waiting_authorization','completing','error');