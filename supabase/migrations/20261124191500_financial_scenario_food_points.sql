BEGIN;

-- The persisted commercial unit and segment identify Gastronomia regardless
-- of whether an emblem is on a pavilion, a walkway, or a landmark.
CREATE OR REPLACE FUNCTION public._financial_scenario_lots(project uuid)
RETURNS TABLE(lot_id uuid,category text,issue text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH RECURSIVE entities AS MATERIALIZED (
  SELECT e.id,e.parent_entity_id,e.classification,e.public_identifier,e.metadata,e.is_archived,
   p.category pavilion,s.slug segment,
   e.parent_entity_id IS NOT NULL AND parent.id IS NULL parent_missing
  FROM public.map_entities e
  LEFT JOIN public.map_entities parent ON parent.id=e.parent_entity_id AND parent.project_id=project
  LEFT JOIN public.financial_scenario_pavilions p ON p.entity_id=e.id AND p.project_id=project
  LEFT JOIN public.map_segments s ON s.id=e.segment_id AND s.project_id=project AND s.is_active
  WHERE e.project_id=project
 ), walk AS (
  SELECT l.id lot_id,l.block,l.commercial_unit,e.*,ARRAY[e.id] path,0 depth,false cycle
  FROM public.commercial_lots l JOIN entities e ON e.id=l.entity_id WHERE l.project_id=project
  UNION ALL
  SELECT w.lot_id,w.block,w.commercial_unit,e.*,w.path||e.id,w.depth+1,e.id=ANY(w.path)
  FROM walk w JOIN entities e ON e.id=w.parent_entity_id WHERE NOT w.cycle AND w.depth<64
 ), facts AS (
  SELECT w.lot_id,
   bool_or(w.depth=0 AND (w.commercial_unit='FOOD_POINT' OR w.classification='FOOD_POINT')) food_unit,
   bool_or(w.depth=0 AND w.commercial_unit='FOOD_POINT' AND w.classification='FOOD_POINT' AND w.segment='gastronomia') gastronomy,
   (array_agg(w.pavilion ORDER BY w.depth) FILTER(WHERE w.depth>0 AND w.pavilion IS NOT NULL))[1] pavilion,
   (array_agg(w.segment ORDER BY w.depth) FILTER(WHERE w.segment IS NOT NULL))[1] segment,
   bool_or(w.cycle OR w.depth=64 OR w.is_archived OR w.parent_missing) broken,
   bool_or(w.classification='PAVILION' AND w.pavilion IS NULL) unknown_pavilion,
   bool_or(w.depth=0 AND (w.classification IN ('INTERNAL_STAND','PAVILION') OR w.metadata?'pavilionPublicIdentifier' OR w.metadata?'pavilionModuleKey' OR coalesce(w.block,'')~*'^P[0-9]+$')) interior,
   bool_or(w.classification='QUADRA' AND w.block IS NOT NULL AND upper(w.public_identifier)<> 'QUADRA-'||upper(btrim(w.block))) block_conflict
  FROM walk w GROUP BY w.lot_id
 ) SELECT lot_id,CASE WHEN food_unit THEN CASE WHEN gastronomy THEN 'food_points' END
  WHEN broken OR unknown_pavilion THEN NULL WHEN pavilion IS NOT NULL THEN pavilion WHEN interior OR block_conflict THEN NULL
  WHEN segment='espaco-automovel' THEN 'automotive' WHEN segment='exporural' THEN 'exporural'
  WHEN segment='industria-comercio-servicos' THEN 'external_ics' END,
  CASE WHEN food_unit THEN CASE WHEN gastronomy IS NOT TRUE THEN 'FOOD_POINT_SCOPE_INVALID' END
   WHEN broken THEN 'PARENT_INVALID' WHEN unknown_pavilion THEN 'PAVILION_UNREGISTERED' WHEN pavilion IS NOT NULL THEN NULL
   WHEN interior THEN 'INTERIOR_WITHOUT_PARENT' WHEN block_conflict THEN 'BLOCK_CONFLICT' WHEN segment IS NULL THEN 'SEGMENT_MISSING' END FROM facts
$$;
REVOKE ALL ON FUNCTION public._financial_scenario_lots(uuid) FROM PUBLIC,anon,authenticated;

-- Read the current 2028 price table independently of sales and receipts.
CREATE OR REPLACE FUNCTION public._financial_scenario_food_inventory(project uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object(
  'units',count(*)::int,
  'pricedUnits',count(p.renovacao_total)::int,
  'availableUnits',(count(*) FILTER (WHERE l.status='AVAILABLE'))::int,
  'tableCents',coalesce(sum(round(p.renovacao_total*100)),0)::bigint::text,
  'availableTableCents',coalesce(sum(round(p.renovacao_total*100)) FILTER (WHERE l.status='AVAILABLE'),0)::bigint::text)
 FROM public.commercial_lots l
 JOIN public.map_entities e ON e.id=l.entity_id AND e.project_id=l.project_id
 JOIN public.map_segments s ON s.id=e.segment_id AND s.project_id=l.project_id
  AND s.slug='gastronomia' AND s.is_active
 LEFT JOIN public.commercial_lot_pricing_2028 p ON p.lot_id=l.id AND p.entity_id=e.id
  AND p.resolution_status<>'EXCLUIDO' AND p.renovacao_total>=0
 WHERE l.project_id=project AND l.commercial_unit='FOOD_POINT' AND e.classification='FOOD_POINT'
  AND l.archived_at IS NULL AND NOT e.is_archived
$$;
REVOKE ALL ON FUNCTION public._financial_scenario_food_inventory(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public._financial_scenario_build(_org_id uuid,_edition_id uuid,_basis text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE project uuid; calculation_version constant text := '2028.2'; result jsonb; categories jsonb; sources jsonb; scenarios jsonb; history jsonb;
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
 -- Use the proven principal and fee margins to attribute actual allocations
 -- in centavos. Keep ambiguous orders and the non-food share in coverage.
 order_food_mix AS MATERIALIZED (
  SELECT i.order_id,sum(c.principal+c.fees)::bigint order_cents,
   (sum(c.principal+c.fees) FILTER (WHERE c.category='food_points'))::bigint food_cents
  FROM commercial c JOIN public.lot_sale_order_items i ON i.id=c.origin_id AND c.source='commercial'
  JOIN public.lot_sale_orders o ON o.id=i.order_id AND o.project_id=project AND o.reverted_at IS NULL
  WHERE _basis='cash'
  GROUP BY i.order_id,o.negotiated_total
  HAVING bool_and(c.issue IS NULL) AND sum(c.principal+c.fees)=round(o.negotiated_total*100)
   AND sum(c.principal+c.fees) FILTER (WHERE c.category='food_points')>0
 ), food_cash AS MATERIALIZED (
  SELECT s.source_id,floor(s.amount::numeric*m.food_cents/m.order_cents)::bigint amount,s.changed_at
  FROM settled s JOIN public.lot_sale_installments i ON i.id=s.source_id
  JOIN order_food_mix m ON m.order_id=i.order_id
  WHERE s.source_type='parcela_comercial' AND s.direction='receber' AND NOT s.inconsistent
   AND s.amount>0 AND s.amount<=round(i.amount*100) AND i.payment_status<>'CANCELLED'
   AND NOT EXISTS (
    SELECT 1 FROM public.financial_scenario_revenue_links link
    JOIN settled cash ON cash.source_type='receita' AND cash.source_id=link.revenue_id AND cash.amount<>0
    WHERE link.org_id=_org_id AND link.edition_id=_edition_id AND link.origin_kind='sale_order' AND link.origin_id=i.order_id
   )
 ), facts AS MATERIALIZED(
 SELECT category,source,stage,principal,fees,issue,changed_at FROM commercial WHERE _basis<>'cash' AND (_basis='portfolio' OR stage='confirmed' OR issue IS NOT NULL)
 UNION ALL SELECT coalesce(l.category,'other_revenue'),'manual',CASE WHEN r.status='confirmada' THEN 'confirmed' ELSE 'projected' END,
  CASE WHEN _basis='cash' THEN coalesce(s.amount,0) WHEN r.status='confirmada' THEN coalesce(r.confirmed_cents,0) WHEN _basis='portfolio' THEN r.projected_cents ELSE 0 END,
  0,CASE WHEN _basis='cash' AND s.inconsistent THEN 'CASH_SETTLEMENT_INCONSISTENT' WHEN l.revenue_id IS NULL THEN 'MANUAL_WITHOUT_CATEGORY' END,r.updated_at
 FROM public.financial_revenues r LEFT JOIN public.financial_scenario_revenue_links l ON l.revenue_id=r.id AND l.org_id=_org_id AND l.edition_id=_edition_id
 LEFT JOIN settled s ON s.source_type='receita' AND s.source_id=r.id
 WHERE r.org_id=_org_id AND r.edition_id=_edition_id AND (r.status<>'cancelada' OR (_basis='cash' AND coalesce(s.amount,0)<>0)) AND (coalesce(l.origin_kind,'manual')='manual' OR _basis='cash')
 UNION ALL SELECT kind,'sponsorship',CASE WHEN r.negotiation_status='confirmado' THEN 'confirmed' ELSE r.negotiation_status END,
  CASE WHEN _basis='cash' THEN CASE WHEN coalesce(r.confirmed_free_cents+r.confirmed_rouanet_cents,0)<=0 THEN 0 WHEN kind='sponsorship_free' THEN coalesce(floor(coalesce(s.amount,0)::numeric*r.confirmed_free_cents/nullif(r.confirmed_free_cents+r.confirmed_rouanet_cents,0))::bigint,0)
    ELSE coalesce(s.amount,0)-coalesce(floor(coalesce(s.amount,0)::numeric*r.confirmed_free_cents/nullif(r.confirmed_free_cents+r.confirmed_rouanet_cents,0))::bigint,0) END
   WHEN r.negotiation_status='confirmado' THEN CASE WHEN kind='sponsorship_free' THEN r.confirmed_free_cents ELSE r.confirmed_rouanet_cents END
   WHEN _basis='portfolio' THEN CASE WHEN kind='sponsorship_free' THEN r.projected_free_cents ELSE r.projected_rouanet_cents END ELSE 0 END,
  0,CASE WHEN _basis='cash' AND s.inconsistent THEN 'CASH_SETTLEMENT_INCONSISTENT' END,r.updated_at FROM public.financial_sponsorships r CROSS JOIN unnest(ARRAY['sponsorship_free','sponsorship_rouanet'])kind
 LEFT JOIN settled s ON s.source_type='patrocinio' AND s.source_id=r.id
 WHERE r.org_id=_org_id AND r.edition_id=_edition_id AND (r.negotiation_status<>'cancelado' OR (_basis='cash' AND coalesce(s.amount,0)<>0))
 UNION ALL SELECT 'other_revenue','cash_unclassified','cash',s.amount,0,'CASH_WITHOUT_CLASSIFICATION',s.changed_at
 FROM public.financial_sponsorships r JOIN settled s ON s.source_type='patrocinio' AND s.source_id=r.id
 WHERE _basis='cash' AND r.org_id=_org_id AND r.edition_id=_edition_id AND s.amount<>0 AND coalesce(r.confirmed_free_cents+r.confirmed_rouanet_cents,0)<=0
 UNION ALL SELECT 'operating_execution','expense',e.financial_status,
  CASE WHEN _basis='cash' THEN coalesce(s.amount,0) WHEN e.financial_status='realizada' THEN coalesce(e.committed_cents,0) WHEN _basis='portfolio' THEN coalesce(e.planned_cents,0) ELSE 0 END,
  0,CASE WHEN _basis='cash' AND s.inconsistent THEN 'CASH_SETTLEMENT_INCONSISTENT' END,e.financial_updated_at FROM public.expenses e LEFT JOIN settled s ON s.source_type='despesa' AND s.source_id=e.id
 WHERE e.org_id=_org_id AND e.financial_edition_id=_edition_id AND (e.financial_status<>'cancelada' OR (_basis='cash' AND coalesce(s.amount,0)<>0))
 UNION ALL SELECT 'food_points','commercial_cash','cash',amount,0,NULL,changed_at FROM food_cash WHERE amount>0
 UNION ALL SELECT CASE WHEN s.direction='pagar' THEN 'operating_execution' ELSE 'other_revenue' END,
  'cash_unclassified','cash',s.amount-coalesce(fc.amount,0),0,'CASH_WITHOUT_CLASSIFICATION',s.changed_at
 FROM settled s LEFT JOIN food_cash fc ON fc.source_id=s.source_id AND s.source_type='parcela_comercial'
  AND s.direction='receber'
 WHERE _basis='cash' AND s.source_type IN ('manual','parcela_comercial')
  AND (fc.source_id IS NULL OR s.amount<>fc.amount)
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
 SELECT coalesce(jsonb_agg(jsonb_build_object('date',observed_on,'revenueCents',amounts->>'revenueCents','expenseCents',amounts->>'expenseCents','categories',CASE WHEN jsonb_path_exists(amounts,'$.categories.*.composition[*] ? (@.principalCents == null || @.feesCents == null)') THEN '{}'::jsonb ELSE amounts->'categories' END,'coverageComplete',coverage_complete AND NOT jsonb_path_exists(amounts,'$.categories.*.composition[*] ? (@.principalCents == null || @.feesCents == null)')) ORDER BY observed_on),'[]') INTO history
 FROM(SELECT DISTINCT ON(observed_on) * FROM public.financial_scenario_observations WHERE edition_id=_edition_id AND basis=_basis
 AND amounts->>'calculationVersion'=calculation_version
 AND observed_on>=(statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date-60 ORDER BY observed_on,bucket DESC)t;
 result:=jsonb_build_object('schemaVersion',2,'orgId',_org_id,'editionId',_edition_id,'projectId',project,'basis',_basis,'calculationVersion',calculation_version,
  'foodPointInventory',public._financial_scenario_food_inventory(project),
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

REVOKE ALL ON FUNCTION public._financial_scenario_build(uuid,uuid,text) FROM PUBLIC,anon,authenticated;

-- Historical snapshots stay intact. Comparable trend data begins with the
-- first observation of the corrected classification.
CREATE OR REPLACE FUNCTION public._financial_collect_scenarios() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c record; b text; v jsonb; ts timestamptz:=statement_timestamp();
BEGIN
 FOR c IN SELECT * FROM public.financial_scenario_sources ORDER BY edition_id LOOP
  FOREACH b IN ARRAY ARRAY['portfolio','confirmed','cash'] LOOP
   v:=public._financial_scenario_build(c.org_id,c.edition_id,b);
   INSERT INTO public.financial_scenario_observations(edition_id,basis,bucket,observed_on,generation,coverage_complete,amounts)
   VALUES(c.edition_id,b,to_timestamp(floor(extract(epoch FROM ts)/600)*600),(ts AT TIME ZONE 'America/Sao_Paulo')::date,v->>'generation',
    (v->'coverage'->>'complete')::boolean,jsonb_build_object('calculationVersion',v->>'calculationVersion','revenueCents',v->'totals'->>'revenueCents','expenseCents',v->'totals'->>'expenseCents','categories',v->'currentByCategory'))
   ON CONFLICT DO NOTHING;
  END LOOP;
 END LOOP;
 DELETE FROM public.financial_scenario_observations WHERE bucket<ts-interval '90 days';
END $$;
REVOKE ALL ON FUNCTION public._financial_collect_scenarios() FROM PUBLIC,anon,authenticated;

ALTER TABLE public.financial_scenario_sources ALTER COLUMN calculation_version SET DEFAULT '2028.2';
UPDATE public.financial_scenario_sources SET calculation_version='2028.2' WHERE calculation_version='2028.1';

COMMIT;
