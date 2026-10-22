DO $preconditions$ BEGIN
 IF to_regprocedure('public.financial_save_scenario(uuid,uuid,text,jsonb,text,uuid)') IS NULL
 OR md5(pg_get_functiondef('public.financial_can(uuid,text)'::regprocedure))<>'4ab47592ed03a32bc7339be0e1e94410'
 THEN RAISE EXCEPTION 'FINANCIAL_SCENARIO_BASE_CONTRACT_CHANGED'; END IF;
END $preconditions$;
-- Simulações 2028. Additive projection; no sale, price, signature or payment is changed.
-- Apply atomically through the connected migration runner, with this exact source recorded.
ALTER TABLE public.financial_scenarios ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS money_unit text NOT NULL DEFAULT 'BRL',
 ADD COLUMN IF NOT EXISTS reference_key text,
 ADD COLUMN IF NOT EXISTS author_kind text NOT NULL DEFAULT 'user';
ALTER TABLE public.financial_scenarios ALTER COLUMN created_by DROP NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='financial_scenario_units_v2') THEN
 ALTER TABLE public.financial_scenarios ADD CONSTRAINT financial_scenario_units_v2 CHECK(
  (schema_version=1 AND money_unit='BRL' AND created_by IS NOT NULL AND author_kind='user') OR
  (schema_version=2 AND money_unit='BRL_CENTS' AND reference_key IS NOT NULL AND
   ((author_kind='user' AND created_by IS NOT NULL) OR (author_kind='migration' AND created_by IS NULL
    AND reference_key='whatsapp-2026-10-21-v1' AND org_id='985888b8-155f-4bbe-b6b9-6bef2893d99b'))));
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS financial_scenario_reference_once ON public.financial_scenarios(edition_id,scenario_key,reference_key) WHERE reference_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.financial_scenario_sources (
 org_id uuid NOT NULL, edition_id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES public.map_projects(id),
 calculation_version text NOT NULL DEFAULT '2028.1', forecast_window_days integer NOT NULL DEFAULT 30 CHECK(forecast_window_days=30),
 FOREIGN KEY(org_id,edition_id) REFERENCES public.financial_editions(org_id,id), UNIQUE(org_id,edition_id)
);
-- Canonical physical pavilion registry, bound to persisted entity UUIDs (never module prefixes).
CREATE TABLE IF NOT EXISTS public.financial_scenario_pavilions (
 project_id uuid NOT NULL REFERENCES public.map_projects(id), entity_id uuid PRIMARY KEY REFERENCES public.map_entities(id),
 physical_number integer NOT NULL CHECK(physical_number IN (1,14,12,13,8,3,5,7)),
 category text NOT NULL CHECK(category IN ('pavilion_ics','agroindustry')), UNIQUE(project_id,physical_number)
);
CREATE TABLE IF NOT EXISTS public.financial_scenario_revenue_links (
 org_id uuid NOT NULL, edition_id uuid NOT NULL, revenue_id uuid PRIMARY KEY REFERENCES public.financial_revenues(id),
 category text NOT NULL CHECK(category IN ('pavilion_ics','automotive','exporural','external_ics','agroindustry','food_points','parking','sponsorship_free','sponsorship_rouanet','other_revenue')),
 origin_kind text NOT NULL CHECK(origin_kind IN ('manual','sale_order','sponsorship')), origin_id uuid,
 version integer NOT NULL DEFAULT 1, updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((origin_kind='manual')=(origin_id IS NULL)), FOREIGN KEY(org_id,edition_id) REFERENCES public.financial_scenario_sources(org_id,edition_id)
);
CREATE TABLE IF NOT EXISTS public.financial_scenario_observations (
 edition_id uuid NOT NULL REFERENCES public.financial_scenario_sources(edition_id), basis text NOT NULL CHECK(basis IN ('portfolio','confirmed','cash')),
 bucket timestamptz NOT NULL, observed_on date NOT NULL, generation text NOT NULL, coverage_complete boolean NOT NULL,
 amounts jsonb NOT NULL, PRIMARY KEY(edition_id,basis,bucket)
);
CREATE INDEX IF NOT EXISTS financial_scenario_history_day ON public.financial_scenario_observations(edition_id,basis,observed_on DESC,bucket DESC);
CREATE INDEX IF NOT EXISTS financial_scenario_items_order ON public.lot_sale_order_items(order_id,id) WHERE contract_state<>'CANCELLED';
CREATE INDEX IF NOT EXISTS financial_scenario_sales_lot ON public.lot_sales(lot_id,status);
CREATE INDEX IF NOT EXISTS financial_scenario_revenues_scope ON public.financial_revenues(org_id,edition_id,status);
CREATE INDEX IF NOT EXISTS financial_scenario_sponsors_scope ON public.financial_sponsorships(org_id,edition_id,negotiation_status);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['financial_scenario_sources','financial_scenario_pavilions','financial_scenario_revenue_links','financial_scenario_observations'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $$;
-- All client reads use scoped RPCs. No additional commercial table grants.

CREATE OR REPLACE FUNCTION public._financial_scenario_validate(a jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE k text; subtotal bigint:=0; total bigint;
BEGIN
 IF a->>'schemaVersion' IS DISTINCT FROM '2' OR a->>'moneyUnit' IS DISTINCT FROM 'BRL_CENTS'
  OR length(coalesce(a->>'referenceKey','')) NOT BETWEEN 3 AND 180 OR jsonb_typeof(a->'targets') IS DISTINCT FROM 'object'
  OR jsonb_typeof(a->'provenance') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'FINANCIAL_SCENARIO_INVALID'; END IF;
 FOREACH k IN ARRAY ARRAY['pavilion_ics','automotive','exporural','external_ics','agroindustry','food_points','parking',
  'sponsorship_free','sponsorship_rouanet','operating_execution','cash_reserve','investment_capacity','operating_subtotal','revenue_total'] LOOP
  IF coalesce(a->'targets'->>k,'') !~ '^[0-9]+$' OR (a->'targets'->>k)::numeric>9007199254740991 THEN
   RAISE EXCEPTION 'FINANCIAL_SCENARIO_TARGET_INVALID: %',k; END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['pavilion_ics','automotive','exporural','external_ics','agroindustry','food_points','parking'] LOOP
  subtotal:=subtotal+(a->'targets'->>k)::bigint;
 END LOOP;
 total:=subtotal+(a->'targets'->>'sponsorship_free')::bigint+(a->'targets'->>'sponsorship_rouanet')::bigint;
 IF subtotal<>(a->'targets'->>'operating_subtotal')::bigint OR total<>(a->'targets'->>'revenue_total')::bigint THEN
  RAISE EXCEPTION 'FINANCIAL_SCENARIO_TOTAL_MISMATCH'; END IF;
 -- Investment discrepancies are provenance, not fabricated expenses.
END $$;

CREATE OR REPLACE FUNCTION public._financial_scenario_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
 RAISE EXCEPTION 'FINANCIAL_SCENARIO_IMMUTABLE: create an audited new version';
END $$;
DROP TRIGGER IF EXISTS financial_scenario_immutable ON public.financial_scenarios;
CREATE TRIGGER financial_scenario_immutable BEFORE UPDATE OR DELETE ON public.financial_scenarios FOR EACH ROW EXECUTE FUNCTION public._financial_scenario_immutable();

-- New contract requires an expected version. Existing six-argument BRL contract remains compatible.
CREATE OR REPLACE FUNCTION public.financial_save_scenario(_org_id uuid,_edition_id uuid,_key text,_assumptions jsonb,
 _notes text,_request_id uuid,_expected_version integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid; replay jsonb; s public.financial_scenarios; current_version integer;
BEGIN
 actor:=public.financial_require(_org_id,'financial_admin');
 PERFORM public.financial_require_operational(_org_id,_edition_id);
 IF NOT EXISTS(SELECT 1 FROM public.financial_scenario_sources WHERE org_id=_org_id AND edition_id=_edition_id)
  THEN RAISE EXCEPTION 'FINANCIAL_SCENARIO_SCOPE_INVALID'; END IF;
 replay:=public.financial_begin(_org_id,'scenario:v2',_request_id,jsonb_build_array(_edition_id,_key,_assumptions,_notes,_expected_version));
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 PERFORM public._financial_scenario_validate(_assumptions);
 IF length(btrim(coalesce(_notes,'')))<3 THEN RAISE EXCEPTION 'FINANCIAL_REASON_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_edition_id::text||_key,31028));
 SELECT coalesce(max(version),0) INTO current_version FROM public.financial_scenarios WHERE edition_id=_edition_id AND scenario_key=_key;
 IF current_version IS DISTINCT FROM _expected_version THEN RAISE EXCEPTION 'FINANCIAL_CONFLICT' USING ERRCODE='40001'; END IF;
 INSERT INTO public.financial_scenarios(org_id,edition_id,scenario_key,version,assumptions,notes,created_by,schema_version,money_unit,reference_key)
 VALUES(_org_id,_edition_id,_key,current_version+1,_assumptions,_notes,actor,2,'BRL_CENTS',_assumptions->>'referenceKey') RETURNING * INTO s;
 PERFORM public.financial_audit(_org_id,_edition_id,'scenario',s.id,'create',NULL,to_jsonb(s),_notes);
 RETURN public.financial_finish(_org_id,'scenario:v2',_request_id,to_jsonb(s));
END $$;

-- Explicit manual classification/deduplication; no text matching or automatic reassignment.
CREATE OR REPLACE FUNCTION public.financial_link_scenario_revenue(_org_id uuid,_edition_id uuid,_revenue_id uuid,
 _category text,_origin_kind text,_origin_id uuid,_expected_version integer,_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid; replay jsonb; old public.financial_scenario_revenue_links; result public.financial_scenario_revenue_links; project uuid;
BEGIN
 actor:=public.financial_require(_org_id,'financial_edit');
 PERFORM public.financial_require_operational(_org_id,_edition_id);
 SELECT project_id INTO project FROM public.financial_scenario_sources WHERE org_id=_org_id AND edition_id=_edition_id;
 IF project IS NULL OR NOT EXISTS(SELECT 1 FROM public.financial_revenues WHERE id=_revenue_id AND org_id=_org_id AND edition_id=_edition_id)
  THEN RAISE EXCEPTION 'FINANCIAL_SCENARIO_SCOPE_INVALID'; END IF;
 IF _origin_kind='sale_order' AND NOT EXISTS(SELECT 1 FROM public.lot_sale_orders WHERE id=_origin_id AND project_id=project)
  OR _origin_kind='sponsorship' AND NOT EXISTS(SELECT 1 FROM public.financial_sponsorships WHERE id=_origin_id AND org_id=_org_id AND edition_id=_edition_id)
  THEN RAISE EXCEPTION 'FINANCIAL_SCENARIO_ORIGIN_INVALID'; END IF;
 replay:=public.financial_begin(_org_id,'scenario:link',_request_id,jsonb_build_array(_edition_id,_revenue_id,_category,_origin_kind,_origin_id,_expected_version));
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_revenue_id::text,22028));
 SELECT * INTO old FROM public.financial_scenario_revenue_links WHERE revenue_id=_revenue_id;
 IF coalesce(old.version,0) IS DISTINCT FROM _expected_version THEN RAISE EXCEPTION 'FINANCIAL_CONFLICT'; END IF;
 INSERT INTO public.financial_scenario_revenue_links(org_id,edition_id,revenue_id,category,origin_kind,origin_id,updated_by)
 VALUES(_org_id,_edition_id,_revenue_id,_category,_origin_kind,_origin_id,actor)
 ON CONFLICT(revenue_id) DO UPDATE SET category=excluded.category,origin_kind=excluded.origin_kind,origin_id=excluded.origin_id,
  version=financial_scenario_revenue_links.version+1,updated_by=actor,updated_at=now() RETURNING * INTO result;
 PERFORM public.financial_audit(_org_id,_edition_id,'scenario',_revenue_id,'link',to_jsonb(old),to_jsonb(result),'Classificação explícita de origem');
 RETURN public.financial_finish(_org_id,'scenario:link',_request_id,to_jsonb(result));
END $$;

CREATE OR REPLACE FUNCTION public._financial_scenario_lots(project uuid)
RETURNS TABLE(lot_id uuid,category text,issue text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH RECURSIVE walk AS (
  SELECT l.id lot_id,l.block,e.id,e.parent_entity_id,e.classification,e.public_identifier,e.segment_id,e.metadata,e.is_archived,
    ARRAY[e.id] path,0 depth,false cycle FROM public.commercial_lots l JOIN public.map_entities e ON e.id=l.entity_id AND e.project_id=project WHERE l.project_id=project
  UNION ALL SELECT w.lot_id,w.block,e.id,e.parent_entity_id,e.classification,e.public_identifier,e.segment_id,e.metadata,e.is_archived,
    w.path||e.id,w.depth+1,e.id=ANY(w.path) FROM walk w JOIN public.map_entities e ON e.id=w.parent_entity_id AND e.project_id=project WHERE NOT w.cycle AND w.depth<64
 ), facts AS (
  SELECT w.lot_id,
   (SELECT p.category FROM walk x JOIN public.financial_scenario_pavilions p ON p.entity_id=x.id AND p.project_id=project WHERE x.lot_id=w.lot_id AND x.depth>0 ORDER BY x.depth LIMIT 1) pavilion,
   (SELECT s.slug FROM walk x JOIN public.map_segments s ON s.id=x.segment_id AND s.project_id=project AND s.is_active WHERE x.lot_id=w.lot_id ORDER BY x.depth LIMIT 1) segment,
   bool_or(w.cycle OR w.depth=64 OR w.is_archived OR (w.parent_entity_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.map_entities e WHERE e.id=w.parent_entity_id AND e.project_id=project))) broken,
   bool_or(w.classification='PAVILION' AND NOT EXISTS(SELECT 1 FROM public.financial_scenario_pavilions p WHERE p.entity_id=w.id AND p.project_id=project)) unknown_pavilion,
   bool_or(w.depth=0 AND (w.classification IN ('INTERNAL_STAND','PAVILION') OR w.metadata?'pavilionPublicIdentifier' OR w.metadata?'pavilionModuleKey' OR coalesce(w.block,'')~*'^P[0-9]+$')) interior,
   bool_or(w.classification='QUADRA' AND w.block IS NOT NULL AND upper(w.public_identifier)<> 'QUADRA-'||upper(btrim(w.block))) block_conflict
  FROM walk w GROUP BY w.lot_id
 ) SELECT lot_id,CASE WHEN broken OR unknown_pavilion THEN NULL WHEN pavilion IS NOT NULL THEN pavilion WHEN interior OR block_conflict THEN NULL
  WHEN segment='espaco-automovel' THEN 'automotive' WHEN segment='exporural' THEN 'exporural'
  WHEN segment='industria-comercio-servicos' THEN 'external_ics' END,
  CASE WHEN broken THEN 'PARENT_INVALID' WHEN unknown_pavilion THEN 'PAVILION_UNREGISTERED' WHEN pavilion IS NOT NULL THEN NULL
   WHEN interior THEN 'INTERIOR_WITHOUT_PARENT' WHEN block_conflict THEN 'BLOCK_CONFLICT' WHEN segment IS NULL THEN 'SEGMENT_MISSING' END FROM facts
$$;

-- One principal per current item. Fees are allocated once per order, floor then residuals by item UUID.
-- Confirmed keeps the same shares for eligible signed items; the remainder stays in progress.
CREATE OR REPLACE FUNCTION public._financial_scenario_commercial(project uuid)
RETURNS TABLE(category text,source text,origin_id uuid,stage text,principal bigint,fees bigint,issue text,changed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH classification AS MATERIALIZED(SELECT * FROM public._financial_scenario_lots(project)),
 items AS MATERIALIZED(
 SELECT i.id,i.order_id,i.lot_id,i.contract_state,c.category,c.issue classification_issue,o.updated_at,
  round(i.item_total*100)::bigint p,round(o.fees_total*100)::bigint f,
  CASE WHEN i.contract_state='LEGACY_UNVERIFIED' THEN 'LEGACY_UNVERIFIED'
   WHEN i.item_total IS NULL OR s.negotiated_value IS NULL THEN 'VALUE_UNPROVEN'
   WHEN l.archived_at IS NOT NULL OR s.lot_id IS DISTINCT FROM i.lot_id OR s.negotiated_value IS DISTINCT FROM i.item_total
    OR NOT ((i.contract_state='SIGNED' AND s.status='CONFIRMED' AND l.status='SOLD') OR (i.contract_state='PENDING_SIGNATURE' AND s.status='OPEN' AND l.status='SALE_OPEN'))
    OR (SELECT count(*) FROM public.lot_sales x WHERE x.lot_id=i.lot_id AND x.status IN ('OPEN','CONFIRMED'))<>1
    OR (SELECT count(*) FROM public.lot_sale_order_items x WHERE x.sale_id=i.sale_id AND x.contract_state<>'CANCELLED')<>1
    THEN 'SALE_ITEM_MISMATCH' WHEN i.item_total<0 THEN 'VALUE_INVALID' END invalid,
  round(o.spaces_subtotal*100)::bigint order_principal,round(o.negotiated_total*100)::bigint order_total,
  round((o.fee_admin+o.fee_ppci+o.fee_cleaning_license)*100)::bigint fee_sum
 FROM public.lot_sale_order_items i JOIN public.lot_sale_orders o ON o.id=i.order_id AND o.project_id=project AND o.status='CONFIRMED'
 JOIN public.commercial_lots l ON l.id=i.lot_id AND l.project_id=project LEFT JOIN public.lot_sales s ON s.id=i.sale_id
 LEFT JOIN classification c ON c.lot_id=i.lot_id WHERE i.contract_state<>'CANCELLED'),
 margins AS(SELECT order_id,sum(p) total,bool_and(invalid IS NULL) valid FROM items GROUP BY order_id),
 parts AS(SELECT i.*,m.total,
  m.valid AND m.total>0 AND m.total=order_principal AND m.total+f=order_total AND f=fee_sum AND f>=0 fee_valid,
  CASE WHEN m.total>0 AND f>=0 THEN floor(f::numeric*p/m.total)::bigint ELSE 0 END fee_floor,
  row_number() OVER(PARTITION BY i.order_id ORDER BY i.id) rn FROM items i JOIN margins m USING(order_id)),
 allocated AS(SELECT *,CASE WHEN fee_valid THEN fee_floor+CASE WHEN rn<=f-sum(fee_floor) OVER(PARTITION BY order_id) THEN 1 ELSE 0 END ELSE 0 END fee_share FROM parts)
 SELECT category,'commercial',id,CASE WHEN contract_state='SIGNED' THEN 'confirmed' ELSE 'pending' END,
  CASE WHEN invalid IS NULL THEN p ELSE 0 END,fee_share,coalesce(invalid,classification_issue,CASE WHEN category IS NULL THEN 'UNCLASSIFIED' END),updated_at FROM allocated
 UNION ALL SELECT NULL,'commercial_fees',order_id,'pending',0,max(f),'FEES_TO_RECONCILE',max(updated_at) FROM allocated WHERE NOT fee_valid GROUP BY order_id HAVING max(f)<>0
 UNION ALL SELECT c.category,'commercial_legacy',s.id,'pending',0,0,'VALUE_UNPROVEN',s.created_at
 FROM public.lot_sales s JOIN public.commercial_lots l ON l.id=s.lot_id AND l.project_id=project
 LEFT JOIN classification c ON c.lot_id=l.id WHERE s.status IN ('OPEN','CONFIRMED') AND NOT EXISTS(SELECT 1 FROM public.lot_sale_order_items i WHERE i.sale_id=s.id)
$$;

CREATE OR REPLACE FUNCTION public._financial_scenario_build(_org_id uuid,_edition_id uuid,_basis text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE project uuid; result jsonb; categories jsonb; sources jsonb; scenarios jsonb; history jsonb;
 revenue bigint; expense bigint; unclassified bigint; issues integer; cash_pending integer;
BEGIN
 IF _basis IS NULL OR _basis NOT IN ('portfolio','confirmed','cash') THEN RAISE EXCEPTION 'FINANCIAL_SCENARIO_BASIS_INVALID'; END IF;
 SELECT c.project_id INTO project FROM public.financial_scenario_sources c JOIN public.financial_editions e ON e.id=c.edition_id AND e.org_id=c.org_id
 JOIN public.map_projects p ON p.id=c.project_id AND p.org_id=c.org_id AND NOT p.is_archived
 WHERE c.org_id=_org_id AND c.edition_id=_edition_id AND e.code=2028 AND e.status='operacional';
 IF project IS NULL THEN RAISE EXCEPTION 'FINANCIAL_SCENARIO_SCOPE_INVALID'; END IF;
 WITH commercial AS MATERIALIZED(SELECT * FROM public._financial_scenario_commercial(project)),
 settled AS MATERIALIZED(SELECT o.source_type,o.source_id,o.direction,coalesce(sum(a.amount_cents),0)::bigint amount,
   max(m.created_at) changed_at,bool_or(o.settlement_inconsistent) inconsistent
  FROM public.financial_obligations o JOIN public.financial_movement_allocations a ON a.obligation_id=o.id AND a.org_id=_org_id
  JOIN public.financial_movements m ON m.id=a.movement_id AND m.org_id=_org_id AND m.edition_id=_edition_id
  WHERE o.org_id=_org_id AND o.edition_id=_edition_id GROUP BY o.source_type,o.source_id,o.direction),
 facts AS MATERIALIZED(
 SELECT category,source,stage,principal,fees,issue,changed_at FROM commercial WHERE _basis<>'cash' AND (_basis='portfolio' OR stage='confirmed' OR issue IS NOT NULL)
 UNION ALL SELECT coalesce(l.category,'other_revenue'),'manual',CASE WHEN r.status='confirmada' THEN 'confirmed' ELSE 'projected' END,
  CASE WHEN _basis='cash' THEN coalesce(s.amount,0) WHEN r.status='confirmada' THEN coalesce(r.confirmed_cents,0) WHEN _basis='portfolio' THEN r.projected_cents ELSE 0 END,
  0,CASE WHEN _basis='cash' AND s.inconsistent THEN 'CASH_SETTLEMENT_INCONSISTENT' WHEN l.revenue_id IS NULL THEN 'MANUAL_WITHOUT_CATEGORY' END,r.updated_at
 FROM public.financial_revenues r LEFT JOIN public.financial_scenario_revenue_links l ON l.revenue_id=r.id AND l.org_id=_org_id AND l.edition_id=_edition_id
 LEFT JOIN settled s ON s.source_type='receita' AND s.source_id=r.id
 WHERE r.org_id=_org_id AND r.edition_id=_edition_id AND (r.status<>'cancelada' OR (_basis='cash' AND coalesce(s.amount,0)<>0)) AND (coalesce(l.origin_kind,'manual')='manual' OR _basis='cash')
 UNION ALL SELECT kind,'sponsorship',CASE WHEN r.negotiation_status='confirmado' THEN 'confirmed' ELSE r.negotiation_status END,
  CASE WHEN _basis='cash' THEN CASE WHEN kind='sponsorship_free' THEN floor(coalesce(s.amount,0)::numeric*r.confirmed_free_cents/nullif(r.confirmed_free_cents+r.confirmed_rouanet_cents,0))::bigint
    ELSE coalesce(s.amount,0)-coalesce(floor(coalesce(s.amount,0)::numeric*r.confirmed_free_cents/nullif(r.confirmed_free_cents+r.confirmed_rouanet_cents,0))::bigint,0) END
   WHEN r.negotiation_status='confirmado' THEN CASE WHEN kind='sponsorship_free' THEN r.confirmed_free_cents ELSE r.confirmed_rouanet_cents END
   WHEN _basis='portfolio' THEN CASE WHEN kind='sponsorship_free' THEN r.projected_free_cents ELSE r.projected_rouanet_cents END ELSE 0 END,
  0,CASE WHEN _basis='cash' AND s.inconsistent THEN 'CASH_SETTLEMENT_INCONSISTENT' END,r.updated_at FROM public.financial_sponsorships r CROSS JOIN unnest(ARRAY['sponsorship_free','sponsorship_rouanet'])kind
 LEFT JOIN settled s ON s.source_type='patrocinio' AND s.source_id=r.id
 WHERE r.org_id=_org_id AND r.edition_id=_edition_id AND (r.negotiation_status<>'cancelado' OR (_basis='cash' AND coalesce(s.amount,0)<>0))
 UNION ALL SELECT 'operating_execution','expense',e.financial_status,
  CASE WHEN _basis='cash' THEN coalesce(s.amount,0) WHEN e.financial_status='realizada' THEN coalesce(e.committed_cents,0) WHEN _basis='portfolio' THEN coalesce(e.planned_cents,0) ELSE 0 END,
  0,CASE WHEN _basis='cash' AND s.inconsistent THEN 'CASH_SETTLEMENT_INCONSISTENT' END,e.financial_updated_at FROM public.expenses e LEFT JOIN settled s ON s.source_type='despesa' AND s.source_id=e.id
 WHERE e.org_id=_org_id AND e.financial_edition_id=_edition_id AND (e.financial_status<>'cancelada' OR (_basis='cash' AND coalesce(s.amount,0)<>0))
 UNION ALL SELECT CASE WHEN direction='pagar' THEN 'operating_execution' ELSE 'other_revenue' END,'cash_unclassified','cash',amount,0,'CASH_WITHOUT_CLASSIFICATION',changed_at
 FROM settled s WHERE _basis='cash' AND source_type IN ('manual','parcela_comercial')
 ), keys AS(SELECT unnest(ARRAY['pavilion_ics','automotive','exporural','external_ics','agroindustry','food_points','parking','sponsorship_free','sponsorship_rouanet','other_revenue','operating_execution'])key),
 grouped AS(SELECT k.key,coalesce(sum(f.principal),0)::bigint principal,coalesce(sum(f.fees) FILTER(WHERE f.issue IS DISTINCT FROM 'FEES_TO_RECONCILE'),0)::bigint fees,
  count(f.source)::int n,count(f.source) FILTER(WHERE f.issue IS NOT NULL)::int invalid,
  coalesce((SELECT jsonb_agg(jsonb_build_object('source',x.source,'stage',x.stage,'principalCents',x.p::text,'feesCents',x.f::text,'issue',x.issue,'count',x.n) ORDER BY x.source,x.stage,x.issue) FROM (SELECT source,stage,issue,sum(principal)::bigint p,sum(fees)::bigint f,count(*)::int n FROM facts z WHERE z.category=k.key GROUP BY source,stage,issue)x),'[]') composition
  FROM keys k LEFT JOIN facts f ON f.category=k.key GROUP BY k.key)
 SELECT (SELECT jsonb_object_agg(key,jsonb_build_object('principalCents',principal::text,'feesCents',fees::text,'amountCents',(principal+fees)::text,'count',n,
  'commercialPortfolioCents',coalesce((SELECT sum(c.principal+c.fees) FROM commercial c WHERE c.category=key),0)::text,
  'commercialConfirmedCents',coalesce((SELECT sum(c.principal+c.fees) FROM commercial c WHERE c.category=key AND c.stage='confirmed'),0)::text,
  'coverageComplete',invalid=0,'status',CASE WHEN invalid>0 THEN 'incomplete' WHEN n>0 THEN 'ready' WHEN key='parking' THEN 'future' ELSE 'empty' END,'composition',composition)) FROM grouped),
 (SELECT coalesce(sum(principal+fees) FILTER(WHERE key<>'operating_execution'),0)::bigint FROM grouped),
 (SELECT principal+fees FROM grouped WHERE key='operating_execution'),
 (SELECT coalesce(sum(principal+CASE WHEN issue='FEES_TO_RECONCILE' THEN 0 ELSE fees END),0)::bigint FROM facts WHERE category IS NULL),
 (SELECT count(*) FROM facts WHERE issue IS NOT NULL),
 (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT source,issue,count(*)::int count,coalesce(sum(principal+fees),0)::text AS "amountCents",max(changed_at) AS "lastChangedAt" FROM facts GROUP BY source,issue ORDER BY source,issue)x)
 INTO categories,revenue,expense,unclassified,issues,sources;
 SELECT count(*) INTO cash_pending FROM public.lot_sale_installments i JOIN public.lot_sale_orders o ON o.id=i.order_id AND o.project_id=project
 WHERE i.payment_status='PAID' AND NOT EXISTS(SELECT 1 FROM public.financial_obligations f WHERE f.org_id=_org_id AND f.edition_id=_edition_id AND f.source_type='parcela_comercial' AND f.source_id=i.id);
 SELECT jsonb_agg(jsonb_build_object('key',scenario_key,'version',version,'referenceKey',reference_key,'targets',assumptions->'targets','provenance',assumptions->'provenance')
 ORDER BY CASE scenario_key WHEN 'pessimistic' THEN 1 WHEN 'realistic' THEN 2 ELSE 3 END) INTO scenarios
 FROM(SELECT DISTINCT ON(scenario_key) * FROM public.financial_scenarios WHERE org_id=_org_id AND edition_id=_edition_id AND schema_version=2 ORDER BY scenario_key,version DESC)t;
 SELECT coalesce(jsonb_agg(jsonb_build_object('date',observed_on,'revenueCents',amounts->>'revenueCents','expenseCents',amounts->>'expenseCents','categories',amounts->'categories','coverageComplete',coverage_complete) ORDER BY observed_on),'[]') INTO history
 FROM(SELECT DISTINCT ON(observed_on) * FROM public.financial_scenario_observations WHERE edition_id=_edition_id AND basis=_basis
 AND observed_on>=(statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date-60 ORDER BY observed_on,bucket DESC)t;
 result:=jsonb_build_object('schemaVersion',2,'orgId',_org_id,'editionId',_edition_id,'projectId',project,'basis',_basis,'calculationVersion','2028.1',
  'currentByCategory',categories,'sourceCoverage',sources,'scenarios',coalesce(scenarios,'[]'),
  'totals',jsonb_build_object('revenueCents',revenue::text,'expenseCents',expense::text,'balanceBeforeReserveCents',(revenue-expense)::text,
    'operatingRevenueCents',((categories->'pavilion_ics'->>'amountCents')::bigint+(categories->'automotive'->>'amountCents')::bigint+(categories->'exporural'->>'amountCents')::bigint+(categories->'external_ics'->>'amountCents')::bigint+(categories->'agroindustry'->>'amountCents')::bigint+(categories->'food_points'->>'amountCents')::bigint+(categories->'parking'->>'amountCents')::bigint)::text,
    'sponsorshipFreeCents',categories->'sponsorship_free'->>'amountCents','sponsorshipRouanetCents',categories->'sponsorship_rouanet'->>'amountCents',
    'unclassifiedCents',unclassified::text,'otherRevenueCents',categories->'other_revenue'->>'amountCents'),
  'coverage',jsonb_build_object('complete',issues=0 AND (_basis<>'cash' OR cash_pending=0),'issueCount',issues,'unreconciledCommercialPayments',cash_pending,
   'cashScope','FINANCIAL_ALLOCATIONS_ONLY','openingBalanceCents',NULL,'otherRevenuePolicy','INCLUDED_SEPARATELY',
   'futureSources',CASE WHEN categories->'parking'->>'status'='future' THEN jsonb_build_array('parking') ELSE '[]'::jsonb END,'historyCollection','SERVER_10_MINUTES_90_DAYS','feePolicy','PROPORTIONAL_FLOOR_RESIDUAL_UUID;CONFIRMED_SAME_ITEM_SHARES'),
  'history',history);
 RETURN result||jsonb_build_object('generation',md5(result::text),'generatedAt',statement_timestamp());
END $$;

CREATE OR REPLACE FUNCTION public.financial_scenario_overview(_org_id uuid,_edition_id uuid,_basis text DEFAULT 'portfolio') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM public.financial_require(_org_id,'financial_access');
 RETURN public._financial_scenario_build(_org_id,_edition_id,_basis);
END $$;

-- Collector is private, independent of open browser tabs. Observations are not economic events.
CREATE OR REPLACE FUNCTION public._financial_collect_scenarios() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c record; b text; v jsonb; ts timestamptz:=statement_timestamp();
BEGIN
 FOR c IN SELECT * FROM public.financial_scenario_sources ORDER BY edition_id LOOP
  FOREACH b IN ARRAY ARRAY['portfolio','confirmed','cash'] LOOP
   v:=public._financial_scenario_build(c.org_id,c.edition_id,b);
   INSERT INTO public.financial_scenario_observations(edition_id,basis,bucket,observed_on,generation,coverage_complete,amounts)
   VALUES(c.edition_id,b,to_timestamp(floor(extract(epoch FROM ts)/600)*600),(ts AT TIME ZONE 'America/Sao_Paulo')::date,v->>'generation',
    (v->'coverage'->>'complete')::boolean,jsonb_build_object('revenueCents',v->'totals'->>'revenueCents','expenseCents',v->'totals'->>'expenseCents','categories',v->'currentByCategory'))
   ON CONFLICT DO NOTHING;
  END LOOP;
 END LOOP;
 DELETE FROM public.financial_scenario_observations WHERE bucket<ts-interval '90 days';
END $$;

REVOKE ALL ON FUNCTION public._financial_scenario_validate(jsonb),public._financial_scenario_immutable(),public._financial_scenario_lots(uuid),
 public._financial_scenario_commercial(uuid),public._financial_scenario_build(uuid,uuid,text),public._financial_collect_scenarios() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.financial_save_scenario(uuid,uuid,text,jsonb,text,uuid,integer),public.financial_link_scenario_revenue(uuid,uuid,uuid,text,text,uuid,integer,uuid),
 public.financial_scenario_overview(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.financial_save_scenario(uuid,uuid,text,jsonb,text,uuid,integer),public.financial_link_scenario_revenue(uuid,uuid,uuid,text,text,uuid,integer,uuid),
 public.financial_scenario_overview(uuid,uuid,text) TO authenticated;

-- Authorized source mapping is paged independently; no page is used to form totals.
CREATE OR REPLACE FUNCTION public.financial_scenario_revenue_sources(_org_id uuid,_edition_id uuid,_offset integer DEFAULT 0,_unmapped_only boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.financial_require(_org_id,'financial_access');
 IF _offset IS NULL OR _offset<0 OR _offset>1000000 OR NOT EXISTS(SELECT 1 FROM public.financial_scenario_sources WHERE org_id=_org_id AND edition_id=_edition_id) THEN RAISE EXCEPTION 'FINANCIAL_SCENARIO_SCOPE_INVALID'; END IF;
 WITH records AS MATERIALIZED(
 SELECT r.id,r.description,CASE WHEN r.status='confirmada' THEN r.confirmed_cents ELSE r.projected_cents END::text AS "amountCents",
  l.category,coalesce(l.version,0) version FROM public.financial_revenues r LEFT JOIN public.financial_scenario_revenue_links l ON l.revenue_id=r.id
 WHERE r.org_id=_org_id AND r.edition_id=_edition_id AND r.status<>'cancelada' AND coalesce(l.origin_kind,'manual')='manual'
 AND (NOT _unmapped_only OR coalesce(l.category,'other_revenue')='other_revenue'))
 SELECT jsonb_build_object('total',(SELECT count(*) FROM records),'items',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM records ORDER BY id LIMIT 25 OFFSET _offset)x),'[]')) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.financial_scenario_revenue_sources(uuid,uuid,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.financial_scenario_revenue_sources(uuid,uuid,integer,boolean) TO authenticated;

-- Official reference seed follows below. Explicit scope, no invented author account.

DO $seed$
DECLARE org constant uuid:='985888b8-155f-4bbe-b6b9-6bef2893d99b';
 project constant uuid:='0538d132-34dd-4347-a33c-526edac7339c'; edition uuid; row record; n integer;
BEGIN
 SELECT id INTO edition FROM public.financial_editions WHERE org_id=org AND code=2028 AND status='operacional';
 IF edition IS NULL OR NOT EXISTS(SELECT 1 FROM public.map_projects WHERE id=project AND org_id=org AND NOT is_archived)
  THEN RAISE EXCEPTION 'FINANCIAL_SCENARIO_SEED_SCOPE_INVALID'; END IF;
 INSERT INTO public.financial_scenario_sources(org_id,edition_id,project_id) VALUES(org,edition,project) ON CONFLICT DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.financial_scenario_sources WHERE edition_id=edition AND org_id=org AND project_id=project)
  THEN RAISE EXCEPTION 'FINANCIAL_SCENARIO_SOURCE_CONFLICT'; END IF;
 FOR row IN SELECT * FROM (VALUES ('B1',1),('B2',14),('B3',12),('B4',8),('B5',13),('B6',3),('B8',5),('B10',7))x(identifier,physical) LOOP
  SELECT count(*) INTO n FROM public.map_entities WHERE project_id=project AND public_identifier=row.identifier AND classification='PAVILION' AND NOT is_archived;
  IF n<>1 THEN RAISE EXCEPTION 'FINANCIAL_SCENARIO_PAVILION_INVALID: %',row.identifier; END IF;
  INSERT INTO public.financial_scenario_pavilions(project_id,entity_id,physical_number,category)
   SELECT project,id,row.physical,CASE WHEN row.physical=7 THEN 'agroindustry' ELSE 'pavilion_ics' END FROM public.map_entities
   WHERE project_id=project AND public_identifier=row.identifier AND classification='PAVILION' AND NOT is_archived ON CONFLICT DO NOTHING;
 END LOOP;
 FOR row IN SELECT * FROM (VALUES
('pessimistic','{"schemaVersion": 2, "moneyUnit": "BRL_CENTS", "referenceKey": "whatsapp-2026-10-21-v1", "targets": {"pavilion_ics": "180109944", "automotive": "24096253", "exporural": "78548703", "external_ics": "80383503", "agroindustry": "10670400", "food_points": "36000000", "parking": "56000000", "operating_subtotal": "465808803", "sponsorship_free": "240000000", "sponsorship_rouanet": "60000000", "revenue_total": "765808803", "operating_execution": "700000000", "cash_reserve": "65808803", "investment_capacity": "0"}, "provenance": {"source": "WhatsApp Image 2026-10-21 at 17.30.11 (1).jpeg", "referenceDate": "2026-10-21", "originalReserveLabel": "Reserva de Caixa 2028", "negativeCents": "0", "issues": [{"code": "ABSOLUTE_VALUES_PRESERVED", "message": "Automóvel e Área Externa preservam os valores absolutos do anexo; não foram recalculados a 80%.", "differenceCents": null}]}}'::jsonb),
('realistic','{"schemaVersion": 2, "moneyUnit": "BRL_CENTS", "referenceKey": "whatsapp-2026-10-21-v1", "targets": {"pavilion_ics": "225137430", "automotive": "30120320", "exporural": "98185879", "external_ics": "100479335", "agroindustry": "13338000", "food_points": "45000000", "parking": "70000000", "operating_subtotal": "582260964", "sponsorship_free": "400000000", "sponsorship_rouanet": "100000000", "revenue_total": "1082260964", "operating_execution": "700000000", "cash_reserve": "150000000", "investment_capacity": "232260964"}, "provenance": {"source": "WhatsApp Image 2026-10-21 at 17.30.11 (1).jpeg", "referenceDate": "2026-10-21", "originalReserveLabel": "Reserva de Caixa 2030", "negativeCents": null, "issues": []}}'::jsonb),
('optimistic','{"schemaVersion": 2, "moneyUnit": "BRL_CENTS", "referenceKey": "whatsapp-2026-10-21-v1", "targets": {"pavilion_ics": "225137430", "automotive": "30120320", "exporural": "98185879", "external_ics": "100479335", "agroindustry": "20000000", "food_points": "50000000", "parking": "72000000", "operating_subtotal": "595922964", "sponsorship_free": "500000000", "sponsorship_rouanet": "120000000", "revenue_total": "1215922964", "operating_execution": "700000000", "cash_reserve": "200000000", "investment_capacity": "313922964"}, "provenance": {"source": "WhatsApp Image 2026-10-21 at 17.30.11 (1).jpeg", "referenceDate": "2026-10-21", "originalReserveLabel": "Reserva de Caixa 2030", "negativeCents": null, "issues": [{"code": "INVESTMENT_REFERENCE_MISMATCH", "message": "Divergência na referência: investimento informado R$ 3.139.229,64; fórmula R$ 3.159.229,64. Diferença R$ 20.000,00.", "differenceCents": "2000000"}, {"code": "PARKING_LABEL_MISMATCH", "message": "Estacionamento rotulado 120%; valor absoluto preservado R$ 720.000,00 (102,8571% de R$ 700.000,00).", "differenceCents": null}]}}'::jsonb)
 )x(key,assumptions) LOOP
  PERFORM public._financial_scenario_validate(row.assumptions);
  PERFORM pg_advisory_xact_lock(hashtextextended(edition::text||row.key,31028));
  INSERT INTO public.financial_scenarios(org_id,edition_id,scenario_key,version,assumptions,notes,created_by,schema_version,money_unit,reference_key,author_kind)
  SELECT org,edition,row.key,coalesce((SELECT max(version) FROM public.financial_scenarios WHERE edition_id=edition AND scenario_key=row.key),0)+1,
   row.assumptions,'Transcrição oficial autorizada; autor de sistema identificado pelo histórico desta migração.',NULL,2,'BRL_CENTS','whatsapp-2026-10-21-v1','migration'
  WHERE NOT EXISTS(SELECT 1 FROM public.financial_scenarios WHERE edition_id=edition AND scenario_key=row.key AND reference_key='whatsapp-2026-10-21-v1');
 END LOOP;
END $seed$;

-- Server collection: one observation per 10-minute bucket, 90-day retention.
-- Local PostgreSQL without pg_cron uses an explicit invocation in the QA harness.
DO $cron$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='financial-scenarios-2028') THEN
   PERFORM cron.schedule('financial-scenarios-2028','*/10 * * * *','SELECT public._financial_collect_scenarios()');
  END IF;
 END IF;
END $cron$;
NOTIFY pgrst, 'reload schema';
