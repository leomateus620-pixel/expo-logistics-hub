-- Refinamento aditivo do fluxo Google Agenda e do contador de backfill.
-- Rotas, tabelas públicas e contratos existentes permanecem preservados.

ALTER TABLE public.google_calendar_connections
  DROP CONSTRAINT IF EXISTS google_calendar_connections_status_check;

ALTER TABLE public.google_calendar_connections
  ADD CONSTRAINT google_calendar_connections_status_check
  CHECK (status IN (
    'connected',
    'reconnect_required',
    'disconnected',
    'error',
    'connecting',
    'completing'
  ));

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
BEGIN
  UPDATE public.google_sync_outbox
     SET status = 'done',
         last_error = NULL,
         updated_at = now()
   WHERE id = target_task_id
     AND user_id = target_user_id
     AND status = 'in_flight';

  GET DIAGNOSTICS completed_rows = ROW_COUNT;
  IF completed_rows = 0 THEN
    RETURN false;
  END IF;

  UPDATE public.google_calendar_connections
     SET backfill_done = CASE
           WHEN target_is_initial_backfill
             THEN LEAST(backfill_total, backfill_done + 1)
           ELSE backfill_done
         END,
         last_sync_at = now(),
         last_error = NULL,
         updated_at = now()
   WHERE user_id = target_user_id
     AND status = 'connected';

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_google_sync_task(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_google_sync_task(uuid, uuid, boolean) TO service_role;

-- O UNIQUE original permite múltiplos NULL em subevent_id. O trigger usa um
-- advisory lock transacional e transforma uma reinserção do mapa principal em
-- atualização, evitando duplicidade durante retry sem remover mapas existentes.
CREATE OR REPLACE FUNCTION public.prevent_duplicate_google_calendar_event_map()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id uuid;
BEGIN
  IF NEW.subevent_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.user_id::text || '|' || NEW.event_id::text || '|main', 0)
  );

  SELECT id
    INTO existing_id
    FROM public.google_calendar_event_map
   WHERE user_id = NEW.user_id
     AND event_id = NEW.event_id
     AND subevent_id IS NULL
   ORDER BY last_synced_at DESC NULLS LAST, created_at DESC
   LIMIT 1;

  IF existing_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.google_calendar_event_map
     SET google_event_id = NEW.google_event_id,
         google_calendar_id = NEW.google_calendar_id,
         content_hash = NEW.content_hash,
         last_synced_at = NEW.last_synced_at,
         deleted_at = NEW.deleted_at,
         updated_at = now()
   WHERE id = existing_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_google_calendar_event_map_trigger
  ON public.google_calendar_event_map;

CREATE TRIGGER prevent_duplicate_google_calendar_event_map_trigger
  BEFORE INSERT ON public.google_calendar_event_map
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_google_calendar_event_map();

CREATE INDEX IF NOT EXISTS google_calendar_event_map_main_lookup_idx
  ON public.google_calendar_event_map(user_id, event_id, last_synced_at DESC)
  WHERE subevent_id IS NULL;
