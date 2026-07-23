
CREATE OR REPLACE FUNCTION public.queue_google_sync_for_user(_user_id uuid, _org_id uuid, _event_id uuid, _operation text, _payload_hash text DEFAULT NULL::text, _initial_backfill boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  generation uuid;
  existing_task_id uuid;
BEGIN
  IF _user_id IS NULL OR _org_id IS NULL OR _event_id IS NULL
     OR _operation NOT IN ('upsert', 'delete') THEN
    RETURN;
  END IF;

  SELECT connection_generation
    INTO generation
    FROM public.google_calendar_connections
   WHERE user_id = _user_id
     AND org_id = _org_id
     AND status IN ('connected', 'synchronizing')
     AND secondary_calendar_id IS NOT NULL
     AND (connection_key IS NOT NULL OR refresh_token_ciphertext IS NOT NULL);

  IF generation IS NULL THEN RETURN; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || '|' || _event_id::text, 0));

  SELECT id
    INTO existing_task_id
    FROM public.google_sync_outbox
   WHERE user_id = _user_id
     AND org_id = _org_id
     AND event_id = _event_id
     AND connection_generation = generation
     AND status IN ('queued', 'failed')
   ORDER BY (status = 'queued') DESC, created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF existing_task_id IS NOT NULL THEN
    UPDATE public.google_sync_outbox
       SET operation = _operation,
           payload_hash = _payload_hash,
           status = 'queued',
           attempts = 0,
           next_attempt_at = now(),
           last_error = NULL,
           is_initial_backfill = is_initial_backfill OR _initial_backfill,
           updated_at = now()
     WHERE id = existing_task_id;
    RETURN;
  END IF;

  INSERT INTO public.google_sync_outbox (
    user_id, org_id, event_id, operation, dedupe_key, payload_hash,
    is_initial_backfill, connection_generation
  ) VALUES (
    _user_id, _org_id, _event_id, _operation,
    _user_id::text || '|' || _event_id::text || '|' || _operation || '|' || generation::text || '|' || gen_random_uuid()::text,
    _payload_hash, _initial_backfill, generation
  );
END;
$function$;
