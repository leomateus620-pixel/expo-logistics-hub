
CREATE TABLE IF NOT EXISTS public.internal_worker_tokens (
  name text PRIMARY KEY,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.internal_worker_tokens TO service_role;
ALTER TABLE public.internal_worker_tokens ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role bypasses RLS. Locked to authenticated/anon.

CREATE OR REPLACE FUNCTION public.invoke_google_sync_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  worker_token text;
  request_id bigint;
BEGIN
  SELECT token INTO worker_token
    FROM public.internal_worker_tokens
   WHERE name = 'google_sync_worker'
   LIMIT 1;

  IF worker_token IS NULL OR worker_token = '' THEN
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := 'https://btfaumhroqtqzxomqorx.supabase.co/functions/v1/google-sync-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Worker-Token', worker_token
    ),
    body := '{}'::jsonb
  ) INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_google_sync_worker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_google_sync_worker() TO service_role;

-- Ensure cron job stays scheduled
DO $schedule$
DECLARE existing_job bigint;
BEGIN
  SELECT jobid INTO existing_job FROM cron.job WHERE jobname = 'google-sync-worker-every-minute';
  IF existing_job IS NOT NULL THEN PERFORM cron.unschedule(existing_job); END IF;
  PERFORM cron.schedule(
    'google-sync-worker-every-minute',
    '* * * * *',
    'SELECT public.invoke_google_sync_worker();'
  );
END
$schedule$;
