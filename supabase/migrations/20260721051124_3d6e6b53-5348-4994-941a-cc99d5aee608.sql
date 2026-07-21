
-- =========================================================================
-- 1. TABELAS
-- =========================================================================

-- Conexões Google Calendar (1 por usuário)
CREATE TABLE public.google_calendar_connections (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  google_email TEXT,
  secondary_calendar_id TEXT,
  scopes_granted TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected','reconnect_required','disconnected','error','connecting')),
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  backfill_total INT NOT NULL DEFAULT 0,
  backfill_done INT NOT NULL DEFAULT 0,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_calendar_connections TO authenticated;
GRANT ALL ON public.google_calendar_connections TO service_role;

ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gcc_owner_select" ON public.google_calendar_connections
  FOR SELECT TO authenticated USING (user_id = auth.uid()
    OR public.get_user_org_role(auth.uid(), org_id) = 'admin');
CREATE POLICY "gcc_owner_insert" ON public.google_calendar_connections
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "gcc_owner_update" ON public.google_calendar_connections
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "gcc_owner_delete" ON public.google_calendar_connections
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER gcc_set_updated_at BEFORE UPDATE ON public.google_calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Mapeamento evento sistema -> evento Google por usuário
CREATE TABLE public.google_calendar_event_map (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.cronograma_eventos(id) ON DELETE CASCADE,
  subevent_id UUID REFERENCES public.cronograma_subeventos(id) ON DELETE CASCADE,
  google_event_id TEXT,
  google_calendar_id TEXT,
  content_hash TEXT,
  last_synced_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gcem_uniq UNIQUE (user_id, event_id, subevent_id)
);

GRANT SELECT ON public.google_calendar_event_map TO authenticated;
GRANT ALL ON public.google_calendar_event_map TO service_role;

ALTER TABLE public.google_calendar_event_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gcem_owner_select" ON public.google_calendar_event_map
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE INDEX gcem_user_idx ON public.google_calendar_event_map(user_id);
CREATE INDEX gcem_event_idx ON public.google_calendar_event_map(event_id);

CREATE TRIGGER gcem_set_updated_at BEFORE UPDATE ON public.google_calendar_event_map
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Fila de sincronização
CREATE TABLE public.google_sync_outbox (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.cronograma_eventos(id) ON DELETE CASCADE,
  subevent_id UUID REFERENCES public.cronograma_subeventos(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN ('upsert','delete')),
  dedupe_key TEXT NOT NULL,
  payload_hash TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','in_flight','done','failed','dead_letter','reconnect_required','cancelled')),
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  is_initial_backfill BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gso_dedupe_uniq UNIQUE (dedupe_key)
);

GRANT SELECT ON public.google_sync_outbox TO authenticated;
GRANT ALL ON public.google_sync_outbox TO service_role;

ALTER TABLE public.google_sync_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gso_owner_select" ON public.google_sync_outbox
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR public.get_user_org_role(auth.uid(), org_id) = 'admin'
  );

CREATE INDEX gso_pick_idx ON public.google_sync_outbox(status, next_attempt_at) WHERE status IN ('queued','failed');
CREATE INDEX gso_user_idx ON public.google_sync_outbox(user_id);

CREATE TRIGGER gso_set_updated_at BEFORE UPDATE ON public.google_sync_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Lembretes por e-mail
CREATE TABLE public.event_reminder_deliveries (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.cronograma_eventos(id) ON DELETE CASCADE,
  event_version BIGINT NOT NULL,
  offset_minutes INT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  channel TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','cancelled','skipped')),
  last_error TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT erd_uniq UNIQUE (idempotency_key)
);

GRANT SELECT ON public.event_reminder_deliveries TO authenticated;
GRANT ALL ON public.event_reminder_deliveries TO service_role;

ALTER TABLE public.event_reminder_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "erd_owner_select" ON public.event_reminder_deliveries
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE INDEX erd_pick_idx ON public.event_reminder_deliveries(status, scheduled_for) WHERE status = 'pending';
CREATE INDEX erd_event_idx ON public.event_reminder_deliveries(event_id);

CREATE TRIGGER erd_set_updated_at BEFORE UPDATE ON public.event_reminder_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Controle de exibição única do sino de notificações
CREATE TABLE public.notification_session_seen (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  shown_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nss_uniq UNIQUE (user_id, session_id)
);

GRANT SELECT, INSERT ON public.notification_session_seen TO authenticated;
GRANT ALL ON public.notification_session_seen TO service_role;

ALTER TABLE public.notification_session_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nss_owner_all" ON public.notification_session_seen
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- =========================================================================
-- 2. FUNÇÕES AUXILIARES
-- =========================================================================

-- Lista usuários que devem receber sincronização de um evento
CREATE OR REPLACE FUNCTION public.google_sync_affected_users(_event_id UUID)
RETURNS TABLE (user_id UUID, org_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT om.user_id, om.org_id
  FROM public.cronograma_evento_comissoes cec
  JOIN public.org_members om
    ON om.commission_id = cec.commission_id
   AND om.org_id = cec.org_id
   AND om.is_active = true
  JOIN public.google_calendar_connections gcc
    ON gcc.user_id = om.user_id
   AND gcc.status IN ('connected','reconnect_required')
  WHERE cec.event_id = _event_id;
$$;

-- Enfileira operações de sync para todos os usuários afetados por um evento
CREATE OR REPLACE FUNCTION public.enqueue_google_sync(_event_id UUID, _operation TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
  v_org UUID;
BEGIN
  IF _event_id IS NULL THEN RETURN; END IF;

  SELECT org_id, md5(coalesce(title,'') || '|' || coalesce(start_date::text,'') || '|' ||
                     coalesce(end_date::text,'') || '|' || coalesce(start_time::text,'') || '|' ||
                     coalesce(end_time::text,'') || '|' || coalesce(location,'') || '|' ||
                     coalesce(description,'') || '|' || coalesce(status,'') || '|' ||
                     coalesce(lock_version::text,'0'))
  INTO v_org, v_hash
  FROM public.cronograma_eventos WHERE id = _event_id;

  IF v_org IS NULL THEN RETURN; END IF;

  INSERT INTO public.google_sync_outbox (user_id, org_id, event_id, operation, dedupe_key, payload_hash)
  SELECT u.user_id, u.org_id, _event_id, _operation,
         u.user_id::text || '|' || _event_id::text || '|' || _operation || '|' || coalesce(v_hash,'x'),
         v_hash
  FROM public.google_sync_affected_users(_event_id) u
  ON CONFLICT (dedupe_key) DO NOTHING;

  -- Invalida lembretes pendentes desatualizados (nova versão gera novas entregas via scheduler)
  IF _operation = 'upsert' THEN
    UPDATE public.event_reminder_deliveries
       SET status = 'cancelled', updated_at = now()
     WHERE event_id = _event_id AND status = 'pending';
  ELSIF _operation = 'delete' THEN
    UPDATE public.event_reminder_deliveries
       SET status = 'cancelled', updated_at = now()
     WHERE event_id = _event_id AND status IN ('pending');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_google_sync(UUID, TEXT) TO service_role;

-- =========================================================================
-- 3. TRIGGERS
-- =========================================================================

CREATE OR REPLACE FUNCTION public.tg_evento_google_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_google_sync(OLD.id, 'delete');
    RETURN OLD;
  ELSE
    PERFORM public.enqueue_google_sync(NEW.id, 'upsert');
    RETURN NEW;
  END IF;
END $$;

CREATE TRIGGER trg_evento_google_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.cronograma_eventos
  FOR EACH ROW EXECUTE FUNCTION public.tg_evento_google_sync();

CREATE OR REPLACE FUNCTION public.tg_subevento_google_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_google_sync(OLD.parent_event_id, 'upsert');
    RETURN OLD;
  ELSE
    PERFORM public.enqueue_google_sync(NEW.parent_event_id, 'upsert');
    RETURN NEW;
  END IF;
END $$;

CREATE TRIGGER trg_subevento_google_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.cronograma_subeventos
  FOR EACH ROW EXECUTE FUNCTION public.tg_subevento_google_sync();

CREATE OR REPLACE FUNCTION public.tg_comissao_evento_google_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_google_sync(OLD.event_id, 'upsert');
    RETURN OLD;
  ELSE
    PERFORM public.enqueue_google_sync(NEW.event_id, 'upsert');
    RETURN NEW;
  END IF;
END $$;

CREATE TRIGGER trg_comissao_evento_google_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.cronograma_evento_comissoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_comissao_evento_google_sync();

-- Quando membro é adicionado/removido/desativado de uma comissão, sincroniza eventos da comissão
CREATE OR REPLACE FUNCTION public.tg_org_member_google_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_op TEXT;
  v_commission UUID;
  v_user UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_commission := OLD.commission_id;
    v_user := OLD.user_id;
    v_op := 'delete';
  ELSIF TG_OP = 'INSERT' THEN
    v_commission := NEW.commission_id;
    v_user := NEW.user_id;
    v_op := CASE WHEN NEW.is_active THEN 'upsert' ELSE 'delete' END;
  ELSE -- UPDATE
    IF (OLD.commission_id IS DISTINCT FROM NEW.commission_id)
       OR (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
      -- Remove eventos da comissão antiga
      IF OLD.commission_id IS NOT NULL THEN
        INSERT INTO public.google_sync_outbox (user_id, org_id, event_id, operation, dedupe_key)
        SELECT OLD.user_id, OLD.org_id, cec.event_id, 'delete',
               OLD.user_id::text || '|' || cec.event_id::text || '|delete|memberchange|' || extract(epoch from now())::text
        FROM public.cronograma_evento_comissoes cec
        WHERE cec.commission_id = OLD.commission_id
        ON CONFLICT (dedupe_key) DO NOTHING;
      END IF;
      -- Adiciona eventos da nova comissão (se ativo)
      IF NEW.commission_id IS NOT NULL AND NEW.is_active THEN
        INSERT INTO public.google_sync_outbox (user_id, org_id, event_id, operation, dedupe_key)
        SELECT NEW.user_id, NEW.org_id, cec.event_id, 'upsert',
               NEW.user_id::text || '|' || cec.event_id::text || '|upsert|memberchange|' || extract(epoch from now())::text
        FROM public.cronograma_evento_comissoes cec
        WHERE cec.commission_id = NEW.commission_id
        ON CONFLICT (dedupe_key) DO NOTHING;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF v_commission IS NOT NULL AND v_user IS NOT NULL THEN
    INSERT INTO public.google_sync_outbox (user_id, org_id, event_id, operation, dedupe_key)
    SELECT v_user, COALESCE(NEW.org_id, OLD.org_id), cec.event_id, v_op,
           v_user::text || '|' || cec.event_id::text || '|' || v_op || '|memberchange|' || extract(epoch from now())::text
    FROM public.cronograma_evento_comissoes cec
    WHERE cec.commission_id = v_commission
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_org_member_google_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.tg_org_member_google_sync();
