-- Compensating projection revision: current exhibitor identity and Dashboard classification parity.
-- No commercial records, identities, geometries, prices or previous report snapshots are modified.
CREATE OR REPLACE FUNCTION public.workers_validate_commercial_report_spec(p_project_id uuid,s jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE k text; x jsonb; d date;
BEGIN
 IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR s->>'schemaVersion' IS DISTINCT FROM '1' OR jsonb_typeof(s->'schemaVersion') IS DISTINCT FROM 'number'
  OR s->>'projectId' IS DISTINCT FROM p_project_id::text THEN RAISE EXCEPTION 'REPORT_SPEC_INVALID' USING ERRCODE='22023'; END IF;
 FOR k IN SELECT jsonb_object_keys(s) LOOP
  IF k<>ALL(ARRAY['schemaVersion','projectId','editionYear','scopes','scopeSearch','geography','saleStates','inventoryStates',
    'contractFilter','exhibitorIds','companySearch','period','minArea','maxArea','minValueCents','maxValueCents','missingArea','missingCompany',
    'monetaryBasis','groupBy','sortBy','sortDirection','sections','presentation','reportFocus','documentFilter','comparisonPeriod']) THEN RAISE EXCEPTION 'REPORT_SPEC_FIELD_INVALID'; END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['scopes','scopeSearch','saleStates','inventoryStates','exhibitorIds','sections'] LOOP
  IF s?k AND (jsonb_typeof(s->k)<>'array' OR jsonb_array_length(s->k)>100) THEN RAISE EXCEPTION 'REPORT_SPEC_ARRAY_INVALID'; END IF;
 END LOOP;
 FOR x IN SELECT * FROM jsonb_array_elements(coalesce(s->'scopes','[]')) LOOP
  IF jsonb_typeof(x)<>'object' OR x->>'kind' IS NULL OR x->>'kind'<>ALL(ARRAY['pavilion','segment','block','lot'])
   OR coalesce(x->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR (SELECT count(*) FROM jsonb_object_keys(x))<>2 THEN RAISE EXCEPTION 'REPORT_SCOPE_INVALID'; END IF;
 END LOOP;
 FOR x IN SELECT * FROM jsonb_array_elements(coalesce(s->'scopeSearch','[]')) LOOP
  IF jsonb_typeof(x)<>'string' OR length(btrim(x#>>'{}')) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'REPORT_SCOPE_INVALID'; END IF;
 END LOOP;
 FOR x IN SELECT * FROM jsonb_array_elements(coalesce(s->'exhibitorIds','[]')) LOOP
  IF jsonb_typeof(x)<>'string' OR (x#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'REPORT_EXHIBITOR_INVALID'; END IF;
 END LOOP;
 FOR x IN SELECT * FROM jsonb_array_elements(coalesce(s->'saleStates','[]')) LOOP
  IF jsonb_typeof(x)<>'string' OR (x#>>'{}')<>ALL(ARRAY['pending','signed','partial','legacy','cancelled']) THEN RAISE EXCEPTION 'REPORT_STATE_INVALID'; END IF;
 END LOOP;
 FOR x IN SELECT * FROM jsonb_array_elements(coalesce(s->'inventoryStates','[]')) LOOP
  IF jsonb_typeof(x)<>'string' OR (x#>>'{}')<>ALL(ARRAY['AVAILABLE','BLOCKED','RESERVED','IN_NEGOTIATION','SALE_OPEN','SOLD','UNAVAILABLE']) THEN RAISE EXCEPTION 'REPORT_STATE_INVALID'; END IF;
 END LOOP;
 FOR x IN SELECT * FROM jsonb_array_elements(coalesce(s->'sections','[]')) LOOP
  IF jsonb_typeof(x)<>'string' OR (x#>>'{}')<>ALL(ARRAY['summary','sales','exhibitors','contracts','charts','plan_2d']) THEN RAISE EXCEPTION 'REPORT_SECTION_INVALID'; END IF;
 END LOOP;
 IF coalesce(s->>'geography','all')<>ALL(ARRAY['all','internal','external'])
  OR coalesce(s->>'contractFilter','any')<>ALL(ARRAY['any','with_document','without_document'])
  OR coalesce(s->>'monetaryBasis','principal')<>ALL(ARRAY['principal','principal_and_fees'])
  OR coalesce(s->>'groupBy','scope')<>ALL(ARRAY['scope','exhibitor','status','none'])
  OR coalesce(s->>'sortBy','scope')<>ALL(ARRAY['scope','exhibitor','area','value','created','signed','lots'])
  OR coalesce(s->>'sortDirection','asc')<>ALL(ARRAY['asc','desc'])
  OR coalesce(s->>'reportFocus','sales')<>ALL(ARRAY['sales','exhibitors','contracts','inventory'])
  OR coalesce(s->>'documentFilter','any')<>ALL(ARRAY['any','multi_lot','with_prior_versions'])
  OR coalesce(s->>'presentation','executive')<>ALL(ARRAY['executive','detailed']) THEN RAISE EXCEPTION 'REPORT_SPEC_ENUM_INVALID'; END IF;
 FOREACH k IN ARRAY ARRAY['minArea','maxArea','minValueCents','maxValueCents','editionYear'] LOOP
  IF s?k AND (jsonb_typeof(s->k)<>'number' OR (s->>k)::numeric<0 OR (s->>k)::numeric>9007199254740991) THEN RAISE EXCEPTION 'REPORT_SPEC_NUMBER_INVALID'; END IF;
 END LOOP;
 IF (s?'minValueCents' AND trunc((s->>'minValueCents')::numeric)<>(s->>'minValueCents')::numeric) OR (s?'maxValueCents' AND trunc((s->>'maxValueCents')::numeric)<>(s->>'maxValueCents')::numeric) OR (s->>'minArea')::numeric>1000000000 OR (s->>'maxArea')::numeric>1000000000 THEN RAISE EXCEPTION 'REPORT_SPEC_NUMBER_INVALID'; END IF;
 IF s?'editionYear' AND ((s->>'editionYear')::numeric NOT BETWEEN 2000 AND 2200 OR trunc((s->>'editionYear')::numeric)<>(s->>'editionYear')::numeric)
  OR (s->>'minArea')::numeric>(s->>'maxArea')::numeric OR (s->>'minValueCents')::numeric>(s->>'maxValueCents')::numeric THEN RAISE EXCEPTION 'REPORT_SPEC_RANGE_INVALID'; END IF;
 FOREACH k IN ARRAY ARRAY['missingArea','missingCompany'] LOOP
  IF s?k AND jsonb_typeof(s->k)<>'boolean' THEN RAISE EXCEPTION 'REPORT_SPEC_BOOLEAN_INVALID'; END IF;
 END LOOP;
 IF s?'companySearch' AND (jsonb_typeof(s->'companySearch')<>'string' OR length(btrim(s->>'companySearch')) NOT BETWEEN 1 AND 180) THEN RAISE EXCEPTION 'REPORT_SPEC_COMPANY_INVALID'; END IF;
 IF s?'comparisonPeriod' THEN
  IF NOT s?'period' OR s#>>'{comparisonPeriod,basis}' IS DISTINCT FROM s#>>'{period,basis}' THEN RAISE EXCEPTION 'REPORT_COMPARISON_INVALID'; END IF;
  PERFORM public.workers_validate_commercial_report_spec(p_project_id,(s-'comparisonPeriod')||jsonb_build_object('period',s->'comparisonPeriod'));
 END IF;
 IF s?'period' THEN
  x:=s->'period';
  IF jsonb_typeof(x)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(x))<>3
   OR coalesce(x->>'basis','')<>ALL(ARRAY['created','signed'])
   OR coalesce(x->>'from','') !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(x->>'to','') !~ '^\d{4}-\d{2}-\d{2}$'
   THEN RAISE EXCEPTION 'REPORT_PERIOD_INVALID'; END IF;
  d:=(x->>'from')::date;
  IF d>(x->>'to')::date THEN RAISE EXCEPTION 'REPORT_PERIOD_INVALID'; END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.workers_validate_commercial_report_spec(uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.workers_map_commercial_report(p_project_id uuid,p_spec jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE caps jsonb; result jsonb; s jsonb:=p_spec; scopes jsonb; selector text; matches jsonb; v_org uuid; v_match_count int;
BEGIN
 caps:=public.workers_commercial_report_authorize(p_project_id);
 v_org:=(caps->>'orgId')::uuid;
 PERFORM public.workers_validate_commercial_report_spec(p_project_id,s);
 IF NOT (caps->>'monetaryValues')::boolean THEN RAISE EXCEPTION 'REPORT_SALES_INFORMATION_RESTRICTED' USING ERRCODE='42501'; END IF;
 IF (s->>'contractFilter') IS DISTINCT FROM 'any' AND s?'contractFilter' AND NOT (caps->>'contractReferences')::boolean
  THEN RAISE EXCEPTION 'REPORT_CONTRACT_INFORMATION_RESTRICTED' USING ERRCODE='42501'; END IF;
 IF coalesce(s->>'documentFilter','any')<>'any' AND NOT (caps->>'contractReferences')::boolean THEN RAISE EXCEPTION 'REPORT_CONTRACT_INFORMATION_RESTRICTED' USING ERRCODE='42501'; END IF;
 IF (s?'minValueCents' OR s?'maxValueCents' OR s->>'monetaryBasis'='principal_and_fees' OR s->>'sortBy'='value') AND NOT (caps->>'monetaryValues')::boolean
  THEN RAISE EXCEPTION 'REPORT_MONETARY_INFORMATION_RESTRICTED' USING ERRCODE='42501'; END IF;
 scopes:=coalesce(s->'scopes','[]');
 -- Names resolve against persisted project rows. Physical numbers use the same
 -- explicit registry as commercialPavilions; technical identifiers are not numbers.
 FOR selector IN SELECT jsonb_array_elements_text(coalesce(s->'scopeSearch','[]')) LOOP
  WITH pavilion_registry(public_identifier,physical_number) AS (VALUES ('B1',1),('B2',14),('B3',12),('B4',8),('B5',13),('B6',3),('B8',5),('B10',7)),
  candidates AS (
   SELECT 'pavilion' kind,e.id FROM public.map_entities e JOIN pavilion_registry p USING(public_identifier)
    WHERE e.project_id=p_project_id AND NOT e.is_archived AND e.classification='PAVILION'
     AND (lower(btrim(selector)) IN (lower(e.name),lower(e.public_identifier),'pavilhão '||p.physical_number,'pavilhao '||p.physical_number))
   UNION SELECT 'segment',g.id FROM public.map_segments g WHERE g.project_id=p_project_id AND g.is_active
    AND lower(btrim(selector)) IN(lower(g.slug),lower(g.name),lower(g.display_name),
      CASE g.slug WHEN 'exporural' THEN 'expo rural' WHEN 'espaco-automovel' THEN 'espaço do automóvel'
        WHEN 'industria-comercio-servicos' THEN 'ics' END)
   UNION SELECT CASE WHEN e.classification='QUADRA' THEN 'block' ELSE 'lot' END,e.id
    FROM public.map_entities e WHERE e.project_id=p_project_id AND NOT e.is_archived AND e.classification='QUADRA'
      AND lower(btrim(selector)) IN(lower(e.name),lower(e.public_identifier),lower(replace(e.public_identifier,'QUADRA-','quadra ')))
  ) SELECT count(*),coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',id)),'[]') INTO v_match_count,matches FROM candidates;
  IF v_match_count<>1 THEN RAISE EXCEPTION 'REPORT_SCOPE_UNRESOLVED: %',left(selector,120) USING ERRCODE='22023'; END IF;
  scopes:=scopes||matches;
 END LOOP;
 s:=s||jsonb_build_object('scopes',scopes);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(scopes) x WHERE NOT (
   (x->>'kind'='segment' AND EXISTS(SELECT 1 FROM public.map_segments g WHERE g.id=(x->>'id')::uuid AND g.project_id=p_project_id AND g.is_active))
   OR (x->>'kind'='pavilion' AND EXISTS(SELECT 1 FROM public.map_entities e WHERE e.id=(x->>'id')::uuid AND e.project_id=p_project_id AND NOT e.is_archived AND e.classification='PAVILION' AND e.public_identifier IN('B1','B2','B3','B4','B5','B6','B8','B10')))
   OR (x->>'kind'='block' AND EXISTS(SELECT 1 FROM public.map_entities e WHERE e.id=(x->>'id')::uuid AND e.project_id=p_project_id AND NOT e.is_archived AND e.classification='QUADRA'))
   OR (x->>'kind'='lot' AND EXISTS(SELECT 1 FROM public.commercial_lots l WHERE l.id=(x->>'id')::uuid AND l.project_id=p_project_id))
  )) THEN RAISE EXCEPTION 'REPORT_SCOPE_OUTSIDE_PROJECT' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(s->'exhibitorIds','[]')) x WHERE NOT EXISTS(
  SELECT 1 FROM public.commercial_exhibitors e WHERE e.id=x::uuid AND e.org_id=v_org)) THEN RAISE EXCEPTION 'REPORT_EXHIBITOR_OUTSIDE_ORG' USING ERRCODE='42501'; END IF;
 IF s?'companySearch' THEN
  SELECT count(DISTINCT e.id),coalesce(jsonb_agg(DISTINCT to_jsonb(e.id)),'[]') INTO v_match_count,matches
   FROM public.commercial_exhibitors e JOIN public.lot_sale_orders o ON o.exhibitor_id=e.id AND o.project_id=p_project_id
   WHERE e.org_id=v_org AND lower(btrim(s->>'companySearch')) IN(lower(btrim(e.name)),lower(btrim(e.trade_name)),lower(btrim(o.buyer_name)),lower(btrim(o.buyer_trade_name)));
  IF v_match_count<>1 THEN RAISE EXCEPTION 'REPORT_COMPANY_UNRESOLVED_OR_AMBIGUOUS' USING ERRCODE='22023'; END IF;
  s:=s||jsonb_build_object('exhibitorIds',matches);
 END IF;
 -- An edition is proven only by a persisted dedicated project field. Price
 -- exercises and source drawing filenames never establish the event edition.
 IF (s?'minValueCents' AND trunc((s->>'minValueCents')::numeric)<>(s->>'minValueCents')::numeric) OR (s?'maxValueCents' AND trunc((s->>'maxValueCents')::numeric)<>(s->>'maxValueCents')::numeric) OR (s->>'minArea')::numeric>1000000000 OR (s->>'maxArea')::numeric>1000000000 THEN RAISE EXCEPTION 'REPORT_SPEC_NUMBER_INVALID'; END IF;
 IF s?'editionYear' AND NOT EXISTS(SELECT 1 FROM public.map_projects p WHERE p.id=p_project_id
   AND (to_jsonb(p)->>'edition_year')::int=(s->>'editionYear')::int) THEN
  RAISE EXCEPTION 'REPORT_EDITION_NOT_PROVEN' USING ERRCODE='22023'; END IF;

 WITH RECURSIVE entities AS MATERIALIZED (
  SELECT e.*,g.geometry FROM public.map_entities e LEFT JOIN public.map_entity_geometries g ON g.entity_id=e.id AND g.project_id=p_project_id AND g.is_current
  WHERE e.project_id=p_project_id
 ), walk AS (
  SELECT l.id lot_id,e.id,e.parent_entity_id,e.classification,e.public_identifier,e.name,e.segment_id,e.is_archived,e.metadata,
   ARRAY[e.id] path,0 depth,false cycle FROM public.commercial_lots l JOIN entities e ON e.id=l.entity_id WHERE l.project_id=p_project_id
  UNION ALL SELECT w.lot_id,e.id,e.parent_entity_id,e.classification,e.public_identifier,e.name,e.segment_id,e.is_archived,e.metadata,
   w.path||e.id,w.depth+1,e.id=ANY(w.path) FROM walk w JOIN entities e ON e.id=w.parent_entity_id WHERE NOT w.cycle AND w.depth<64
 ), facts AS MATERIALIZED (
  SELECT w.lot_id,
   (array_agg(w.id ORDER BY w.depth) FILTER(WHERE w.depth>0 AND w.classification='PAVILION' AND w.public_identifier IN('B1','B2','B3','B4','B5','B6','B8','B10')))[1] pavilion_id,
   (array_agg(w.name ORDER BY w.depth) FILTER(WHERE w.depth>0 AND w.classification='PAVILION' AND w.public_identifier IN('B1','B2','B3','B4','B5','B6','B8','B10')))[1] pavilion_name,
   (array_agg(w.segment_id ORDER BY w.depth) FILTER(WHERE w.segment_id IS NOT NULL))[1] segment_id,
   array_agg(w.id) ancestor_ids,
   bool_or(w.cycle OR w.depth=64 OR (w.depth>0 AND w.is_archived) OR (w.parent_entity_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM entities e WHERE e.id=w.parent_entity_id))) broken,
   bool_or(w.classification='PAVILION' AND w.public_identifier NOT IN('B1','B2','B3','B4','B5','B6','B8','B10')) unknown_pavilion,
   bool_or(w.classification='QUADRA' AND w.public_identifier~*'^QUADRA-[A-Z]{1,2}$' AND ll.block IS NOT NULL AND upper(w.public_identifier)<>'QUADRA-'||upper(btrim(ll.block))) block_conflict,
   bool_or(w.depth=0 AND (w.classification IN('INTERNAL_STAND','PAVILION') OR w.metadata?'pavilionPublicIdentifier' OR w.metadata?'pavilionModuleKey')) interior
  FROM walk w JOIN public.commercial_lots ll ON ll.id=w.lot_id GROUP BY w.lot_id
 ), classified AS MATERIALIZED (
  SELECT l.*,e.geometry,e.is_archived entity_archived,CASE WHEN jsonb_typeof(e.metadata->'labelAnchor')='array' AND jsonb_array_length(e.metadata->'labelAnchor')=2 THEN e.metadata->'labelAnchor' END label_anchor,f.pavilion_id,f.pavilion_name,g.id segment_id,g.display_name segment_name,f.ancestor_ids,
   CASE WHEN f.broken OR f.unknown_pavilion THEN 'unclassified' WHEN f.pavilion_id IS NOT NULL THEN 'internal'
    WHEN f.interior OR f.block_conflict OR coalesce(l.block,'')~*'^P[0-9]+$' OR g.id IS NULL THEN 'unclassified' ELSE 'external' END category,
   CASE WHEN f.broken THEN 'PARENT_INVALID' WHEN f.unknown_pavilion THEN 'PAVILION_UNREGISTERED'
    WHEN f.pavilion_id IS NULL AND (f.interior OR coalesce(l.block,'')~*'^P[0-9]+$') THEN 'INTERIOR_WITHOUT_PARENT'
    WHEN f.pavilion_id IS NULL AND f.block_conflict THEN 'BLOCK_CONFLICT'
    WHEN f.pavilion_id IS NULL AND g.id IS NULL THEN 'SEGMENT_MISSING' END classification_issue
  FROM public.commercial_lots l JOIN entities e ON e.id=l.entity_id JOIN facts f ON f.lot_id=l.id
   LEFT JOIN public.map_segments g ON g.id=f.segment_id AND g.project_id=p_project_id AND g.is_active WHERE l.project_id=p_project_id
 ), scoped AS MATERIALIZED (
  SELECT * FROM classified l WHERE
   (NOT EXISTS(SELECT 1 FROM jsonb_array_elements(scopes) x WHERE x->>'kind'='pavilion') OR l.pavilion_id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(scopes) x WHERE x->>'kind'='pavilion'))
   AND (NOT EXISTS(SELECT 1 FROM jsonb_array_elements(scopes) x WHERE x->>'kind'='segment') OR l.segment_id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(scopes) x WHERE x->>'kind'='segment'))
   AND (NOT EXISTS(SELECT 1 FROM jsonb_array_elements(scopes) x WHERE x->>'kind'='block') OR EXISTS(SELECT 1 FROM jsonb_array_elements(scopes) x WHERE x->>'kind'='block' AND (x->>'id')::uuid=ANY(l.ancestor_ids)))
   AND (NOT EXISTS(SELECT 1 FROM jsonb_array_elements(scopes) x WHERE x->>'kind'='lot') OR l.id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(scopes) x WHERE x->>'kind'='lot'))
   AND (coalesce(s->>'geography','all')='all' OR l.category=s->>'geography')
   AND (jsonb_array_length(coalesce(s->'inventoryStates','[]'))=0 OR l.status IN(SELECT jsonb_array_elements_text(s->'inventoryStates')))
   AND (NOT coalesce((s->>'missingArea')::boolean,false) OR l.official_area_sqm IS NULL)
 ), inventory AS MATERIALIZED (SELECT * FROM scoped WHERE archived_at IS NULL AND NOT entity_archived
  AND (coalesce(s->>'reportFocus','sales')<>'inventory' OR ((NOT s?'minArea' OR official_area_sqm>=(s->>'minArea')::numeric) AND (NOT s?'maxArea' OR official_area_sqm<=(s->>'maxArea')::numeric)))),
 all_items AS MATERIALIZED (
  SELECT i.id,i.order_id,i.sale_id,i.lot_id,o.exhibitor_id,
   coalesce(nullif(to_jsonb(o)->>'commercial_reference',''),'Pedido sem referência comercial') reference,
   coalesce(public.commercial_buyer_display_name(ex.trade_name,ex.name),public.commercial_buyer_display_name(o.buyer_trade_name,o.buyer_name)) display_name,
   public.commercial_buyer_display_name(o.buyer_trade_name,o.buyer_name) historical_display_name,
   i.public_identifier historical_label,i.official_area_snapshot historical_area,round(i.item_total*100)::bigint principal,
   round(o.fees_total*100)::bigint order_fees,round(o.spaces_subtotal*100)::bigint order_principal,round(o.negotiated_total*100)::bigint order_total,
   round((o.fee_admin+o.fee_ppci+o.fee_cleaning_license)*100)::bigint fee_sum,
   i.created_at,i.signed_at,i.contract_state,
   CASE WHEN i.contract_state='CANCELLED' THEN 'cancelled'
    WHEN i.contract_state='LEGACY_UNVERIFIED' THEN 'legacy'
    WHEN i.contract_state IN('SIGNED','PENDING_SIGNATURE') AND (a.negotiated_value IS DISTINCT FROM i.item_total
      OR lower(btrim(a.buyer_name)) IS DISTINCT FROM lower(btrim(o.buyer_name))
      OR (SELECT count(*) FROM public.lot_sales a2 WHERE a2.lot_id=i.lot_id AND a2.status IN('OPEN','CONFIRMED') AND a2.reverted_at IS NULL)<>1
      OR (SELECT count(*) FROM public.lot_sale_order_items i2 WHERE i2.sale_id=i.sale_id AND i2.contract_state<>'CANCELLED')<>1) THEN 'inconsistent'
    WHEN i.contract_state='SIGNED' AND i.signed_at IS NOT NULL AND a.status='CONFIRMED' AND a.reverted_at IS NULL AND a.lot_id=i.lot_id THEN 'signed'
    WHEN i.contract_state='PENDING_SIGNATURE' AND a.status='OPEN' AND a.reverted_at IS NULL AND a.lot_id=i.lot_id THEN 'pending'
    ELSE 'inconsistent' END state,
   o.updated_at order_updated_at,o.status order_status,o.reverted_at order_reverted_at,
   (count(*) FILTER(WHERE i.contract_state='SIGNED') OVER(PARTITION BY o.id)>0 AND count(*) FILTER(WHERE i.contract_state='PENDING_SIGNATURE') OVER(PARTITION BY o.id)>0) partial_order
  FROM public.lot_sale_orders o LEFT JOIN public.commercial_exhibitors ex ON ex.id=o.exhibitor_id AND ex.org_id=v_org JOIN public.lot_sale_order_items i ON i.order_id=o.id
   LEFT JOIN public.lot_sales a ON a.id=i.sale_id WHERE o.project_id=p_project_id AND o.status<>'REVERTED' AND o.reverted_at IS NULL
 ), margins AS (
  SELECT order_id,sum(principal) FILTER(WHERE state<>'cancelled') principal,
   bool_and(state IN('signed','pending') AND principal>=0) FILTER(WHERE state<>'cancelled') valid
  FROM all_items GROUP BY order_id
 ), shares AS (
  SELECT i.*,coalesce(m.valid AND m.principal>0 AND m.principal=i.order_principal AND m.principal+i.order_fees=i.order_total
   AND i.order_fees=i.fee_sum AND i.order_fees>=0,false) fee_valid,
   CASE WHEN i.state<>'cancelled' AND m.principal>0 AND i.order_fees>=0 THEN floor(i.order_fees::numeric*i.principal/m.principal)::bigint ELSE 0 END fee_floor,
   count(*) FILTER(WHERE i.state<>'cancelled') OVER(PARTITION BY i.order_id ORDER BY i.id) fee_rank
  FROM all_items i JOIN margins m USING(order_id)
 ), allocated AS MATERIALIZED (
  SELECT *,CASE WHEN state='cancelled' THEN 0 WHEN fee_valid THEN fee_floor+CASE WHEN fee_rank<=order_fees-sum(fee_floor) OVER(PARTITION BY order_id) THEN 1 ELSE 0 END END fees FROM shares
 ), legacy AS (
  SELECT a.id,NULL::uuid order_id,a.id sale_id,a.lot_id,NULL::uuid exhibitor_id,coalesce(nullif(to_jsonb(a)->>'commercial_reference',''),'Registro legado sem referência') reference,
   public.commercial_buyer_display_name(a.buyer_trade_name,a.buyer_name) display_name,public.commercial_buyer_display_name(a.buyer_trade_name,a.buyer_name) historical_display_name,NULL::text historical_label,NULL::numeric historical_area,
   round(a.negotiated_value*100)::bigint principal,NULL::bigint fees,a.created_at,NULL::timestamptz signed_at,'legacy'::text state,false partial_order,false fee_valid
  FROM public.lot_sales a JOIN public.commercial_lots l ON l.id=a.lot_id AND l.project_id=p_project_id
  WHERE a.status IN('OPEN','CONFIRMED') AND a.reverted_at IS NULL AND NOT EXISTS(SELECT 1 FROM all_items i WHERE i.sale_id=a.id)
 ), sale_rows AS MATERIALIZED (
  SELECT id,order_id,sale_id,lot_id,exhibitor_id,reference,display_name,historical_display_name,historical_label,historical_area,principal,fees,created_at,signed_at,state,partial_order,fee_valid FROM allocated
  UNION ALL SELECT * FROM legacy
 ), contract_links AS MATERIALIZED (
  SELECT c.id,c.contract_number,c.scope,c.order_id,c.is_active,c.active_version,c.created_at,c.updated_at,
   CASE WHEN c.scope='LOT' THEN ARRAY[c.lot_id] ELSE ARRAY(SELECT cl.lot_id FROM public.lot_contract_lots cl WHERE cl.contract_id=c.id ORDER BY cl.lot_id) END lot_ids,
   (SELECT count(*) FROM public.lot_contract_versions v WHERE v.contract_id=c.id) version_count,
   EXISTS(SELECT 1 FROM public.lot_contract_versions v WHERE v.contract_id=c.id AND v.version=c.active_version AND v.superseded_at IS NULL) has_active_version
  FROM public.lot_contracts c WHERE (caps->>'contractReferences')::boolean
   AND ((c.scope='LOT' AND c.lot_id IN(SELECT id FROM scoped)) OR (c.scope='ORDER_ITEMS' AND EXISTS(SELECT 1 FROM public.lot_contract_lots cl JOIN scoped l ON l.id=cl.lot_id WHERE cl.contract_id=c.id) AND EXISTS(SELECT 1 FROM public.lot_sale_orders o WHERE o.id=c.order_id AND o.project_id=p_project_id)))
 ), filtered_contract_links AS MATERIALIZED (
  SELECT * FROM contract_links c WHERE coalesce(s->>'documentFilter','any')='any'
   OR (s->>'documentFilter'='multi_lot' AND cardinality(c.lot_ids)>1)
   OR (s->>'documentFilter'='with_prior_versions' AND c.version_count>1)
 ), enriched AS MATERIALIZED (
  SELECT r.*,l.lot_number,l.display_name lot_label,l.block,l.official_area_sqm current_area,l.status map_status,
   l.pavilion_id,l.pavilion_name,l.segment_id,l.segment_name,l.category,l.classification_issue,l.archived_at,l.entity_archived,
   CASE WHEN (caps->>'contractReferences')::boolean THEN ARRAY(SELECT c.id FROM contract_links c WHERE c.is_active AND c.has_active_version
    AND r.lot_id=ANY(c.lot_ids) AND (c.scope='LOT' OR c.order_id=r.order_id) ORDER BY c.id) END contract_ids
  FROM sale_rows r JOIN scoped l ON l.id=r.lot_id
 ), selected AS MATERIALIZED (
  SELECT * FROM enriched r WHERE coalesce(s->>'reportFocus','sales')<>'inventory' AND
   (jsonb_array_length(coalesce(s->'saleStates','[]'))=0 OR r.state IN(SELECT jsonb_array_elements_text(s->'saleStates'))
    OR (s->'saleStates'?'partial' AND r.partial_order AND r.state<>'cancelled'))
   AND (jsonb_array_length(coalesce(s->'exhibitorIds','[]'))=0 OR r.exhibitor_id::text IN(SELECT jsonb_array_elements_text(s->'exhibitorIds')))
   AND (NOT coalesce((s->>'missingCompany')::boolean,false) OR r.exhibitor_id IS NULL)
   AND (NOT s?'minArea' OR r.historical_area>=(s->>'minArea')::numeric) AND (NOT s?'maxArea' OR r.historical_area<=(s->>'maxArea')::numeric)
   AND (NOT s?'minValueCents' OR r.principal>=(s->>'minValueCents')::numeric) AND (NOT s?'maxValueCents' OR r.principal<=(s->>'maxValueCents')::numeric)
   AND (coalesce(s->>'contractFilter','any')='any' OR (s->>'contractFilter'='with_document' AND cardinality(r.contract_ids)>0)
     OR (s->>'contractFilter'='without_document' AND cardinality(r.contract_ids)=0))
   AND (NOT s?'period' OR (CASE WHEN s#>>'{period,basis}'='signed' THEN r.signed_at ELSE r.created_at END
      >=((s#>>'{period,from}')::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
    AND CASE WHEN s#>>'{period,basis}'='signed' THEN r.signed_at ELSE r.created_at END
      <(((s#>>'{period,to}')::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')))
 ), focused_contracts AS MATERIALIZED (
  SELECT c.* FROM filtered_contract_links c WHERE EXISTS(SELECT 1 FROM selected r WHERE r.lot_id=ANY(c.lot_ids) AND (c.scope='LOT' OR c.order_id=r.order_id))
   OR (coalesce(s->>'reportFocus','sales')='contracts' AND coalesce(s->>'contractFilter','any')<>'without_document'
    AND jsonb_array_length(coalesce(s->'saleStates','[]'))=0 AND jsonb_array_length(coalesce(s->'exhibitorIds','[]'))=0
    AND NOT (s?'period' OR s?'minArea' OR s?'maxArea' OR s?'minValueCents' OR s?'maxValueCents')
    AND NOT coalesce((s->>'missingCompany')::boolean,false) AND EXISTS(SELECT 1 FROM inventory l WHERE l.id=ANY(c.lot_ids)))
 ), issue_rows AS MATERIALIZED (
  SELECT id,'SIGNATURE_SALE_MISMATCH' code FROM selected WHERE state='inconsistent'
  UNION ALL SELECT id,'LEGACY_UNVERIFIED' FROM selected WHERE state='legacy'
  UNION ALL SELECT id,'HISTORICAL_AREA_MISSING' FROM selected WHERE historical_area IS NULL
  UNION ALL SELECT id,'VALUE_MISSING_OR_INVALID' FROM selected WHERE principal IS NULL OR principal<0
  UNION ALL SELECT id,'EXHIBITOR_IDENTITY_MISSING' FROM selected WHERE exhibitor_id IS NULL
  UNION ALL SELECT id,'FEES_UNRECONCILED' FROM selected WHERE state<>'cancelled' AND NOT fee_valid AND (caps->>'monetaryValues')::boolean
  UNION ALL SELECT id,'HISTORICAL_ENTITY_ARCHIVED' FROM selected WHERE entity_archived
  UNION ALL SELECT id,'HISTORICAL_LOT_ARCHIVED' FROM selected WHERE archived_at IS NOT NULL
  UNION ALL SELECT id,classification_issue FROM scoped WHERE classification_issue IS NOT NULL
  UNION ALL SELECT id,'GEOMETRY_MISSING' FROM inventory WHERE geometry IS NULL
  UNION ALL SELECT id,'CURRENT_AREA_MISSING' FROM inventory WHERE official_area_sqm IS NULL
 ), row_json AS MATERIALIZED (
  SELECT r.*,jsonb_build_object('id',r.id,'orderId',r.order_id,'saleId',r.sale_id,'lotId',r.lot_id,'exhibitorId',r.exhibitor_id,
   'reference',r.reference,'displayName',r.display_name,'historicalDisplayName',r.historical_display_name,'lotLabel',r.lot_label,'historicalLotLabel',r.historical_label,'lotNumber',r.lot_number,'block',r.block,
   'pavilionId',r.pavilion_id,'pavilionName',r.pavilion_name,'segmentId',r.segment_id,'segmentName',r.segment_name,'category',r.category,
   'mapStatus',r.map_status,'state',r.state,'partialOrder',r.partial_order,'historicalArea',r.historical_area,'currentArea',r.current_area,
   'principalCents',CASE WHEN (caps->>'monetaryValues')::boolean AND r.principal>=0 THEN r.principal END,
   'feesCents',CASE WHEN (caps->>'monetaryValues')::boolean THEN r.fees END,
   'totalCents',CASE WHEN (caps->>'monetaryValues')::boolean AND r.principal>=0 THEN
     CASE WHEN coalesce(s->>'monetaryBasis','principal')='principal' THEN r.principal ELSE r.principal+r.fees END END,
   'createdAt',r.created_at,'signedAt',r.signed_at,'documentCount',cardinality(r.contract_ids),'contractIds',r.contract_ids,
   'issues',coalesce((SELECT jsonb_agg(i.code ORDER BY i.code) FROM issue_rows i WHERE i.id=r.id),'[]')) j
  FROM selected r
 ), grouped AS (
  SELECT CASE coalesce(s->>'groupBy','scope') WHEN 'exhibitor' THEN coalesce(exhibitor_id::text,'unidentified') WHEN 'status' THEN state
   WHEN 'none' THEN 'all' ELSE coalesce(pavilion_id,segment_id)::text END key,
   CASE coalesce(s->>'groupBy','scope') WHEN 'exhibitor' THEN CASE WHEN exhibitor_id IS NULL THEN 'Identidade não comprovada' ELSE coalesce(display_name,'Identificação comercial indisponível') END
   WHEN 'status' THEN CASE state WHEN 'pending' THEN 'Aguardando assinatura' WHEN 'signed' THEN 'Assinatura confirmada' WHEN 'legacy' THEN 'Legado sem comprovação' WHEN 'cancelled' THEN 'Cancelado' ELSE 'Revisar associação' END
   WHEN 'none' THEN 'Todo o recorte' ELSE coalesce(pavilion_name,segment_name,'Área sem classificação') END label,
   count(DISTINCT lot_id) lots,count(DISTINCT coalesce(order_id,sale_id)) orders,count(DISTINCT exhibitor_id) exhibitors,
   CASE WHEN (caps->>'monetaryValues')::boolean THEN sum(principal) FILTER(WHERE state IN('signed','pending') AND principal>=0) END principal,
   CASE WHEN (caps->>'monetaryValues')::boolean THEN sum(fees) FILTER(WHERE state IN('signed','pending')) END fees,
   sum(historical_area) FILTER(WHERE state<>'cancelled') historical_area
  FROM selected GROUP BY 1,2
 ), payload AS (
 SELECT jsonb_build_object('schemaVersion',1,'snapshotId',gen_random_uuid(),'generatedAt',statement_timestamp(),'spec',s,
  'scope',jsonb_build_object('projectId',p_project_id,'projectName',(SELECT name FROM public.map_projects WHERE id=p_project_id),'editionYear',(SELECT (to_jsonb(p)->>'edition_year')::int FROM public.map_projects p WHERE p.id=p_project_id),'timezone','America/Sao_Paulo'),
  'capabilities',caps-'orgId',
  'totals',jsonb_build_object('orders',(SELECT count(DISTINCT coalesce(order_id,sale_id)) FROM selected),
   'signedLots',(SELECT count(DISTINCT lot_id) FROM selected WHERE state='signed'),'pendingLots',(SELECT count(DISTINCT lot_id) FROM selected WHERE state='pending'),
   'legacyLots',(SELECT count(DISTINCT lot_id) FROM selected WHERE state='legacy'),'cancelledItems',(SELECT count(*) FROM selected WHERE state='cancelled'),
   'partialOrders',(SELECT count(DISTINCT order_id) FROM selected WHERE partial_order),'exhibitors',(SELECT count(DISTINCT exhibitor_id) FROM selected),
   'documents',CASE WHEN (caps->>'contractReferences')::boolean THEN (SELECT count(DISTINCT c.id) FROM focused_contracts c WHERE c.is_active AND c.has_active_version) END,
   'soldMapLots',(SELECT count(*) FROM inventory WHERE status='SOLD'),'availableLots',(SELECT count(*) FROM inventory WHERE status='AVAILABLE'),'inventoryLots',(SELECT count(*) FROM inventory),
   'principalCents',CASE WHEN (caps->>'monetaryValues')::boolean THEN (SELECT sum(principal) FROM selected WHERE state IN('signed','pending') AND principal>=0) END,
   'signedPrincipalCents',CASE WHEN (caps->>'monetaryValues')::boolean THEN (SELECT sum(principal) FROM selected WHERE state='signed' AND principal>=0) END,
   'pendingPrincipalCents',CASE WHEN (caps->>'monetaryValues')::boolean THEN (SELECT sum(principal) FROM selected WHERE state='pending' AND principal>=0) END,
   'legacyPrincipalCents',CASE WHEN (caps->>'monetaryValues')::boolean THEN (SELECT sum(principal) FROM selected WHERE state='legacy' AND principal>=0) END,
   'feesCents',CASE WHEN (caps->>'monetaryValues')::boolean THEN (SELECT sum(fees) FROM selected WHERE state IN('signed','pending')) END,
   'totalCents',CASE WHEN (caps->>'monetaryValues')::boolean THEN (SELECT CASE WHEN coalesce(s->>'monetaryBasis','principal')='principal' THEN sum(principal) FILTER(WHERE principal>=0)
      WHEN bool_and(fees IS NOT NULL) AND bool_and(principal IS NOT NULL AND principal>=0) THEN sum(principal+fees) END FROM selected WHERE state IN('signed','pending')) END,
   'historicalArea',(SELECT sum(historical_area) FROM selected WHERE state<>'cancelled'),'currentArea',(SELECT sum(official_area_sqm) FROM inventory)),
  'coverage',jsonb_build_object('complete',NOT EXISTS(SELECT 1 FROM issue_rows),'excludedRows',(SELECT count(*) FROM selected WHERE state IN('legacy','inconsistent','cancelled')),
   'issues',coalesce((SELECT jsonb_agg(jsonb_build_object('code',code,'count',n) ORDER BY code) FROM (SELECT code,count(*) n FROM issue_rows GROUP BY code) q),'[]')),
  'rows',coalesce((SELECT jsonb_agg(j ORDER BY
   CASE WHEN s->>'sortBy'='value' AND s->>'sortDirection'='desc' THEN principal END DESC NULLS LAST,
   CASE WHEN s->>'sortBy'='value' AND coalesce(s->>'sortDirection','asc')='asc' THEN principal END ASC NULLS LAST,
   CASE WHEN s->>'sortBy'='area' AND s->>'sortDirection'='desc' THEN historical_area END DESC NULLS LAST,
   CASE WHEN s->>'sortBy'='area' AND coalesce(s->>'sortDirection','asc')='asc' THEN historical_area END ASC NULLS LAST,
   CASE WHEN s->>'sortBy'='created' AND s->>'sortDirection'='desc' THEN created_at END DESC,
   CASE WHEN s->>'sortBy'='created' AND coalesce(s->>'sortDirection','asc')='asc' THEN created_at END ASC,
   CASE WHEN s->>'sortBy'='signed' AND s->>'sortDirection'='desc' THEN signed_at END DESC NULLS LAST,
   CASE WHEN s->>'sortBy'='signed' AND coalesce(s->>'sortDirection','asc')='asc' THEN signed_at END ASC NULLS LAST,
   CASE WHEN s->>'sortBy'='exhibitor' THEN display_name END,coalesce(pavilion_name,segment_name),block,lot_number,id) FROM row_json),'[]'),
  'inventory',coalesce((SELECT jsonb_agg(jsonb_build_object('lotId',l.id,'entityId',l.entity_id,'lotLabel',l.display_name,'lotNumber',l.lot_number,'block',l.block,
   'pavilionId',l.pavilion_id,'pavilionName',l.pavilion_name,'segmentId',l.segment_id,'segmentName',l.segment_name,'category',l.category,'status',l.status,
   'currentArea',l.official_area_sqm,'labelAnchor',l.label_anchor,'geometry',l.geometry,'associations',coalesce((SELECT jsonb_agg(jsonb_build_object('rowId',r.id,'exhibitorId',r.exhibitor_id,'displayName',r.display_name,'state',r.state) ORDER BY r.id) FROM selected r WHERE r.lot_id=l.id AND r.state<>'cancelled'),'[]'),
   'issues',coalesce((SELECT jsonb_agg(DISTINCT i.code) FROM issue_rows i WHERE i.id=l.id),'[]')) ORDER BY l.id) FROM inventory l),'[]'),
  'contracts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'reference',c.contract_number,'scope',c.scope,'orderId',c.order_id,'lotIds',c.lot_ids,'active',c.is_active AND c.has_active_version,'activeVersion',c.active_version,'versionCount',c.version_count,'createdAt',c.created_at,'updatedAt',c.updated_at) ORDER BY c.id)
   FROM focused_contracts c),'[]'),
  'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('key',coalesce(key,'unclassified'),'label',label,'lots',lots,'orders',orders,'exhibitors',exhibitors,'principalCents',principal,'feesCents',fees,'historicalArea',historical_area) ORDER BY label,key) FROM grouped),'[]'),
  'planOutlines',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'label',e.name,'kind',CASE e.classification WHEN 'PAVILION' THEN 'pavilion' WHEN 'QUADRA' THEN 'block' ELSE 'support' END,'geometry',e.geometry,'lotIds',ARRAY(SELECT l.id FROM inventory l WHERE e.id=ANY(l.ancestor_ids) OR (l.segment_id=e.segment_id AND e.classification IN('GATE','ROAD','PEDESTRIAN_PATH','LANDMARK')) ORDER BY l.id)) ORDER BY e.id)
   FROM entities e WHERE e.geometry IS NOT NULL AND NOT e.is_archived AND e.classification IN('PAVILION','QUADRA','GATE','ROAD','PEDESTRIAN_PATH','LANDMARK')
   AND (EXISTS(SELECT 1 FROM inventory l WHERE e.id=ANY(l.ancestor_ids)) OR EXISTS(SELECT 1 FROM inventory l WHERE l.segment_id=e.segment_id AND e.classification IN('GATE','ROAD','PEDESTRIAN_PATH','LANDMARK')))),'[]'),
  'calibration',(SELECT jsonb_build_object('mapUnitsPerMeter',map_units_per_meter,'status','VALIDATED') FROM public.map_calibrations WHERE project_id=p_project_id AND status='VALIDATED' AND map_units_per_meter>0 ORDER BY version DESC LIMIT 1),
  'notes',jsonb_build_array('Valores em centavos de BRL. Principal negociado e taxas são componentes distintos; recebimentos não são inferidos de assinaturas.',
   'Pedidos parcialmente assinados aparecem nos subconjuntos de assinatura; o total de pedidos usa identidades distintas. Expositores e documentos que cruzam áreas não são aditivos.',
   'Vendidos no mapa inclui legado sem comprovação. Contrato anexado não comprova assinatura; somente vínculos explícitos e versões ativas contam como documentos ativos.',
   'Área negociada e identificação histórica provêm do snapshot da venda. Planta e identificação atual provêm do cadastro vigente; vendas não são transferidas a lotes descendentes.',
   'Taxas são rateadas sobre todos os itens ativos do pedido antes dos filtros, pelo principal em centavos, com resíduo distribuído por UUID estável. Itens cancelados não recebem taxas; assinatura parcial inclui somente a quota dos itens selecionados.',
   'Edição somente é informada quando comprovada por campo próprio no projeto. Situação é a vigente; períodos filtram criação ou confirmação da assinatura e não reconstroem uma posição histórica.',
   'Documentos inativos e versões anteriores ficam discriminados e não entram na contagem de documentos ativos. Informações contratuais restritas aparecem como indisponíveis, nunca zero.')) data
 ), compared AS (
 SELECT data||CASE WHEN s?'comparisonPeriod' THEN jsonb_build_object('comparison',jsonb_build_object('period',s->'comparisonPeriod','totals',public.workers_map_commercial_report(p_project_id,(s-'comparisonPeriod')||jsonb_build_object('period',s->'comparisonPeriod'))->'totals')) ELSE '{}'::jsonb END data FROM payload
 ) SELECT data||jsonb_build_object('generation',md5((data-'snapshotId'-'generatedAt')::text||coalesce((SELECT string_agg(md5(to_jsonb(p)::text),'' ORDER BY p.id) FROM public.commercial_price_rules p WHERE p.project_id=p_project_id OR p.project_id IS NULL),''))) INTO result FROM compared;
 IF EXISTS(SELECT 1 FROM jsonb_each(result->'totals') x WHERE jsonb_typeof(x.value)='number' AND abs((x.value#>>'{}')::numeric)>9007199254740991) THEN RAISE EXCEPTION 'REPORT_NUMERIC_RANGE' USING ERRCODE='22003'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.workers_map_commercial_report(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workers_map_commercial_report(uuid,jsonb) TO authenticated;
COMMENT ON FUNCTION public.workers_map_commercial_report(uuid,jsonb) IS 'Read-only authorized report DTO. Snapshot persistence is a separate audited artifact operation. No contacts, fiscal documents, file paths, payments or URLs.';
NOTIFY pgrst,'reload schema';
