CREATE OR REPLACE FUNCTION public.invoke_agenda_meeting_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  worker_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO worker_secret
    FROM vault.decrypted_secrets
   WHERE name='agenda_meeting_worker_token'
   LIMIT 1;
  IF NULLIF(worker_secret,'') IS NULL THEN RETURN NULL; END IF;
  SELECT net.http_post(
    url := 'https://btfaumhroqtqzxomqorx.supabase.co/functions/v1/agenda-meeting-worker',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Worker-Token', worker_secret
    ),
    body := '{}'::jsonb
  ) INTO request_id;
  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_agenda_meeting_worker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_agenda_meeting_worker() TO service_role;

SELECT vault.create_secret(
  'dfbac8a3e7618c54807766f45721e9e52958ad082cf7c75e906915eee1ec51e7',
  'agenda_meeting_worker_token',
  'Token interno usado pelo agendador para acionar o processador de reunioes'
)
WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='agenda_meeting_worker_token');
