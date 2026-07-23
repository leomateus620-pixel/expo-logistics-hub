ALTER TABLE public.google_calendar_oauth_attempts
  ADD COLUMN IF NOT EXISTS callback_observation JSONB;