-- Prepared only: no historical backfill, account selection, or production activation.
-- Existing public entry points are retained. The relation and privileged bridge stay private.
CREATE SCHEMA IF NOT EXISTS agenda_private;
REVOKE ALL ON SCHEMA agenda_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA agenda_private TO authenticated;

CREATE TABLE IF NOT EXISTS agenda_private.cronograma_restaurant_config (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  responsible_user_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  configured_by uuid NOT NULL,
  configured_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, responsible_user_id) REFERENCES public.org_members(org_id, user_id)
);
CREATE TABLE IF NOT EXISTS agenda_private.cronograma_restaurant_links (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_event_id uuid NOT NULL,
  venue_event_id uuid NOT NULL UNIQUE,
  origin text NOT NULL DEFAULT 'cronograma' CHECK (origin = 'cronograma'),
  source_revision bigint NOT NULL CHECK (source_revision > 0),
  source_snapshot jsonb NOT NULL,
  responsible_user_id uuid NOT NULL,
  setup_lead interval NOT NULL DEFAULT interval '0' CHECK(setup_lead>=interval '0'),
  teardown_lag interval NOT NULL DEFAULT interval '0' CHECK(teardown_lag>=interval '0'),
  detached_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, source_event_id),
  FOREIGN KEY (org_id, venue_event_id) REFERENCES public.venue_events(org_id, id) ON DELETE RESTRICT
);
-- A private transaction capability, never a client-controllable GUC or payload flag.
CREATE TABLE IF NOT EXISTS agenda_private.cronograma_restaurant_write_context (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  source_event_id uuid NOT NULL,
  PRIMARY KEY (backend_pid, transaction_id)
);
CREATE TABLE IF NOT EXISTS agenda_private.cronograma_source_write_context (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  org_id uuid NOT NULL,
  source_event_id uuid,
  source_key text,
  expected_version bigint,
  PRIMARY KEY (backend_pid, transaction_id)
);
REVOKE ALL ON ALL TABLES IN SCHEMA agenda_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA agenda_private TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON agenda_private.cronograma_restaurant_config TO service_role;
GRANT SELECT ON agenda_private.cronograma_restaurant_links TO service_role;
ALTER TABLE public.venue_events ADD COLUMN IF NOT EXISTS cronograma_source_event_id uuid;
ALTER TABLE public.venue_events ADD COLUMN IF NOT EXISTS cronograma_source_revision bigint;
ALTER TABLE public.venue_events ADD COLUMN IF NOT EXISTS cronograma_source_snapshot jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS venue_event_cronograma_origin_unique
  ON public.venue_events(org_id, cronograma_source_event_id) WHERE cronograma_source_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION agenda_private.matches_location(_code text, _name text, _expected text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT CASE WHEN _code IS NOT NULL AND _code <> '' THEN _code = _expected
    ELSE btrim(regexp_replace(lower(extensions.unaccent(coalesce(_name, ''))), '[[:space:]]+', ' ', 'g')) =
      CASE _expected WHEN 'centro_eventos_fenasoja' THEN 'centro de eventos fenasoja'
        WHEN 'sala_voluntarios' THEN 'sala dos voluntarios' END END;
$$;
-- An explicit code wins. The save RPC clears a previous code only for text-only edits.
CREATE OR REPLACE FUNCTION public.cronograma_location_code_sync()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, extensions AS $$
BEGIN
  IF NEW.location_code IS NULL THEN
    NEW.location_code := CASE btrim(regexp_replace(lower(extensions.unaccent(coalesce(NEW.location, ''))), '[[:space:]]+', ' ', 'g'))
      WHEN 'sala dos voluntarios' THEN 'sala_voluntarios'
      WHEN 'casa fenasoja' THEN 'casa_fenasoja'
      WHEN 'centro de eventos fenasoja' THEN 'centro_eventos_fenasoja'
      WHEN 'auditorio-centro administrativo' THEN 'auditorio_centro_administrativo' END;
  END IF;
  RETURN NEW;
END $$;
-- Return the version from the same authorized unit-agenda snapshot the user edits.
-- No second lookup can accidentally promote a stale form to the latest version.
DO $$
DECLARE definition text;
BEGIN
  IF to_regprocedure('public.cronograma_unit_agenda(uuid)') IS NOT NULL THEN
    definition:=pg_get_functiondef('public.cronograma_unit_agenda(uuid)'::regprocedure);
    IF position('lock_version bigint' IN definition)=0 THEN
      IF position('document_count integer)' IN definition)=0 OR position('AS document_count' IN definition)=0 THEN
        RAISE EXCEPTION 'CRONOGRAMA_UNIT_AGENDA_LAYOUT_CHANGED';
      END IF;
      definition:=replace(definition,'document_count integer)',
        'document_count integer, lock_version bigint, location_code text, source_key text)');
      definition:=replace(definition,'AS document_count',
        'AS document_count, e.lock_version, e.location_code, e.source_key');
      EXECUTE 'DROP FUNCTION public.cronograma_unit_agenda(uuid)';
      EXECUTE definition;
      REVOKE ALL ON FUNCTION public.cronograma_unit_agenda(uuid) FROM PUBLIC,anon;
      GRANT EXECUTE ON FUNCTION public.cronograma_unit_agenda(uuid) TO authenticated;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION agenda_private.validate_unit_origin(_payload jsonb,_org_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE commission_id uuid := nullif(_payload->>'origin_commission_id','')::uuid;
BEGIN
  IF commission_id IS NULL THEN RETURN; END IF;
  IF NOT public.is_org_member(auth.uid(),_org_id)
    OR NOT public.cronograma_unit_can_manage(auth.uid(),commission_id)
    OR NOT EXISTS(SELECT 1 FROM public.commissions c WHERE c.id=commission_id AND c.org_id=_org_id AND c.is_active)
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(_payload->'commissions','[]'::jsonb)) item
      WHERE item->>'commission_id'=commission_id::text AND coalesce(item->>'relation_role','apoio')='principal') THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: origem de unidade inválida' USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION agenda_private.validate_unit_origin(jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION agenda_private.validate_unit_origin(jsonb,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION agenda_private.source_visible(_row public.cronograma_eventos)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_org_member(auth.uid(), _row.org_id)
    AND (NOT _row.planning_restricted OR public.cronograma_can_view_planning(auth.uid(), _row.org_id))
    AND ((public.get_user_org_role(auth.uid(), _row.org_id) IN ('admin','gestor','operador')
          AND NOT public.has_capability(auth.uid(), _row.org_id, 'restricted_scope'))
      OR NOT public.has_scoped_cronograma_access(auth.uid(), _row.org_id)
      OR public.cronograma_scoped_event_visible(_row.id, auth.uid())
      OR _row.created_by_user_id = auth.uid());
$$;
CREATE OR REPLACE FUNCTION agenda_private.require_restaurant_config(_org_id uuid)
RETURNS agenda_private.cronograma_restaurant_config LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c agenda_private.cronograma_restaurant_config;
BEGIN
  SELECT * INTO c FROM agenda_private.cronograma_restaurant_config WHERE org_id = _org_id;
  IF NOT FOUND OR NOT c.enabled THEN
    RAISE EXCEPTION 'CRONOGRAMA_RESTAURANT_CONFIGURATION_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = _org_id
      AND m.user_id = c.responsible_user_id AND m.is_active
      AND (m.role = 'admin' OR EXISTS (SELECT 1 FROM public.user_capabilities uc
        WHERE uc.org_id = _org_id AND uc.user_id = m.user_id
          AND uc.capability IN ('venue_events_approve','venue_events_full_access')))
      AND (m.role IN ('admin','gestor','operador') OR EXISTS (SELECT 1 FROM public.user_capabilities uc
        WHERE uc.org_id = _org_id AND uc.user_id = m.user_id
          AND uc.capability IN ('venue_events_access','venue_events_full_access')))) THEN
    RAISE EXCEPTION 'CRONOGRAMA_RESTAURANT_RESPONSIBLE_INVALID' USING ERRCODE = '42501';
  END IF;
  RETURN c;
END $$;

CREATE OR REPLACE FUNCTION agenda_private.guard_source_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE linked boolean;
BEGIN
  IF TG_OP='INSERT' THEN
    -- Future direct imports cannot manufacture a different authenticated creator
    -- in another location and later move that row into the bridge.
    IF auth.uid() IS NOT NULL AND NEW.created_by_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'CRONOGRAMA_CREATOR_INVALID' USING ERRCODE='42501';
    END IF;
    IF agenda_private.matches_location(NEW.location_code,NEW.location,'centro_eventos_fenasoja')
      AND NOT EXISTS (SELECT 1 FROM agenda_private.cronograma_source_write_context c
        WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.org_id=NEW.org_id
          AND c.source_event_id IS NULL AND c.expected_version IS NULL
          AND (c.source_key IS NULL OR c.source_key=NEW.source_key)) THEN
      RAISE EXCEPTION 'CRONOGRAMA_RESTAURANT_USE_VERSIONED_SAVE: use cronograma_save_event também nas importações' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND (NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id OR NEW.org_id IS DISTINCT FROM OLD.org_id)
    AND TG_OP='UPDATE' THEN
    RAISE EXCEPTION 'CRONOGRAMA_CREATOR_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  linked := EXISTS (SELECT 1 FROM agenda_private.cronograma_restaurant_links
    WHERE org_id = OLD.org_id AND source_event_id = OLD.id);
  IF linked OR (TG_OP = 'UPDATE' AND agenda_private.matches_location(NEW.location_code, NEW.location, 'centro_eventos_fenasoja')) THEN
    IF NOT EXISTS (SELECT 1 FROM agenda_private.cronograma_source_write_context c
      WHERE c.backend_pid = pg_backend_pid() AND c.transaction_id = txid_current()
        AND c.org_id = OLD.org_id AND (c.source_event_id = OLD.id OR c.source_key = OLD.source_key)
        AND c.expected_version = OLD.lock_version) THEN
      RAISE EXCEPTION 'CRONOGRAMA_CONFLICT: use a gravação com a versão atual' USING ERRCODE='40001';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
      OR NEW.source_key IS DISTINCT FROM OLD.source_key THEN
      RAISE EXCEPTION 'CRONOGRAMA_RESTAURANT_SOURCE_IDENTITY_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
    IF NEW.lock_version <> OLD.lock_version + 1 THEN
      RAISE EXCEPTION 'CRONOGRAMA_CONFLICT: versão de origem obrigatória' USING ERRCODE = '40001';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS zz_cronograma_restaurant_source_identity ON public.cronograma_eventos;
CREATE TRIGGER zz_cronograma_restaurant_source_identity BEFORE INSERT OR UPDATE OR DELETE ON public.cronograma_eventos
  FOR EACH ROW EXECUTE FUNCTION agenda_private.guard_source_identity();

CREATE OR REPLACE FUNCTION agenda_private.sync_restaurant_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  source public.cronograma_eventos;
  link agenda_private.cronograma_restaurant_links;
  config agenda_private.cronograma_restaurant_config;
  venue public.venue_events;
  before_venue jsonb;
  snapshot jsonb;
  destination_space_id uuid;
  space_count integer;
  creator_name text;
  actor uuid := auth.uid();
  start_value timestamptz;
  end_value timestamptz;
  setup_value timestamptz;
  teardown_value timestamptz;
  lead_value interval;
  lag_value interval;
  complete_period boolean := false;
  material boolean;
  removed boolean;
  desired_status text;
  operation text;
  bridge_request uuid := gen_random_uuid();
BEGIN
  source := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT * INTO link FROM agenda_private.cronograma_restaurant_links
    WHERE org_id = source.org_id AND source_event_id = source.id FOR UPDATE;
  removed := TG_OP = 'DELETE' OR source.status = 'cancelado'
    OR NOT agenda_private.matches_location(source.location_code, source.location, 'centro_eventos_fenasoja');
  IF link.venue_event_id IS NULL AND removed THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  IF actor IS NULL OR NOT public.is_org_member(actor, source.org_id)
    OR NOT public.has_capability(actor, source.org_id, 'cronograma_eventos_write')
    OR NOT agenda_private.source_visible(source) THEN
    RAISE EXCEPTION 'CRONOGRAMA_RESTAURANT_SOURCE_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(source.org_id::text, 28701));
  IF link.venue_event_id IS NOT NULL THEN
    SELECT * INTO venue FROM public.venue_events WHERE org_id = source.org_id AND id = link.venue_event_id FOR UPDATE;
    before_venue := to_jsonb(venue);
  END IF;
  snapshot := jsonb_build_object('title', source.title, 'start_date', source.start_date,
    'end_date', source.end_date, 'start_time', source.start_time, 'end_time', source.end_time,
    'event_time', source.event_time, 'location_code', source.location_code,
    'location', source.location, 'has_exact_date', source.has_exact_date);
  material := link.venue_event_id IS NULL
    OR (link.source_snapshot - ARRAY['location','location_code','event_time'])
      IS DISTINCT FROM (snapshot - ARRAY['location','location_code','event_time']);
  IF (removed OR material) AND venue.status IN ('confirmado','em_preparacao','em_andamento','concluido') THEN
    RAISE EXCEPTION 'CRONOGRAMA_RESTAURANT_PROTECTED: regularize a operação no Restaurante antes de alterar a origem'
      USING ERRCODE = '23514';
  END IF;
  INSERT INTO agenda_private.cronograma_restaurant_write_context VALUES (pg_backend_pid(), txid_current(), source.id);
  IF removed THEN
    IF venue.status <> 'cancelado' THEN
      UPDATE public.venue_events SET status = 'cancelado', cancellation_reason = 'Origem da Agenda excluída, cancelada ou transferida de local',
        updated_by = actor, version = version + 1, cronograma_source_revision = source.lock_version,
        cronograma_source_snapshot = snapshot WHERE id = venue.id RETURNING * INTO venue;
      UPDATE public.venue_event_spaces SET blocks_availability = false WHERE event_id = venue.id;
      PERFORM public.venue_refresh_occupancies(venue.id);
      PERFORM public.venue_sync_event_counterpart(venue.id, bridge_request, 'Origem reconciliada pela Agenda Fenasoja');
      INSERT INTO public.venue_event_approvals(org_id,event_id,decision,reason,previous_status,new_status,approver_id)
        VALUES(source.org_id,venue.id,'cancelado',venue.cancellation_reason,before_venue->>'status','cancelado',actor);
    END IF;
    UPDATE agenda_private.cronograma_restaurant_links SET source_revision = source.lock_version,
      source_snapshot = snapshot, detached_at = coalesce(detached_at, now()),
      deleted_at = CASE WHEN TG_OP = 'DELETE' THEN now() ELSE deleted_at END, updated_at = now()
      WHERE org_id = source.org_id AND source_event_id = source.id;
    IF TG_OP = 'DELETE' THEN
      INSERT INTO public.cronograma_evento_tombstones(org_id,source_key,deleted_event_id,deleted_by_user_id)
        VALUES(source.org_id,source.source_key,source.id,actor)
        ON CONFLICT(org_id,source_key) DO NOTHING;
    END IF;
    operation := 'cronograma_detached';
  ELSE
    config := agenda_private.require_restaurant_config(source.org_id);
    SELECT count(*), (array_agg(s.id))[1] INTO space_count, destination_space_id FROM public.venue_spaces s
      WHERE s.org_id = source.org_id AND s.slug = 'restaurante-fenasoja' AND s.type = 'restaurante' AND s.active;
    IF space_count <> 1 OR NOT EXISTS (SELECT 1 FROM public.venue_space_booking_units mapping
      JOIN public.venue_booking_units unit ON unit.org_id = mapping.org_id AND unit.id = mapping.booking_unit_id AND unit.active
      WHERE mapping.org_id = source.org_id AND mapping.space_id = destination_space_id) THEN
      RAISE EXCEPTION 'CRONOGRAMA_RESTAURANT_DESTINATION_INVALID' USING ERRCODE = '23514';
    END IF;
    SELECT nullif(btrim(m.nome_exibicao), '') INTO creator_name FROM public.org_members m
      WHERE m.org_id = source.org_id AND m.user_id = source.created_by_user_id;
    IF creator_name IS NULL OR length(creator_name)>160 OR (TG_OP = 'INSERT' AND source.created_by_user_id IS DISTINCT FROM actor) THEN
      RAISE EXCEPTION 'CRONOGRAMA_RESTAURANT_CREATOR_INVALID' USING ERRCODE = '42501';
    END IF;
    IF length(btrim(source.title)) NOT BETWEEN 3 AND 160 THEN
      RAISE EXCEPTION 'CRONOGRAMA_RESTAURANT_TITLE_INVALID' USING ERRCODE='23514';
    END IF;
    -- An absent end date means the same source day; overnight times retain their established meaning.
    -- Missing dates/times remain missing in the source snapshot and require information.
    IF source.has_exact_date AND source.start_date IS NOT NULL AND source.start_time IS NOT NULL AND source.end_time IS NOT NULL THEN
      start_value := (source.start_date + source.start_time) AT TIME ZONE 'America/Sao_Paulo';
      end_value := (coalesce(source.end_date, source.start_date) + source.end_time) AT TIME ZONE 'America/Sao_Paulo';
      IF coalesce(source.end_date,source.start_date)=source.start_date AND source.end_time < source.start_time THEN end_value := end_value + interval '1 day'; END IF;
      complete_period := start_value < end_value;
    END IF;
    IF NOT complete_period THEN start_value := NULL; end_value := NULL; END IF;
    lead_value:=coalesce(venue.start_at-venue.setup_start_at,link.setup_lead,interval '0');
    lag_value:=coalesce(venue.teardown_end_at-venue.end_at,link.teardown_lag,interval '0');
    setup_value:=start_value-lead_value;
    teardown_value:=end_value+lag_value;
    desired_status := CASE WHEN complete_period THEN 'solicitado' ELSE 'pendente_informacoes' END;
    IF link.venue_event_id IS NULL THEN
      INSERT INTO public.venue_events(org_id,title,event_type,requested_area,pending_date,start_at,end_at,
        setup_start_at,teardown_end_at,requester_name,requester_user_id,responsible_user_id,
        status,approval_status,priority,visibility,created_by,updated_by,
        cronograma_source_event_id,cronograma_source_revision,cronograma_source_snapshot)
      VALUES(source.org_id,btrim(source.title),'INSTITUCIONAL','CENTRO DE EVENTOS FENASOJA',NOT complete_period,
        start_value,end_value,setup_value,teardown_value,upper(creator_name),source.created_by_user_id,config.responsible_user_id,
        desired_status,'pendente',CASE WHEN source.priority IN ('baixa','media','alta','critica') THEN source.priority ELSE 'media' END,
        'restrita',source.created_by_user_id,actor,source.id,source.lock_version,snapshot) RETURNING * INTO venue;
      INSERT INTO public.venue_event_spaces(org_id,event_id,space_id,requested_area,start_at,end_at,setup_start_at,teardown_end_at,blocks_availability)
        VALUES(source.org_id,venue.id,destination_space_id,'CENTRO DE EVENTOS FENASOJA',start_value,end_value,setup_value,teardown_value,false);
      INSERT INTO agenda_private.cronograma_restaurant_links(org_id,source_event_id,venue_event_id,source_revision,source_snapshot,responsible_user_id)
        VALUES(source.org_id,source.id,venue.id,source.lock_version,snapshot,config.responsible_user_id);
      INSERT INTO public.venue_event_approvals(org_id,event_id,decision,reason,previous_status,new_status,approver_id)
        VALUES(source.org_id,venue.id,'enviado','Encaminhado pela Agenda Fenasoja','rascunho',desired_status,actor);
      operation := 'cronograma_forwarded';
    ELSE
      IF venue.status IN ('cancelado','concluido') AND material THEN
        RAISE EXCEPTION 'CRONOGRAMA_RESTAURANT_REACTIVATION_REQUIRED' USING ERRCODE = '23514';
      END IF;
      IF venue.responsible_user_id IS DISTINCT FROM config.responsible_user_id THEN
        RAISE EXCEPTION 'CRONOGRAMA_RESTAURANT_RESPONSIBLE_CHANGED: reconciliação auditada obrigatória' USING ERRCODE = '23514';
      END IF;
      IF material THEN
        UPDATE public.venue_events SET title = btrim(source.title), pending_date = NOT complete_period,
          start_at = start_value, end_at = end_value, setup_start_at = setup_value, teardown_end_at = teardown_value,
          status = desired_status, approval_status = 'pendente', conflict_status = 'nao_verificado',
          conflict_override_reason = NULL, conflict_override_fingerprint = NULL,
          updated_by = actor, version = version + 1, cronograma_source_revision = source.lock_version,
          cronograma_source_snapshot = snapshot WHERE id = venue.id RETURNING * INTO venue;
        UPDATE public.venue_event_spaces SET start_at = start_value,end_at = end_value,setup_start_at = setup_value,
          teardown_end_at = teardown_value,blocks_availability = false,conflict_override = false WHERE event_id = venue.id;
        INSERT INTO public.venue_event_approvals(org_id,event_id,decision,reason,previous_status,new_status,approver_id)
          VALUES(source.org_id,venue.id,'alteracao_material','Alteração da origem exige nova validação',before_venue->>'status',desired_status,actor);
        PERFORM public.venue_refresh_occupancies(venue.id);
        PERFORM public.venue_sync_event_counterpart(venue.id, bridge_request, 'Alteração da origem exige nova validação');
      ELSE
        UPDATE public.venue_events SET title=btrim(source.title),
          updated_by=CASE WHEN title IS DISTINCT FROM btrim(source.title) THEN actor ELSE updated_by END,
          version=CASE WHEN title IS DISTINCT FROM btrim(source.title) THEN version+1 ELSE version END,
          cronograma_source_revision = source.lock_version,
          cronograma_source_snapshot = snapshot WHERE id = venue.id RETURNING * INTO venue;
      END IF;
      UPDATE agenda_private.cronograma_restaurant_links SET source_revision = source.lock_version,
        source_snapshot = snapshot,setup_lead=lead_value,teardown_lag=lag_value, updated_at = now() WHERE org_id = source.org_id AND source_event_id = source.id;
      operation := 'cronograma_updated';
    END IF;
  END IF;
  IF NOT removed AND (link.venue_event_id IS NULL OR material) THEN
    PERFORM agenda_private.apply_venue_checklist(source.org_id,venue,ARRAY[destination_space_id],actor,bridge_request,'Origem Agenda Fenasoja');
  END IF;
  PERFORM public.venue_log_audit(source.org_id,'venue_event',venue.id,
    CASE WHEN before_venue IS NULL THEN 'create'::public.audit_action ELSE 'update'::public.audit_action END,
    before_venue,to_jsonb(venue),operation,'Origem Agenda Fenasoja',bridge_request);
  DELETE FROM agenda_private.cronograma_restaurant_write_context WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current();
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS cronograma_restaurant_bridge ON public.cronograma_eventos;
CREATE TRIGGER cronograma_restaurant_bridge AFTER INSERT OR UPDATE OR DELETE ON public.cronograma_eventos
  FOR EACH ROW EXECUTE FUNCTION agenda_private.sync_restaurant_source();

CREATE OR REPLACE FUNCTION agenda_private.guard_linked_venue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE config agenda_private.cronograma_restaurant_config;
BEGIN
  IF EXISTS (SELECT 1 FROM agenda_private.cronograma_restaurant_write_context
    WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current()
      AND source_event_id = coalesce(NEW.cronograma_source_event_id, OLD.cronograma_source_event_id)) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.cronograma_source_event_id IS NOT NULL THEN RAISE EXCEPTION 'VENUE_CRONOGRAMA_SOURCE_FORGED' USING ERRCODE = '42501'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.cronograma_source_event_id IS NULL THEN
    IF TG_OP = 'UPDATE' AND NEW.cronograma_source_event_id IS NOT NULL THEN RAISE EXCEPTION 'VENUE_CRONOGRAMA_SOURCE_FORGED' USING ERRCODE = '42501'; END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'VENUE_CRONOGRAMA_HISTORY_REQUIRED' USING ERRCODE = '23514'; END IF;
  IF ROW(NEW.org_id,NEW.title,NEW.executive_description,NEW.event_type,NEW.requested_area,NEW.pending_date,
      NEW.start_at,NEW.end_at,NEW.requester_name,NEW.requester_user_id,
      NEW.created_by,NEW.responsible_user_id,NEW.cronograma_source_event_id,NEW.cronograma_source_revision,NEW.cronograma_source_snapshot)
    IS DISTINCT FROM ROW(OLD.org_id,OLD.title,OLD.executive_description,OLD.event_type,OLD.requested_area,OLD.pending_date,
      OLD.start_at,OLD.end_at,OLD.requester_name,OLD.requester_user_id,
      OLD.created_by,OLD.responsible_user_id,OLD.cronograma_source_event_id,OLD.cronograma_source_revision,OLD.cronograma_source_snapshot) THEN
    RAISE EXCEPTION 'VENUE_CRONOGRAMA_SOURCE_FIELDS_READ_ONLY' USING ERRCODE = '42501';
  END IF;
  IF NEW.visibility <> 'restrita' THEN
    RAISE EXCEPTION 'VENUE_CRONOGRAMA_SOURCE_FIELDS_READ_ONLY' USING ERRCODE = '42501';
  END IF;
  IF (NEW.approval_status IS DISTINCT FROM OLD.approval_status AND NEW.approval_status IN ('aprovado','em_analise','recusado'))
    OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('em_analise','aprovado','recusado','confirmado')) THEN
    config := agenda_private.require_restaurant_config(OLD.org_id);
    IF auth.uid() IS DISTINCT FROM config.responsible_user_id
      OR OLD.responsible_user_id IS DISTINCT FROM config.responsible_user_id
      OR NOT public.venue_has_capability(OLD.org_id,'venue_events_approve') THEN
      RAISE EXCEPTION 'VENUE_CRONOGRAMA_DESIGNATED_APPROVER_REQUIRED' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_venue_cronograma_guard ON public.venue_events;
CREATE TRIGGER zz_venue_cronograma_guard BEFORE INSERT OR UPDATE OR DELETE ON public.venue_events
  FOR EACH ROW EXECUTE FUNCTION agenda_private.guard_linked_venue();

-- Private replay helpers reuse the durable Venue receipt mechanism. Their results are
-- reconstructed from persisted source rows; callers cannot supply a success document.
CREATE OR REPLACE FUNCTION agenda_private.cronograma_begin_save(_payload jsonb, _expected bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE org uuid := nullif(_payload->>'org_id','')::uuid;
DECLARE replay jsonb;
DECLARE source public.cronograma_eventos;
BEGIN
  PERFORM public._cronograma_require_writer(org);
  IF NOT public.is_org_member(auth.uid(),org) THEN RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(org::text,28701));
  replay := public.venue_begin_mutation(org,'cronograma_save_event',nullif(_payload->>'request_id','')::uuid,
    _payload || jsonb_build_object('expected_lock_version',_expected));
  IF (replay->>'replayed')::boolean THEN
    SELECT * INTO source FROM public.cronograma_eventos WHERE org_id=org AND id=(replay->'result'->>'id')::uuid;
    IF source.id IS NULL OR agenda_private.source_visible(source) IS NOT TRUE THEN
      RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED' USING ERRCODE='42501';
    END IF;
  END IF;
  IF NOT (replay->>'replayed')::boolean THEN
    INSERT INTO agenda_private.cronograma_source_write_context VALUES (pg_backend_pid(),txid_current(),org,
      nullif(_payload->>'id','')::uuid,_payload->>'source_key',_expected)
    ON CONFLICT(backend_pid,transaction_id) DO UPDATE SET org_id=EXCLUDED.org_id,
      source_event_id=EXCLUDED.source_event_id,source_key=EXCLUDED.source_key,expected_version=EXCLUDED.expected_version;
  END IF;
  RETURN replay;
END $$;
CREATE OR REPLACE FUNCTION agenda_private.cronograma_finish_save(_payload jsonb, _expected bigint, _event_id uuid, _action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE source public.cronograma_eventos; link agenda_private.cronograma_restaurant_links; venue public.venue_events; result jsonb;
BEGIN
  SELECT * INTO source FROM public.cronograma_eventos WHERE id = _event_id AND org_id = nullif(_payload->>'org_id','')::uuid;
  PERFORM public._cronograma_require_writer(source.org_id);
  IF source.id IS NULL OR agenda_private.source_visible(source) IS NOT TRUE
    OR (_payload->>'id' IS NOT NULL AND source.id <> nullif(_payload->>'id','')::uuid)
    OR (_payload->>'source_key' IS NOT NULL AND source.source_key <> _payload->>'source_key') THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.venue_mutation_receipts r WHERE r.org_id = source.org_id
    AND r.actor_user_id = auth.uid() AND r.operation = 'cronograma_save_event'
    AND r.idempotency_key = nullif(_payload->>'request_id','')::uuid AND r.result IS NULL
    AND r.request_hash = md5((_payload || jsonb_build_object('expected_lock_version',_expected))::text)) THEN
    RAISE EXCEPTION 'VENUE_IDEMPOTENCY_RECEIPT_MISSING' USING ERRCODE='P0001';
  END IF;
  SELECT to_jsonb(f) INTO result FROM public.cronograma_eventos_full f WHERE f.id = source.id;
  SELECT * INTO link FROM agenda_private.cronograma_restaurant_links WHERE org_id = source.org_id AND source_event_id = source.id;
  IF FOUND THEN
    SELECT * INTO venue FROM public.venue_events WHERE id = link.venue_event_id;
    result := result || jsonb_build_object('restaurant_forwarding',jsonb_build_object(
      'event_id',venue.id,'status',venue.status,'approval_status',venue.approval_status,
      'source_revision',link.source_revision,'action',CASE WHEN link.detached_at IS NOT NULL THEN 'cancelled'
        WHEN link.created_at=transaction_timestamp() THEN 'created' ELSE 'updated' END));
  END IF;
  DELETE FROM agenda_private.cronograma_source_write_context WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current();
  RETURN public.venue_finish_mutation(source.org_id,'cronograma_save_event',nullif(_payload->>'request_id','')::uuid,result);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA agenda_private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION agenda_private.cronograma_begin_save(jsonb,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION agenda_private.cronograma_finish_save(jsonb,bigint,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION agenda_private.validate_unit_origin(jsonb,uuid) TO authenticated;
-- Keep the existing private occupancy helper callable through its existing public wrapper.
GRANT EXECUTE ON FUNCTION agenda_private.restaurant_alert(uuid,date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.cronograma_save_event(payload jsonb, expected_lock_version bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_org uuid;
  v_prev public.cronograma_eventos%ROWTYPE;
  v_row public.cronograma_eventos%ROWTYPE;
  v_request text := payload->>'request_id';
  v_source_key text := payload->>'source_key';
  v_action text;
  v_replay jsonb;
BEGIN
  v_id := NULLIF(payload->>'id','')::uuid;
  v_org := NULLIF(payload->>'org_id','')::uuid;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'CRONOGRAMA_VALIDATION_ERROR: org_id obrigatório' USING ERRCODE='P0001';
  END IF;
  PERFORM public._cronograma_require_writer(v_org);
  v_replay := agenda_private.cronograma_begin_save(payload, expected_lock_version);
  IF (v_replay->>'replayed')::boolean THEN
    -- Re-evaluate current source RLS before returning a stored success.
    IF NOT EXISTS (SELECT 1 FROM public.cronograma_eventos_full f WHERE f.id = (v_replay->'result'->>'id')::uuid) THEN
      RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED' USING ERRCODE='42501';
    END IF;
    RETURN v_replay->'result';
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.cronograma_eventos WHERE id = v_id AND org_id = v_org FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CRONOGRAMA_NOT_FOUND: evento %', v_id USING ERRCODE='P0001';
    END IF;
    IF expected_lock_version IS NULL OR v_prev.lock_version <> expected_lock_version THEN
      RAISE EXCEPTION 'CRONOGRAMA_CONFLICT: versão % esperada, atual %', expected_lock_version, v_prev.lock_version
        USING ERRCODE='P0001';
    END IF;
    v_action := 'update';
  ELSIF v_source_key IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.cronograma_eventos
     WHERE org_id = v_org AND source_key = v_source_key FOR UPDATE;
    IF FOUND THEN
      IF expected_lock_version IS NULL OR v_prev.lock_version <> expected_lock_version THEN
        RAISE EXCEPTION 'CRONOGRAMA_CONFLICT: origem já criada; recarregue antes de editar' USING ERRCODE='40001';
      END IF;
      v_id := v_prev.id;
      v_action := 'update';
    ELSE
      v_action := 'create';
    END IF;
  ELSE
    v_action := 'create';
  END IF;

  IF v_action='create' AND EXISTS(SELECT 1 FROM public.cronograma_evento_tombstones WHERE org_id=v_org AND source_key=v_source_key) THEN
    RAISE EXCEPTION 'CRONOGRAMA_DELETED_SOURCE: este evento foi excluído; recarregue a agenda' USING ERRCODE='23514';
  END IF;
  IF nullif(payload->>'origin_commission_id','') IS NOT NULL THEN
    IF v_action='create' THEN
      PERFORM agenda_private.validate_unit_origin(payload,v_org);
    ELSIF v_prev.origin_commission_id IS DISTINCT FROM (payload->>'origin_commission_id')::uuid THEN
      RAISE EXCEPTION 'CRONOGRAMA_ORIGIN_IMMUTABLE' USING ERRCODE='42501';
    END IF;
  END IF;

  IF v_action = 'create' THEN
    INSERT INTO public.cronograma_eventos (
      org_id, source_key, title, description, category, category_key, event_type,
      source_year, start_date, end_date, month_label, week_label, status, priority,
      location, location_code, event_time, start_time, end_time, days_remaining,
      commission_slug, commission_name, responsible_name,
      source_sheet, source_row, source_cell, source_note,
      is_official_seed, has_exact_date, linked_commissions, subevents,
      pending_reason, decision_needed, created_by_user_id, lock_version,
      notify_all_commission_members,origin_source,origin_commission_id
    ) VALUES (
      v_org,
      COALESCE(v_source_key, 'manual-' || gen_random_uuid()::text),
      COALESCE(payload->>'title',''),
      payload->>'description',
      COALESCE(payload->>'category','Outros / a classificar'),
      payload->>'category_key',
      COALESCE(payload->>'event_type','planejamento'),
      COALESCE(NULLIF(payload->>'source_year','')::int, 2028),
      NULLIF(payload->>'start_date','')::date,
      NULLIF(payload->>'end_date','')::date,
      payload->>'month_label',
      payload->>'week_label',
      COALESCE(payload->>'status','planejado'),
      COALESCE(payload->>'priority','media'),
      payload->>'location',
      payload->>'location_code',
      payload->>'event_time',
      NULLIF(payload->>'start_time','')::time,
      NULLIF(payload->>'end_time','')::time,
      NULLIF(payload->>'days_remaining','')::int,
      payload->>'commission_slug',
      payload->>'commission_name',
      payload->>'responsible_name',
      COALESCE(payload->>'source_sheet','Cadastro manual'),
      payload->>'source_row',
      payload->>'source_cell',
      payload->>'source_note',
      COALESCE((payload->>'is_official_seed')::boolean, false),
      COALESCE((payload->>'has_exact_date')::boolean, (payload->>'start_date') IS NOT NULL),
      COALESCE(payload->'linked_commissions','[]'::jsonb),
      COALESCE(payload->'subevents_json','[]'::jsonb),
      payload->>'pending_reason',
      payload->>'decision_needed',
      auth.uid(),
      1,
      COALESCE((payload->>'notify_all_commission_members')::boolean, false),
      CASE WHEN nullif(payload->>'origin_commission_id','') IS NOT NULL THEN 'unidade' ELSE 'agenda_central' END,
      nullif(payload->>'origin_commission_id','')::uuid
    ) RETURNING * INTO v_row;
    v_id := v_row.id;
  ELSE
    UPDATE public.cronograma_eventos SET
      title = COALESCE(payload->>'title', title),
      description = CASE WHEN payload ? 'description' THEN payload->>'description' ELSE description END,
      category = COALESCE(payload->>'category', category),
      category_key = CASE WHEN payload ? 'category_key' THEN payload->>'category_key' ELSE category_key END,
      event_type = COALESCE(payload->>'event_type', event_type),
      source_year = COALESCE(NULLIF(payload->>'source_year','')::int, source_year),
      start_date = CASE WHEN payload ? 'start_date' THEN NULLIF(payload->>'start_date','')::date ELSE start_date END,
      end_date = CASE WHEN payload ? 'end_date' THEN NULLIF(payload->>'end_date','')::date ELSE end_date END,
      month_label = CASE WHEN payload ? 'month_label' THEN payload->>'month_label' ELSE month_label END,
      week_label = CASE WHEN payload ? 'week_label' THEN payload->>'week_label' ELSE week_label END,
      status = COALESCE(payload->>'status', status),
      priority = COALESCE(payload->>'priority', priority),
      location = CASE WHEN payload ? 'location' THEN payload->>'location' ELSE location END,
      location_code = CASE WHEN payload ? 'location_code' THEN payload->>'location_code' WHEN payload ? 'location' THEN NULL ELSE location_code END,
      event_time = CASE WHEN payload ? 'event_time' THEN payload->>'event_time' ELSE event_time END,
      start_time = CASE WHEN payload ? 'start_time' THEN NULLIF(payload->>'start_time','')::time ELSE start_time END,
      end_time = CASE WHEN payload ? 'end_time' THEN NULLIF(payload->>'end_time','')::time ELSE end_time END,
      days_remaining = CASE WHEN payload ? 'days_remaining' THEN NULLIF(payload->>'days_remaining','')::int ELSE days_remaining END,
      commission_slug = CASE WHEN payload ? 'commission_slug' THEN payload->>'commission_slug' ELSE commission_slug END,
      commission_name = CASE WHEN payload ? 'commission_name' THEN payload->>'commission_name' ELSE commission_name END,
      responsible_name = CASE WHEN payload ? 'responsible_name' THEN payload->>'responsible_name' ELSE responsible_name END,
      has_exact_date = CASE WHEN payload ? 'has_exact_date' THEN (payload->>'has_exact_date')::boolean ELSE has_exact_date END,
      pending_reason = CASE WHEN payload ? 'pending_reason' THEN payload->>'pending_reason' ELSE pending_reason END,
      decision_needed = CASE WHEN payload ? 'decision_needed' THEN payload->>'decision_needed' ELSE decision_needed END,
      notify_all_commission_members = CASE WHEN payload ? 'notify_all_commission_members' THEN COALESCE((payload->>'notify_all_commission_members')::boolean, false) ELSE notify_all_commission_members END,
      lock_version = lock_version + 1,
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO v_row;
  END IF;

  IF payload ? 'commissions' THEN
    PERFORM public._cronograma_apply_event_commissions(v_id, v_org, payload->'commissions');
  END IF;
  IF payload ? 'responsibles' THEN
    PERFORM public._cronograma_apply_event_responsibles(v_id, v_org, payload->'responsibles');
  END IF;

  PERFORM public._cronograma_log(v_id, 'event', v_id, v_action,
    CASE WHEN v_action = 'update' THEN to_jsonb(v_prev) ELSE NULL END,
    to_jsonb(v_row), v_request);

  RETURN agenda_private.cronograma_finish_save(payload, expected_lock_version, v_id, v_action);
END $function$;

-- A linked request always has exactly its Restaurant allocation. This also covers
-- existing venue imports and the save RPC's delete/reinsert allocation transaction.
CREATE OR REPLACE FUNCTION agenda_private.check_linked_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.event_id ELSE NEW.event_id END;
DECLARE event public.venue_events; allocations integer;
BEGIN
  SELECT * INTO event FROM public.venue_events WHERE id = target;
  IF event.cronograma_source_event_id IS NULL THEN RETURN NULL; END IF;
  SELECT count(*) INTO allocations FROM public.venue_event_spaces a
    JOIN public.venue_spaces s ON s.org_id = a.org_id AND s.id = a.space_id
    WHERE a.event_id = target AND s.slug = 'restaurante-fenasoja' AND s.type = 'restaurante' AND s.active;
  IF allocations <> 1 OR (SELECT count(*) FROM public.venue_event_spaces WHERE event_id = target) <> 1 THEN
    RAISE EXCEPTION 'VENUE_CRONOGRAMA_RESTAURANT_ALLOCATION_REQUIRED' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS venue_cronograma_allocation_guard ON public.venue_event_spaces;
CREATE CONSTRAINT TRIGGER venue_cronograma_allocation_guard
  AFTER INSERT OR UPDATE OR DELETE ON public.venue_event_spaces DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION agenda_private.check_linked_allocation();
REVOKE ALL ON FUNCTION agenda_private.check_linked_allocation() FROM PUBLIC, anon, authenticated;

-- Retain the existing alert name and window, adding optional explicit self exclusion.
-- Three-argument callers still work through the default parameter.
DROP FUNCTION IF EXISTS public.cronograma_restaurant_alert(uuid,date,date);
CREATE OR REPLACE FUNCTION public.cronograma_restaurant_alert(
  _org_id uuid, _start_date date, _end_date date, _source_event_id uuid DEFAULT NULL)
RETURNS TABLE(event_date date,event_end_date date,title text,start_time text,end_time text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE source public.cronograma_eventos; self_id uuid;
BEGIN
  IF auth.uid() IS NULL OR _org_id IS NULL OR public.get_user_org_role(auth.uid(),_org_id) NOT IN ('admin','gestor','operador') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF _start_date IS NULL OR _end_date IS NULL OR _end_date < _start_date OR _end_date > _start_date + 366 THEN
    RAISE EXCEPTION 'Invalid date interval';
  END IF;
  IF _source_event_id IS NOT NULL THEN
    SELECT * INTO source FROM public.cronograma_eventos WHERE org_id = _org_id AND id = _source_event_id;
    IF NOT FOUND OR NOT agenda_private.source_visible(source) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
    SELECT venue_event_id INTO self_id FROM agenda_private.cronograma_restaurant_links WHERE org_id = _org_id AND source_event_id = _source_event_id;
  END IF;
  RETURN QUERY WITH RECURSIVE restaurant_spaces AS (
    SELECT s.id FROM public.venue_spaces s WHERE s.org_id = _org_id AND s.slug = 'restaurante-fenasoja' AND s.type = 'restaurante' AND s.active
    UNION ALL SELECT child.id FROM public.venue_spaces child JOIN restaurant_spaces parent ON child.parent_space_id = parent.id
      WHERE child.org_id = _org_id AND child.active AND child.type = 'restaurante'
  )
  SELECT (e.start_at AT TIME ZONE 'America/Sao_Paulo')::date,(e.end_at AT TIME ZONE 'America/Sao_Paulo')::date,
    CASE WHEN public.venue_can_view_event(_org_id,e.id) THEN e.title ELSE 'Ocupação reservada' END,
    CASE WHEN public.venue_can_view_event(_org_id,e.id) THEN to_char(e.start_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI') ELSE NULL END,
    CASE WHEN public.venue_can_view_event(_org_id,e.id) THEN to_char(e.end_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI') ELSE NULL END
  FROM public.venue_events e WHERE e.org_id = _org_id AND e.id IS DISTINCT FROM self_id
    AND e.status NOT IN ('cancelado','recusado') AND e.start_at IS NOT NULL AND e.end_at IS NOT NULL
    AND (e.start_at AT TIME ZONE 'America/Sao_Paulo')::date <= _end_date + 1
    AND (e.end_at AT TIME ZONE 'America/Sao_Paulo')::date >= _start_date - 1
    AND EXISTS (SELECT 1 FROM public.venue_event_spaces es JOIN restaurant_spaces rs ON rs.id = es.space_id WHERE es.org_id = _org_id AND es.event_id = e.id)
  ORDER BY e.start_at,e.id LIMIT 100;
END $$;
REVOKE ALL ON FUNCTION public.cronograma_restaurant_alert(uuid,date,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cronograma_restaurant_alert(uuid,date,date,uuid) TO authenticated;

DROP FUNCTION IF EXISTS agenda_private.cronograma_begin_delete(uuid,uuid,bigint);
CREATE OR REPLACE FUNCTION agenda_private.cronograma_begin_delete(_event_id uuid,_org_id uuid,_expected bigint,_source_key text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source public.cronograma_eventos;
BEGIN
  PERFORM public._cronograma_require_writer(_org_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(_org_id::text,28701));
  SELECT * INTO source FROM public.cronograma_eventos WHERE org_id=_org_id
    AND (id=_event_id OR (_event_id IS NULL AND source_key=_source_key)) FOR UPDATE;
  IF source.id IS NULL THEN RETURN; END IF;
  PERFORM public._cronograma_require_writer(_org_id);
  IF agenda_private.source_visible(source) IS NOT TRUE THEN RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
  IF (_expected IS NOT NULL AND source.lock_version <> _expected)
    OR (_expected IS NULL AND EXISTS(SELECT 1 FROM agenda_private.cronograma_restaurant_links WHERE org_id=_org_id AND source_event_id=source.id)) THEN
    RAISE EXCEPTION 'CRONOGRAMA_CONFLICT: recarregue antes de excluir' USING ERRCODE='40001';
  END IF;
  INSERT INTO agenda_private.cronograma_source_write_context VALUES(pg_backend_pid(),txid_current(),_org_id,source.id,source.source_key,_expected)
  ON CONFLICT(backend_pid,transaction_id) DO UPDATE SET org_id=EXCLUDED.org_id,
    source_event_id=EXCLUDED.source_event_id,source_key=EXCLUDED.source_key,expected_version=EXCLUDED.expected_version;
END $$;
REVOKE ALL ON FUNCTION agenda_private.cronograma_begin_delete(uuid,uuid,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION agenda_private.cronograma_begin_delete(uuid,uuid,bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION agenda_private.cronograma_finish_delete()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  DELETE FROM agenda_private.cronograma_source_write_context WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();
$$;
REVOKE ALL ON FUNCTION agenda_private.cronograma_finish_delete() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION agenda_private.cronograma_finish_delete() TO authenticated;

DROP FUNCTION IF EXISTS public.cronograma_delete_event(uuid,uuid,text);
CREATE OR REPLACE FUNCTION public.cronograma_delete_event(event_id uuid, event_org_id uuid, event_source_key text, expected_lock_version bigint DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event public.cronograma_eventos%ROWTYPE;
  v_source_key text := btrim(event_source_key);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(auth.uid(),event_org_id) THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: não autenticado' USING ERRCODE = 'P0001';
  END IF;

  IF public.get_user_org_role(auth.uid(), event_org_id) NOT IN ('admin','gestor')
     AND NOT public.has_capability(auth.uid(), event_org_id, 'cronograma_eventos_write') THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: sem permissão para excluir eventos' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(event_org_id::text,28701));
  PERFORM agenda_private.cronograma_begin_delete(event_id,event_org_id,expected_lock_version,v_source_key);
  IF event_id IS NOT NULL THEN
    SELECT * INTO v_event
    FROM public.cronograma_eventos
    WHERE id = event_id AND org_id = event_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CRONOGRAMA_NOT_FOUND: evento não encontrado' USING ERRCODE = 'P0001';
    END IF;
    v_source_key := v_event.source_key;
  END IF;

  IF v_source_key IS NULL OR v_source_key = '' THEN
    RAISE EXCEPTION 'CRONOGRAMA_VALIDATION_ERROR: source_key obrigatório' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.cronograma_evento_tombstones (org_id, source_key, deleted_event_id, deleted_by_user_id)
  VALUES (event_org_id, v_source_key, event_id, auth.uid())
  ON CONFLICT (org_id, source_key) DO UPDATE SET
    deleted_event_id = EXCLUDED.deleted_event_id,
    deleted_by_user_id = EXCLUDED.deleted_by_user_id,
    deleted_at = now();

  DELETE FROM public.cronograma_eventos
  WHERE org_id = event_org_id
    AND (id = event_id OR source_key = v_source_key);

  PERFORM agenda_private.cronograma_finish_delete();
  RETURN jsonb_build_object('id', event_id, 'source_key', v_source_key, 'deleted', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.cronograma_delete_event(uuid,uuid,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cronograma_delete_event(uuid,uuid,text,bigint) TO authenticated;

CREATE OR REPLACE FUNCTION agenda_private.revalidate_linked_resources()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target uuid := CASE WHEN TG_OP='DELETE' THEN OLD.event_id ELSE NEW.event_id END;
DECLARE event public.venue_events; before_event jsonb; request uuid := gen_random_uuid();
BEGIN
  SELECT * INTO event FROM public.venue_events WHERE id=target FOR UPDATE;
  IF event.cronograma_source_event_id IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP='UPDATE' AND ROW(NEW.resource_type,NEW.quantity,NEW.responsible_team,NEW.notes)
      IS NOT DISTINCT FROM ROW(OLD.resource_type,OLD.quantity,OLD.responsible_team,OLD.notes) THEN RETURN NEW; END IF;
  IF event.status IN ('confirmado','em_preparacao','em_andamento','concluido') THEN
    RAISE EXCEPTION 'CRONOGRAMA_RESTAURANT_PROTECTED: regularize a operação antes de alterar recursos' USING ERRCODE='23514';
  END IF;
  IF event.status IN ('aprovado','em_analise') THEN
    before_event := to_jsonb(event);
    UPDATE public.venue_events SET status=CASE WHEN pending_date THEN 'pendente_informacoes' ELSE 'solicitado' END,
      approval_status='pendente',conflict_status='nao_verificado',conflict_override_reason=NULL,conflict_override_fingerprint=NULL,
      updated_by=auth.uid(),version=version+1 WHERE id=target RETURNING * INTO event;
    UPDATE public.venue_event_spaces SET blocks_availability=false,conflict_override=false WHERE event_id=target;
    PERFORM public.venue_refresh_occupancies(target);
    PERFORM public.venue_sync_event_counterpart(target,request,'Recursos alterados: nova validação obrigatória');
    INSERT INTO public.venue_event_approvals(org_id,event_id,decision,reason,previous_status,new_status,approver_id)
      VALUES(event.org_id,target,'alteracao_material','Recursos alterados: nova validação obrigatória',before_event->>'status',event.status,auth.uid());
    PERFORM public.venue_log_audit(event.org_id,'venue_event',target,'update'::public.audit_action,
      before_event,to_jsonb(event),'cronograma_resources_changed','Recursos alterados',request);
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS venue_cronograma_resource_guard ON public.venue_event_resources;
CREATE TRIGGER venue_cronograma_resource_guard BEFORE INSERT OR UPDATE OR DELETE ON public.venue_event_resources
  FOR EACH ROW EXECUTE FUNCTION agenda_private.revalidate_linked_resources();
REVOKE ALL ON FUNCTION agenda_private.revalidate_linked_resources() FROM PUBLIC,anon,authenticated;

-- Replay must revalidate today's designated validator before returning a prior
-- approval receipt. Unlinked events keep the existing transition implementation.
CREATE OR REPLACE FUNCTION agenda_private.require_linked_transition(_org_id uuid,_event_id uuid,_transition text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE config agenda_private.cronograma_restaurant_config; designated uuid;
BEGIN
  IF _transition NOT IN ('start_review','approve','reject','confirm') THEN RETURN; END IF;
  SELECT responsible_user_id INTO designated FROM public.venue_events WHERE org_id=_org_id AND id=_event_id AND cronograma_source_event_id IS NOT NULL;
  IF NOT FOUND THEN RETURN; END IF;
  config:=agenda_private.require_restaurant_config(_org_id);
  IF auth.uid() IS DISTINCT FROM config.responsible_user_id OR designated IS DISTINCT FROM config.responsible_user_id
    OR NOT public.venue_has_capability(_org_id,'venue_events_approve') THEN
    RAISE EXCEPTION 'VENUE_CRONOGRAMA_DESIGNATED_APPROVER_REQUIRED' USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION agenda_private.require_linked_transition(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
DO $$
DECLARE definition text;
BEGIN
  definition:=pg_get_functiondef('public.venue_transition_event(uuid,uuid,integer,text,text,uuid,jsonb)'::regprocedure);
  IF position('agenda_private.require_linked_transition' IN definition)=0 THEN
    IF position('actor_id := public.venue_assert_capability' IN definition)=0 THEN RAISE EXCEPTION 'VENUE_TRANSITION_LAYOUT_CHANGED'; END IF;
    definition:=replace(definition,'actor_id := public.venue_assert_capability',
      'PERFORM agenda_private.require_linked_transition(_org_id,_event_id,_transition);' || chr(10) || '  actor_id := public.venue_assert_capability');
    EXECUTE definition;
  END IF;
END $$;

-- Share the existing checklist reconciliation unchanged between normal Venue saves
-- and the private source bridge; completed/waived items and operator notes survive.
CREATE OR REPLACE FUNCTION agenda_private.apply_venue_checklist(
  _org_id uuid,event_row public.venue_events,venue_ids uuid[],actor_id uuid,_idempotency_key uuid,change_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE checklist_template record; obsolete_checklist record; updated_checklist record;
DECLARE start_value timestamptz:=event_row.start_at; end_value timestamptz:=event_row.end_at;
DECLARE event_type_value text:=event_row.event_type; responsible_user_value uuid:=event_row.responsible_user_id;
BEGIN
  FOR checklist_template IN
    SELECT DISTINCT ON (template.title) template.*
    FROM public.venue_checklist_templates template
    WHERE template.org_id = _org_id
      AND template.active
      AND (template.space_id IS NULL OR template.space_id = ANY(venue_ids))
      AND (template.event_type IS NULL OR template.event_type = event_type_value)
    ORDER BY template.title, template.space_id NULLS LAST, template.event_type NULLS LAST
  LOOP
    INSERT INTO public.venue_event_checklist_items AS existing (
      org_id, event_id, template_id, title, responsible_user_id, deadline,
      phase, required, sort_order, created_by, updated_by
    ) VALUES (
      _org_id,
      event_row.id,
      checklist_template.id,
      checklist_template.title,
      responsible_user_value,
      CASE
        WHEN start_value IS NOT NULL AND checklist_template.deadline_offset_hours IS NOT NULL
          THEN (
            CASE
              WHEN checklist_template.phase = 'pos_evento' THEN end_value
              ELSE start_value
            END
          ) + make_interval(hours => checklist_template.deadline_offset_hours)
        ELSE NULL
      END,
      checklist_template.phase,
      checklist_template.required,
      checklist_template.sort_order,
      actor_id,
      actor_id
    ) ON CONFLICT (event_id, template_id) DO UPDATE SET
      phase = EXCLUDED.phase,
      responsible_user_id = coalesce(existing.responsible_user_id, EXCLUDED.responsible_user_id),
      status = CASE WHEN existing.status = 'obsoleto' THEN 'pendente' ELSE existing.status END,
      note = CASE WHEN existing.status = 'obsoleto' THEN NULL ELSE existing.note END,
      completed_at = CASE WHEN existing.status = 'obsoleto' THEN NULL ELSE existing.completed_at END,
      completed_by = CASE WHEN existing.status = 'obsoleto' THEN NULL ELSE existing.completed_by END,
      deadline = CASE
        WHEN existing.status IN ('concluido', 'dispensado')
          THEN existing.deadline
        ELSE EXCLUDED.deadline
      END,
      updated_by = actor_id,
      version = existing.version + 1
    WHERE existing.phase IS DISTINCT FROM EXCLUDED.phase
      OR existing.responsible_user_id IS DISTINCT FROM
        coalesce(existing.responsible_user_id, EXCLUDED.responsible_user_id)
      OR existing.status = 'obsoleto'
      OR existing.deadline IS DISTINCT FROM CASE
        WHEN existing.status IN ('concluido', 'dispensado')
          THEN existing.deadline
        ELSE EXCLUDED.deadline
      END;
  END LOOP;

  FOR obsolete_checklist IN
    SELECT item.*
    FROM public.venue_event_checklist_items item
    WHERE item.event_id = event_row.id
      AND item.template_id IS NOT NULL
      AND item.status NOT IN ('concluido', 'dispensado', 'obsoleto')
      AND NOT EXISTS (
        SELECT 1
        FROM public.venue_checklist_templates template
        WHERE template.id = item.template_id
          AND template.org_id = _org_id
          AND template.active
          AND (template.space_id IS NULL OR template.space_id = ANY(venue_ids))
          AND (template.event_type IS NULL OR template.event_type = event_type_value)
      )
    FOR UPDATE
  LOOP
    UPDATE public.venue_event_checklist_items
    SET
      status = 'obsoleto',
      note = 'Item desativado automaticamente após mudança de espaço ou tipo do evento.',
      completed_at = now(),
      completed_by = actor_id,
      updated_by = actor_id,
      version = version + 1
    WHERE id = obsolete_checklist.id
    RETURNING * INTO updated_checklist;

    PERFORM public.venue_log_audit(
      _org_id,
      'venue_checklist_item',
      obsolete_checklist.id,
      'status_change'::public.audit_action,
      to_jsonb(obsolete_checklist),
      to_jsonb(updated_checklist),
      'checklist_item_obsoleted',
      change_reason,
      _idempotency_key
    );
  END LOOP;

END $$;
REVOKE ALL ON FUNCTION agenda_private.apply_venue_checklist(uuid,public.venue_events,uuid[],uuid,uuid,text) FROM PUBLIC,anon,authenticated;
DO $$
DECLARE definition text; begin_at integer; end_at integer;
BEGIN
  definition:=pg_get_functiondef('public.venue_save_event(uuid,uuid,integer,uuid,jsonb)'::regprocedure);
  IF position('agenda_private.apply_venue_checklist' IN definition)=0 THEN
    begin_at:=position('  FOR checklist_template IN' IN definition);
    end_at:=position('  PERFORM public.venue_refresh_occupancies(event_row.id);' IN substring(definition FROM begin_at));
    IF begin_at=0 OR end_at=0 THEN RAISE EXCEPTION 'VENUE_CHECKLIST_LAYOUT_CHANGED'; END IF;
    end_at:=begin_at+end_at-1;
    definition:=substring(definition FROM 1 FOR begin_at-1)
      || '  PERFORM agenda_private.apply_venue_checklist(_org_id,event_row,venue_ids,actor_id,_idempotency_key,change_reason);' || chr(10)
      || substring(definition FROM end_at);
    EXECUTE definition;
  END IF;
  definition:=pg_get_functiondef('public.venue_save_event(uuid,uuid,integer,uuid,jsonb)'::regprocedure);
  IF position('-- linked resource version refresh' IN definition)=0 THEN
    IF position('  PERFORM agenda_private.apply_venue_checklist(_org_id,event_row,venue_ids,actor_id,_idempotency_key,change_reason);' IN definition)=0 THEN
      RAISE EXCEPTION 'VENUE_CHECKLIST_LAYOUT_CHANGED';
    END IF;
    definition:=replace(definition,
      '  PERFORM agenda_private.apply_venue_checklist(_org_id,event_row,venue_ids,actor_id,_idempotency_key,change_reason);',
      '  -- linked resource version refresh' || chr(10)
      || '  IF event_row.cronograma_source_event_id IS NOT NULL THEN' || chr(10)
      || '    SELECT * INTO event_row FROM public.venue_events WHERE id=event_row.id;' || chr(10)
      || '  END IF;' || chr(10)
      || '  PERFORM agenda_private.apply_venue_checklist(_org_id,event_row,venue_ids,actor_id,_idempotency_key,change_reason);');
    EXECUTE definition;
  END IF;
END $$;

-- Configuration is service/maintenance-only, with a verifiable organization
-- administrator recorded for the explicit UUID assignment. No account lookup,
-- capability grant, fallback validator, or administrative approval override exists.
CREATE OR REPLACE FUNCTION agenda_private.guard_restaurant_config()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'CRONOGRAMA_RESTAURANT_CONFIG_ORG_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.org_members m WHERE m.org_id=NEW.org_id
    AND m.user_id=NEW.configured_by AND m.is_active AND m.role='admin') THEN
    RAISE EXCEPTION 'CRONOGRAMA_RESTAURANT_CONFIG_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  NEW.configured_at:=now();
  NEW.revision:=CASE WHEN TG_OP='INSERT' THEN 1 ELSE OLD.revision+1 END;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION agenda_private.audit_restaurant_config()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP<>'DELETE' AND NEW.enabled THEN PERFORM agenda_private.require_restaurant_config(NEW.org_id); END IF;
  PERFORM public.venue_log_audit(CASE WHEN TG_OP='DELETE' THEN OLD.org_id ELSE NEW.org_id END,
    'cronograma_restaurant_config',CASE WHEN TG_OP='DELETE' THEN OLD.org_id ELSE NEW.org_id END,
    CASE WHEN TG_OP='INSERT' THEN 'create'::public.audit_action WHEN TG_OP='DELETE' THEN 'delete'::public.audit_action ELSE 'update'::public.audit_action END,
    CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END,'restaurant_forwarding_configuration',
    'Atribuição explícita por manutenção autorizada',NULL);
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS cronograma_restaurant_config_guard ON agenda_private.cronograma_restaurant_config;
CREATE TRIGGER cronograma_restaurant_config_guard BEFORE INSERT OR UPDATE ON agenda_private.cronograma_restaurant_config
  FOR EACH ROW EXECUTE FUNCTION agenda_private.guard_restaurant_config();
DROP TRIGGER IF EXISTS cronograma_restaurant_config_audit ON agenda_private.cronograma_restaurant_config;
CREATE TRIGGER cronograma_restaurant_config_audit AFTER INSERT OR UPDATE OR DELETE ON agenda_private.cronograma_restaurant_config
  FOR EACH ROW EXECUTE FUNCTION agenda_private.audit_restaurant_config();
REVOKE ALL ON FUNCTION agenda_private.guard_restaurant_config() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION agenda_private.audit_restaurant_config() FROM PUBLIC,anon,authenticated;
