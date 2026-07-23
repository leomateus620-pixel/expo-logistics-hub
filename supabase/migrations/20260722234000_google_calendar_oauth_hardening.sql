-- Google Calendar OAuth hardening and durable synchronization.
-- Secrets remain in Edge Function secrets / Vault and are never stored here.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- ---------------------------------------------------------------------------
-- Connection lifecycle and one-time OAuth attempts
-- ---------------------------------------------------------------------------

ALTER TABLE public.google_calendar_connections
  ALTER COLUMN connected_at DROP NOT NULL,
  ALTER COLUMN connected_at DROP DEFAULT,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS connection_generation uuid;

ALTER TABLE public.google_calendar_connections
  DROP CONSTRAINT IF EXISTS google_calendar_connections_status_check;

ALTER TABLE public.google_calendar_connections
  ADD CONSTRAINT google_calendar_connections_status_check
  CHECK (status IN (
    'disconnected',
    'starting',
    'waiting_authorization',
    'completing',
    'preparing_calendar',
    'synchronizing',
    'connected',
    'reconnect_required',
    'disconnecting',
    'error'
  ));

CREATE TABLE IF NOT EXISTS public.google_calendar_oauth_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN (
    'starting',
    'waiting_authorization',
    'completing',
    'completed',
    'cancelled',
    'expired',
    'error'
  )),
  return_origin text NOT NULL,
  callback_path text NOT NULL,
  next_path text NOT NULL,
  oauth_session_id_hash text,
  provider_state_hash text,
  exchange_code_hash text,
  prior_connection_status text,
  prior_error_code text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_calendar_oauth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_calendar_oauth_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.google_calendar_oauth_attempts TO service_role;

DROP TRIGGER IF EXISTS google_calendar_oauth_attempts_set_updated_at
  ON public.google_calendar_oauth_attempts;
CREATE TRIGGER google_calendar_oauth_attempts_set_updated_at
  BEFORE UPDATE ON public.google_calendar_oauth_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS google_calendar_oauth_attempts_user_org_idx
  ON public.google_calendar_oauth_attempts(user_id, org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS google_calendar_oauth_attempts_expiry_idx
  ON public.google_calendar_oauth_attempts(expires_at)
  WHERE status IN ('starting', 'waiting_authorization', 'completing');

ALTER TABLE public.google_calendar_connections
  ADD COLUMN IF NOT EXISTS active_oauth_attempt_id uuid
  REFERENCES public.google_calendar_oauth_attempts(id) ON DELETE SET NULL;

-- Existing rows are adopted only when they already contain the two backend
-- artifacts required by the prior verified flow. Incomplete rows must reconnect.
UPDATE public.google_calendar_connections
   SET connection_generation = COALESCE(connection_generation, gen_random_uuid()),
       verified_at = COALESCE(verified_at, connected_at),
       error_code = NULL
 WHERE status = 'connected'
   AND connection_key IS NOT NULL
   AND secondary_calendar_id IS NOT NULL;

UPDATE public.google_calendar_connections
   SET status = 'reconnect_required',
       error_code = 'calendar_not_verified',
       last_error = 'calendar_not_verified'
 WHERE status = 'connected'
   AND (connection_key IS NULL OR secondary_calendar_id IS NULL);

UPDATE public.google_calendar_connections
   SET error_code = CASE
         WHEN lower(coalesce(last_error, '')) ~ '(401|unauthorized|revoked)' THEN 'authorization_revoked'
         WHEN lower(coalesce(last_error, '')) ~ '(authorization|connection_key|oauth)' THEN 'authorization_not_confirmed'
         ELSE 'sync_failed'
       END,
       last_error = CASE
         WHEN lower(coalesce(last_error, '')) ~ '(401|unauthorized|revoked)' THEN 'authorization_revoked'
         WHEN lower(coalesce(last_error, '')) ~ '(authorization|connection_key|oauth)' THEN 'authorization_not_confirmed'
         ELSE 'sync_failed'
       END
 WHERE last_error IS NOT NULL
   AND error_code IS NULL;

-- connection_key must only be reachable through service-role Edge Functions.
REVOKE ALL ON public.google_calendar_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.google_calendar_connections TO service_role;
DROP POLICY IF EXISTS "gcc_owner_select" ON public.google_calendar_connections;
DROP POLICY IF EXISTS "gcc_owner_insert" ON public.google_calendar_connections;
DROP POLICY IF EXISTS "gcc_owner_update" ON public.google_calendar_connections;
DROP POLICY IF EXISTS "gcc_owner_delete" ON public.google_calendar_connections;

-- ---------------------------------------------------------------------------
-- Preserve delete work, enforce mapping uniqueness and version outbox work
-- ---------------------------------------------------------------------------

ALTER TABLE public.google_calendar_event_map
  DROP CONSTRAINT IF EXISTS google_calendar_event_map_event_id_fkey,
  DROP CONSTRAINT IF EXISTS google_calendar_event_map_subevent_id_fkey;

ALTER TABLE public.google_sync_outbox
  DROP CONSTRAINT IF EXISTS google_sync_outbox_event_id_fkey,
  DROP CONSTRAINT IF EXISTS google_sync_outbox_subevent_id_fkey,
  ADD COLUMN IF NOT EXISTS connection_generation uuid;

ALTER TABLE public.google_sync_outbox
  DROP CONSTRAINT IF EXISTS google_sync_outbox_status_check;

UPDATE public.google_sync_outbox SET status = 'completed' WHERE status = 'done';

ALTER TABLE public.google_sync_outbox
  ADD CONSTRAINT google_sync_outbox_status_check
  CHECK (status IN (
    'queued',
    'in_flight',
    'completed',
    'failed',
    'dead_letter',
    'reconnect_required',
    'cancelled'
  ));

UPDATE public.google_sync_outbox outbox
   SET connection_generation = connection.connection_generation
  FROM public.google_calendar_connections connection
 WHERE outbox.user_id = connection.user_id
   AND outbox.org_id = connection.org_id
   AND outbox.connection_generation IS NULL;

DROP TRIGGER IF EXISTS prevent_duplicate_google_calendar_event_map_trigger
  ON public.google_calendar_event_map;
DROP FUNCTION IF EXISTS public.prevent_duplicate_google_calendar_event_map();

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, event_id
           ORDER BY last_synced_at DESC NULLS LAST, created_at DESC, id DESC
         ) AS position
    FROM public.google_calendar_event_map
   WHERE subevent_id IS NULL
)
DELETE FROM public.google_calendar_event_map target
 USING ranked
 WHERE target.id = ranked.id
   AND ranked.position > 1;

DROP INDEX IF EXISTS public.google_calendar_event_map_main_lookup_idx;
CREATE UNIQUE INDEX IF NOT EXISTS google_calendar_event_map_main_uidx
  ON public.google_calendar_event_map(user_id, event_id)
  WHERE subevent_id IS NULL;

CREATE INDEX IF NOT EXISTS google_sync_outbox_generation_idx
  ON public.google_sync_outbox(user_id, org_id, connection_generation, status, next_attempt_at);

WITH ranked_pending AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, event_id, connection_generation
           ORDER BY updated_at DESC, created_at DESC, id DESC
         ) AS position
    FROM public.google_sync_outbox
   WHERE status = 'queued'
)
UPDATE public.google_sync_outbox target
   SET status = 'cancelled',
       last_error = 'duplicate_pending_task_coalesced',
       updated_at = now()
  FROM ranked_pending
 WHERE target.id = ranked_pending.id
   AND ranked_pending.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS google_sync_outbox_one_pending_event_uidx
  ON public.google_sync_outbox(user_id, event_id, connection_generation)
  WHERE status = 'queued';

-- ---------------------------------------------------------------------------
-- Eligibility and coalesced outbox enqueueing
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.google_user_eligible_for_event(
  _user_id uuid,
  _org_id uuid,
  _event_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.org_members active_member
     WHERE active_member.user_id = _user_id
       AND active_member.org_id = _org_id
       AND active_member.is_active = true
       AND EXISTS (
         SELECT 1 FROM public.cronograma_eventos event
          WHERE event.id = _event_id AND event.org_id = _org_id
       )
       AND (
         public.has_capability(_user_id, _org_id, 'full_access')
         OR EXISTS (
           SELECT 1
             FROM public.org_members commission_member
             JOIN public.cronograma_evento_comissoes link
               ON link.org_id = commission_member.org_id
              AND link.commission_id = commission_member.commission_id
            WHERE commission_member.user_id = _user_id
              AND commission_member.org_id = _org_id
              AND commission_member.is_active = true
              AND commission_member.commission_id IS NOT NULL
              AND link.event_id = _event_id
         )
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.queue_google_sync_for_user(
  _user_id uuid,
  _org_id uuid,
  _event_id uuid,
  _operation text,
  _payload_hash text DEFAULT NULL,
  _initial_backfill boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
     AND connection_key IS NOT NULL
     AND secondary_calendar_id IS NOT NULL;

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
    user_id,
    org_id,
    event_id,
    operation,
    dedupe_key,
    payload_hash,
    is_initial_backfill,
    connection_generation
  ) VALUES (
    _user_id,
    _org_id,
    _event_id,
    _operation,
    _user_id::text || '|' || _event_id::text || '|' || _operation || '|' || generation::text || '|' || gen_random_uuid()::text,
    _payload_hash,
    _initial_backfill,
    generation
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.google_sync_affected_users(_event_id uuid)
RETURNS TABLE (user_id uuid, org_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT connection.user_id, event.org_id
    FROM public.cronograma_eventos event
    JOIN public.google_calendar_connections connection
      ON connection.org_id = event.org_id
     AND connection.status IN ('connected', 'synchronizing')
     AND connection.connection_key IS NOT NULL
     AND connection.secondary_calendar_id IS NOT NULL
   WHERE event.id = _event_id
     AND public.google_user_eligible_for_event(connection.user_id, event.org_id, event.id);
$$;

CREATE OR REPLACE FUNCTION public.enqueue_google_sync(_event_id uuid, _operation text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_hash text;
  event_org uuid;
  affected record;
BEGIN
  IF _event_id IS NULL OR _operation NOT IN ('upsert', 'delete') THEN RETURN; END IF;

  SELECT org_id,
         md5(
           coalesce(title, '') || '|' || coalesce(start_date::text, '') || '|' ||
           coalesce(end_date::text, '') || '|' || coalesce(start_time::text, '') || '|' ||
           coalesce(end_time::text, '') || '|' || coalesce(location, '') || '|' ||
           coalesce(description, '') || '|' || coalesce(status, '') || '|' ||
           coalesce(lock_version::text, '0')
         )
    INTO event_org, event_hash
    FROM public.cronograma_eventos
   WHERE id = _event_id;

  IF event_org IS NULL THEN RETURN; END IF;

  FOR affected IN SELECT * FROM public.google_sync_affected_users(_event_id) LOOP
    PERFORM public.queue_google_sync_for_user(
      affected.user_id,
      affected.org_id,
      _event_id,
      _operation,
      event_hash,
      false
    );
  END LOOP;

  UPDATE public.event_reminder_deliveries
     SET status = 'cancelled', updated_at = now()
   WHERE event_id = _event_id
     AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_google_sync_event(_event_id uuid, _org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  connection record;
  operation text;
BEGIN
  FOR connection IN
    SELECT user_id
      FROM public.google_calendar_connections
     WHERE org_id = _org_id
       AND status IN ('connected', 'synchronizing')
       AND connection_generation IS NOT NULL
  LOOP
    operation := CASE
      WHEN public.google_user_eligible_for_event(connection.user_id, _org_id, _event_id)
        THEN 'upsert'
      ELSE 'delete'
    END;
    PERFORM public.queue_google_sync_for_user(
      connection.user_id,
      _org_id,
      _event_id,
      operation,
      NULL,
      false
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_google_sync_user(_user_id uuid, _org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_row record;
  operation text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.google_calendar_connections
     WHERE user_id = _user_id
       AND org_id = _org_id
       AND status IN ('connected', 'synchronizing')
  ) THEN RETURN; END IF;

  FOR event_row IN
    SELECT event_id AS id FROM public.google_calendar_event_map
     WHERE user_id = _user_id
    UNION
    SELECT id FROM public.cronograma_eventos WHERE org_id = _org_id
  LOOP
    operation := CASE
      WHEN public.google_user_eligible_for_event(_user_id, _org_id, event_row.id)
        THEN 'upsert'
      ELSE 'delete'
    END;
    PERFORM public.queue_google_sync_for_user(
      _user_id,
      _org_id,
      event_row.id,
      operation,
      NULL,
      false
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.google_user_eligible_for_event(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queue_google_sync_for_user(uuid, uuid, uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.google_sync_affected_users(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_google_sync(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_google_sync_event(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_google_sync_user(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.google_user_eligible_for_event(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_google_sync_for_user(uuid, uuid, uuid, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.google_sync_affected_users(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_google_sync(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_google_sync_event(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_google_sync_user(uuid, uuid) TO service_role;

-- Event deletes are queued while the event, links and mappings still exist.
DROP TRIGGER IF EXISTS trg_evento_google_sync ON public.cronograma_eventos;
DROP TRIGGER IF EXISTS trg_evento_google_sync_delete ON public.cronograma_eventos;
DROP TRIGGER IF EXISTS trg_evento_google_sync_write ON public.cronograma_eventos;
CREATE OR REPLACE FUNCTION public.tg_evento_google_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    FOR target IN
      SELECT DISTINCT connection.user_id
        FROM public.google_calendar_connections connection
       WHERE connection.org_id = OLD.org_id
         AND connection.status IN ('connected', 'synchronizing')
         AND (
           EXISTS (
             SELECT 1 FROM public.google_calendar_event_map mapping
              WHERE mapping.user_id = connection.user_id
                AND mapping.event_id = OLD.id
                AND mapping.deleted_at IS NULL
           )
           OR public.google_user_eligible_for_event(connection.user_id, OLD.org_id, OLD.id)
         )
    LOOP
      PERFORM public.queue_google_sync_for_user(
        target.user_id,
        OLD.org_id,
        OLD.id,
        'delete',
        NULL,
        false
      );
    END LOOP;
    RETURN OLD;
  END IF;

  PERFORM public.enqueue_google_sync(NEW.id, 'upsert');
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_evento_google_sync_delete
  BEFORE DELETE ON public.cronograma_eventos
  FOR EACH ROW EXECUTE FUNCTION public.tg_evento_google_sync();
CREATE TRIGGER trg_evento_google_sync_write
  AFTER INSERT OR UPDATE ON public.cronograma_eventos
  FOR EACH ROW EXECUTE FUNCTION public.tg_evento_google_sync();

DROP TRIGGER IF EXISTS trg_comissao_evento_google_sync ON public.cronograma_evento_comissoes;
CREATE OR REPLACE FUNCTION public.tg_comissao_evento_google_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.reconcile_google_sync_event(OLD.event_id, OLD.org_id);
    RETURN OLD;
  END IF;
  PERFORM public.reconcile_google_sync_event(NEW.event_id, NEW.org_id);
  IF TG_OP = 'UPDATE' AND OLD.event_id IS DISTINCT FROM NEW.event_id THEN
    PERFORM public.reconcile_google_sync_event(OLD.event_id, OLD.org_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_comissao_evento_google_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.cronograma_evento_comissoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_comissao_evento_google_sync();

DROP TRIGGER IF EXISTS trg_org_member_google_sync ON public.org_members;
CREATE OR REPLACE FUNCTION public.tg_org_member_google_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.reconcile_google_sync_user(OLD.user_id, OLD.org_id);
    RETURN OLD;
  END IF;
  PERFORM public.reconcile_google_sync_user(NEW.user_id, NEW.org_id);
  IF TG_OP = 'UPDATE' AND ROW(OLD.user_id, OLD.org_id) IS DISTINCT FROM ROW(NEW.user_id, NEW.org_id) THEN
    PERFORM public.reconcile_google_sync_user(OLD.user_id, OLD.org_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_org_member_google_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.tg_org_member_google_sync();

-- ---------------------------------------------------------------------------
-- Atomic worker claim, completion and durable scheduling
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_google_sync_batch(batch_size integer DEFAULT 25)
RETURNS SETOF public.google_sync_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.google_sync_outbox
     SET status = 'failed',
         last_error = 'stale_in_flight_recovered',
         next_attempt_at = now(),
         updated_at = now()
   WHERE status = 'in_flight'
     AND updated_at < now() - interval '5 minutes';

  UPDATE public.google_sync_outbox outbox
     SET status = 'cancelled',
         last_error = 'connection_generation_superseded',
         updated_at = now()
    FROM public.google_calendar_connections connection
   WHERE outbox.user_id = connection.user_id
     AND outbox.org_id = connection.org_id
     AND outbox.status IN ('queued', 'failed')
     AND outbox.connection_generation IS DISTINCT FROM connection.connection_generation;

  WITH ranked_ready AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY user_id, event_id, connection_generation
             ORDER BY updated_at DESC, created_at DESC, id DESC
           ) AS position
      FROM public.google_sync_outbox
     WHERE status IN ('queued', 'failed')
  )
  UPDATE public.google_sync_outbox older
     SET status = 'cancelled',
         last_error = 'superseded_by_newer_task',
         updated_at = now()
    FROM ranked_ready
   WHERE older.id = ranked_ready.id
     AND ranked_ready.position > 1;

  RETURN QUERY
  WITH candidates AS (
    SELECT outbox.id
      FROM public.google_sync_outbox outbox
      JOIN public.google_calendar_connections connection
        ON connection.user_id = outbox.user_id
       AND connection.org_id = outbox.org_id
       AND connection.connection_generation = outbox.connection_generation
       AND connection.status IN ('connected', 'synchronizing')
     WHERE outbox.status IN ('queued', 'failed')
       AND outbox.next_attempt_at <= now()
     ORDER BY outbox.next_attempt_at, outbox.created_at
     FOR UPDATE OF outbox SKIP LOCKED
     LIMIT GREATEST(1, LEAST(batch_size, 100))
  )
  UPDATE public.google_sync_outbox claimed
     SET status = 'in_flight', updated_at = now()
    FROM candidates
   WHERE claimed.id = candidates.id
  RETURNING claimed.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_google_sync_task(
  target_task_id uuid,
  target_user_id uuid,
  target_is_initial_backfill boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  completed_rows integer;
  task_generation uuid;
BEGIN
  UPDATE public.google_sync_outbox task
     SET status = 'completed',
         last_error = NULL,
         updated_at = now()
   WHERE task.id = target_task_id
     AND task.user_id = target_user_id
     AND task.status = 'in_flight'
     AND EXISTS (
       SELECT 1 FROM public.google_calendar_connections connection
        WHERE connection.user_id = task.user_id
          AND connection.org_id = task.org_id
          AND connection.connection_generation = task.connection_generation
          AND connection.status IN ('connected', 'synchronizing')
     )
  RETURNING task.connection_generation INTO task_generation;

  GET DIAGNOSTICS completed_rows = ROW_COUNT;
  IF completed_rows = 0 THEN RETURN false; END IF;

  UPDATE public.google_calendar_connections
     SET backfill_done = CASE
           WHEN target_is_initial_backfill THEN LEAST(backfill_total, backfill_done + 1)
           ELSE backfill_done
         END,
         last_sync_at = now(),
         error_code = NULL,
         last_error = NULL,
         updated_at = now()
   WHERE user_id = target_user_id
     AND connection_generation = task_generation
     AND status IN ('connected', 'synchronizing');

  UPDATE public.google_calendar_connections connection
     SET status = 'connected', updated_at = now()
   WHERE connection.user_id = target_user_id
     AND connection.connection_generation = task_generation
     AND connection.status = 'synchronizing'
     AND connection.backfill_done >= connection.backfill_total
     AND NOT EXISTS (
       SELECT 1 FROM public.google_sync_outbox pending
        WHERE pending.user_id = connection.user_id
          AND pending.org_id = connection.org_id
          AND pending.connection_generation = connection.connection_generation
          AND pending.is_initial_backfill = true
          AND pending.status IN ('queued', 'failed', 'in_flight')
     );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_google_sync_batch(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_google_sync_task(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_google_sync_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_google_sync_task(uuid, uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_google_sync_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  worker_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret
    INTO worker_secret
    FROM vault.decrypted_secrets
   WHERE name = 'google_sync_worker_service_role_key'
   LIMIT 1;

  IF worker_secret IS NULL OR worker_secret = '' THEN RETURN NULL; END IF;

  SELECT net.http_post(
    url := 'https://btfaumhroqtqzxomqorx.supabase.co/functions/v1/google-sync-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_secret
    ),
    body := '{}'::jsonb
  ) INTO request_id;
  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_google_sync_worker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_google_sync_worker() TO service_role;

DO $schedule$
DECLARE
  existing_job bigint;
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

-- Deployment prerequisite (execute out-of-band with the real value):
-- SELECT vault.create_secret('<service-role-key>', 'google_sync_worker_service_role_key');
