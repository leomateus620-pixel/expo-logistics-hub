-- Additive personal AI workspace metadata. Business reads remain user-JWT registry calls.
CREATE TABLE public.ai_routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, user_id uuid NOT NULL,
  conversation_id uuid NOT NULL, request_id uuid NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0),
  config jsonb NOT NULL, status text NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','active','paused','disabled','cancelled','expired')),
  expires_at timestamptz, next_scheduled_at timestamptz, confirmed_version integer,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(conversation_id,org_id,user_id) REFERENCES public.ai_conversations(id,org_id,user_id),
  UNIQUE(id,org_id,user_id), UNIQUE(user_id,org_id,request_id)
);
CREATE TABLE public.ai_routine_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,user_id uuid NOT NULL,routine_id uuid NOT NULL,
  conversation_id uuid NOT NULL,request_id uuid NOT NULL DEFAULT gen_random_uuid(),routine_version integer NOT NULL,
  scheduled_for timestamptz NOT NULL,reference_date date NOT NULL,state text NOT NULL CHECK(state IN('running','succeeded','failed','skipped')),
  generation integer NOT NULL DEFAULT 1 CHECK(generation>0),lease_expires_at timestamptz,
  started_at timestamptz,finished_at timestamptz,catch_up boolean NOT NULL DEFAULT false,failure_code text,
  result_trust text NOT NULL DEFAULT 'none' CHECK(result_trust IN('none','user_scoped_reported')),
  FOREIGN KEY(routine_id,org_id,user_id) REFERENCES public.ai_routines(id,org_id,user_id),
  FOREIGN KEY(conversation_id,org_id,user_id) REFERENCES public.ai_conversations(id,org_id,user_id),
  UNIQUE(id,org_id,user_id),UNIQUE(routine_id,scheduled_for),UNIQUE(user_id,request_id)
);
CREATE TABLE public.ai_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,user_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),worker_id text CHECK(worker_id IN('agenda','arena','mapa','interesse','comissao','logistica','caixa','radar')),
  content text NOT NULL CHECK(char_length(content) BETWEEN 1 AND 1000),enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,org_id,user_id)
);
CREATE TABLE public.ai_system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,user_id uuid NOT NULL,conversation_id uuid,
  kind text NOT NULL CHECK(kind IN('routineCreated','routineChanged','routineUndone','routineRun','memoryChanged')),
  entity_id uuid NOT NULL,version integer NOT NULL,label text NOT NULL CHECK(char_length(label)<=500),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(conversation_id,org_id,user_id) REFERENCES public.ai_conversations(id,org_id,user_id),
  UNIQUE(user_id,org_id,kind,entity_id,version)
);
CREATE TABLE public.ai_inbox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,user_id uuid NOT NULL,routine_id uuid NOT NULL,run_id uuid NOT NULL,
  worker_id text NOT NULL CHECK(worker_id IN('agenda','arena','mapa','interesse','comissao','logistica','caixa','radar')),
  kind text NOT NULL CHECK(kind IN('restaurantConflict','openSalesAge','transportWeather','routineFailure')),
  title text NOT NULL CHECK(char_length(title)<=180),href text NOT NULL CHECK(href IN('/cronograma-eventos','/mapa-comercial','/transports','/equipe-ia')),
  created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,seen_at timestamptz,
  FOREIGN KEY(routine_id,org_id,user_id) REFERENCES public.ai_routines(id,org_id,user_id),
  FOREIGN KEY(run_id,org_id,user_id) REFERENCES public.ai_routine_runs(id,org_id,user_id),UNIQUE(user_id,org_id,run_id,kind)
);
CREATE TABLE public.ai_workspace_receipts (
  org_id uuid NOT NULL,user_id uuid NOT NULL,request_id uuid NOT NULL,kind text NOT NULL,
  fingerprint text NOT NULL,entity_id uuid,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,org_id,request_id)
);
-- Match the Lovable migration order already verified for the base. No auth.users FK.
REVOKE ALL ON public.ai_routines,public.ai_routine_runs,public.ai_memory,public.ai_system_events,public.ai_inbox_items,public.ai_workspace_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ai_routines,public.ai_routine_runs,public.ai_memory,public.ai_system_events,public.ai_inbox_items TO authenticated;
ALTER TABLE public.ai_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_routine_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_inbox_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_workspace_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_routines_read_own ON public.ai_routines FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) AND org_id IN(SELECT public.ai_workers_member_org_ids()));
CREATE POLICY ai_routine_runs_read_own ON public.ai_routine_runs FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) AND org_id IN(SELECT public.ai_workers_member_org_ids()));
CREATE POLICY ai_memory_read_own ON public.ai_memory FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) AND org_id IN(SELECT public.ai_workers_member_org_ids()));
CREATE POLICY ai_system_events_read_own ON public.ai_system_events FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) AND org_id IN(SELECT public.ai_workers_member_org_ids()));
CREATE POLICY ai_inbox_items_read_own ON public.ai_inbox_items FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) AND org_id IN(SELECT public.ai_workers_member_org_ids()));
CREATE INDEX ai_routines_due ON public.ai_routines(user_id,org_id,next_scheduled_at) WHERE status='active';
CREATE INDEX ai_runs_owner ON public.ai_routine_runs(user_id,org_id,scheduled_for DESC);
CREATE INDEX ai_memory_owner ON public.ai_memory(user_id,org_id,updated_at DESC);
CREATE INDEX ai_system_events_owner ON public.ai_system_events(user_id,org_id,conversation_id,created_at DESC);
CREATE INDEX ai_inbox_owner ON public.ai_inbox_items(user_id,org_id,expires_at,created_at DESC);
CREATE INDEX ai_workspace_receipts_rate ON public.ai_workspace_receipts(user_id,created_at DESC);
CREATE INDEX ai_system_events_rate ON public.ai_system_events(user_id,created_at DESC);

CREATE FUNCTION public.ai_workspace_assert_member(_org_id uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' OR _org_id IS NULL OR _org_id NOT IN(SELECT public.ai_workers_member_org_ids()) THEN
    RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN auth.uid();
END $$;
CREATE FUNCTION public.ai_workspace_metadata_budget(_actor uuid) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF (SELECT count(*) FROM public.ai_workspace_receipts WHERE user_id=_actor AND created_at>now()-interval '1 minute')
    +(SELECT count(*) FROM public.ai_system_events WHERE user_id=_actor AND created_at>now()-interval '1 minute')>=100
    OR (SELECT count(*) FROM public.ai_workspace_receipts WHERE user_id=_actor AND created_at>now()-interval '1 day')
    +(SELECT count(*) FROM public.ai_system_events WHERE user_id=_actor AND created_at>now()-interval '1 day')>=1000 THEN
    RAISE EXCEPTION 'WORKERS_RATE_LIMITED' USING ERRCODE='54000';
  END IF;
END $$;
CREATE FUNCTION public.ai_workspace_config_valid(_config jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE r jsonb; s jsonb; k text[];
BEGIN
  IF jsonb_typeof(_config) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(_config) key)
    IS DISTINCT FROM ARRAY['delivery','executionMode','recipe','schedule','title','workerId'] THEN RETURN false; END IF;
  IF jsonb_typeof(_config->'title')<>'string' OR char_length(btrim(_config->>'title')) NOT BETWEEN 1 AND 100
    OR _config->>'delivery' IS DISTINCT FROM 'inApp' OR _config->>'executionMode' IS DISTINCT FROM 'activeSession' THEN RETURN false; END IF;
  s:=_config->'schedule';r:=_config->'recipe';
  IF jsonb_typeof(s)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(s) key)<>ARRAY['localTime','timeZone','weekdays']
    OR s->>'timeZone' IS DISTINCT FROM 'America/Sao_Paulo' OR coalesce(s->>'localTime','')!~'^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'
    OR jsonb_typeof(s->'weekdays')<>'array' OR jsonb_array_length(s->'weekdays') NOT BETWEEN 1 AND 7 THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'weekdays') x WHERE jsonb_typeof(x)<>'number' OR x::text!~'^[1-7]$')
    OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(s->'weekdays') x)<>jsonb_array_length(s->'weekdays') THEN RETURN false; END IF;
  IF jsonb_typeof(r)<>'object' THEN RETURN false; END IF;
  SELECT array_agg(key ORDER BY key) INTO k FROM jsonb_object_keys(r) key;
  CASE r->>'recipeId'
  WHEN 'agendaBriefing' THEN
    RETURN k=ARRAY['commissionId','dayOffset','includeRestaurantConflicts','recipeId'] AND _config->>'workerId' IN('agenda','arena')
      AND (r->'commissionId'='null'::jsonb OR (jsonb_typeof(r->'commissionId')='string' AND (r->>'commissionId')::uuid IS NOT NULL))
      AND r->'dayOffset' IN('0'::jsonb,'1'::jsonb) AND jsonb_typeof(r->'includeRestaurantConflicts')='boolean'
      AND (_config->>'workerId'<>'arena' OR r->'includeRestaurantConflicts'='true'::jsonb);
  WHEN 'openSalesAge' THEN
    RETURN k=ARRAY['minimumAgeDays','projectId','recipeId'] AND _config->>'workerId'='mapa'
      AND jsonb_typeof(r->'projectId')='string' AND (r->>'projectId')::uuid IS NOT NULL
      AND jsonb_typeof(r->'minimumAgeDays')='number' AND r->>'minimumAgeDays'~'^[0-9]{1,3}$' AND (r->>'minimumAgeDays')::int BETWEEN 1 AND 365;
  WHEN 'transportWeather' THEN RETURN k=ARRAY['recipeId'] AND _config->>'workerId'='logistica';
  ELSE RETURN false; END CASE;
EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value THEN RETURN false;
END $$;
CREATE FUNCTION public.ai_workspace_recipe_allowed(_org_id uuid,_config jsonb) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE role_name text; permissions jsonb;
BEGIN
  PERFORM public.ai_workspace_assert_member(_org_id);
  IF public.ai_workspace_config_valid(_config) IS DISTINCT FROM true THEN RETURN false; END IF;
  CASE _config#>>'{recipe,recipeId}'
  WHEN 'agendaBriefing' THEN
    IF (_config#>>'{recipe,includeRestaurantConflicts}')::boolean THEN
      permissions:=public.venue_get_permissions(_org_id);
      RETURN coalesce((permissions->>'venue_events_access')::boolean,false);
    END IF; RETURN true;
  WHEN 'openSalesAge' THEN RETURN coalesce(public.map_has_explicit_capability(_org_id,'map.manage_sales'),false);
  WHEN 'transportWeather' THEN
    role_name:=public.get_user_org_role(auth.uid(),_org_id)::text;
    RETURN role_name IN('admin','gestor') OR (role_name='operador' AND NOT EXISTS(SELECT 1 FROM public.user_capabilities WHERE user_id=auth.uid() AND org_id=_org_id AND capability='restricted_scope'))
      OR EXISTS(SELECT 1 FROM public.user_capabilities WHERE user_id=auth.uid() AND org_id=_org_id AND capability='full_access');
  ELSE RETURN false;END CASE;
END $$;
CREATE FUNCTION public.ai_workspace_next_schedule(_config jsonb,_after timestamptz) RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE d date; candidate timestamptz;i integer;
BEGIN
  IF public.ai_workspace_config_valid(_config) IS DISTINCT FROM true OR _after IS NULL THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  FOR i IN 0..7 LOOP
    d:=(_after AT TIME ZONE 'America/Sao_Paulo')::date+i;
    IF (_config#>'{schedule,weekdays}') @> to_jsonb(ARRAY[extract(isodow FROM d)::int]) THEN
      candidate:=(d+(_config#>>'{schedule,localTime}')::time) AT TIME ZONE 'America/Sao_Paulo';
      IF candidate>_after THEN RETURN candidate; END IF;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'WORKERS_INVALID_SCHEDULE' USING ERRCODE='22023';
END $$;
CREATE FUNCTION public.ai_workspace_routine_view(r public.ai_routines) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE allowed boolean:=public.ai_workspace_recipe_allowed(r.org_id,r.config); expired boolean:=r.status='proposed' AND r.expires_at<=now(); days text;t timestamptz:=clock_timestamp();due boolean;
BEGIN
  due:=r.status='active' AND (r.next_scheduled_at<=t OR EXISTS(SELECT 1 FROM public.ai_routine_runs WHERE routine_id=r.id AND user_id=r.user_id AND org_id=r.org_id AND state='running' AND lease_expires_at<=t));
  SELECT string_agg((ARRAY['seg','ter','qua','qui','sex','sáb','dom'])[(x::text)::int],', ' ORDER BY (x::text)::int) INTO days FROM jsonb_array_elements(r.config#>'{schedule,weekdays}') x;
  IF r.config#>'{schedule,weekdays}'='[1,2,3,4,5]'::jsonb THEN days:='Dias úteis'; END IF;
  RETURN jsonb_build_object('id',r.id,'orgId',r.org_id,'conversationId',r.conversation_id,'version',r.version,'config',r.config,
    'state',CASE WHEN expired THEN 'expired' ELSE r.status END,'scheduleLabel',days||' · '||(r.config#>>'{schedule,localTime}')||' · America/Sao_Paulo',
    'nextScheduledAt',r.next_scheduled_at,'createdAt',r.created_at,'updatedAt',r.updated_at,'expiresAt',r.expires_at,'serverNow',t,
    'lastRunAt',(SELECT max(finished_at) FROM public.ai_routine_runs WHERE routine_id=r.id AND org_id=r.org_id AND user_id=r.user_id AND state='succeeded'),
    'waitingForSession',due,
    'canConfirm',allowed AND r.status='proposed' AND NOT expired,'canEdit',r.status IN('active','paused') OR (r.status='proposed' AND NOT expired),
    'canRunNow',allowed AND due,'unavailableReason',CASE WHEN NOT allowed THEN 'permissions_changed' ELSE NULL END);
END $$;
CREATE FUNCTION public.ai_workspace_run_view(r public.ai_routine_runs) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT jsonb_build_object('id',r.id,'routineId',r.routine_id,'conversationId',r.conversation_id,'requestId',r.request_id,'routineVersion',r.routine_version,
    'scheduledFor',r.scheduled_for,'referenceDate',r.reference_date,'startedAt',r.started_at,'finishedAt',r.finished_at,'state',r.state,'catchUp',r.catch_up,'failureCode',r.failure_code,'resultTrust',r.result_trust);
$$;
CREATE FUNCTION public.ai_workspace_memory_view(r public.ai_memory) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT jsonb_build_object('id',r.id,'orgId',r.org_id,'version',r.version,'workerId',r.worker_id,'content',r.content,'enabled',r.enabled,'createdAt',r.created_at,'updatedAt',r.updated_at);
$$;

CREATE FUNCTION public.ai_workspace_propose_routine(_org_id uuid,_conversation_id uuid,_request_id uuid,_config jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=public.ai_workspace_assert_member(_org_id);r public.ai_routines; fingerprint text;receipt public.ai_workspace_receipts;
BEGIN
  IF _request_id IS NULL OR public.ai_workspace_config_valid(_config) IS DISTINCT FROM true THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  _config:=jsonb_set(_config,'{title}',to_jsonb(left(btrim(workers_private.redact_text(btrim(_config->>'title'))),100)));
  IF public.ai_workspace_config_valid(_config) IS DISTINCT FROM true THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023';END IF;
  _config:=jsonb_set(_config,'{schedule,weekdays}',(SELECT jsonb_agg(x ORDER BY x) FROM jsonb_array_elements(_config#>'{schedule,weekdays}') x));
  fingerprint:=encode(sha256(convert_to(_conversation_id::text||_config::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,16102026));
  SELECT * INTO receipt FROM public.ai_workspace_receipts WHERE user_id=actor AND org_id=_org_id AND request_id=_request_id;
  IF FOUND THEN
    IF receipt.kind<>'proposeRoutine' OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'WORKERS_VERSION_CONFLICT' USING ERRCODE='55000'; END IF;
    SELECT * INTO r FROM public.ai_routines WHERE id=receipt.entity_id AND user_id=actor AND org_id=_org_id; RETURN public.ai_workspace_routine_view(r);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_conversations WHERE id=_conversation_id AND org_id=_org_id AND user_id=actor)
    OR public.ai_workspace_recipe_allowed(_org_id,_config) IS NOT TRUE THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF (SELECT count(*) FROM public.ai_routines WHERE user_id=actor AND created_at>now()-interval '1 day')>=30 THEN RAISE EXCEPTION 'WORKERS_RATE_LIMITED' USING ERRCODE='54000';END IF;
  INSERT INTO public.ai_routines(org_id,user_id,conversation_id,request_id,config,expires_at) VALUES(_org_id,actor,_conversation_id,_request_id,_config,clock_timestamp()+interval '15 minutes') RETURNING * INTO r;
  INSERT INTO public.ai_workspace_receipts VALUES(_org_id,actor,_request_id,'proposeRoutine',fingerprint,r.id,now());
  RETURN public.ai_workspace_routine_view(r);
END $$;
CREATE FUNCTION public.ai_workspace_confirm_routine(_org_id uuid,_routine_id uuid,_expected_version integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=public.ai_workspace_assert_member(_org_id);r public.ai_routines;t timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,16102026));
  SELECT * INTO r FROM public.ai_routines WHERE id=_routine_id AND user_id=actor AND org_id=_org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  t:=clock_timestamp();
  IF r.status='active' AND r.confirmed_version=_expected_version THEN RETURN public.ai_workspace_routine_view(r); END IF;
  IF r.version IS DISTINCT FROM _expected_version OR r.status<>'proposed' THEN RAISE EXCEPTION 'WORKERS_VERSION_CONFLICT' USING ERRCODE='55000'; END IF;
  IF r.expires_at<=t THEN UPDATE public.ai_routines SET status='expired',version=version+1,updated_at=t WHERE id=r.id RETURNING * INTO r;RETURN public.ai_workspace_routine_view(r);END IF;
  IF public.ai_workspace_recipe_allowed(_org_id,r.config) IS NOT TRUE THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF (SELECT count(*) FROM public.ai_routines WHERE user_id=actor AND status='active')>=10 THEN RAISE EXCEPTION 'WORKERS_RATE_LIMITED' USING ERRCODE='54000';END IF;
  UPDATE public.ai_routines SET status='active',confirmed_version=version,version=version+1,next_scheduled_at=public.ai_workspace_next_schedule(config,t),expires_at=NULL,updated_at=t WHERE id=r.id RETURNING * INTO r;
  INSERT INTO public.ai_system_events(org_id,user_id,conversation_id,kind,entity_id,version,label) VALUES(_org_id,actor,r.conversation_id,'routineCreated',r.id,r.version,'Rotina criada: '||(r.config->>'title')||' · '||(public.ai_workspace_routine_view(r)->>'scheduleLabel'));
  RETURN public.ai_workspace_routine_view(r);
END $$;
CREATE FUNCTION public.ai_workspace_set_routine_state(_org_id uuid,_routine_id uuid,_expected_version integer,_state text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=public.ai_workspace_assert_member(_org_id);r public.ai_routines;t timestamptz;
BEGIN
  IF _state IS NULL OR _state NOT IN('active','paused','disabled') THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,16102026));
  SELECT * INTO r FROM public.ai_routines WHERE id=_routine_id AND org_id=_org_id AND user_id=actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF r.status=_state AND r.version=_expected_version+1 THEN RETURN public.ai_workspace_routine_view(r);END IF;
  IF r.version IS DISTINCT FROM _expected_version OR NOT((r.status='proposed' AND _state='disabled') OR (r.status='active' AND _state IN('paused','disabled')) OR (r.status='paused' AND _state IN('active','disabled'))) THEN RAISE EXCEPTION 'WORKERS_VERSION_CONFLICT' USING ERRCODE='55000';END IF;
  IF _state='active' THEN
    PERFORM public.ai_workspace_metadata_budget(actor);
    IF public.ai_workspace_recipe_allowed(_org_id,r.config) IS NOT TRUE THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501';END IF;
    IF (SELECT count(*) FROM public.ai_routines WHERE user_id=actor AND status='active')>=10 THEN RAISE EXCEPTION 'WORKERS_RATE_LIMITED' USING ERRCODE='54000';END IF;
  END IF;
  t:=clock_timestamp();
  UPDATE public.ai_routines SET status=_state,version=version+1,expires_at=NULL,next_scheduled_at=CASE WHEN _state='active' THEN public.ai_workspace_next_schedule(config,t) ELSE NULL END,updated_at=t WHERE id=r.id RETURNING * INTO r;
  INSERT INTO public.ai_system_events(org_id,user_id,conversation_id,kind,entity_id,version,label) VALUES(_org_id,actor,r.conversation_id,'routineChanged',r.id,r.version,CASE _state WHEN 'active' THEN 'Rotina retomada' WHEN 'paused' THEN 'Rotina pausada' ELSE 'Rotina desativada' END);
  RETURN public.ai_workspace_routine_view(r);
END $$;
CREATE FUNCTION public.ai_workspace_undo_routine(_org_id uuid,_routine_id uuid,_expected_version integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=public.ai_workspace_assert_member(_org_id);r public.ai_routines;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,16102026));
  SELECT * INTO r FROM public.ai_routines WHERE id=_routine_id AND org_id=_org_id AND user_id=actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF r.status='cancelled' AND r.version=_expected_version+1 THEN RETURN public.ai_workspace_routine_view(r);END IF;
  IF r.version IS DISTINCT FROM _expected_version OR r.status NOT IN('active','paused') OR NOT EXISTS(SELECT 1 FROM public.ai_system_events WHERE entity_id=r.id AND user_id=actor AND org_id=_org_id AND kind='routineCreated' AND version=r.version) THEN RAISE EXCEPTION 'WORKERS_VERSION_CONFLICT' USING ERRCODE='55000';END IF;
  UPDATE public.ai_routines SET status='cancelled',version=version+1,next_scheduled_at=NULL,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
  INSERT INTO public.ai_system_events(org_id,user_id,conversation_id,kind,entity_id,version,label) VALUES(_org_id,actor,r.conversation_id,'routineUndone',r.id,r.version,'Rotina desfeita: futuras execuções desativadas');
  RETURN public.ai_workspace_routine_view(r);
END $$;

CREATE FUNCTION public.ai_workspace_claim_due(_org_id uuid,_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=public.ai_workspace_assert_member(_org_id);r public.ai_routines;run public.ai_routine_runs;t timestamptz;today date;due timestamptz;claims jsonb:='[]';n integer:=0;receipt public.ai_workspace_receipts;
BEGIN
  IF _request_id IS NULL THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,16102026));t:=clock_timestamp();today:=(t AT TIME ZONE 'America/Sao_Paulo')::date;
  SELECT * INTO receipt FROM public.ai_workspace_receipts WHERE user_id=actor AND org_id=_org_id AND request_id=_request_id;
  IF FOUND THEN IF receipt.kind<>'executeDue' THEN RAISE EXCEPTION 'WORKERS_VERSION_CONFLICT' USING ERRCODE='55000';END IF;RETURN jsonb_build_object('claims',claims,'serverNow',t,'replayed',true);END IF;
  PERFORM public.ai_workspace_metadata_budget(actor);
  INSERT INTO public.ai_workspace_receipts VALUES(_org_id,actor,_request_id,'executeDue','executeDue',NULL,t);
  FOR r IN SELECT * FROM public.ai_routines WHERE user_id=actor AND org_id=_org_id AND status='active' AND
    (next_scheduled_at<=t OR EXISTS(SELECT 1 FROM public.ai_routine_runs q WHERE q.routine_id=ai_routines.id AND q.state='running' AND q.lease_expires_at<=t)) ORDER BY next_scheduled_at,id FOR UPDATE LOOP
    EXIT WHEN n>=2;
    IF public.ai_workspace_recipe_allowed(_org_id,r.config) IS NOT TRUE THEN CONTINUE;END IF;
    IF (SELECT count(*) FROM public.ai_routine_runs WHERE user_id=actor AND state='running' AND lease_expires_at>t)>=2 THEN EXIT;END IF;
    SELECT * INTO run FROM public.ai_routine_runs WHERE routine_id=r.id AND state='running' AND lease_expires_at<=t ORDER BY scheduled_for DESC LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      PERFORM public.ai_workers_fail_turn(_org_id,run.request_id,'local/readonly-routine',0,0);
      IF run.reference_date=today AND run.routine_version=r.version THEN
        UPDATE public.ai_routine_runs SET generation=generation+1,request_id=gen_random_uuid(),started_at=t,lease_expires_at=t+interval '90 seconds',failure_code=NULL WHERE id=run.id RETURNING * INTO run;
      ELSE
        UPDATE public.ai_routine_runs SET state='skipped',finished_at=t,lease_expires_at=NULL,failure_code='stale_occurrence' WHERE id=run.id;run:=NULL;
      END IF;
    ELSE run:=NULL;END IF;
    IF run.id IS NULL THEN
      IF r.next_scheduled_at>t THEN CONTINUE;END IF;
      due:=r.next_scheduled_at;
      IF (due AT TIME ZONE 'America/Sao_Paulo')::date<today THEN
        INSERT INTO public.ai_routine_runs(org_id,user_id,routine_id,conversation_id,routine_version,scheduled_for,reference_date,state,finished_at,failure_code)
          VALUES(_org_id,actor,r.id,r.conversation_id,r.version,due,(due AT TIME ZONE 'America/Sao_Paulo')::date,'skipped',t,'stale_occurrence') ON CONFLICT(routine_id,scheduled_for) DO NOTHING;
        due:=(today+(r.config#>>'{schedule,localTime}')::time) AT TIME ZONE 'America/Sao_Paulo';
        UPDATE public.ai_routines SET next_scheduled_at=public.ai_workspace_next_schedule(config,t) WHERE id=r.id;
        IF due>t OR NOT(r.config#>'{schedule,weekdays}' @> to_jsonb(ARRAY[extract(isodow FROM today)::int])) THEN CONTINUE;END IF;
      END IF;
      INSERT INTO public.ai_routine_runs(org_id,user_id,routine_id,conversation_id,routine_version,scheduled_for,reference_date,state,started_at,lease_expires_at,catch_up)
        VALUES(_org_id,actor,r.id,r.conversation_id,r.version,due,today,'running',t,t+interval '90 seconds',t>due+interval '1 minute') ON CONFLICT(routine_id,scheduled_for) DO NOTHING RETURNING * INTO run;
      IF NOT FOUND THEN CONTINUE;END IF;
      UPDATE public.ai_routines SET next_scheduled_at=public.ai_workspace_next_schedule(config,t) WHERE id=r.id;
    END IF;
    -- Same transaction and lock as chat admission: routines do not bypass its budget.
    PERFORM public.ai_workers_begin_turn(_org_id,run.request_id,r.config->>'workerId','Execução de rotina: '||(r.config->>'title'),r.conversation_id);
    claims:=claims||jsonb_build_array(jsonb_build_object('run',public.ai_workspace_run_view(run),'generation',run.generation,'config',r.config));n:=n+1;
  END LOOP;
  RETURN jsonb_build_object('claims',claims,'serverNow',t,'replayed',false);
END $$;
CREATE FUNCTION public.ai_workspace_validate_run(_org_id uuid,_run_id uuid,_generation integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=public.ai_workspace_assert_member(_org_id);run public.ai_routine_runs;r public.ai_routines;
BEGIN
  SELECT * INTO run FROM public.ai_routine_runs WHERE id=_run_id AND org_id=_org_id AND user_id=actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501';END IF;
  SELECT * INTO r FROM public.ai_routines WHERE id=run.routine_id AND user_id=actor AND org_id=_org_id;
  IF run.state<>'running' OR run.generation IS DISTINCT FROM _generation OR run.lease_expires_at<=clock_timestamp() OR r.status<>'active' OR r.version IS DISTINCT FROM run.routine_version THEN RAISE EXCEPTION 'WORKERS_VERSION_CONFLICT' USING ERRCODE='55000';END IF;
  IF public.ai_workspace_recipe_allowed(_org_id,r.config) IS NOT TRUE THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501';END IF;
  RETURN public.ai_workspace_run_view(run);
END $$;
CREATE FUNCTION public.ai_workspace_finish_run(_org_id uuid,_run_id uuid,_generation integer,_success boolean,_failure_code text DEFAULT NULL,_alert_kind text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=public.ai_workspace_assert_member(_org_id);run public.ai_routine_runs;r public.ai_routines;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,16102026));
  SELECT * INTO run FROM public.ai_routine_runs WHERE id=_run_id AND org_id=_org_id AND user_id=actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF run.generation IS DISTINCT FROM _generation THEN RAISE EXCEPTION 'WORKERS_VERSION_CONFLICT' USING ERRCODE='55000';END IF;
  IF run.state IN('succeeded','failed') THEN RETURN public.ai_workspace_run_view(run);END IF;
  IF run.state<>'running' OR _success IS NULL OR (_failure_code IS NOT NULL AND _failure_code NOT IN('permissions_changed','data_unavailable','cancelled','rate_limited','scope_unavailable')) THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023';END IF;
  SELECT * INTO r FROM public.ai_routines WHERE id=run.routine_id AND user_id=actor AND org_id=_org_id;
  IF _success THEN PERFORM public.ai_workspace_validate_run(_org_id,_run_id,_generation);END IF;
  IF _alert_kind IS NOT NULL AND NOT((_alert_kind='restaurantConflict' AND r.config#>>'{recipe,recipeId}'='agendaBriefing' AND r.config#>>'{recipe,includeRestaurantConflicts}'='true') OR (_alert_kind='openSalesAge' AND r.config#>>'{recipe,recipeId}'='openSalesAge') OR (_alert_kind='transportWeather' AND r.config#>>'{recipe,recipeId}'='transportWeather')) THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023';END IF;
  IF NOT _success THEN PERFORM public.ai_workers_fail_turn(_org_id,run.request_id,'local/readonly-routine',0,0);END IF;
  UPDATE public.ai_routine_runs SET state=CASE WHEN _success THEN 'succeeded' ELSE 'failed' END,finished_at=clock_timestamp(),lease_expires_at=NULL,failure_code=CASE WHEN _success THEN NULL ELSE coalesce(_failure_code,'data_unavailable') END,result_trust='user_scoped_reported' WHERE id=run.id RETURNING * INTO run;
  INSERT INTO public.ai_system_events(org_id,user_id,conversation_id,kind,entity_id,version,label) VALUES(_org_id,actor,r.conversation_id,'routineRun',run.id,run.generation,CASE WHEN _success THEN 'Execução registrada · sessão autenticada' ELSE 'Execução não concluída' END) ON CONFLICT DO NOTHING;
  IF NOT _success THEN _alert_kind:='routineFailure';END IF;
  IF _alert_kind IS NOT NULL THEN
    INSERT INTO public.ai_inbox_items(org_id,user_id,routine_id,run_id,worker_id,kind,title,href,expires_at)
      VALUES(_org_id,actor,r.id,run.id,r.config->>'workerId',_alert_kind,
        CASE _alert_kind WHEN 'restaurantConflict' THEN 'Revise a consulta de conflitos do Restaurante' WHEN 'openSalesAge' THEN 'Revise a consulta de vendas em aberto' WHEN 'transportWeather' THEN 'Revise o clima dos transportes' ELSE 'Sua rotina precisa de atenção' END,
        CASE _alert_kind WHEN 'restaurantConflict' THEN '/cronograma-eventos' WHEN 'openSalesAge' THEN '/mapa-comercial' WHEN 'transportWeather' THEN '/transports' ELSE '/equipe-ia' END,clock_timestamp()+interval '1 day') ON CONFLICT DO NOTHING;
  END IF;
  RETURN public.ai_workspace_run_view(run);
END $$;

-- Atomic fencing + existing message receipt; no business outputs are stored in runs.
CREATE FUNCTION public.ai_workspace_complete_run(_org_id uuid,_run_id uuid,_generation integer,_content text,_citations jsonb,_tool_names text[],_alert_kind text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=public.ai_workspace_assert_member(_org_id);run public.ai_routine_runs;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,16102026));
  SELECT * INTO run FROM public.ai_routine_runs WHERE id=_run_id AND org_id=_org_id AND user_id=actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF run.generation IS DISTINCT FROM _generation THEN RAISE EXCEPTION 'WORKERS_VERSION_CONFLICT' USING ERRCODE='55000';END IF;
  IF run.state='succeeded' THEN RETURN public.ai_workspace_run_view(run);END IF;
  PERFORM public.ai_workspace_validate_run(_org_id,_run_id,_generation);
  IF _tool_names IS NULL OR coalesce(array_length(_tool_names,1),0)>4 OR EXISTS(SELECT 1 FROM unnest(_tool_names) n WHERE n IS NULL OR n NOT IN('list_events','commission_agenda','restaurant_alert','list_sale_orders','transport_weather')) THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023';END IF;
  PERFORM public.ai_workers_finish_turn(_org_id,run.request_id,workers_private.redact_text(_content),_citations,'local/readonly-routine',0,0,_tool_names,true);
  RETURN public.ai_workspace_finish_run(_org_id,_run_id,_generation,true,NULL,_alert_kind);
END $$;

CREATE FUNCTION public.ai_workspace_save_memory(_org_id uuid,_request_id uuid,_memory_id uuid,_expected_version integer,_worker_id text,_content text,_enabled boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=public.ai_workspace_assert_member(_org_id);m public.ai_memory;receipt public.ai_workspace_receipts;fingerprint text;conversation uuid;
BEGIN
  IF _request_id IS NULL OR _content IS NULL OR char_length(btrim(_content)) NOT BETWEEN 1 AND 1000 OR _enabled IS NULL OR (_worker_id IS NOT NULL AND _worker_id NOT IN('agenda','arena','mapa','interesse','comissao','logistica','caixa','radar')) OR ((_memory_id IS NULL)<>(_expected_version IS NULL)) THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023';END IF;
  _content:=left(btrim(workers_private.redact_text(btrim(_content))),1000);
  IF char_length(_content) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023';END IF;
  fingerprint:=encode(sha256(convert_to(jsonb_build_array(_memory_id,_expected_version,_worker_id,_content,_enabled)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,16102026));
  SELECT * INTO receipt FROM public.ai_workspace_receipts WHERE user_id=actor AND org_id=_org_id AND request_id=_request_id;
  IF FOUND THEN
    IF receipt.kind<>'saveMemory' OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'WORKERS_VERSION_CONFLICT' USING ERRCODE='55000';END IF;
    SELECT * INTO m FROM public.ai_memory WHERE id=receipt.entity_id AND user_id=actor AND org_id=_org_id;RETURN public.ai_workspace_memory_view(m);
  END IF;
  PERFORM public.ai_workspace_metadata_budget(actor);
  IF _memory_id IS NULL THEN
    IF (SELECT count(*) FROM public.ai_memory WHERE user_id=actor)>=100 THEN RAISE EXCEPTION 'WORKERS_RATE_LIMITED' USING ERRCODE='54000';END IF;
    INSERT INTO public.ai_memory(org_id,user_id,worker_id,content,enabled) VALUES(_org_id,actor,_worker_id,_content,_enabled) RETURNING * INTO m;
  ELSE
    SELECT * INTO m FROM public.ai_memory WHERE id=_memory_id AND org_id=_org_id AND user_id=actor FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501';END IF;
    IF m.version IS DISTINCT FROM _expected_version THEN RAISE EXCEPTION 'WORKERS_VERSION_CONFLICT' USING ERRCODE='55000';END IF;
    UPDATE public.ai_memory SET content=_content,worker_id=_worker_id,enabled=_enabled,version=version+1,updated_at=clock_timestamp() WHERE id=m.id RETURNING * INTO m;
  END IF;
  INSERT INTO public.ai_workspace_receipts VALUES(_org_id,actor,_request_id,'saveMemory',fingerprint,m.id,now());
  -- A memory command has no conversation context. Never invent one for the event.
  conversation:=NULL;
  INSERT INTO public.ai_system_events(org_id,user_id,conversation_id,kind,entity_id,version,label) VALUES(_org_id,actor,conversation,'memoryChanged',m.id,m.version,CASE WHEN m.enabled THEN 'Memória explícita atualizada' ELSE 'Memória desativada' END);
  RETURN public.ai_workspace_memory_view(m);
END $$;
CREATE FUNCTION public.ai_workspace_mark_alert_seen(_org_id uuid,_alert_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=public.ai_workspace_assert_member(_org_id);
BEGIN
  UPDATE public.ai_inbox_items SET seen_at=clock_timestamp() WHERE id=_alert_id AND org_id=_org_id AND user_id=actor AND seen_at IS NULL;
  IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM public.ai_inbox_items WHERE id=_alert_id AND org_id=_org_id AND user_id=actor) THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501';END IF;RETURN '{"seen":true}'::jsonb;
END $$;
CREATE FUNCTION public.ai_workspace_snapshot(_org_id uuid,_conversation_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=public.ai_workspace_assert_member(_org_id);
BEGIN
  IF _conversation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ai_conversations WHERE id=_conversation_id AND user_id=actor AND org_id=_org_id) THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501';END IF;
  RETURN jsonb_build_object('serverNow',now(),
    'routines',coalesce((SELECT jsonb_agg(public.ai_workspace_routine_view(r) ORDER BY r.updated_at DESC) FROM(SELECT * FROM public.ai_routines WHERE user_id=actor AND org_id=_org_id AND (_conversation_id IS NULL OR conversation_id=_conversation_id) ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'proposed' THEN 2 ELSE 3 END,updated_at DESC LIMIT 100) r),'[]'::jsonb),
    'runs',coalesce((SELECT jsonb_agg(public.ai_workspace_run_view(r) ORDER BY r.scheduled_for DESC) FROM(SELECT * FROM public.ai_routine_runs WHERE user_id=actor AND org_id=_org_id AND (_conversation_id IS NULL OR conversation_id=_conversation_id) ORDER BY scheduled_for DESC LIMIT 100) r),'[]'::jsonb),
    'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'conversationId',e.conversation_id,'createdAt',e.created_at,'kind',e.kind,'entityId',e.entity_id,'version',e.version,'label',e.label,'canUndo',e.kind='routineCreated' AND EXISTS(SELECT 1 FROM public.ai_routines r WHERE r.id=e.entity_id AND r.org_id=_org_id AND r.user_id=actor AND r.version=e.version AND r.status IN('active','paused'))) ORDER BY e.created_at) FROM(SELECT * FROM public.ai_system_events WHERE user_id=actor AND org_id=_org_id AND conversation_id IS NOT NULL AND (_conversation_id IS NULL OR conversation_id=_conversation_id) ORDER BY created_at DESC LIMIT 200) e),'[]'::jsonb),
    'memories',coalesce((SELECT jsonb_agg(public.ai_workspace_memory_view(m) ORDER BY m.updated_at DESC) FROM public.ai_memory m WHERE m.user_id=actor AND m.org_id=_org_id),'[]'::jsonb),
    'alerts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'workerId',a.worker_id,'kind',a.kind,'title',a.title,'href',a.href,'routineId',a.routine_id,'runId',a.run_id,'createdAt',a.created_at,'expiresAt',a.expires_at,'seenAt',a.seen_at) ORDER BY a.created_at DESC) FROM(SELECT i.* FROM public.ai_inbox_items i JOIN public.ai_routines r ON r.id=i.routine_id AND r.org_id=i.org_id AND r.user_id=i.user_id WHERE i.user_id=actor AND i.org_id=_org_id AND i.expires_at>now() AND (_conversation_id IS NULL OR r.conversation_id=_conversation_id) AND public.ai_workspace_recipe_allowed(_org_id,r.config) ORDER BY i.created_at DESC LIMIT 100) a),'[]'::jsonb));
END $$;
CREATE FUNCTION public.ai_workspace_usage(_org_id uuid,_from timestamptz,_to timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=public.ai_workspace_assert_member(_org_id);
BEGIN
  IF public.get_user_org_role(actor,_org_id)::text IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501';END IF;
  IF _from IS NULL OR _to IS NULL OR NOT isfinite(_from) OR NOT isfinite(_to) OR _from>=_to OR _to-_from>interval '90 days' THEN RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('from',_from,'to',_to,'serverNow',now(),'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('userId',q.user_id,'workerId',q.worker_id,'requests',q.requests,'inputTokens',q.input_tokens,'outputTokens',q.output_tokens,'incompleteMeasurements',q.incomplete,'costUsd',NULL,'costSource','notReported','telemetryTrust','user_scoped')) FROM(
    SELECT user_id,worker_id,count(*)::int requests,sum(input_tokens) input_tokens,sum(output_tokens) output_tokens,count(*) FILTER(WHERE NOT usage_complete)::int incomplete FROM public.ai_usage WHERE org_id=_org_id AND created_at>=_from AND created_at<_to GROUP BY user_id,worker_id ORDER BY user_id,worker_id LIMIT 500) q),'[]'::jsonb));
END $$;

-- Private helpers are not exposed, even though their bodies touch only metadata/authz.
ALTER FUNCTION public.ai_workspace_propose_routine(uuid,uuid,uuid,jsonb) SET lock_timeout='5s';
ALTER FUNCTION public.ai_workspace_confirm_routine(uuid,uuid,integer) SET lock_timeout='5s';
ALTER FUNCTION public.ai_workspace_set_routine_state(uuid,uuid,integer,text) SET lock_timeout='5s';
ALTER FUNCTION public.ai_workspace_undo_routine(uuid,uuid,integer) SET lock_timeout='5s';
ALTER FUNCTION public.ai_workspace_claim_due(uuid,uuid) SET lock_timeout='5s';
ALTER FUNCTION public.ai_workspace_finish_run(uuid,uuid,integer,boolean,text,text) SET lock_timeout='5s';
ALTER FUNCTION public.ai_workspace_complete_run(uuid,uuid,integer,text,jsonb,text[],text) SET lock_timeout='5s';
ALTER FUNCTION public.ai_workspace_save_memory(uuid,uuid,uuid,integer,text,text,boolean) SET lock_timeout='5s';
ALTER FUNCTION public.ai_workspace_mark_alert_seen(uuid,uuid) SET lock_timeout='5s';
REVOKE ALL ON FUNCTION public.ai_workspace_assert_member(uuid),public.ai_workspace_metadata_budget(uuid),public.ai_workspace_config_valid(jsonb),public.ai_workspace_recipe_allowed(uuid,jsonb),public.ai_workspace_next_schedule(jsonb,timestamptz),public.ai_workspace_routine_view(public.ai_routines),public.ai_workspace_run_view(public.ai_routine_runs),public.ai_workspace_memory_view(public.ai_memory) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_workspace_propose_routine(uuid,uuid,uuid,jsonb),public.ai_workspace_confirm_routine(uuid,uuid,integer),public.ai_workspace_set_routine_state(uuid,uuid,integer,text),public.ai_workspace_undo_routine(uuid,uuid,integer),public.ai_workspace_claim_due(uuid,uuid),public.ai_workspace_validate_run(uuid,uuid,integer),public.ai_workspace_finish_run(uuid,uuid,integer,boolean,text,text),public.ai_workspace_complete_run(uuid,uuid,integer,text,jsonb,text[],text),public.ai_workspace_save_memory(uuid,uuid,uuid,integer,text,text,boolean),public.ai_workspace_mark_alert_seen(uuid,uuid),public.ai_workspace_snapshot(uuid,uuid),public.ai_workspace_usage(uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_workspace_propose_routine(uuid,uuid,uuid,jsonb),public.ai_workspace_confirm_routine(uuid,uuid,integer),public.ai_workspace_set_routine_state(uuid,uuid,integer,text),public.ai_workspace_undo_routine(uuid,uuid,integer),public.ai_workspace_claim_due(uuid,uuid),public.ai_workspace_validate_run(uuid,uuid,integer),public.ai_workspace_finish_run(uuid,uuid,integer,boolean,text,text),public.ai_workspace_complete_run(uuid,uuid,integer,text,jsonb,text[],text),public.ai_workspace_save_memory(uuid,uuid,uuid,integer,text,text,boolean),public.ai_workspace_mark_alert_seen(uuid,uuid),public.ai_workspace_snapshot(uuid,uuid),public.ai_workspace_usage(uuid,timestamptz,timestamptz) TO authenticated;
COMMENT ON TABLE public.ai_routine_runs IS 'Metadata only. Rich results use existing own ai_messages; reports and usage are user_scoped, never attested billing. Active-session JWT execution, no stored tokens.';
COMMENT ON TABLE public.ai_memory IS 'Explicit personal preferences only; never permission grants, provider system instructions, raw attachments or transcript storage.';
COMMENT ON TABLE public.ai_inbox_items IS 'Own in-app reported condition references; no business body, third-party delivery, push, email or tokens.';
