-- Fenasoja phase 2. Additive; business RPCs/policies/triggers/grants are unchanged.
-- Only these already-definer RPCs may be called: new note, reservation, negotiation.
-- Lovable apply note: the blanket REVOKE on all workers_private functions was removed (platform rule);
-- the workers_private schema itself stays closed to PUBLIC/anon/authenticated (no USAGE).
CREATE SCHEMA IF NOT EXISTS workers_private;
REVOKE ALL ON SCHEMA workers_private FROM PUBLIC, anon, authenticated;

CREATE FUNCTION workers_private.redact_text(_text text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = pg_catalog,workers_private,pg_temp AS $$
DECLARE result text := coalesce(_text,'');
BEGIN
  result := regexp_replace(result,'\m[0-9]{2}\.?[0-9]{3}\.?[0-9]{3}/?[0-9]{4}-?[0-9]{2}\M','[documento protegido]','g');
  result := regexp_replace(result,'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}','[segredo protegido]','g');
  -- Whole identifiers/tokens must be removed before the older phone matcher can
  -- partially replace their digit sequences and make them unrecognizable.
  result := public.ai_workers_redact_text(result);
  result := regexp_replace(result,'[[:cntrl:]]',' ','g');
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION workers_private.redact_text(text) FROM PUBLIC,anon,authenticated;

CREATE TABLE public.ai_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  worker_id text NOT NULL CHECK (worker_id IN ('arena','mapa')),
  kind text NOT NULL CHECK (kind IN ('arena_note','commercial_reserve','commercial_negotiate')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','executed','cancelled','expired','failed')),
  target_id uuid NOT NULL,
  target jsonb NOT NULL,
  summary text NOT NULL,
  diff jsonb NOT NULL CHECK (jsonb_typeof(diff) = 'array'),
  manual_input_state text NOT NULL CHECK (manual_input_state IN ('notRequired','required','complete')),
  receipt jsonb,
  failure jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '15 minutes'),
  FOREIGN KEY (conversation_id,org_id,user_id) REFERENCES public.ai_conversations(id,org_id,user_id),
  UNIQUE (id,org_id,user_id),
  CHECK ((kind = 'arena_note' AND worker_id = 'arena' AND manual_input_state = 'notRequired') OR
    (kind <> 'arena_note' AND worker_id = 'mapa' AND manual_input_state IN ('required','complete'))),
  CHECK ((status = 'executed') = (receipt IS NOT NULL))
);
REVOKE ALL ON public.ai_actions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_actions TO authenticated;
ALTER TABLE public.ai_actions ENABLE ROW LEVEL SECURITY;
CREATE INDEX ai_actions_owner_idx ON public.ai_actions(user_id,org_id,created_at DESC);
CREATE INDEX ai_actions_pending_idx ON public.ai_actions(expires_at) WHERE status = 'proposed';

CREATE TABLE public.ai_action_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL,
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  event text NOT NULL CHECK (event IN ('proposed','edited','manual_completed','confirmed','executed','cancelled','expired','failed','snapshot_changed')),
  code text CHECK (code IS NULL OR code IN ('execution_failed','snapshot_changed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (action_id,org_id,user_id) REFERENCES public.ai_actions(id,org_id,user_id)
);
REVOKE ALL ON public.ai_action_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_action_events TO authenticated;
ALTER TABLE public.ai_action_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX ai_action_events_action_idx ON public.ai_action_events(action_id,created_at,id);

CREATE TABLE workers_private.ai_action_payloads (
  action_id uuid PRIMARY KEY REFERENCES public.ai_actions(id),
  input jsonb,
  manual_input jsonb,
  snapshot jsonb NOT NULL,
  idempotency_key uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()
);
REVOKE ALL ON workers_private.ai_action_payloads FROM PUBLIC, anon, authenticated;
ALTER TABLE workers_private.ai_action_payloads ENABLE ROW LEVEL SECURITY;

CREATE TABLE workers_private.ai_action_requests (
  user_id uuid NOT NULL,
  request_id uuid NOT NULL,
  org_id uuid NOT NULL,
  action_id uuid NOT NULL REFERENCES public.ai_actions(id),
  request_hash text NOT NULL,
  PRIMARY KEY (user_id,request_id)
);
REVOKE ALL ON workers_private.ai_action_requests FROM PUBLIC, anon, authenticated;
ALTER TABLE workers_private.ai_action_requests ENABLE ROW LEVEL SECURITY;

-- Private functions intentionally have no client grants, even over direct SQL.
CREATE FUNCTION workers_private.action_actor(_org_id uuid,_lock boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,workers_private,pg_temp AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF _lock THEN
    PERFORM 1 FROM public.org_members WHERE org_id=_org_id AND user_id=actor AND is_active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501'; END IF;
    PERFORM 1 FROM public.user_capabilities WHERE org_id=_org_id AND user_id=actor ORDER BY capability FOR SHARE;
  ELSIF NOT public.is_org_member(actor,_org_id) THEN
    RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  RETURN actor;
END $$;

CREATE FUNCTION workers_private.action_allowed(_org_id uuid,_kind text,_target_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,workers_private,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.is_org_member(auth.uid(),_org_id) THEN RETURN false; END IF;
  IF _kind='arena_note' THEN
    RETURN public.venue_has_capability(_org_id,'venue_events_access')
      AND public.venue_has_capability(_org_id,'venue_events_manage')
      AND public.venue_can_view_event(_org_id,_target_id);
  ELSIF _kind IN ('commercial_reserve','commercial_negotiate') THEN
    IF NOT public.can_view_commercial_map(_org_id) OR NOT public.map_has_explicit_capability(_org_id,'map.manage_sales') THEN RETURN false; END IF;
    RETURN EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id=l.project_id
      JOIN public.map_entities e ON e.id=l.entity_id AND e.project_id=p.id
      WHERE l.id=_target_id AND p.org_id=_org_id AND NOT p.is_archived AND NOT e.is_archived AND l.archived_at IS NULL);
  END IF;
  RETURN false;
END $$;

CREATE FUNCTION workers_private.action_input(_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,workers_private,pg_temp AS $$
DECLARE kind text := _input->>'kind'; body text; target uuid;
BEGIN
  IF jsonb_typeof(_input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  IF kind='arena_note' THEN
    IF (_input - ARRAY['kind','eventId','body']) <> '{}'::jsonb OR NOT (_input ?& ARRAY['kind','eventId','body'])
      OR jsonb_typeof(_input->'body') <> 'string' THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023'; END IF;
    target := (_input->>'eventId')::uuid;
    body := btrim(_input->>'body');
    IF char_length(body) NOT BETWEEN 2 AND 2000 OR workers_private.redact_text(body) IS DISTINCT FROM body THEN
      RAISE EXCEPTION 'WORKERS_ACTION_SENSITIVE_TEXT' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('kind',kind,'eventId',target,'body',body);
  ELSIF kind IN ('commercial_reserve','commercial_negotiate') THEN
    IF (_input - ARRAY['kind','lotId']) <> '{}'::jsonb OR NOT (_input ?& ARRAY['kind','lotId']) THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023'; END IF;
    target := (_input->>'lotId')::uuid;
    IF target IS NULL THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('kind',kind,'lotId',target);
  END IF;
  RAISE EXCEPTION 'WORKERS_ACTION_NOT_ALLOWED' USING ERRCODE='22023';
END $$;

CREATE FUNCTION workers_private.action_venue_href(_org_id uuid,_event_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog,workers_private,pg_temp AS $$
  WITH RECURSIVE ancestry AS (
    SELECT s.id,s.parent_space_id,s.type,ARRAY[s.id] visited
    FROM public.venue_event_spaces a JOIN public.venue_spaces s ON s.id=a.space_id AND s.org_id=a.org_id
    WHERE a.org_id=_org_id AND a.event_id=_event_id
    UNION ALL
    SELECT s.id,s.parent_space_id,s.type,a.visited||s.id FROM ancestry a
    JOIN public.venue_spaces s ON s.id=a.parent_space_id AND s.org_id=_org_id
    WHERE NOT s.id=ANY(a.visited) AND cardinality(a.visited)<32
  )
  SELECT '/eventos-restaurante-arena' || coalesce((SELECT '/'||type||'/agenda' FROM ancestry WHERE type IN ('restaurante','arena') ORDER BY type LIMIT 1),'')
    || '?evento='||_event_id::text||'&aba=historico';
$$;

CREATE FUNCTION workers_private.action_snapshot(_org_id uuid,_kind text,_target_id uuid,_lock boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,workers_private,pg_temp AS $$
DECLARE result jsonb; project_id_value uuid; entity_id_value uuid;
BEGIN
  IF workers_private.action_allowed(_org_id,_kind,_target_id) IS NOT TRUE THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF _kind='arena_note' THEN
    IF _lock THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(_org_id::text,28701));
      PERFORM 1 FROM public.venue_events WHERE org_id=_org_id AND id=_target_id FOR UPDATE;
    END IF;
    SELECT jsonb_build_object('id',id,'version',version,'status',status,'updatedAt',updated_at,
      'label',left(workers_private.redact_text(title),160),'href',workers_private.action_venue_href(_org_id,_target_id)) INTO result
      FROM public.venue_events WHERE org_id=_org_id AND id=_target_id;
  ELSE
    SELECT project_id,entity_id INTO project_id_value,entity_id_value FROM public.commercial_lots WHERE id=_target_id;
    IF _lock THEN
      PERFORM 1 FROM public.map_projects WHERE id=project_id_value AND org_id=_org_id FOR SHARE;
      PERFORM 1 FROM public.map_entities WHERE id=entity_id_value AND project_id=project_id_value FOR SHARE;
      PERFORM 1 FROM public.commercial_lots WHERE id=_target_id FOR UPDATE;
      PERFORM 1 FROM public.lot_reservations WHERE lot_id=_target_id ORDER BY id FOR UPDATE;
      PERFORM 1 FROM public.lot_negotiations WHERE lot_id=_target_id ORDER BY id FOR UPDATE;
    END IF;
    SELECT jsonb_build_object('id',l.id,'projectId',l.project_id,'entityId',l.entity_id,'status',l.status,
      'updatedAt',l.updated_at,'archivedAt',l.archived_at,'projectArchived',p.is_archived,'entityArchived',e.is_archived,
      'label',left(workers_private.redact_text(l.display_name),160),'href','/mapa-comercial?lote='||l.id::text,
      'reservationActive',EXISTS(SELECT 1 FROM public.lot_reservations r WHERE r.lot_id=l.id AND r.status='ACTIVE'),
      'negotiationActive',EXISTS(SELECT 1 FROM public.lot_negotiations n WHERE n.lot_id=l.id AND n.status='ACTIVE'),
      'saleActive',EXISTS(SELECT 1 FROM public.lot_sales s WHERE s.lot_id=l.id AND coalesce(s.status,'ACTIVE')<>'REVERTED'),
      'contractActive',EXISTS(SELECT 1 FROM public.lot_contracts c WHERE c.is_active AND (c.lot_id=l.id OR
        EXISTS(SELECT 1 FROM public.lot_contract_lots cl WHERE cl.contract_id=c.id AND cl.lot_id=l.id)))) INTO result
      FROM public.commercial_lots l JOIN public.map_projects p ON p.id=l.project_id
      JOIN public.map_entities e ON e.id=l.entity_id AND e.project_id=p.id
      WHERE l.id=_target_id AND l.project_id=project_id_value AND l.entity_id=entity_id_value AND p.org_id=_org_id;
    IF result IS NULL OR result->>'status' <> 'AVAILABLE' OR result->>'archivedAt' IS NOT NULL
      OR (result->>'projectArchived')::boolean OR (result->>'entityArchived')::boolean
      OR (result->>'reservationActive')::boolean OR (result->>'negotiationActive')::boolean
      OR (result->>'saleActive')::boolean OR (result->>'contractActive')::boolean THEN
      RAISE EXCEPTION 'WORKERS_ACTION_SNAPSHOT_CHANGED' USING ERRCODE='40001';
    END IF;
  END IF;
  IF result IS NULL THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  -- Re-check after waiting for resource locks; no capability from a card is authoritative.
  IF workers_private.action_allowed(_org_id,_kind,_target_id) IS NOT TRUE THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN result;
END $$;

CREATE FUNCTION workers_private.action_event(_action public.ai_actions,_event text,_code text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog,workers_private,pg_temp AS $$
  INSERT INTO public.ai_action_events(action_id,org_id,user_id,version,event,code)
    VALUES ((_action).id,(_action).org_id,(_action).user_id,(_action).version,_event,_code);
$$;

CREATE FUNCTION workers_private.action_expire(_action public.ai_actions)
RETURNS public.ai_actions LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,workers_private,pg_temp AS $$
DECLARE result public.ai_actions := _action;
BEGIN
  IF result.status='proposed' AND result.expires_at <= clock_timestamp() THEN
    UPDATE public.ai_actions SET status='expired',updated_at=clock_timestamp() WHERE id=result.id AND status='proposed' RETURNING * INTO result;
    IF FOUND THEN
      UPDATE workers_private.ai_action_payloads SET input=NULL,manual_input=NULL WHERE action_id=result.id;
      PERFORM workers_private.action_event(result,'expired');
    END IF;
  END IF;
  RETURN result;
END $$;

CREATE FUNCTION workers_private.action_view(_action public.ai_actions,_replayed boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,workers_private,pg_temp AS $$
DECLARE permitted boolean; pending boolean; receipt_value jsonb := _action.receipt; diff_value jsonb := _action.diff; body_value text;
BEGIN
  permitted := workers_private.action_allowed(_action.org_id,_action.kind,_action.target_id);
  IF NOT permitted OR _action.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  pending := _action.status='proposed' AND _action.expires_at>clock_timestamp();
  -- Exact operational note preview exists only in this authorized RPC projection.
  -- The public SELECT table contains a stub; commercial form data is NEVER projected.
  IF pending AND _action.kind='arena_note' THEN
    SELECT input->>'body' INTO body_value FROM workers_private.ai_action_payloads WHERE action_id=_action.id;
    IF body_value IS NOT NULL AND workers_private.redact_text(body_value)=body_value THEN
      diff_value := jsonb_build_array(jsonb_build_object('field','body','label','Nova nota','beforeDisplay',NULL,'afterDisplay',body_value,'redacted',false));
    END IF;
  END IF;
  IF receipt_value IS NOT NULL THEN receipt_value := receipt_value || jsonb_build_object('replayed',_replayed); END IF;
  RETURN jsonb_build_object('id',_action.id,'orgId',_action.org_id,'conversationId',_action.conversation_id,'workerId',_action.worker_id,
    'kind',_action.kind,'version',_action.version,'status',_action.status,'summary',_action.summary,'target',_action.target,'diff',diff_value,
    'createdAt',_action.created_at,'updatedAt',_action.updated_at,'expiresAt',_action.expires_at,'serverNow',clock_timestamp(),
    'permissions',jsonb_build_object('canConfirm',pending AND _action.manual_input_state<>'required' AND _action.failure IS NULL,'canEdit',pending,'canCancel',pending,
      'reason',CASE WHEN NOT pending THEN 'Esta proposta não está disponível para confirmação.' WHEN _action.failure IS NOT NULL THEN 'O registro mudou. Edite a proposta antes de confirmar.' WHEN _action.manual_input_state='required' THEN 'Preencha os dados privados para revisar e confirmar.' ELSE '' END),
    'manualInputState',_action.manual_input_state,'receipt',receipt_value,'failure',_action.failure);
END $$;

CREATE FUNCTION workers_private.action_owned(_org_id uuid,_action_id uuid,_lock boolean DEFAULT true)
RETURNS public.ai_actions LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,workers_private,pg_temp AS $$
DECLARE result public.ai_actions;
BEGIN
  PERFORM workers_private.action_actor(_org_id,false);
  IF _lock THEN
    SELECT * INTO result FROM public.ai_actions WHERE id=_action_id AND org_id=_org_id AND user_id=auth.uid() FOR UPDATE;
  ELSE
    SELECT * INTO result FROM public.ai_actions WHERE id=_action_id AND org_id=_org_id AND user_id=auth.uid();
  END IF;
  IF result.id IS NULL OR workers_private.action_allowed(_org_id,result.kind,result.target_id) IS NOT TRUE THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN result;
END $$;

CREATE FUNCTION public.ai_workers_get_action(_org_id uuid,_action_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,workers_private,pg_temp AS $$
DECLARE item public.ai_actions;
BEGIN
  item := workers_private.action_owned(_org_id,_action_id);
  item := workers_private.action_expire(item);
  RETURN workers_private.action_view(item);
END $$;

CREATE FUNCTION public.ai_workers_list_actions(_org_id uuid,_conversation_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,workers_private,pg_temp AS $$
DECLARE item public.ai_actions; result jsonb := '[]';
BEGIN
  PERFORM workers_private.action_actor(_org_id,false);
  IF _conversation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ai_conversations WHERE id=_conversation_id AND org_id=_org_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  FOR item IN SELECT * FROM public.ai_actions WHERE org_id=_org_id AND user_id=auth.uid()
    AND (_conversation_id IS NULL OR conversation_id=_conversation_id) ORDER BY created_at DESC,id LIMIT 50 FOR UPDATE
  LOOP
    IF workers_private.action_allowed(_org_id,item.kind,item.target_id) THEN
      item := workers_private.action_expire(item);
      result := result || jsonb_build_array(workers_private.action_view(item));
    END IF;
  END LOOP;
  RETURN result;
END $$;

CREATE FUNCTION public.ai_workers_propose_action(_org_id uuid,_conversation_id uuid,_request_id uuid,_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,workers_private,pg_temp AS $$
DECLARE actor uuid; normalized jsonb; snapshot_value jsonb; target_id_value uuid; item public.ai_actions; prior workers_private.ai_action_requests;
  request_hash text; kind_value text; summary_value text; diff_value jsonb;
BEGIN
  actor := workers_private.action_actor(_org_id,false);
  normalized := workers_private.action_input(_input); kind_value := normalized->>'kind';
  IF _request_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.ai_conversations WHERE id=_conversation_id AND org_id=_org_id AND user_id=actor) THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  target_id_value := coalesce(normalized->>'eventId',normalized->>'lotId')::uuid;
  request_hash := encode(sha256(convert_to(jsonb_build_object('command','propose','org',_org_id,'conversation',_conversation_id,'input',normalized)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,13002026));
  SELECT * INTO prior FROM workers_private.ai_action_requests WHERE user_id=actor AND request_id=_request_id;
  IF FOUND THEN
    IF prior.org_id<>_org_id OR prior.request_hash<>request_hash THEN RAISE EXCEPTION 'WORKERS_IDEMPOTENCY_MISMATCH' USING ERRCODE='22023'; END IF;
    item := workers_private.action_owned(_org_id,prior.action_id); item := workers_private.action_expire(item);
    RETURN workers_private.action_view(item);
  END IF;
  IF (SELECT count(*) FROM public.ai_actions WHERE user_id=actor AND created_at>clock_timestamp()-interval '1 minute') >= 10
    OR (SELECT count(*) FROM public.ai_actions WHERE user_id=actor AND status='proposed' AND expires_at>clock_timestamp()) >= 20 THEN RAISE EXCEPTION 'WORKERS_RATE_LIMITED' USING ERRCODE='54000'; END IF;
  snapshot_value := workers_private.action_snapshot(_org_id,kind_value,target_id_value,false);
  summary_value := CASE kind_value WHEN 'arena_note' THEN 'Adicionar nota operacional ao evento' WHEN 'commercial_reserve' THEN 'Reservar lote disponível' ELSE 'Iniciar negociação de lote disponível' END;
  diff_value := jsonb_build_array(jsonb_build_object('field',CASE WHEN kind_value='arena_note' THEN 'note' ELSE 'status' END,
    'label',CASE WHEN kind_value='arena_note' THEN 'Nova nota' ELSE 'Situação do lote' END,
    'beforeDisplay',CASE WHEN kind_value='arena_note' THEN NULL ELSE 'Disponível' END,
    'afterDisplay',CASE kind_value WHEN 'arena_note' THEN 'Nota operacional ('||char_length(normalized->>'body')||' caracteres)' WHEN 'commercial_reserve' THEN 'Reservado' ELSE 'Em negociação' END,'redacted',kind_value='arena_note'));
  INSERT INTO public.ai_actions(org_id,user_id,conversation_id,worker_id,kind,target_id,target,summary,diff,manual_input_state)
    VALUES (_org_id,actor,_conversation_id,CASE WHEN kind_value='arena_note' THEN 'arena' ELSE 'mapa' END,kind_value,target_id_value,
      jsonb_build_object('recordId',target_id_value,'label',snapshot_value->>'label','href',snapshot_value->>'href'),
      summary_value,diff_value,CASE WHEN kind_value='arena_note' THEN 'notRequired' ELSE 'required' END) RETURNING * INTO item;
  INSERT INTO workers_private.ai_action_payloads(action_id,input,snapshot) VALUES(item.id,normalized,snapshot_value);
  INSERT INTO workers_private.ai_action_requests VALUES(actor,_request_id,_org_id,item.id,request_hash);
  PERFORM workers_private.action_event(item,'proposed');
  RETURN workers_private.action_view(item);
END $$;

CREATE FUNCTION public.ai_workers_edit_action(_org_id uuid,_action_id uuid,_expected_revision integer,_request_id uuid,_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,workers_private,pg_temp AS $$
DECLARE item public.ai_actions; normalized jsonb; snapshot_value jsonb; prior workers_private.ai_action_requests; request_hash text;
BEGIN
  PERFORM workers_private.action_actor(_org_id,false);
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,13002026));
  item := workers_private.action_owned(_org_id,_action_id);
  normalized := workers_private.action_input(_input);
  IF _request_id IS NULL OR normalized->>'kind'<>item.kind OR coalesce(normalized->>'eventId',normalized->>'lotId')::uuid<>item.target_id THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  request_hash := encode(sha256(convert_to(jsonb_build_object('command','edit','org',_org_id,'action',_action_id,'version',_expected_revision,'input',normalized)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(item.user_id::text,13002026));
  SELECT * INTO prior FROM workers_private.ai_action_requests WHERE user_id=item.user_id AND request_id=_request_id;
  IF FOUND THEN
    IF prior.org_id<>_org_id OR prior.request_hash<>request_hash OR prior.action_id<>item.id THEN RAISE EXCEPTION 'WORKERS_IDEMPOTENCY_MISMATCH' USING ERRCODE='22023'; END IF;
    RETURN workers_private.action_view(workers_private.action_expire(item));
  END IF;
  IF item.version IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION 'WORKERS_ACTION_STALE' USING ERRCODE='40001'; END IF;
  item := workers_private.action_expire(item);
  IF item.status<>'proposed' THEN RETURN workers_private.action_view(item); END IF;
  snapshot_value := workers_private.action_snapshot(_org_id,item.kind,item.target_id,false);
  UPDATE public.ai_actions SET version=version+1,updated_at=clock_timestamp(),expires_at=clock_timestamp()+interval '15 minutes',failure=NULL,
    target=target||jsonb_build_object('label',snapshot_value->>'label','href',snapshot_value->>'href'),manual_input_state=CASE WHEN item.kind='arena_note' THEN 'notRequired' ELSE 'required' END,
    diff=CASE WHEN item.kind='arena_note' THEN jsonb_build_array(jsonb_build_object('field','note','label','Nova nota','beforeDisplay',NULL,
      'afterDisplay','Nota operacional ('||char_length(normalized->>'body')||' caracteres)','redacted',true)) ELSE diff END
    WHERE id=item.id RETURNING * INTO item;
  UPDATE workers_private.ai_action_payloads SET input=normalized,manual_input=NULL,snapshot=snapshot_value,idempotency_key=gen_random_uuid() WHERE action_id=item.id;
  INSERT INTO workers_private.ai_action_requests VALUES(item.user_id,_request_id,_org_id,item.id,request_hash);
  PERFORM workers_private.action_event(item,'edited');
  RETURN workers_private.action_view(item);
END $$;

CREATE FUNCTION public.ai_workers_manual_action(_org_id uuid,_action_id uuid,_expected_revision integer,_request_id uuid,_manual_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,workers_private,pg_temp AS $$
DECLARE item public.ai_actions; snapshot_value jsonb; manual_value jsonb; request_hash text; prior workers_private.ai_action_requests;
  company text := btrim(_manual_input->>'companyName'); contact text := nullif(btrim(_manual_input->>'contactName'),''); expiry timestamptz;
BEGIN
  PERFORM workers_private.action_actor(_org_id,false);
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,13002026));
  item := workers_private.action_owned(_org_id,_action_id);
  IF _request_id IS NULL OR jsonb_typeof(_manual_input) IS DISTINCT FROM 'object' OR _manual_input->>'kind' IS DISTINCT FROM item.kind OR item.kind='arena_note'
    OR jsonb_typeof(_manual_input->'companyName') IS DISTINCT FROM 'string' OR char_length(company) NOT BETWEEN 1 AND 160
    OR char_length(coalesce(contact,''))>160 THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  IF item.kind='commercial_reserve' THEN
    IF (_manual_input-ARRAY['kind','companyName','contactName','reservationExpiresAt'])<>'{}'::jsonb
      OR NOT (_manual_input ?& ARRAY['kind','companyName','contactName','reservationExpiresAt']) OR contact IS NULL
      OR jsonb_typeof(_manual_input->'contactName')<>'string' OR jsonb_typeof(_manual_input->'reservationExpiresAt')<>'string' THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023'; END IF;
    expiry := (_manual_input->>'reservationExpiresAt')::timestamptz;
    IF expiry IS NULL OR expiry<=clock_timestamp() OR NOT isfinite(expiry) THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023'; END IF;
    manual_value := jsonb_build_object('kind',item.kind,'companyName',company,'contactName',contact,'reservationExpiresAt',expiry);
  ELSE
    IF (_manual_input-ARRAY['kind','companyName','contactName'])<>'{}'::jsonb OR NOT (_manual_input ?& ARRAY['kind','companyName','contactName'])
      OR jsonb_typeof(_manual_input->'contactName') NOT IN ('string','null') THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023'; END IF;
    manual_value := jsonb_build_object('kind',item.kind,'companyName',company,'contactName',contact);
  END IF;
  -- Identifiers/contact names are required private data, never an escape hatch for secrets/URLs.
  IF workers_private.redact_text(company) IS DISTINCT FROM company OR (contact IS NOT NULL AND workers_private.redact_text(contact) IS DISTINCT FROM contact) THEN RAISE EXCEPTION 'WORKERS_ACTION_SENSITIVE_TEXT' USING ERRCODE='22023'; END IF;
  request_hash := encode(sha256(convert_to(jsonb_build_object('command','manual','org',_org_id,'action',_action_id,'version',_expected_revision,'input',manual_value)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(item.user_id::text,13002026));
  SELECT * INTO prior FROM workers_private.ai_action_requests WHERE user_id=item.user_id AND request_id=_request_id;
  IF FOUND THEN
    IF prior.org_id<>_org_id OR prior.action_id<>item.id OR prior.request_hash<>request_hash THEN RAISE EXCEPTION 'WORKERS_IDEMPOTENCY_MISMATCH' USING ERRCODE='22023'; END IF;
    RETURN workers_private.action_view(workers_private.action_expire(item));
  END IF;
  IF item.version IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION 'WORKERS_ACTION_STALE' USING ERRCODE='40001'; END IF;
  item := workers_private.action_expire(item);
  IF item.status<>'proposed' THEN RETURN workers_private.action_view(item); END IF;
  snapshot_value := workers_private.action_snapshot(_org_id,item.kind,item.target_id,false);
  UPDATE public.ai_actions SET version=version+1,updated_at=clock_timestamp(),expires_at=clock_timestamp()+interval '15 minutes',failure=NULL,manual_input_state='complete',
    target=target||jsonb_build_object('label',snapshot_value->>'label','href',snapshot_value->>'href'),
    diff=jsonb_build_array(jsonb_build_object('field','status','label','Situação do lote','beforeDisplay','Disponível',
      'afterDisplay',CASE item.kind WHEN 'commercial_reserve' THEN 'Reservado' ELSE 'Em negociação' END,'redacted',false),
      jsonb_build_object('field','contact','label','Dados privados','beforeDisplay',NULL,'afterDisplay','Dados preenchidos; não compartilhados com a IA','redacted',true))
    || CASE WHEN expiry IS NOT NULL THEN jsonb_build_array(jsonb_build_object('field','expiresAt','label','Validade da reserva','beforeDisplay',NULL,
      'afterDisplay',to_char(expiry AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||' (America/Sao_Paulo)','redacted',false)) ELSE '[]'::jsonb END
    WHERE id=item.id RETURNING * INTO item;
  UPDATE workers_private.ai_action_payloads SET manual_input=manual_value,snapshot=snapshot_value,idempotency_key=gen_random_uuid() WHERE action_id=item.id;
  INSERT INTO workers_private.ai_action_requests VALUES(item.user_id,_request_id,_org_id,item.id,request_hash);
  PERFORM workers_private.action_event(item,'manual_completed');
  RETURN workers_private.action_view(item);
END $$;

CREATE FUNCTION public.ai_workers_cancel_action(_org_id uuid,_action_id uuid,_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,workers_private,pg_temp AS $$
DECLARE item public.ai_actions;
BEGIN
  item := workers_private.action_owned(_org_id,_action_id);
  IF item.version IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION 'WORKERS_ACTION_STALE' USING ERRCODE='40001'; END IF;
  item := workers_private.action_expire(item);
  IF item.status='proposed' THEN
    UPDATE public.ai_actions SET status='cancelled',updated_at=clock_timestamp(),failure=NULL WHERE id=item.id RETURNING * INTO item;
    UPDATE workers_private.ai_action_payloads SET input=NULL,manual_input=NULL WHERE action_id=item.id;
    PERFORM workers_private.action_event(item,'cancelled');
  END IF;
  RETURN workers_private.action_view(item);
END $$;

CREATE FUNCTION public.ai_workers_confirm_action(_org_id uuid,_action_id uuid,_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,workers_private,pg_temp AS $$
DECLARE item public.ai_actions; private_payload workers_private.ai_action_payloads; current_snapshot jsonb; note_row public.venue_event_notes;
  result_id uuid; result_target jsonb; expiry timestamptz; execution_time timestamptz;
BEGIN
  item := workers_private.action_owned(_org_id,_action_id);
  PERFORM workers_private.action_actor(_org_id,true);
  IF item.version IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION 'WORKERS_ACTION_STALE' USING ERRCODE='40001'; END IF;
  IF item.status='executed' THEN RETURN workers_private.action_view(item,true); END IF;
  IF item.status<>'proposed' THEN RETURN workers_private.action_view(item); END IF;
  IF item.manual_input_state='required' THEN RAISE EXCEPTION 'WORKERS_ACTION_MANUAL_REQUIRED' USING ERRCODE='22023'; END IF;
  SELECT * INTO private_payload FROM workers_private.ai_action_payloads WHERE action_id=item.id FOR UPDATE;
  IF NOT FOUND OR private_payload.input IS NULL THEN RAISE EXCEPTION 'WORKERS_ACTION_NOT_ALLOWED' USING ERRCODE='22023'; END IF;
  BEGIN
    current_snapshot := workers_private.action_snapshot(_org_id,item.kind,item.target_id,true);
    -- Clock check is after membership, capability, card, payload and ALL target locks.
    IF item.expires_at<=clock_timestamp() THEN
      item := workers_private.action_expire(item);
      RETURN workers_private.action_view(item);
    END IF;
    IF current_snapshot IS DISTINCT FROM private_payload.snapshot THEN RAISE EXCEPTION 'WORKERS_ACTION_SNAPSHOT_CHANGED' USING ERRCODE='40001'; END IF;
    PERFORM workers_private.action_input(private_payload.input);
    UPDATE public.ai_actions SET status='confirmed',updated_at=clock_timestamp(),failure=NULL WHERE id=item.id RETURNING * INTO item;
    PERFORM workers_private.action_event(item,'confirmed');
    IF item.kind='arena_note' THEN
      SELECT * INTO note_row FROM public.venue_save_event_note(item.target_id,private_payload.input->>'body',NULL::uuid);
      IF note_row.id IS NULL OR note_row.org_id<>_org_id OR note_row.event_id<>item.target_id OR note_row.author_user_id<>auth.uid()
        OR note_row.deleted_at IS NOT NULL OR note_row.body IS DISTINCT FROM (private_payload.input->>'body') THEN RAISE EXCEPTION 'WORKERS_ACTION_INVALID_RECEIPT'; END IF;
      result_id := note_row.id;
    ELSIF item.kind='commercial_reserve' THEN
      expiry := (private_payload.manual_input->>'reservationExpiresAt')::timestamptz;
      IF expiry IS NULL OR expiry<=clock_timestamp() OR NOT isfinite(expiry) THEN RAISE EXCEPTION 'WORKERS_ACTION_INVALID_MANUAL'; END IF;
      result_id := public.reserve_commercial_lot(item.target_id,private_payload.manual_input->>'companyName',NULL::text,
        private_payload.manual_input->>'contactName',NULL::text,NULL::text,expiry,NULL::text);
      IF result_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.lot_reservations WHERE id=result_id AND lot_id=item.target_id
        AND responsible_user_id=auth.uid() AND status='ACTIVE' AND expires_at=expiry
        AND company_name=private_payload.manual_input->>'companyName' AND contact_name=private_payload.manual_input->>'contactName'
        AND document_number IS NULL AND phone IS NULL AND email IS NULL AND notes IS NULL) THEN RAISE EXCEPTION 'WORKERS_ACTION_INVALID_RECEIPT'; END IF;
    ELSIF item.kind='commercial_negotiate' THEN
      result_id := public.start_commercial_negotiation(item.target_id,private_payload.manual_input->>'companyName',NULL::text,
        private_payload.manual_input->>'contactName',NULL::numeric,NULL::text);
      IF result_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.lot_negotiations WHERE id=result_id AND lot_id=item.target_id
        AND responsible_user_id=auth.uid() AND status='ACTIVE' AND proposed_value IS NULL AND document_number IS NULL AND notes IS NULL
        AND company_name=private_payload.manual_input->>'companyName'
        AND contact_name IS NOT DISTINCT FROM (private_payload.manual_input->>'contactName')) THEN RAISE EXCEPTION 'WORKERS_ACTION_INVALID_RECEIPT'; END IF;
    ELSE RAISE EXCEPTION 'WORKERS_ACTION_NOT_ALLOWED' USING ERRCODE='22023'; END IF;
    result_target := item.target;
    execution_time := clock_timestamp();
    -- A native constraint/trigger may wait after our explicit target locks. Do
    -- not commit a late effect: the exception rolls the whole nested call back.
    IF item.expires_at<=execution_time THEN RAISE EXCEPTION 'WORKERS_ACTION_EXPIRED' USING ERRCODE='22023'; END IF;
    UPDATE public.ai_actions SET status='executed',updated_at=execution_time,
      receipt=jsonb_build_object('receiptId',result_id,'executedAt',execution_time,'target',result_target,'summary',item.summary,
        'replayed',false,'undo',NULL),failure=NULL WHERE id=item.id RETURNING * INTO item;
    UPDATE workers_private.ai_action_payloads SET input=NULL,manual_input=NULL WHERE action_id=item.id;
    PERFORM workers_private.action_event(item,'executed');
  EXCEPTION
    WHEN serialization_failure THEN
      IF SQLERRM='WORKERS_ACTION_SNAPSHOT_CHANGED' THEN
        IF item.expires_at<=clock_timestamp() THEN item := workers_private.action_expire(item);
        ELSE
          UPDATE public.ai_actions SET status='proposed',updated_at=clock_timestamp(),failure=jsonb_build_object('code','snapshot_changed','message','O registro mudou. Edite a proposta antes de confirmar.') WHERE id=item.id RETURNING * INTO item;
          PERFORM workers_private.action_event(item,'snapshot_changed','snapshot_changed');
        END IF;
      ELSE RAISE; END IF;
    WHEN insufficient_privilege OR deadlock_detected OR lock_not_available OR query_canceled THEN RAISE;
    WHEN OTHERS THEN
      -- Nested block rollback removes every business effect before failure is recorded.
      UPDATE public.ai_actions SET status=CASE WHEN SQLERRM='WORKERS_ACTION_EXPIRED' THEN 'expired' ELSE 'failed' END,receipt=NULL,updated_at=clock_timestamp(),
        failure=CASE WHEN SQLERRM='WORKERS_ACTION_EXPIRED' THEN NULL ELSE jsonb_build_object('code','execution_failed','message','Não foi possível executar. Revise o registro e crie uma nova proposta.') END WHERE id=item.id RETURNING * INTO item;
      UPDATE workers_private.ai_action_payloads SET input=NULL,manual_input=NULL WHERE action_id=item.id;
      PERFORM workers_private.action_event(item,CASE WHEN item.status='expired' THEN 'expired' ELSE 'failed' END,CASE WHEN item.status='expired' THEN NULL ELSE 'execution_failed' END);
  END;
  RETURN workers_private.action_view(item);
END $$;

-- RLS also revalidates current business access for raw table SELECT, not just Edge get/list.
CREATE FUNCTION public.ai_workers_visible_action_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog,workers_private,pg_temp AS $$
  SELECT a.id FROM public.ai_actions a WHERE a.user_id=auth.uid()
    AND a.org_id IN (SELECT public.ai_workers_member_org_ids())
    AND workers_private.action_allowed(a.org_id,a.kind,a.target_id);
$$;
REVOKE ALL ON FUNCTION public.ai_workers_visible_action_ids() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_workers_visible_action_ids() TO authenticated;
CREATE POLICY ai_actions_read_own ON public.ai_actions FOR SELECT TO authenticated
  USING (user_id=(SELECT auth.uid()) AND id IN (SELECT public.ai_workers_visible_action_ids()));
CREATE POLICY ai_action_events_read_own ON public.ai_action_events FOR SELECT TO authenticated
  USING (user_id=(SELECT auth.uid()) AND action_id IN (SELECT public.ai_workers_visible_action_ids()));

ALTER FUNCTION public.ai_workers_list_actions(uuid,uuid) SET lock_timeout='5s';
ALTER FUNCTION public.ai_workers_get_action(uuid,uuid) SET lock_timeout='5s';
ALTER FUNCTION public.ai_workers_propose_action(uuid,uuid,uuid,jsonb) SET lock_timeout='5s';
ALTER FUNCTION public.ai_workers_edit_action(uuid,uuid,integer,uuid,jsonb) SET lock_timeout='5s';
ALTER FUNCTION public.ai_workers_manual_action(uuid,uuid,integer,uuid,jsonb) SET lock_timeout='5s';
ALTER FUNCTION public.ai_workers_confirm_action(uuid,uuid,integer) SET lock_timeout='5s';
ALTER FUNCTION public.ai_workers_cancel_action(uuid,uuid,integer) SET lock_timeout='5s';

REVOKE ALL ON FUNCTION public.ai_workers_list_actions(uuid,uuid),public.ai_workers_get_action(uuid,uuid),
  public.ai_workers_propose_action(uuid,uuid,uuid,jsonb),public.ai_workers_edit_action(uuid,uuid,integer,uuid,jsonb),
  public.ai_workers_manual_action(uuid,uuid,integer,uuid,jsonb),public.ai_workers_cancel_action(uuid,uuid,integer),
  public.ai_workers_confirm_action(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_workers_list_actions(uuid,uuid),public.ai_workers_get_action(uuid,uuid),
  public.ai_workers_propose_action(uuid,uuid,uuid,jsonb),public.ai_workers_edit_action(uuid,uuid,integer,uuid,jsonb),
  public.ai_workers_manual_action(uuid,uuid,integer,uuid,jsonb),public.ai_workers_cancel_action(uuid,uuid,integer),
  public.ai_workers_confirm_action(uuid,uuid,integer) TO authenticated;
