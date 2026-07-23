CREATE INDEX IF NOT EXISTS google_calendar_oauth_attempts_state_lookup
  ON public.google_calendar_oauth_attempts (user_id, provider_state_hash)
  WHERE status = 'waiting_authorization';