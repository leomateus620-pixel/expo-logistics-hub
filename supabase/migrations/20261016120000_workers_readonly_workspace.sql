-- Workers Fenasoja, phases 0/1. Additive only; no business policies or writes.
-- Telemetry is user-scoped, not an attested provider billing ledger.
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  -- Identity is validated by auth.uid() and active org membership in every RPC/policy.
  -- Lovable schema rules do not permit a public-table FK into auth.users.
  user_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  worker_id text NOT NULL CHECK (worker_id IN ('agenda','arena','mapa','interesse','comissao','logistica','caixa','radar')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, org_id, user_id)
);

CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  request_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  worker_id text NOT NULL CHECK (worker_id IN ('agenda','arena','mapa','interesse','comissao','logistica','caixa','radar')),
  content text NOT NULL DEFAULT '' CHECK (char_length(content) <= 24000),
  citations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) <= 30),
  state text NOT NULL CHECK (state IN ('pending','complete','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (conversation_id, org_id, user_id) REFERENCES public.ai_conversations(id, org_id, user_id),
  UNIQUE (user_id, request_id, role),
  CHECK (role <> 'user' OR (state = 'complete' AND citations = '[]'::jsonb))
);

CREATE TABLE public.ai_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  request_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('turn_started','tool_completed','turn_completed','turn_failed')),
  tool_name text CHECK (tool_name IS NULL OR tool_name ~ '^[a-z][a-z0-9_]{0,79}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (conversation_id, org_id, user_id) REFERENCES public.ai_conversations(id, org_id, user_id)
);

CREATE TABLE public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  request_id uuid NOT NULL,
  worker_id text NOT NULL CHECK (worker_id IN ('agenda','arena','mapa','interesse','comissao','logistica','caixa','radar')),
  provider text NOT NULL CHECK (provider = 'lovable'),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 128 AND model ~ '^[a-z0-9-]+/[A-Za-z0-9._-]+$'),
  input_tokens integer NOT NULL CHECK (input_tokens BETWEEN 0 AND 200000),
  output_tokens integer NOT NULL CHECK (output_tokens BETWEEN 0 AND 50000),
  outcome text NOT NULL DEFAULT 'completed' CHECK (outcome IN ('completed','failed')),
  usage_complete boolean NOT NULL DEFAULT true,
  cost_usd numeric(14,8) CHECK (cost_usd IS NULL),
  telemetry_trust text NOT NULL DEFAULT 'user_scoped' CHECK (telemetry_trust = 'user_scoped'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (conversation_id, org_id, user_id) REFERENCES public.ai_conversations(id, org_id, user_id),
  UNIQUE (user_id, request_id)
);

REVOKE ALL ON public.ai_conversations, public.ai_messages, public.ai_audit_events, public.ai_usage FROM anon, authenticated;
GRANT SELECT ON public.ai_conversations, public.ai_messages, public.ai_audit_events, public.ai_usage TO authenticated;

CREATE INDEX ai_conversations_owner_updated_idx ON public.ai_conversations(user_id, org_id, updated_at DESC);
CREATE INDEX ai_messages_conversation_idx ON public.ai_messages(conversation_id, created_at, id);
CREATE INDEX ai_messages_owner_rate_idx ON public.ai_messages(user_id, created_at) WHERE role = 'user';
CREATE INDEX ai_audit_events_owner_idx ON public.ai_audit_events(user_id, org_id, created_at DESC);
CREATE INDEX ai_usage_owner_idx ON public.ai_usage(user_id, org_id, created_at DESC);

CREATE FUNCTION public.ai_workers_member_org_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.org_id FROM public.org_members m WHERE m.user_id = auth.uid() AND m.is_active;
$$;
REVOKE ALL ON FUNCTION public.ai_workers_member_org_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_workers_member_org_ids() TO authenticated;

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_conversations_read_own ON public.ai_conversations FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND org_id IN (SELECT public.ai_workers_member_org_ids()));
CREATE POLICY ai_messages_read_own ON public.ai_messages FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND org_id IN (SELECT public.ai_workers_member_org_ids()));
CREATE POLICY ai_audit_events_read_own ON public.ai_audit_events FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND org_id IN (SELECT public.ai_workers_member_org_ids()));
CREATE POLICY ai_usage_read_own ON public.ai_usage FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND org_id IN (SELECT public.ai_workers_member_org_ids()));

CREATE FUNCTION public.ai_workers_redact_text(_text text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE result text := coalesce(_text, '');
BEGIN
  result := regexp_replace(result, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[e-mail protegido]', 'g');
  result := regexp_replace(result, '\m[0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}\M', '[documento protegido]', 'g');
  result := regexp_replace(result, '(\+?55[ -]?)?\(?[0-9]{2}\)?[ -]?[0-9]{4,5}[ -]?[0-9]{4}', '[telefone protegido]', 'g');
  result := regexp_replace(result, '(?i)(bearer[ ]+|sk-|sb_secret_)[A-Za-z0-9._-]+', '[segredo protegido]', 'g');
  result := regexp_replace(result, '(?i)(pix[ :]+)[^ ,;\n]+', 'PIX [protegido]', 'g');
  result := regexp_replace(result, '(?i)https?://[^[:space:]]+', '[link externo omitido]', 'g');
  result := regexp_replace(result, '(?i)/areas/[^/[:space:]]+/[^[:space:]]+', '[link público protegido]', 'g');
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.ai_workers_redact_text(text) FROM PUBLIC, anon, authenticated;

-- Serializes admission per user: concurrent requests cannot bypass request limits.
CREATE FUNCTION public.ai_workers_begin_turn(
  _org_id uuid, _request_id uuid, _worker_id text, _message text, _conversation_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); conversation uuid; existing public.ai_messages; content text;
BEGIN
  IF actor IS NULL OR _org_id NOT IN (SELECT public.ai_workers_member_org_ids()) THEN
    RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _request_id IS NULL OR _worker_id NOT IN ('agenda','arena','mapa','interesse','comissao','logistica','caixa','radar')
    OR _message IS NULL OR char_length(btrim(_message)) NOT BETWEEN 1 AND 6000 THEN
    RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text, 16102026));
  SELECT * INTO existing FROM public.ai_messages WHERE user_id = actor AND request_id = _request_id AND role = 'assistant';
  IF FOUND THEN
    IF existing.org_id <> _org_id OR (_conversation_id IS NOT NULL AND existing.conversation_id <> _conversation_id) THEN
      RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    IF existing.state = 'complete' THEN
      RETURN jsonb_build_object('conversationId', existing.conversation_id, 'replayed', true, 'content', existing.content,
        'citations', existing.citations, 'workerId', existing.worker_id);
    END IF;
    RAISE EXCEPTION 'WORKERS_REQUEST_IN_PROGRESS_OR_FAILED' USING ERRCODE = '55000';
  END IF;
  IF (SELECT count(*) FROM public.ai_messages WHERE user_id = actor AND role = 'user' AND created_at > now() - interval '1 minute') >= 8
    OR (SELECT count(*) FROM public.ai_messages WHERE user_id = actor AND role = 'user' AND created_at > now() - interval '1 day') >= 120
    OR (SELECT count(*) FROM public.ai_messages WHERE user_id = actor AND role = 'assistant' AND state = 'pending' AND created_at > now() - interval '2 minutes') >= 2 THEN
    RAISE EXCEPTION 'WORKERS_RATE_LIMITED' USING ERRCODE = '54000';
  END IF;
  content := public.ai_workers_redact_text(btrim(_message));
  conversation := _conversation_id;
  IF conversation IS NULL THEN
    INSERT INTO public.ai_conversations(org_id, user_id, title, worker_id)
      VALUES (_org_id, actor, left(content, 100), _worker_id) RETURNING id INTO conversation;
  ELSIF NOT EXISTS (SELECT 1 FROM public.ai_conversations WHERE id = conversation AND org_id = _org_id AND user_id = actor) THEN
    RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.ai_messages(org_id,user_id,conversation_id,request_id,role,worker_id,content,state)
    VALUES (_org_id,actor,conversation,_request_id,'user',_worker_id,content,'complete'),
      (_org_id,actor,conversation,_request_id,'assistant',_worker_id,'','pending');
  INSERT INTO public.ai_audit_events(org_id,user_id,conversation_id,request_id,event)
    VALUES (_org_id,actor,conversation,_request_id,'turn_started');
  RETURN jsonb_build_object('conversationId', conversation, 'replayed', false);
END $$;

CREATE FUNCTION public.ai_workers_finish_turn(
  _org_id uuid, _request_id uuid, _content text, _citations jsonb, _model text,
  _input_tokens integer, _output_tokens integer, _tool_names text[] DEFAULT ARRAY[]::text[], _usage_complete boolean DEFAULT true
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); msg public.ai_messages; item jsonb; tool text; safe_citations jsonb := '[]'::jsonb;
BEGIN
  IF actor IS NULL OR _org_id NOT IN (SELECT public.ai_workers_member_org_ids()) THEN
    RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO msg FROM public.ai_messages WHERE user_id=actor AND org_id=_org_id AND request_id=_request_id AND role='assistant' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF msg.state = 'complete' THEN RETURN; END IF;
  IF msg.state <> 'pending' OR char_length(coalesce(_content,'')) NOT BETWEEN 1 AND 24000
    OR jsonb_typeof(_citations) IS DISTINCT FROM 'array' OR jsonb_array_length(_citations) > 30
    OR coalesce(array_length(_tool_names,1),0) > 8 THEN
    RAISE EXCEPTION 'WORKERS_INVALID_COMPLETION' USING ERRCODE = '22023';
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(_citations) LOOP
    IF jsonb_typeof(item) <> 'object' OR item->>'source' IS NULL OR item->>'source' NOT IN ('app','web')
      OR char_length(coalesce(item->>'label','')) NOT BETWEEN 1 AND 160
      OR char_length(coalesce(item->>'url','')) NOT BETWEEN 1 AND 1500
      OR (item->>'source'='app' AND (item->>'url' NOT LIKE '/%' OR item->>'url' LIKE '//%' OR item->>'url' ~ '[[:space:]\\<>]'
        OR item->>'url' ~* '^/areas(/|$)' OR item->>'url' ~* '[?&](token|email|phone|cpf|pix)='))
      OR (item->>'source'='web' AND (item->>'url' !~ '^https://([a-z0-9-]+\.)*(fenasoja\.com\.br|gov\.br|embrapa\.br)(/|$)'
        OR item->>'url' ~* '(/|%2f)(a|%[46]1)(r|%[57]2)(e|%[46]5)(a|%[46]1)(s|%[57]3)(/|%2f|$)'
        OR coalesce(item->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')) THEN
      RAISE EXCEPTION 'WORKERS_INVALID_CITATION' USING ERRCODE = '22023';
    END IF;
    safe_citations := safe_citations || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'label',public.ai_workers_redact_text(item->>'label'),'url',item->>'url','source',item->>'source',
      'date',CASE WHEN item->>'source'='web' THEN item->>'date' ELSE NULL END)));
  END LOOP;
  UPDATE public.ai_messages SET content=public.ai_workers_redact_text(_content),citations=safe_citations,state='complete' WHERE id=msg.id;
  UPDATE public.ai_conversations SET updated_at=now() WHERE id=msg.conversation_id;
  INSERT INTO public.ai_usage(org_id,user_id,conversation_id,request_id,worker_id,provider,model,input_tokens,output_tokens,usage_complete)
    VALUES (_org_id,actor,msg.conversation_id,_request_id,msg.worker_id,'lovable',_model,_input_tokens,_output_tokens,coalesce(_usage_complete,false));
  FOREACH tool IN ARRAY _tool_names LOOP
    INSERT INTO public.ai_audit_events(org_id,user_id,conversation_id,request_id,event,tool_name)
      VALUES (_org_id,actor,msg.conversation_id,_request_id,'tool_completed',tool);
  END LOOP;
  INSERT INTO public.ai_audit_events(org_id,user_id,conversation_id,request_id,event)
    VALUES (_org_id,actor,msg.conversation_id,_request_id,'turn_completed');
END $$;

CREATE FUNCTION public.ai_workers_fail_turn(_org_id uuid, _request_id uuid, _model text DEFAULT NULL, _input_tokens integer DEFAULT 0, _output_tokens integer DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); msg public.ai_messages;
BEGIN
  IF actor IS NULL OR _org_id NOT IN (SELECT public.ai_workers_member_org_ids()) THEN
    RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  UPDATE public.ai_messages SET state='failed' WHERE user_id=actor AND org_id=_org_id AND request_id=_request_id
    AND role='assistant' AND state='pending' RETURNING * INTO msg;
  IF FOUND THEN
    INSERT INTO public.ai_audit_events(org_id,user_id,conversation_id,request_id,event)
      VALUES (_org_id,actor,msg.conversation_id,_request_id,'turn_failed');
    IF _model IS NOT NULL THEN
      INSERT INTO public.ai_usage(org_id,user_id,conversation_id,request_id,worker_id,provider,model,input_tokens,output_tokens,outcome,usage_complete)
        VALUES (_org_id,actor,msg.conversation_id,_request_id,msg.worker_id,'lovable',_model,_input_tokens,_output_tokens,'failed',false)
        ON CONFLICT (user_id,request_id) DO NOTHING;
    END IF;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.ai_workers_begin_turn(uuid,uuid,text,text,uuid),
  public.ai_workers_finish_turn(uuid,uuid,text,jsonb,text,integer,integer,text[],boolean),
  public.ai_workers_fail_turn(uuid,uuid,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_workers_begin_turn(uuid,uuid,text,text,uuid),
  public.ai_workers_finish_turn(uuid,uuid,text,jsonb,text,integer,integer,text[],boolean),
  public.ai_workers_fail_turn(uuid,uuid,text,integer,integer) TO authenticated;

COMMENT ON TABLE public.ai_usage IS 'User-scoped operational telemetry, not attested billing; cost remains unknown. No admin cross-user access in phases 0/1.';
COMMENT ON TABLE public.ai_audit_events IS 'Append-only request/tool metadata. Never store tool arguments, business outputs, personal data or secrets.';
