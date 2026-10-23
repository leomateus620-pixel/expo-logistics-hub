-- Additive response compatibility for typed report focus and comparisons.
-- Preserve existing messages and immutable snapshots; no commercial facts change.
BEGIN;
CREATE OR REPLACE FUNCTION workers_private.sanitize_commercial_response_value(v jsonb,k text DEFAULT '',depth integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE entry record; item jsonb; answer jsonb; t text;
BEGIN
 IF depth>12 THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(v)='object' THEN
  answer:='{}';
  FOR entry IN SELECT * FROM jsonb_each(v) LOOP
   IF entry.key NOT IN('reportFocus','documentFilter','comparisonPeriod','issuesOnly','orderIds','contractIds','contractSearch','orderSearch','documentStates','schemaVersion','projectId','editionYear','scopes','kind','id','scopeSearch','geography','saleStates','inventoryStates','contractFilter','exhibitorIds','companySearch','period','from','to','basis','minArea','maxArea','minValueCents','maxValueCents','missingArea','missingCompany','monetaryBasis','groupBy','sortBy','sortDirection','sections','presentation','type','snapshotId','reportId','title','scopeLabels','filterLabels','generatedAt','generation','rowCount','previewCount','coverage','complete','excludedRows','issues','code','count','capabilities','companyNames','monetaryValues','contractReferences','status','expiresAt','lotCount','missingGeometryCount') THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
   answer:=answer||jsonb_build_object(entry.key,workers_private.sanitize_commercial_response_value(entry.value,entry.key,depth+1));
  END LOOP;
  RETURN answer;
 ELSIF jsonb_typeof(v)='array' THEN
  IF jsonb_array_length(v)>100 THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
  answer:='[]';FOR item IN SELECT * FROM jsonb_array_elements(v) LOOP answer:=answer||jsonb_build_array(workers_private.sanitize_commercial_response_value(item,k,depth+1));END LOOP;RETURN answer;
 ELSIF jsonb_typeof(v)='string' THEN
  t:=v#>>'{}';
  IF length(t)>1200 OR t~'[<>`]' OR t~*'https?://|storage/v1/|[?&]token=' THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
  IF k IN('projectId','id','snapshotId','reportId','exhibitorIds','orderIds','contractIds') THEN
   IF t!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;RETURN v;
  ELSIF k IN('generatedAt','expiresAt') THEN
   IF t!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;PERFORM t::timestamptz;RETURN v;
  ELSIF k IN('from','to') THEN
   IF t!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;PERFORM t::date;RETURN v;
  ELSIF k='generation' THEN
   IF t!~'^[a-f0-9]{32,64}$' THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;RETURN v;
  END IF;
  RETURN to_jsonb(public.ai_workers_redact_text(t));
 ELSIF jsonb_typeof(v) IN('number','boolean','null') THEN
  IF jsonb_typeof(v)='number' AND abs((v#>>'{}')::numeric)>9007199254740991 THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;RETURN v;
 END IF;
 RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION workers_private.sanitize_commercial_response_value(jsonb,text,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION workers_private.sanitize_response_content(_content text,_org_id uuid,_citations jsonb)
RETURNS text LANGUAGE plpgsql STABLE SET search_path=pg_catalog,workers_private,pg_temp AS $$
DECLARE doc jsonb; base jsonb; safe_base jsonb; b jsonb; spec jsonb; scope_item jsonb; i jsonb; field text; clean_blocks jsonb:='[]';base_blocks jsonb:='[]'; n integer:=0; saved workers_private.commercial_report_snapshots; keys text[]; safe_text text;
BEGIN
 IF left(_content,21)<>E'```fenasoja-response\n' THEN RETURN workers_private.sanitize_response_content_v1(_content,_org_id,_citations);END IF;
 IF right(_content,4)<>E'\n```' THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
 doc:=substring(_content FROM 22 FOR char_length(_content)-25)::jsonb;
 IF doc->'version'='1'::jsonb THEN RETURN workers_private.sanitize_response_content_v1(_content,_org_id,_citations);END IF;
 IF doc->'version' IS DISTINCT FROM '2'::jsonb OR doc->>'worker' IS DISTINCT FROM 'mapa' OR doc->>'intent' IS DISTINCT FROM 'map_report'
 OR jsonb_typeof(doc->'blocks') IS DISTINCT FROM 'array' OR jsonb_array_length(doc->'blocks')>12 THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
 spec:=doc#>'{metadata,filters,commercial}';
 IF jsonb_typeof(spec) IS DISTINCT FROM 'object' OR spec->>'schemaVersion' IS DISTINCT FROM '1' OR spec->>'projectId' IS DISTINCT FROM doc#>>'{metadata,projectId}'
 OR coalesce(spec->>'geography','') NOT IN('all','internal','external') OR coalesce(spec->>'monetaryBasis','') NOT IN('principal','principal_and_fees')
 OR coalesce(spec->>'contractFilter','') NOT IN('any','with_document','without_document') OR coalesce(spec->>'groupBy','') NOT IN('scope','exhibitor','status','none')
 OR coalesce(spec->>'sortBy','') NOT IN('scope','exhibitor','area','value','created','signed','lots') OR coalesce(spec->>'sortDirection','') NOT IN('asc','desc')
 OR coalesce(spec->>'reportFocus','sales') NOT IN('sales','exhibitors','contracts','inventory') OR coalesce(spec->>'documentFilter','any') NOT IN('any','multi_lot','with_prior_versions')
 OR coalesce(spec->>'documentStates','all') NOT IN('all','active','inactive')
 OR coalesce(spec->>'presentation','') NOT IN('executive','detailed') THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
 PERFORM workers_private.sanitize_commercial_response_value(spec);
 FOR field IN SELECT unnest(ARRAY['scopes','scopeSearch','saleStates','inventoryStates','exhibitorIds','sections']) LOOP
  IF jsonb_typeof(spec->field) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
 END LOOP;
 FOR scope_item IN SELECT * FROM jsonb_array_elements(spec->'scopes') LOOP
  IF jsonb_typeof(scope_item) IS DISTINCT FROM 'object' OR coalesce(scope_item->>'kind','') NOT IN('pavilion','segment','block','lot')
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(scope_item) k WHERE k NOT IN('kind','id')) OR NOT(scope_item?'id') THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(spec->'saleStates') t WHERE t NOT IN('pending','signed','partial','legacy','cancelled'))
 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(spec->'inventoryStates') t WHERE t NOT IN('AVAILABLE','BLOCKED','RESERVED','IN_NEGOTIATION','SALE_OPEN','SOLD','UNAVAILABLE'))
 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(spec->'sections') t WHERE t NOT IN('summary','sales','exhibitors','contracts','charts','plan_2d')) THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
 IF spec?'period' AND (jsonb_typeof(spec->'period') IS DISTINCT FROM 'object' OR coalesce(spec#>>'{period,basis}','') NOT IN('created','signed') OR spec#>>'{period,from}'>spec#>>'{period,to}') THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
 FOR b IN SELECT * FROM jsonb_array_elements(doc->'blocks') LOOP
  IF b->>'type' NOT IN('commercial_report','commercial_plan') THEN base_blocks:=base_blocks||jsonb_build_array(b);CONTINUE;END IF;
  IF b->>'type'='commercial_report' THEN
   keys:=ARRAY['type','snapshotId','reportId','title','scopeLabels','filterLabels','generatedAt','generation','rowCount','previewCount','coverage','capabilities','status','expiresAt'];
   IF coalesce(b->>'status','') NOT IN('available','requested','querying','rendering','ready','error','expired')
    OR jsonb_typeof(b->'rowCount') IS DISTINCT FROM 'number' OR jsonb_typeof(b->'previewCount') IS DISTINCT FROM 'number'
    OR (b->>'rowCount')::numeric<0 OR (b->>'previewCount')::numeric NOT BETWEEN 0 AND 30 OR (b->>'previewCount')::numeric>(b->>'rowCount')::numeric
    OR (b->>'status'<>'available' AND NOT(b?'reportId')) OR jsonb_typeof(b->'coverage') IS DISTINCT FROM 'object'
    OR jsonb_typeof(b#>'{coverage,complete}') IS DISTINCT FROM 'boolean' OR jsonb_typeof(b#>'{coverage,excludedRows}') IS DISTINCT FROM 'number'
    OR jsonb_typeof(b#>'{coverage,issues}') IS DISTINCT FROM 'array' OR jsonb_array_length(b#>'{coverage,issues}')>30
    OR jsonb_typeof(b->'capabilities') IS DISTINCT FROM 'object' OR jsonb_typeof(b->'filterLabels') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'filterLabels')>20 THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
   FOR field IN SELECT unnest(ARRAY['companyNames','monetaryValues','contractReferences']) LOOP
    IF jsonb_typeof(b#>ARRAY['capabilities',field]) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
   END LOOP;
   IF b?'reportId' AND NOT EXISTS(SELECT 1 FROM workers_private.commercial_report_jobs j WHERE j.id=(b->>'reportId')::uuid AND j.snapshot_id=(b->>'snapshotId')::uuid AND j.user_id=auth.uid() AND j.org_id=_org_id) THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
  ELSE
   keys:=ARRAY['type','snapshotId','generation','title','scopeLabels','lotCount','missingGeometryCount'];
   IF jsonb_typeof(b->'lotCount') IS DISTINCT FROM 'number' OR jsonb_typeof(b->'missingGeometryCount') IS DISTINCT FROM 'number' OR (b->>'lotCount')::numeric<0 OR (b->>'missingGeometryCount')::numeric<0 OR (b->>'missingGeometryCount')::numeric>(b->>'lotCount')::numeric THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(b) k WHERE NOT k=ANY(keys)) OR length(coalesce(b->>'title','')) NOT BETWEEN 1 AND 180
   OR jsonb_typeof(b->'scopeLabels') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'scopeLabels')>20 THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
  SELECT * INTO saved FROM workers_private.commercial_report_snapshots WHERE id=(b->>'snapshotId')::uuid AND org_id=_org_id AND user_id=auth.uid() AND project_id=(spec->>'projectId')::uuid;
  IF NOT FOUND OR saved.generation IS DISTINCT FROM b->>'generation' OR saved.payload->'spec' IS DISTINCT FROM spec THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
  IF b->>'type'='commercial_report' AND (saved.payload->'capabilities' IS DISTINCT FROM b->'capabilities' OR saved.payload->'generatedAt' IS DISTINCT FROM b->'generatedAt' OR CASE coalesce(spec->>'reportFocus','sales') WHEN 'contracts' THEN jsonb_array_length(saved.payload->'contracts') WHEN 'inventory' THEN CASE WHEN coalesce(spec->>'groupBy','scope')='none' THEN jsonb_array_length(saved.payload->'inventory') ELSE (SELECT count(DISTINCT CASE WHEN spec->>'groupBy'='status' THEN lot->>'status' ELSE coalesce(lot->>'pavilionId',lot->>'segmentId','unclassified') END) FROM jsonb_array_elements(saved.payload->'inventory') lot) END WHEN 'exhibitors' THEN jsonb_array_length(saved.payload->'groups') ELSE jsonb_array_length(saved.payload->'rows') END<>(b->>'rowCount')::integer) THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
  PERFORM workers_private.sanitize_commercial_response_value(b);
 END LOOP;
 IF (SELECT count(*) FROM jsonb_array_elements(doc->'blocks') x WHERE x->>'type'='commercial_report')<>1
 OR (SELECT count(DISTINCT x->>'snapshotId') FROM jsonb_array_elements(doc->'blocks') x WHERE x->>'type' IN('commercial_report','commercial_plan'))<>1 THEN RAISE EXCEPTION 'WORKERS_INVALID_RESPONSE' USING ERRCODE='22023';END IF;
 base:=jsonb_set(jsonb_set(doc,'{version}','1'),'{blocks}',base_blocks);
 base:=base#-'{metadata,filters,commercial}';
 safe_text:=workers_private.sanitize_response_content_v1(E'```fenasoja-response\n'||base::text||E'\n```',_org_id,_citations);
 safe_base:=substring(safe_text FROM 22 FOR char_length(safe_text)-25)::jsonb;
 FOR b IN SELECT * FROM jsonb_array_elements(doc->'blocks') LOOP
  IF b->>'type' IN('commercial_report','commercial_plan') THEN
   clean_blocks:=clean_blocks||jsonb_build_array(workers_private.sanitize_commercial_response_value(b));
  ELSE clean_blocks:=clean_blocks||jsonb_build_array(safe_base->'blocks'->n);n:=n+1; END IF;
 END LOOP;
 safe_base:=jsonb_set(jsonb_set(safe_base,'{version}','2'),'{blocks}',clean_blocks);
 safe_base:=jsonb_set(safe_base,'{metadata,filters,commercial}',workers_private.sanitize_commercial_response_value(spec));
 RETURN E'```fenasoja-response\n'||safe_base::text||E'\n```';
END $$;
REVOKE ALL ON FUNCTION workers_private.sanitize_response_content(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
COMMIT;
