CREATE OR REPLACE FUNCTION public.cronograma_member_org_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT org_id FROM public.org_members WHERE user_id=auth.uid() AND is_active;
$$;
CREATE OR REPLACE FUNCTION public.cronograma_planning_org_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT org_id FROM public.cronograma_planning_viewers WHERE user_id=auth.uid()
   AND org_id IN (SELECT public.cronograma_member_org_ids());
$$;
-- Institutional agendas share canonical events. No event/document data is rewritten.
-- All exposed authorization functions derive the actor from auth.uid(); no global grants.
CREATE OR REPLACE FUNCTION public.cronograma_writer_org_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT m.org_id FROM public.org_members m
  WHERE m.user_id=auth.uid() AND m.is_active
    AND (m.role IN ('admin','gestor','operador') OR public.has_capability(auth.uid(),m.org_id,'cronograma_eventos_write'));
$$;

CREATE OR REPLACE FUNCTION public.cronograma_managed_commission_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH memberships AS MATERIALIZED (
    SELECT m.org_id,m.role FROM public.org_members m WHERE m.user_id=auth.uid() AND m.is_active
  ), institutional AS MATERIALIZED (
    SELECT r.commission_id,r.relationship_role FROM public.commission_responsibles r
    JOIN public.commission_people p ON p.id=r.person_id AND p.org_id=r.org_id
    WHERE r.active AND p.user_id=auth.uid() AND r.responsible_type='pessoa'
  )
  SELECT c.id FROM public.commissions c JOIN memberships m ON m.org_id=c.org_id
  WHERE c.is_active AND (c.org_id IN (SELECT public.cronograma_writer_org_ids())
    OR EXISTS (SELECT 1 FROM institutional i WHERE i.commission_id=c.id
      AND (i.relationship_role IN ('principal','corresponsavel','copresidente') OR m.role<>'leitura')));
$$;

-- Retain the older API for documents/origin validation, without trusting a caller-supplied identity.
CREATE OR REPLACE FUNCTION public.cronograma_unit_can_manage(_user_id uuid,_commission_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT _user_id=auth.uid() AND _commission_id IN (SELECT public.cronograma_managed_commission_ids());
$$;

CREATE OR REPLACE FUNCTION public.cronograma_visible_event_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH me AS (SELECT auth.uid() uid), orgs AS MATERIALIZED (
    SELECT m.org_id,m.role FROM public.org_members m,me WHERE m.user_id=me.uid AND m.is_active
  ), flags AS MATERIALIZED (
    SELECT o.org_id,public.cronograma_can_view_planning(me.uid,o.org_id) can_plan,
      (o.role IN ('admin','gestor','operador') AND NOT public.has_capability(me.uid,o.org_id,'restricted_scope')) broad,
      NOT public.has_scoped_cronograma_access(me.uid,o.org_id) unscoped FROM orgs o,me
  ), member_units AS MATERIALIZED (
    SELECT r.commission_id FROM public.commission_responsibles r
    JOIN public.commission_people p ON p.id=r.person_id AND p.org_id=r.org_id
    JOIN public.commissions c ON c.id=r.commission_id AND c.org_id=r.org_id
    WHERE p.user_id=auth.uid() AND r.active AND c.is_active
  ), related AS MATERIALIZED (
    SELECT l.event_id FROM public.cronograma_evento_comissoes l WHERE l.commission_id IN (SELECT commission_id FROM member_units)
    UNION SELECT r.event_id FROM public.cronograma_evento_responsaveis r
      WHERE r.org_member_user_id=auth.uid() AND r.responsible_type='member'
    UNION SELECT e.id FROM public.cronograma_eventos e JOIN public.cronograma_location_watchers w
      ON w.org_id=e.org_id AND w.location_code=e.location_code WHERE w.user_id=auth.uid()
  )
  SELECT e.id FROM public.cronograma_eventos e JOIN flags f ON f.org_id=e.org_id
  WHERE (NOT e.planning_restricted OR f.can_plan)
    AND (f.broad OR f.unscoped OR e.created_by_user_id=auth.uid() OR e.id IN (SELECT event_id FROM related));
$$;

CREATE OR REPLACE FUNCTION public.cronograma_writable_event_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH managed AS MATERIALIZED (SELECT public.cronograma_managed_commission_ids() id),
  related AS MATERIALIZED (
    SELECT l.event_id FROM public.cronograma_evento_comissoes l WHERE l.commission_id IN (SELECT id FROM managed)
  )
  SELECT e.id FROM public.cronograma_eventos e
  WHERE e.id IN (SELECT public.cronograma_visible_event_ids())
    AND (e.org_id IN (SELECT public.cronograma_writer_org_ids())
      OR e.origin_commission_id IN (SELECT id FROM managed) OR e.id IN (SELECT event_id FROM related));
$$;

CREATE OR REPLACE FUNCTION public.cronograma_unit_event_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.cronograma_writable_event_ids();
$$;

-- Central create remains a global privilege. Scoped users must supply their real origin.
CREATE OR REPLACE FUNCTION agenda_private.require_event_writer(_payload jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=nullif(_payload->>'org_id','')::uuid; source public.cronograma_eventos;
DECLARE origin uuid:=nullif(_payload->>'origin_commission_id','')::uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(auth.uid(),org) THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO source FROM public.cronograma_eventos e WHERE e.org_id=org
    AND (e.id=nullif(_payload->>'id','')::uuid OR (_payload->>'id' IS NULL AND e.source_key=_payload->>'source_key'));
  IF source.id IS NOT NULL THEN
    IF source.id NOT IN (SELECT public.cronograma_writable_event_ids()) THEN
      RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED' USING ERRCODE='42501';
    END IF;
  ELSIF _payload->>'id' IS NOT NULL THEN
    RAISE EXCEPTION 'CRONOGRAMA_NOT_FOUND' USING ERRCODE='P0001';
  ELSIF origin IS NOT NULL THEN
    PERFORM agenda_private.validate_unit_origin(_payload,org);
  ELSIF org NOT IN (SELECT public.cronograma_writer_org_ids()) THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: criação exige a unidade proprietária' USING ERRCODE='42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION agenda_private.validate_event_selection(_payload jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=nullif(_payload->>'org_id','')::uuid; item jsonb; c public.commissions; source public.cronograma_eventos;
DECLARE principal uuid; expected_owner uuid; seen uuid[]:='{}'; person uuid; linked_user uuid;
BEGIN
  SELECT * INTO source FROM public.cronograma_eventos e WHERE e.org_id=org
    AND (e.id=nullif(_payload->>'id','')::uuid OR (_payload->>'id' IS NULL AND e.source_key=_payload->>'source_key'));
  IF (_payload ? 'title' AND length(btrim(coalesce(_payload->>'title','')))<3)
    OR (source.id IS NULL AND nullif(_payload->>'title','') IS NULL)
    OR (nullif(_payload->>'end_date','')::date < nullif(_payload->>'start_date','')::date)
    OR (coalesce(nullif(_payload->>'end_date',''),_payload->>'start_date')=_payload->>'start_date'
      AND nullif(_payload->>'end_time','')::time < nullif(_payload->>'start_time','')::time) THEN
    RAISE EXCEPTION 'CRONOGRAMA_VALIDATION_ERROR: título ou período inválido' USING ERRCODE='22023';
  END IF;
  IF source.id IS NOT NULL AND (_payload ? 'origin_commission_id')
    AND nullif(_payload->>'origin_commission_id','')::uuid IS DISTINCT FROM source.origin_commission_id THEN
    RAISE EXCEPTION 'CRONOGRAMA_ORIGIN_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  expected_owner:=coalesce(source.origin_commission_id,nullif(_payload->>'origin_commission_id','')::uuid);
  IF _payload ? 'commissions' THEN
    IF jsonb_typeof(_payload->'commissions')<>'array' THEN RAISE EXCEPTION 'CRONOGRAMA_RELATIONSHIP_INVALID'; END IF;
    FOR item IN SELECT * FROM jsonb_array_elements(_payload->'commissions') LOOP
      SELECT * INTO c FROM public.commissions WHERE org_id=org AND
        (id=nullif(item->>'commission_id','')::uuid OR (nullif(item->>'commission_id','') IS NULL AND slug=item->>'commission_slug'));
      IF c.id IS NULL OR c.id=ANY(seen) OR (NOT c.is_active AND NOT EXISTS(
        SELECT 1 FROM public.cronograma_evento_comissoes l WHERE l.event_id=source.id AND l.commission_id=c.id)) THEN
        RAISE EXCEPTION 'CRONOGRAMA_RELATIONSHIP_INVALID: unidade inválida ou repetida' USING ERRCODE='22023';
      END IF;
      seen:=array_append(seen,c.id);
      IF item->>'relation_role'='principal' THEN
        IF principal IS NOT NULL THEN RAISE EXCEPTION 'CRONOGRAMA_RELATIONSHIP_INVALID: mais de uma unidade principal'; END IF;
        principal:=c.id;
      END IF;
    END LOOP;
    IF expected_owner IS NOT NULL AND principal IS DISTINCT FROM expected_owner THEN
      RAISE EXCEPTION 'CRONOGRAMA_ORIGIN_IMMUTABLE: preserve a unidade proprietária' USING ERRCODE='42501';
    END IF;
  END IF;
  IF expected_owner IS NOT NULL AND (_payload ? 'commission_slug') AND _payload->>'commission_slug' IS DISTINCT FROM
    (SELECT slug FROM public.commissions WHERE id=expected_owner AND org_id=org) THEN
    RAISE EXCEPTION 'CRONOGRAMA_ORIGIN_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  seen:='{}';
  IF _payload ? 'responsibles' THEN
    IF jsonb_typeof(_payload->'responsibles')<>'array' THEN RAISE EXCEPTION 'CRONOGRAMA_RELATIONSHIP_INVALID'; END IF;
    FOR item IN SELECT * FROM jsonb_array_elements(_payload->'responsibles') LOOP
      person:=nullif(item->>'person_id','')::uuid; linked_user:=nullif(item->>'user_id','')::uuid;
      IF person IS NOT NULL THEN
        IF person=ANY(seen) OR NOT EXISTS(SELECT 1 FROM public.commission_people p WHERE p.id=person AND p.org_id=org) THEN
          RAISE EXCEPTION 'CRONOGRAMA_RELATIONSHIP_INVALID: pessoa inválida ou repetida' USING ERRCODE='22023';
        END IF;
        seen:=array_append(seen,person);
      ELSIF linked_user IS NOT NULL THEN
        IF linked_user=ANY(seen) OR NOT EXISTS(SELECT 1 FROM public.org_members m WHERE m.org_id=org AND m.user_id=linked_user AND m.is_active) THEN
          RAISE EXCEPTION 'CRONOGRAMA_RELATIONSHIP_INVALID: conta sem vínculo ativo' USING ERRCODE='22023';
        END IF;
        seen:=array_append(seen,linked_user);
      ELSIF nullif(btrim(item->>'name'),'') IS NULL THEN
        RAISE EXCEPTION 'CRONOGRAMA_RELATIONSHIP_INVALID: convidado sem identificação' USING ERRCODE='22023';
      END IF;
    END LOOP;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cronograma_agenda_permissions(_org_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'global_write',_org_id IN (SELECT public.cronograma_writer_org_ids()),
    'managed_commission_ids',coalesce((SELECT jsonb_agg(c.id) FROM public.commissions c WHERE c.org_id=_org_id
      AND c.id IN (SELECT public.cronograma_managed_commission_ids())),'[]'::jsonb),
    'writable_event_ids',coalesce((SELECT jsonb_agg(e.id) FROM public.cronograma_eventos e WHERE e.org_id=_org_id
      AND e.id IN (SELECT public.cronograma_writable_event_ids())),'[]'::jsonb),
    'deletable_event_ids',coalesce((SELECT jsonb_agg(e.id) FROM public.cronograma_eventos e WHERE e.org_id=_org_id
      AND e.id IN (SELECT public.cronograma_visible_event_ids()) AND public.is_org_member(auth.uid(),_org_id)
      AND (public.get_user_org_role(auth.uid(),_org_id) IN ('admin','gestor')
        OR public.has_capability(auth.uid(),_org_id,'cronograma_eventos_write'))),'[]'::jsonb));
$$;

-- Remove permissive relationship policies that allowed adding one's own unit to an unrelated event.
DROP POLICY IF EXISTS cronograma_evento_comissoes_unit_write ON public.cronograma_evento_comissoes;
DROP POLICY IF EXISTS cronograma_evento_responsaveis_unit_write ON public.cronograma_evento_responsaveis;
ALTER POLICY cronograma_evento_comissoes_write ON public.cronograma_evento_comissoes
  USING(event_id IN (SELECT public.cronograma_writable_event_ids()))
  WITH CHECK(event_id IN (SELECT public.cronograma_writable_event_ids()));
ALTER POLICY cronograma_evento_responsaveis_write ON public.cronograma_evento_responsaveis
  USING(event_id IN (SELECT public.cronograma_writable_event_ids()))
  WITH CHECK(event_id IN (SELECT public.cronograma_writable_event_ids()));
ALTER POLICY cronograma_evento_logs_insert ON public.cronograma_evento_logs
  WITH CHECK(event_id IN (SELECT public.cronograma_writable_event_ids()) AND user_id=auth.uid());
ALTER POLICY cronograma_evento_logs_select ON public.cronograma_evento_logs
  USING(event_id IN (SELECT public.cronograma_writable_event_ids()));
ALTER POLICY cronograma_eventos_insert ON public.cronograma_eventos WITH CHECK (
  created_by_user_id=auth.uid() AND org_id IN (SELECT public.cronograma_member_org_ids())
  AND (org_id IN (SELECT public.cronograma_writer_org_ids()) OR origin_commission_id IN (SELECT public.cronograma_managed_commission_ids()))
);
ALTER POLICY cronograma_eventos_update ON public.cronograma_eventos
  USING(id IN (SELECT public.cronograma_writable_event_ids()))
  WITH CHECK(id IN (SELECT public.cronograma_writable_event_ids()));
-- Own-row branch is essential for INSERT ... RETURNING (set evaluation predates insertion).
ALTER POLICY cronograma_eventos_select ON public.cronograma_eventos USING (
  (created_by_user_id=auth.uid() AND org_id IN (SELECT public.cronograma_member_org_ids())
    AND (NOT planning_restricted OR org_id IN (SELECT public.cronograma_planning_org_ids())))
  OR id IN (SELECT public.cronograma_visible_event_ids())
);

-- Guard direct unit writes as well as the RPC, while preserving legacy central import paths.
CREATE OR REPLACE FUNCTION agenda_private.guard_institutional_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE origin uuid; eid uuid; organization uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_TABLE_NAME='cronograma_eventos' THEN
    origin:=NEW.origin_commission_id; eid:=NEW.id; organization:=NEW.org_id;
    IF TG_OP='UPDATE' AND (NEW.origin_commission_id IS DISTINCT FROM OLD.origin_commission_id
      OR NEW.origin_source IS DISTINCT FROM OLD.origin_source
      OR (OLD.origin_commission_id IS NOT NULL AND NEW.commission_slug IS DISTINCT FROM OLD.commission_slug)) THEN
      RAISE EXCEPTION 'CRONOGRAMA_ORIGIN_IMMUTABLE' USING ERRCODE='42501';
    END IF;
  ELSE
    eid:=CASE WHEN TG_OP='DELETE' THEN OLD.event_id ELSE NEW.event_id END;
    SELECT e.origin_commission_id,e.org_id INTO origin,organization FROM public.cronograma_eventos e WHERE e.id=eid;
  END IF;
  IF origin IS NOT NULL AND NOT EXISTS(SELECT 1 FROM agenda_private.cronograma_source_write_context c
    WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.org_id=organization
      AND (c.source_event_id=eid OR (TG_TABLE_NAME='cronograma_eventos' AND TG_OP='INSERT')
        OR c.source_key=(SELECT source_key FROM public.cronograma_eventos WHERE id=eid))) THEN
    RAISE EXCEPTION 'CRONOGRAMA_VALIDATION_ERROR: use cronograma_save_event para preservar os vínculos' USING ERRCODE='42501';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS agenda_institutional_event_guard ON public.cronograma_eventos;
CREATE TRIGGER agenda_institutional_event_guard BEFORE INSERT OR UPDATE ON public.cronograma_eventos
  FOR EACH ROW EXECUTE FUNCTION agenda_private.guard_institutional_event();
DROP TRIGGER IF EXISTS agenda_institutional_links_guard ON public.cronograma_evento_comissoes;
CREATE TRIGGER agenda_institutional_links_guard BEFORE INSERT OR UPDATE OR DELETE ON public.cronograma_evento_comissoes
  FOR EACH ROW EXECUTE FUNCTION agenda_private.guard_institutional_event();

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
  v_previous_relations jsonb;
BEGIN
  v_id := NULLIF(payload->>'id','')::uuid;
  v_org := NULLIF(payload->>'org_id','')::uuid;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'CRONOGRAMA_VALIDATION_ERROR: org_id obrigatório' USING ERRCODE='P0001';
  END IF;
  PERFORM agenda_private.require_event_writer(payload);
  PERFORM agenda_private.validate_event_selection(payload);
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

  IF v_action='update' THEN
    SELECT jsonb_build_object(
      'commissions',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]'::jsonb) FROM public.cronograma_evento_comissoes l WHERE l.event_id=v_id),
      'responsibles',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) FROM public.cronograma_evento_responsaveis r WHERE r.event_id=v_id)
    ) INTO v_previous_relations;
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
    CASE WHEN v_action = 'update' THEN to_jsonb(v_prev)||v_previous_relations ELSE NULL END,
    to_jsonb(v_row)||jsonb_build_object(
      'commissions',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]'::jsonb) FROM public.cronograma_evento_comissoes l WHERE l.event_id=v_id),
      'responsibles',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) FROM public.cronograma_evento_responsaveis r WHERE r.event_id=v_id)
    ), v_request);

  RETURN agenda_private.cronograma_finish_save(payload, expected_lock_version, v_id, v_action);
END $function$
;

CREATE OR REPLACE FUNCTION agenda_private.cronograma_begin_save(_payload jsonb, _expected bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE org uuid := nullif(_payload->>'org_id','')::uuid;
DECLARE replay jsonb;
DECLARE source public.cronograma_eventos;
BEGIN
  PERFORM agenda_private.require_event_writer(_payload);
  PERFORM agenda_private.validate_event_selection(_payload);
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
END $function$
;

CREATE OR REPLACE FUNCTION agenda_private.cronograma_finish_save(_payload jsonb, _expected bigint, _event_id uuid, _action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE source public.cronograma_eventos; link agenda_private.cronograma_restaurant_links; venue public.venue_events; result jsonb;
BEGIN
  SELECT * INTO source FROM public.cronograma_eventos WHERE id = _event_id AND org_id = nullif(_payload->>'org_id','')::uuid;
  PERFORM agenda_private.require_event_writer(_payload);
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
END $function$
;

CREATE OR REPLACE FUNCTION public._cronograma_apply_event_responsibles(_event_id uuid, _org_id uuid, _items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE item jsonb; v_id uuid; v_person uuid; v_user uuid; v_name text; keep_ids uuid[]:='{}';
BEGIN
 IF _items IS NULL THEN RETURN; END IF;
 PERFORM agenda_private.require_event_writer(jsonb_build_object('org_id',_org_id,'id',_event_id));
 PERFORM agenda_private.validate_event_selection(jsonb_build_object('org_id',_org_id,'id',_event_id,'responsibles',_items));
 IF jsonb_typeof(_items)<>'array' OR jsonb_array_length(_items)>500 THEN RAISE EXCEPTION 'Lista de convidados inválida.'; END IF;
 UPDATE public.cronograma_evento_responsaveis SET is_primary=false WHERE event_id=_event_id AND is_primary;
 FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
  v_person:=nullif(item->>'person_id','')::uuid;
  v_user:=nullif(item->>'user_id','')::uuid;
  v_name:=item->>'name';
  v_id:=NULL;
  IF v_person IS NOT NULL THEN
   SELECT display_name INTO v_name FROM public.commission_people WHERE id=v_person AND org_id=_org_id;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Pessoa indisponível.'; END IF;
   -- Only the persisted, verified account relationship can enable personal access.
   SELECT p.user_id INTO v_user FROM public.commission_people p
     JOIN public.org_members m ON m.user_id=p.user_id AND m.org_id=p.org_id AND m.is_active
     WHERE p.id=v_person AND p.org_id=_org_id;
   SELECT id INTO v_id FROM public.cronograma_evento_responsaveis WHERE event_id=_event_id AND person_id=v_person LIMIT 1;
   IF v_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.commission_responsibles r JOIN public.commissions c ON c.id=r.commission_id
      WHERE r.person_id=v_person AND r.org_id=_org_id AND r.active AND c.is_active) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Pessoa inativa para novos convites.';
   END IF;
  ELSIF v_user IS NOT NULL THEN
   SELECT id INTO v_id FROM public.cronograma_evento_responsaveis WHERE event_id=_event_id AND org_member_user_id=v_user LIMIT 1;
  ELSE
   -- Preserve existing free-text history; new institutional selections always have person_id.
   SELECT id INTO v_id FROM public.cronograma_evento_responsaveis WHERE event_id=_event_id AND person_id IS NULL AND org_member_user_id IS NULL AND name_snapshot=v_name AND NOT(id=ANY(keep_ids)) LIMIT 1;
  END IF;
  IF v_id IS NULL THEN
   INSERT INTO public.cronograma_evento_responsaveis(event_id,org_id,person_id,org_member_user_id,name_snapshot,role,is_primary,responsible_type)
   VALUES(_event_id,_org_id,v_person,v_user,v_name,item->>'role',coalesce((item->>'is_primary')::boolean,false),CASE WHEN v_user IS NULL THEN 'external' ELSE 'member' END)
   RETURNING id INTO v_id;
  ELSE
   -- Do not remove the verified user_id of a historic link, and do not re-send assignment notifications.
   UPDATE public.cronograma_evento_responsaveis SET person_id=coalesce(v_person,person_id),name_snapshot=v_name,role=item->>'role',
    is_primary=coalesce((item->>'is_primary')::boolean,false),
    org_member_user_id=CASE WHEN v_person IS NOT NULL THEN v_user ELSE org_member_user_id END,
    responsible_type=CASE WHEN coalesce(v_user,org_member_user_id) IS NULL THEN 'external' ELSE 'member' END,
    updated_at=now() WHERE id=v_id;
  END IF;
  keep_ids:=array_append(keep_ids,v_id);
 END LOOP;
 DELETE FROM public.cronograma_evento_responsaveis WHERE event_id=_event_id AND NOT(id=ANY(keep_ids));
END; $function$
;

CREATE OR REPLACE FUNCTION public._cronograma_apply_event_commissions(_event_id uuid, _org_id uuid, _items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE item jsonb; resolved_ids uuid[] := '{}';
BEGIN
  IF _items IS NULL THEN RETURN; END IF;
  PERFORM agenda_private.require_event_writer(jsonb_build_object('org_id',_org_id,'id',_event_id));
  PERFORM agenda_private.validate_event_selection(jsonb_build_object('org_id',_org_id,'id',_event_id,'commissions',_items));

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF (item->>'commission_id') IS NULL AND (item->>'commission_slug') IS NOT NULL THEN
      item := item || jsonb_build_object('commission_id',
        (SELECT id FROM public.commissions WHERE org_id = _org_id AND slug = item->>'commission_slug' LIMIT 1)
      );
    END IF;

    IF (item->>'commission_id') IS NULL THEN
      RAISE EXCEPTION 'CRONOGRAMA_RELATIONSHIP_INVALID: comissão % não encontrada', item->>'commission_slug'
        USING ERRCODE='P0001';
    END IF;

    INSERT INTO public.cronograma_evento_comissoes
      (event_id, org_id, commission_id, commission_slug, commission_name_snapshot, relation_role)
    VALUES (
      _event_id, _org_id,
      (item->>'commission_id')::uuid,
      (SELECT slug FROM public.commissions WHERE id=(item->>'commission_id')::uuid AND org_id=_org_id),
      (SELECT nome FROM public.commissions WHERE id=(item->>'commission_id')::uuid AND org_id=_org_id),
      COALESCE(item->>'relation_role', 'participante')
    )
    ON CONFLICT (event_id, commission_id) DO UPDATE
      SET commission_slug = EXCLUDED.commission_slug,
          commission_name_snapshot = EXCLUDED.commission_name_snapshot,
          relation_role = EXCLUDED.relation_role,
          updated_at = now();

    resolved_ids := array_append(resolved_ids, (item->>'commission_id')::uuid);
  END LOOP;

  DELETE FROM public.cronograma_evento_comissoes
   WHERE event_id = _event_id
     AND (resolved_ids = '{}' OR NOT (commission_id = ANY (resolved_ids)));
END $function$
;

CREATE OR REPLACE FUNCTION agenda_private.sync_restaurant_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    OR NOT EXISTS(SELECT 1 FROM agenda_private.cronograma_source_write_context c
      WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.org_id=source.org_id)
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
END $function$
;

REVOKE ALL ON FUNCTION public.cronograma_member_org_ids(), public.cronograma_planning_org_ids(), public.cronograma_writer_org_ids(), public.cronograma_agenda_permissions(uuid),
  agenda_private.require_event_writer(jsonb), agenda_private.validate_event_selection(jsonb),
  agenda_private.guard_institutional_event() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cronograma_member_org_ids(),public.cronograma_planning_org_ids(),public.cronograma_writer_org_ids(),public.cronograma_agenda_permissions(uuid),
  agenda_private.require_event_writer(jsonb),agenda_private.validate_event_selection(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';

-- Validate the final transaction state, never the temporary state while replacing links.
CREATE OR REPLACE FUNCTION agenda_private.check_institutional_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE eid uuid; e public.cronograma_eventos;
BEGIN
 IF TG_TABLE_NAME='cronograma_eventos' THEN eid:=NEW.id;
 ELSE eid:=CASE WHEN TG_OP='DELETE' THEN OLD.event_id ELSE NEW.event_id END; END IF;
 SELECT * INTO e FROM public.cronograma_eventos WHERE id=eid;
 IF e.origin_commission_id IS NOT NULL AND (
   e.origin_source<>'unidade' OR NOT EXISTS(SELECT 1 FROM public.commissions c WHERE c.id=e.origin_commission_id AND c.org_id=e.org_id AND c.slug=e.commission_slug)
   OR (SELECT count(*) FROM public.cronograma_evento_comissoes l WHERE l.event_id=e.id AND l.relation_role='principal')<>1
   OR NOT EXISTS(SELECT 1 FROM public.cronograma_evento_comissoes l WHERE l.event_id=e.id AND l.commission_id=e.origin_commission_id AND l.relation_role='principal')
 ) THEN RAISE EXCEPTION 'CRONOGRAMA_ORIGIN_IMMUTABLE: vínculo principal obrigatório' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION agenda_private.check_institutional_owner() FROM PUBLIC,anon;
CREATE CONSTRAINT TRIGGER agenda_institutional_owner_event AFTER INSERT OR UPDATE ON public.cronograma_eventos
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION agenda_private.check_institutional_owner();
CREATE CONSTRAINT TRIGGER agenda_institutional_owner_links AFTER INSERT OR UPDATE OR DELETE ON public.cronograma_evento_comissoes
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION agenda_private.check_institutional_owner();

REVOKE ALL ON FUNCTION public.cronograma_save_event(jsonb,bigint),
 public._cronograma_apply_event_commissions(uuid,uuid,jsonb),public._cronograma_apply_event_responsibles(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cronograma_save_event(jsonb,bigint),
 public._cronograma_apply_event_commissions(uuid,uuid,jsonb),public._cronograma_apply_event_responsibles(uuid,uuid,jsonb) TO authenticated;
DROP TRIGGER IF EXISTS agenda_institutional_people_guard ON public.cronograma_evento_responsaveis;
CREATE TRIGGER agenda_institutional_people_guard BEFORE INSERT OR UPDATE OR DELETE ON public.cronograma_evento_responsaveis
 FOR EACH ROW EXECUTE FUNCTION agenda_private.guard_institutional_event();

CREATE OR REPLACE FUNCTION public.cronograma_scoped_event_visible(_event_id uuid,_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.cronograma_evento_responsaveis r
   WHERE r.event_id=_event_id AND r.org_member_user_id=_user_id AND r.responsible_type='member')
 OR EXISTS(SELECT 1 FROM public.cronograma_evento_comissoes l
   JOIN public.commission_responsibles r ON r.commission_id=l.commission_id AND r.org_id=l.org_id AND r.active
   JOIN public.commission_people p ON p.id=r.person_id AND p.org_id=r.org_id
   JOIN public.commissions c ON c.id=r.commission_id AND c.org_id=r.org_id AND c.is_active
   WHERE l.event_id=_event_id AND p.user_id=_user_id)
 OR public.cronograma_location_watcher(_user_id,_event_id);
$$;
