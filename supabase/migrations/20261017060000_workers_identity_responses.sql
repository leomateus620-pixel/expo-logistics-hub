-- Incremental visual identities, no new tables or data changes.
-- Apply only after preflight; existing version-1 and legacy responses stay valid.
-- Recovery: restore the two sanitizer helpers from 20261017030000; retain messages.
-- Incremental response persistence. No table rewrite; legacy messages remain readable.
-- Rollback: restore ai_workers_finish_turn from 20261016120000 before dropping these helpers.
-- Deploy together with workers-orchestrator; never blanket-regex serialized JSON.
BEGIN;
CREATE OR REPLACE FUNCTION workers_private.sanitize_response_value(_value jsonb,_key text,_citations jsonb,_depth integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE result jsonb; entry record; item jsonb; text_value text;
BEGIN
  IF _depth>12 THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
  IF jsonb_typeof(_value)='object' THEN
    result:='{}'::jsonb;
    FOR entry IN SELECT * FROM jsonb_each(_value) LOOP
      IF entry.key NOT IN('choices','id','entityKind','visualKey','events','position','version','worker','intent','summary','metadata','blocks','organizationId','edition','projectId','period','from','to','label','timezone','scope','updatedAt','completeness','notes','filters','relationship','commissionId','personId','type','text','items','value','unit','description','title','data','population','complete','columns','rows','current','previous','name','role','verifiedOn','publishedOn','photoUrl','details','url','source','date','message','question','options','currentLabel','previousLabel','query','group_by','status','search','location','category','priority','weekday','commission_id','block','min_area','max_area','covered','electricity','water','internet','missing_number','missing_area','missing_time','missing_location','missing_category','cross_midnight','cross_period','start_in_period') THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
      result:=result||jsonb_build_object(entry.key,workers_private.sanitize_response_value(entry.value,entry.key,_citations,_depth+1));
    END LOOP;
    RETURN result;
  ELSIF jsonb_typeof(_value)='array' THEN
    IF jsonb_array_length(_value)>30 THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
    result:='[]'::jsonb;
    FOR item IN SELECT * FROM jsonb_array_elements(_value) LOOP
      result:=result||jsonb_build_array(workers_private.sanitize_response_value(item,_key,_citations,_depth+1));
    END LOOP;
    RETURN result;
  ELSIF jsonb_typeof(_value)='string' THEN
    text_value:=_value#>>'{}';
    IF char_length(text_value)>1200 OR text_value~'[<>`]' THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
    IF _key IN('url','photoUrl') THEN
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_citations) c WHERE c->>'url'=text_value) THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE_SOURCE' USING ERRCODE='22023';END IF;
      RETURN _value;
    ELSIF _key IN('organizationId','projectId','commissionId','personId','commission_id','id') THEN
      IF text_value!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
      RETURN _value;
    ELSIF _key IN('from','to','date','verifiedOn','publishedOn') THEN
      IF text_value!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
      PERFORM text_value::date;RETURN _value;
    ELSIF _key='updatedAt' THEN
      IF text_value!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
      PERFORM text_value::timestamptz;RETURN _value;
    END IF;
    RETURN to_jsonb(public.ai_workers_redact_text(text_value));
  ELSIF jsonb_typeof(_value) IN('number','boolean','null') THEN
    -- Numeric facts are never treated as CPF/telephone strings.
    IF jsonb_typeof(_value)='number' AND abs((_value#>>'{}')::numeric)>9007199254740991 THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
    RETURN _value;
  END IF;
  RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION workers_private.sanitize_response_value(jsonb,text,jsonb,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION workers_private.sanitize_response_content(_content text,_org_id uuid,_citations jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE document jsonb;block jsonb;item jsonb;row_value jsonb;cell jsonb;chart_value jsonb;body text;allowed_keys text[];
BEGIN
  IF left(_content,21)<>E'```fenasoja-response\n' THEN RETURN public.ai_workers_redact_text(_content);END IF;
  IF right(_content,4)<>E'\n```' THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
  body:=substring(_content FROM 22 FOR char_length(_content)-25);
  document:=body::jsonb;
  IF jsonb_typeof(document) IS DISTINCT FROM 'object' OR document->'version' IS DISTINCT FROM '1'::jsonb OR document->>'worker' IS NULL OR document->>'worker' NOT IN('agenda','arena','mapa','interesse','comissao','logistica','caixa','radar')
    OR char_length(coalesce(document->>'intent','')) NOT BETWEEN 1 AND 180 OR char_length(coalesce(document->>'summary','')) NOT BETWEEN 1 AND 1200
    OR jsonb_typeof(document->'metadata') IS DISTINCT FROM 'object' OR document#>>'{metadata,organizationId}' IS DISTINCT FROM _org_id::text
    OR document#>>'{metadata,timezone}' IS DISTINCT FROM 'America/Sao_Paulo' OR document#>>'{metadata,completeness}' IS NULL OR document#>>'{metadata,completeness}' NOT IN('complete','partial','unavailable')
    OR char_length(coalesce(document#>>'{metadata,scope}','')) NOT BETWEEN 1 AND 180 OR document#>>'{metadata,updatedAt}' IS NULL
    OR jsonb_typeof(document#>'{metadata,notes}') IS DISTINCT FROM 'array' OR jsonb_array_length(document#>'{metadata,notes}')>8
    OR jsonb_typeof(document->'blocks') IS DISTINCT FROM 'array' OR jsonb_array_length(document->'blocks')>12
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(document) k WHERE k NOT IN('version','worker','intent','summary','metadata','blocks')) THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
  FOR block IN SELECT * FROM jsonb_array_elements(document->'blocks') LOOP
    IF jsonb_typeof(block)<>'object' OR block->>'type' IS NULL OR block->>'type' NOT IN('summary','indicators','bar_chart','pie_chart','table','comparison','profile','sources','empty','clarification','entity_ranking') THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
    allowed_keys:=CASE block->>'type'
      WHEN 'summary' THEN ARRAY['type','text'] WHEN 'indicators' THEN ARRAY['type','items'] WHEN 'bar_chart' THEN ARRAY['type','title','unit','data','population','complete'] WHEN 'pie_chart' THEN ARRAY['type','title','unit','data','population','complete']
      WHEN 'table' THEN ARRAY['type','title','columns','rows'] WHEN 'comparison' THEN ARRAY['type','title','unit','items','currentLabel','previousLabel'] WHEN 'profile' THEN ARRAY['type','name','role','edition','verifiedOn','publishedOn','photoUrl','details']
      WHEN 'entity_ranking' THEN ARRAY['type','title','entityKind','population','items'] WHEN 'sources' THEN ARRAY['type','items'] WHEN 'empty' THEN ARRAY['type','message'] WHEN 'clarification' THEN ARRAY['type','question','options','choices'] END;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(block) k WHERE NOT k=ANY(allowed_keys)) THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
    IF block->>'type'='table' THEN
      IF jsonb_typeof(block->'columns') IS DISTINCT FROM 'array' OR jsonb_array_length(block->'columns') NOT BETWEEN 1 AND 8 OR jsonb_typeof(block->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(block->'rows')>30 THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(block->'columns') c WHERE jsonb_typeof(c)<>'string' OR char_length(c#>>'{}') NOT BETWEEN 1 AND 180) THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
      FOR row_value IN SELECT * FROM jsonb_array_elements(block->'rows') LOOP
        IF jsonb_typeof(row_value) IS DISTINCT FROM 'array' OR jsonb_array_length(row_value)<>jsonb_array_length(block->'columns') THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
        FOR cell IN SELECT * FROM jsonb_array_elements(row_value) LOOP IF jsonb_typeof(cell)<>'string' OR char_length(cell#>>'{}')>400 THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;END LOOP;
      END LOOP;
    ELSIF block->>'type' IN('indicators','comparison') THEN
      IF jsonb_typeof(block->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(block->'items') NOT BETWEEN 1 AND 8 THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
      FOR item IN SELECT * FROM jsonb_array_elements(block->'items') LOOP
        IF jsonb_typeof(item)<>'object' OR jsonb_typeof(item->'label') IS DISTINCT FROM 'string' OR char_length(coalesce(item->>'label','')) NOT BETWEEN 1 AND 180 OR block->>'type'='indicators' AND (item->>'unit' IS NULL OR item->>'unit' NOT IN('count','BRL','percent','minutes'))
          OR block->>'type'='indicators' AND jsonb_typeof(item->'value') IS DISTINCT FROM 'number'
          OR block->>'type'='comparison' AND (jsonb_typeof(item->'current') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'previous') IS DISTINCT FROM 'number') THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
      END LOOP;
    ELSIF block->>'type' IN('bar_chart','pie_chart') THEN
      IF document#>>'{metadata,completeness}'<>'complete' OR block->'complete' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(block->'data') IS DISTINCT FROM 'array' OR jsonb_array_length(block->'data') NOT BETWEEN 1 AND 20
        OR jsonb_typeof(block->'population') IS DISTINCT FROM 'number' OR char_length(coalesce(block->>'title','')) NOT BETWEEN 1 AND 180 OR block->>'unit' IS NULL OR block->>'unit' NOT IN('count','BRL','percent','minutes') THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
      FOR chart_value IN SELECT * FROM jsonb_array_elements(block->'data') LOOP
        IF char_length(coalesce(chart_value->>'label','')) NOT BETWEEN 1 AND 180 OR jsonb_typeof(chart_value->'value') IS DISTINCT FROM 'number' OR (chart_value->>'value')::numeric<0 THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
      END LOOP;
      IF (block->>'type'='pie_chart' AND (block->>'population')::numeric<>jsonb_array_length(block->'data')) OR (block->>'population')::numeric<jsonb_array_length(block->'data') OR (SELECT count(DISTINCT v->>'label') FROM jsonb_array_elements(block->'data') v)<>jsonb_array_length(block->'data') THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
    ELSIF block->>'type'='clarification' AND block ? 'choices' THEN
      IF char_length(coalesce(block->>'question','')) NOT BETWEEN 1 AND 1200 OR jsonb_typeof(block->'choices') IS DISTINCT FROM 'array'
        OR jsonb_array_length(block->'choices') NOT BETWEEN 1 AND 8
        OR (block ? 'options' AND (jsonb_typeof(block->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(block->'options')<>jsonb_array_length(block->'choices'))) THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023'; END IF;
      FOR item IN SELECT * FROM jsonb_array_elements(block->'choices') LOOP
        IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN('id','name'))
          OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string' OR coalesce(item->>'id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string' OR char_length(coalesce(item->>'name','')) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023'; END IF;
      END LOOP;
      IF (SELECT count(DISTINCT c->>'id') FROM jsonb_array_elements(block->'choices') c)<>jsonb_array_length(block->'choices') THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023'; END IF;
    ELSIF block->>'type'='entity_ranking' THEN
      IF char_length(coalesce(block->>'title','')) NOT BETWEEN 1 AND 180 OR block->>'entityKind' IS NULL OR block->>'entityKind' NOT IN ('person','commission')
        OR jsonb_typeof(block->'population') IS DISTINCT FROM 'number' OR (block->>'population')::numeric<0 OR trunc((block->>'population')::numeric)<>(block->>'population')::numeric
        OR jsonb_typeof(block->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(block->'items') NOT BETWEEN 1 AND 30 OR (block->>'population')::numeric<jsonb_array_length(block->'items') THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023'; END IF;
      FOR item IN SELECT * FROM jsonb_array_elements(block->'items') LOOP
        IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN ('id','name','label','visualKey','events','position'))
          OR coalesce(item->>'id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string' OR char_length(coalesce(item->>'name','')) NOT BETWEEN 1 AND 180
          OR (item ? 'label' AND (jsonb_typeof(item->'label') IS DISTINCT FROM 'string' OR char_length(item->>'label') NOT BETWEEN 1 AND 180))
          OR (item ? 'visualKey' AND (block->>'entityKind'='person' OR jsonb_typeof(item->'visualKey') IS DISTINCT FROM 'string' OR item->>'visualKey'!~'^[a-z][a-z0-9-]{0,100}$'))
          OR jsonb_typeof(item->'events') IS DISTINCT FROM 'number' OR (item->>'events')::numeric<0 OR trunc((item->>'events')::numeric)<>(item->>'events')::numeric
          OR jsonb_typeof(item->'position') IS DISTINCT FROM 'number' OR (item->>'position')::numeric<1 OR trunc((item->>'position')::numeric)<>(item->>'position')::numeric THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023'; END IF;
      END LOOP;
      IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(block->'items') x)<>jsonb_array_length(block->'items') OR EXISTS(
        SELECT 1 FROM (SELECT x, ord, lag((x->>'events')::numeric) OVER (ORDER BY ord) previous FROM jsonb_array_elements(block->'items') WITH ORDINALITY a(x,ord)) ranked
        WHERE (x->>'position')::numeric<>ord OR (previous IS NOT NULL AND (x->>'events')::numeric>previous)
      ) THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023'; END IF;
    ELSIF block->>'type'='sources' THEN
      IF jsonb_typeof(block->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(block->'items') NOT BETWEEN 1 AND 8 OR EXISTS(SELECT 1 FROM jsonb_array_elements(block->'items') s WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_citations) c WHERE c->>'url'=s->>'url' AND c->>'source'=s->>'source' AND coalesce(c->>'date','')=coalesce(s->>'date',''))) THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE_SOURCE' USING ERRCODE='22023';END IF;
    ELSIF block->>'type'='profile' THEN
      IF char_length(coalesce(block->>'name','')) NOT BETWEEN 1 AND 180 OR char_length(coalesce(block->>'role','')) NOT BETWEEN 1 AND 180 OR char_length(coalesce(block->>'edition','')) NOT BETWEEN 1 AND 180 OR block->>'verifiedOn' IS NULL OR jsonb_typeof(block->'details') IS DISTINCT FROM 'array' OR jsonb_array_length(block->'details')>6 THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
    ELSIF block->>'type'='summary' AND char_length(coalesce(block->>'text','')) NOT BETWEEN 1 AND 1200 OR block->>'type'='empty' AND char_length(coalesce(block->>'message','')) NOT BETWEEN 1 AND 1200 OR block->>'type'='clarification' AND char_length(coalesce(block->>'question','')) NOT BETWEEN 1 AND 1200 THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
  END LOOP;
  RETURN E'```fenasoja-response\n'||workers_private.sanitize_response_value(document,'',_citations)::text||E'\n```';
END $$;
REVOKE ALL ON FUNCTION workers_private.sanitize_response_content(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;


COMMIT;
