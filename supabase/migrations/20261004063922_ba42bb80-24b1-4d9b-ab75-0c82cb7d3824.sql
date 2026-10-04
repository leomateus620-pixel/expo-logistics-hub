-- Notificações da Agenda Restaurante e Arena (push + Google Agenda)

CREATE TABLE IF NOT EXISTS public.venue_notification_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('restaurante','arena')),
  push_enabled boolean NOT NULL DEFAULT true,
  google_enabled boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, scope)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_notification_subscriptions TO authenticated;
GRANT ALL ON public.venue_notification_subscriptions TO service_role;
ALTER TABLE public.venue_notification_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.venue_notification_user_has_access(_user_id uuid, _org_id uuid, _full boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members m
     WHERE m.user_id = _user_id AND m.org_id = _org_id AND m.is_active = true AND m.role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM public.user_capabilities c
     WHERE c.user_id = _user_id AND c.org_id = _org_id
       AND c.capability = ANY (CASE WHEN _full
         THEN ARRAY['venue_events_full_access','full_access']
         ELSE ARRAY['venue_events_access','venue_events_full_access','full_access'] END)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.venue_notification_user_has_access(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.venue_notification_user_has_access(uuid, uuid, boolean) TO authenticated, service_role;

CREATE POLICY "venue_subs_select" ON public.venue_notification_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.venue_notification_user_has_access(auth.uid(), org_id, true));
CREATE POLICY "venue_subs_insert" ON public.venue_notification_subscriptions FOR INSERT TO authenticated
  WITH CHECK (
    public.venue_notification_user_has_access(user_id, org_id, false)
    AND (user_id = auth.uid() OR public.venue_notification_user_has_access(auth.uid(), org_id, true))
  );
CREATE POLICY "venue_subs_update" ON public.venue_notification_subscriptions FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.venue_notification_user_has_access(auth.uid(), org_id, true))
  WITH CHECK (user_id = auth.uid() OR public.venue_notification_user_has_access(auth.uid(), org_id, true));
CREATE POLICY "venue_subs_delete" ON public.venue_notification_subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.venue_notification_user_has_access(auth.uid(), org_id, true));

CREATE TABLE IF NOT EXISTS public.venue_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  venue_event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('created','changed','cancelled','reminder_60')),
  event_version integer NOT NULL DEFAULT 0,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','skipped','failed','cancelled')),
  idempotency_key text NOT NULL UNIQUE,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_notif_deliveries_due_idx ON public.venue_notification_deliveries (status, scheduled_for);
GRANT SELECT ON public.venue_notification_deliveries TO authenticated;
GRANT ALL ON public.venue_notification_deliveries TO service_role;
ALTER TABLE public.venue_notification_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_deliveries_own" ON public.venue_notification_deliveries FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Google: suporte a eventos do Restaurante e Arena nas tabelas existentes
ALTER TABLE public.google_sync_outbox ADD COLUMN IF NOT EXISTS venue_event_id uuid;
ALTER TABLE public.google_calendar_event_map ADD COLUMN IF NOT EXISTS venue_event_id uuid;
ALTER TABLE public.google_calendar_event_map ALTER COLUMN event_id DROP NOT NULL;
DO $$ BEGIN
  ALTER TABLE public.google_calendar_event_map ADD CONSTRAINT gcem_one_source
    CHECK ((event_id IS NOT NULL) <> (venue_event_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.google_sync_outbox ADD CONSTRAINT gso_one_source
    CHECK ((event_id IS NOT NULL) <> (venue_event_id IS NOT NULL)) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS gcem_venue_uidx ON public.google_calendar_event_map (user_id, venue_event_id) WHERE venue_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS gso_venue_one_pending_uidx ON public.google_sync_outbox (user_id, venue_event_id, connection_generation) WHERE status = 'queued' AND venue_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_google_sync_batch(batch_size integer DEFAULT 25)
 RETURNS SETOF google_sync_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.google_sync_outbox
     SET status = 'failed', last_error = 'stale_in_flight_recovered', next_attempt_at = now(), updated_at = now()
   WHERE status = 'in_flight' AND updated_at < now() - interval '5 minutes';

  UPDATE public.google_sync_outbox outbox
     SET status = 'cancelled', last_error = 'connection_generation_superseded', updated_at = now()
    FROM public.google_calendar_connections connection
   WHERE outbox.user_id = connection.user_id
     AND outbox.org_id = connection.org_id
     AND outbox.status IN ('queued', 'failed')
     AND outbox.connection_generation IS DISTINCT FROM connection.connection_generation;

  WITH ranked_ready AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY user_id, COALESCE(event_id, venue_event_id), (venue_event_id IS NOT NULL), connection_generation
             ORDER BY updated_at DESC, created_at DESC, id DESC
           ) AS position
      FROM public.google_sync_outbox
     WHERE status IN ('queued', 'failed')
  )
  UPDATE public.google_sync_outbox older
     SET status = 'cancelled', last_error = 'superseded_by_newer_task', updated_at = now()
    FROM ranked_ready
   WHERE older.id = ranked_ready.id AND ranked_ready.position > 1;

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
$function$;

-- Escopo (restaurante/arena) de um evento, subindo pela hierarquia de espaços
CREATE OR REPLACE FUNCTION public.venue_event_scopes(_event_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE chain AS (
    SELECT s.id, s.parent_space_id, s.type, 0 AS depth
      FROM public.venue_event_spaces es JOIN public.venue_spaces s ON s.id = es.space_id
     WHERE es.event_id = _event_id
    UNION ALL
    SELECT p.id, p.parent_space_id, p.type, c.depth + 1
      FROM chain c JOIN public.venue_spaces p ON p.id = c.parent_space_id
     WHERE c.depth < 10
  )
  SELECT COALESCE(array_agg(DISTINCT type) FILTER (WHERE type IN ('restaurante','arena')), ARRAY[]::text[]) FROM chain;
$$;
REVOKE EXECUTE ON FUNCTION public.venue_event_scopes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.venue_event_scopes(uuid) TO authenticated, service_role;

-- Regra explícita de destinatários
CREATE OR REPLACE FUNCTION public.venue_notification_recipients(_event_id uuid)
RETURNS TABLE (user_id uuid, push_enabled boolean, google_enabled boolean, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev public.venue_events%ROWTYPE;
  scopes text[];
BEGIN
  SELECT * INTO ev FROM public.venue_events WHERE id = _event_id;
  IF NOT FOUND THEN RETURN; END IF;
  scopes := public.venue_event_scopes(_event_id);

  RETURN QUERY
  WITH candidates AS (
    SELECT s.user_id, bool_or(s.push_enabled) AS push_on, bool_or(s.google_enabled) AS google_on, 'subscription'::text AS why
      FROM public.venue_notification_subscriptions s
     WHERE s.org_id = ev.org_id AND s.scope = ANY (scopes)
     GROUP BY s.user_id
    UNION ALL
    SELECT r.uid, true, true, 'responsible'
      FROM (
        SELECT ev.responsible_user_id AS uid WHERE ev.responsible_user_id IS NOT NULL
        UNION SELECT vr.user_id FROM public.venue_event_responsibles vr
         WHERE vr.event_id = _event_id AND vr.user_id IS NOT NULL
      ) r
  ),
  merged AS (
    SELECT c.user_id,
           -- assinatura explícita prevalece sobre o padrão de responsável
           COALESCE(bool_or(c.push_on) FILTER (WHERE c.why = 'subscription'), bool_or(c.push_on)) AS push_on,
           COALESCE(bool_or(c.google_on) FILTER (WHERE c.why = 'subscription'), bool_or(c.google_on)) AS google_on,
           string_agg(DISTINCT c.why, ',') AS why
      FROM candidates c GROUP BY c.user_id
  )
  SELECT m.user_id, m.push_on, m.google_on, m.why
    FROM merged m
   WHERE public.venue_notification_user_has_access(m.user_id, ev.org_id, false)
     AND (
       ev.visibility IS DISTINCT FROM 'restrita'
       OR m.user_id = ev.created_by
       OR m.user_id = ev.responsible_user_id
       OR m.why LIKE '%responsible%'
       OR public.venue_notification_user_has_access(m.user_id, ev.org_id, true)
     );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.venue_notification_recipients(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.venue_notification_recipients(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.queue_google_venue_sync_for_user(_user_id uuid, _org_id uuid, _venue_event_id uuid, _operation text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  generation uuid;
  existing_task_id uuid;
BEGIN
  IF _user_id IS NULL OR _org_id IS NULL OR _venue_event_id IS NULL OR _operation NOT IN ('upsert','delete') THEN RETURN; END IF;
  SELECT connection_generation INTO generation FROM public.google_calendar_connections
   WHERE user_id = _user_id AND org_id = _org_id AND status IN ('connected','synchronizing')
     AND secondary_calendar_id IS NOT NULL
     AND (connection_key IS NOT NULL OR refresh_token_ciphertext IS NOT NULL);
  IF generation IS NULL THEN RETURN; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || '|venue|' || _venue_event_id::text, 0));
  SELECT id INTO existing_task_id FROM public.google_sync_outbox
   WHERE user_id = _user_id AND org_id = _org_id AND venue_event_id = _venue_event_id
     AND connection_generation = generation AND status IN ('queued','failed')
   ORDER BY (status = 'queued') DESC, created_at DESC LIMIT 1 FOR UPDATE;

  IF existing_task_id IS NOT NULL THEN
    UPDATE public.google_sync_outbox SET operation = _operation, status = 'queued', attempts = 0,
           next_attempt_at = now(), last_error = NULL, updated_at = now()
     WHERE id = existing_task_id;
    RETURN;
  END IF;

  INSERT INTO public.google_sync_outbox (user_id, org_id, event_id, venue_event_id, operation, dedupe_key, connection_generation)
  VALUES (_user_id, _org_id, NULL, _venue_event_id, _operation,
          _user_id::text || '|venue|' || _venue_event_id::text || '|' || _operation || '|' || generation::text || '|' || gen_random_uuid()::text,
          generation);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.queue_google_venue_sync_for_user(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_google_venue_sync_for_user(uuid, uuid, uuid, text) TO service_role;

-- Reconcilia Google (upsert para destinatários, delete para quem saiu) e lembretes
CREATE OR REPLACE FUNCTION public.venue_notification_reconcile_event(_event_id uuid, _org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev public.venue_events%ROWTYPE;
  r record;
  active boolean;
BEGIN
  SELECT * INTO ev FROM public.venue_events WHERE id = _event_id;
  active := FOUND AND ev.start_at IS NOT NULL AND ev.status NOT IN ('cancelado','recusado');

  IF active THEN
    FOR r IN SELECT * FROM public.venue_notification_recipients(_event_id) WHERE google_enabled LOOP
      PERFORM public.queue_google_venue_sync_for_user(r.user_id, ev.org_id, _event_id, 'upsert');
    END LOOP;
  END IF;

  FOR r IN
    SELECT m.user_id FROM public.google_calendar_event_map m
     WHERE m.venue_event_id = _event_id AND m.deleted_at IS NULL
       AND (NOT active OR m.user_id NOT IN (SELECT x.user_id FROM public.venue_notification_recipients(_event_id) x WHERE x.google_enabled))
  LOOP
    PERFORM public.queue_google_venue_sync_for_user(r.user_id, _org_id, _event_id, 'delete');
  END LOOP;

  -- lembretes de 1h: cancela obsoletos e agenda o atual
  UPDATE public.venue_notification_deliveries d SET status = 'cancelled', updated_at = now()
   WHERE d.venue_event_id = _event_id AND d.kind = 'reminder_60' AND d.status = 'pending'
     AND (NOT active OR d.event_version <> ev.version
          OR d.user_id NOT IN (SELECT x.user_id FROM public.venue_notification_recipients(_event_id) x WHERE x.push_enabled));

  IF active AND ev.start_at - interval '60 minutes' > now() THEN
    INSERT INTO public.venue_notification_deliveries (org_id, venue_event_id, user_id, kind, event_version, scheduled_for, idempotency_key)
    SELECT ev.org_id, _event_id, x.user_id, 'reminder_60', ev.version, ev.start_at - interval '60 minutes',
           x.user_id::text || '|' || _event_id::text || '|' || ev.version::text || '|' || to_char(ev.start_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI') || '|reminder_60'
      FROM public.venue_notification_recipients(_event_id) x WHERE x.push_enabled
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.venue_notification_reconcile_event(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.venue_notification_reconcile_event(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.venue_notification_enqueue_immediate(_event_id uuid, _kind text, _actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ev public.venue_events%ROWTYPE;
BEGIN
  SELECT * INTO ev FROM public.venue_events WHERE id = _event_id;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.venue_notification_deliveries (org_id, venue_event_id, user_id, kind, event_version, idempotency_key)
  SELECT ev.org_id, _event_id, x.user_id, _kind, ev.version,
         x.user_id::text || '|' || _event_id::text || '|' || ev.version::text || '|' || _kind
    FROM public.venue_notification_recipients(_event_id) x
   WHERE x.push_enabled AND x.user_id IS DISTINCT FROM _actor
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.venue_notification_enqueue_immediate(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.venue_notification_enqueue_immediate(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_venue_event_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid := COALESCE(auth.uid(), NEW.updated_by, NEW.created_by);
  was_cancelled boolean;
  is_cancelled boolean;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      -- espaços ainda podem não estar vinculados; o gatilho de espaços completa o aviso de criação
      PERFORM public.venue_notification_enqueue_immediate(NEW.id, 'created', actor);
    ELSE
      was_cancelled := OLD.status IN ('cancelado','recusado');
      is_cancelled := NEW.status IN ('cancelado','recusado');
      IF is_cancelled AND NOT was_cancelled THEN
        PERFORM public.venue_notification_enqueue_immediate(NEW.id, 'cancelled', actor);
      ELSIF NOT is_cancelled AND (
        OLD.start_at IS DISTINCT FROM NEW.start_at OR OLD.end_at IS DISTINCT FROM NEW.end_at
        OR OLD.title IS DISTINCT FROM NEW.title OR was_cancelled
      ) THEN
        PERFORM public.venue_notification_enqueue_immediate(NEW.id, 'changed', actor);
      END IF;
    END IF;
    PERFORM public.venue_notification_reconcile_event(NEW.id, NEW.org_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'venue_notifications_failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_venue_event_notifications_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  BEGIN
    UPDATE public.venue_notification_deliveries SET status = 'cancelled', updated_at = now()
     WHERE venue_event_id = OLD.id AND status = 'pending';
    FOR r IN SELECT user_id FROM public.google_calendar_event_map WHERE venue_event_id = OLD.id AND deleted_at IS NULL LOOP
      PERFORM public.queue_google_venue_sync_for_user(r.user_id, OLD.org_id, OLD.id, 'delete');
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'venue_notifications_delete_failed: %', SQLERRM;
  END;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_venue_event_space_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target uuid := COALESCE(NEW.event_id, OLD.event_id);
  ev_org uuid;
  ev_created timestamptz;
BEGIN
  BEGIN
    SELECT org_id, created_at INTO ev_org, ev_created FROM public.venue_events WHERE id = target;
    IF ev_org IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
    -- criação: aviso só sai quando o espaço é conhecido (idempotente por versão)
    IF TG_OP = 'INSERT' AND ev_created > now() - interval '10 minutes' THEN
      PERFORM public.venue_notification_enqueue_immediate(target, 'created', auth.uid());
    ELSIF TG_OP IN ('INSERT','DELETE','UPDATE') THEN
      PERFORM public.venue_notification_enqueue_immediate(target, 'changed', auth.uid());
    END IF;
    PERFORM public.venue_notification_reconcile_event(target, ev_org);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'venue_space_notifications_failed: %', SQLERRM;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_venue_subscription_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  target_org uuid := COALESCE(NEW.org_id, OLD.org_id);
  target_scope text := COALESCE(NEW.scope, OLD.scope);
BEGIN
  BEGIN
    FOR r IN
      SELECT e.id FROM public.venue_events e
       WHERE e.org_id = target_org AND e.start_at >= now() - interval '1 day'
         AND target_scope = ANY (public.venue_event_scopes(e.id))
       LIMIT 500
    LOOP
      PERFORM public.venue_notification_reconcile_event(r.id, target_org);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'venue_subscription_reconcile_failed: %', SQLERRM;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Ao conectar o Google, inclui os eventos futuros do Restaurante e Arena
CREATE OR REPLACE FUNCTION public.tg_google_connection_venue_backfill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NEW.status IN ('connected','synchronizing')
     AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.connection_generation IS DISTINCT FROM NEW.connection_generation)
     AND NEW.secondary_calendar_id IS NOT NULL THEN
    BEGIN
      FOR r IN
        SELECT e.id FROM public.venue_events e
         WHERE e.org_id = NEW.org_id AND e.start_at >= now() - interval '1 day'
           AND e.status NOT IN ('cancelado','recusado')
         LIMIT 500
      LOOP
        IF EXISTS (SELECT 1 FROM public.venue_notification_recipients(r.id) x WHERE x.user_id = NEW.user_id AND x.google_enabled) THEN
          PERFORM public.queue_google_venue_sync_for_user(NEW.user_id, NEW.org_id, r.id, 'upsert');
        END IF;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'venue_google_backfill_failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venue_event_notifications ON public.venue_events;
CREATE TRIGGER trg_venue_event_notifications AFTER INSERT OR UPDATE ON public.venue_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_venue_event_notifications();
DROP TRIGGER IF EXISTS trg_venue_event_notifications_delete ON public.venue_events;
CREATE TRIGGER trg_venue_event_notifications_delete AFTER DELETE ON public.venue_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_venue_event_notifications_delete();
DROP TRIGGER IF EXISTS trg_venue_event_space_notifications ON public.venue_event_spaces;
CREATE TRIGGER trg_venue_event_space_notifications AFTER INSERT OR UPDATE OF space_id OR DELETE ON public.venue_event_spaces
  FOR EACH ROW EXECUTE FUNCTION public.tg_venue_event_space_notifications();
DROP TRIGGER IF EXISTS trg_venue_subscription_notifications ON public.venue_notification_subscriptions;
CREATE TRIGGER trg_venue_subscription_notifications AFTER INSERT OR UPDATE OR DELETE ON public.venue_notification_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_venue_subscription_notifications();
DROP TRIGGER IF EXISTS trg_google_connection_venue_backfill ON public.google_calendar_connections;
CREATE TRIGGER trg_google_connection_venue_backfill AFTER UPDATE ON public.google_calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_google_connection_venue_backfill();

-- Lista de pessoas com acesso, para a tela de inscritos (só gestão completa)
CREATE OR REPLACE FUNCTION public.venue_notification_candidates(_org_id uuid)
RETURNS TABLE (user_id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT p.user_id, p.full_name
    FROM public.profiles p
   WHERE public.venue_notification_user_has_access(auth.uid(), _org_id, true)
     AND public.venue_notification_user_has_access(p.user_id, _org_id, false)
     AND EXISTS (SELECT 1 FROM public.org_members m WHERE m.user_id = p.user_id AND m.org_id = _org_id AND m.is_active = true)
   ORDER BY p.full_name;
$$;
REVOKE EXECUTE ON FUNCTION public.venue_notification_candidates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.venue_notification_candidates(uuid) TO authenticated;