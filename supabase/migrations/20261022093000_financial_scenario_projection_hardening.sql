-- Treat a missing legacy order margin as unreconciled, rather than SQL NULL.
-- Principal remains eligible independently; known fees stay visible in coverage.
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
  coalesce(m.valid AND m.total>0 AND m.total=order_principal AND m.total+f=order_total AND f=fee_sum AND f>=0,false) fee_valid,
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

REVOKE ALL ON FUNCTION public._financial_scenario_commercial(uuid) FROM PUBLIC,anon,authenticated;

-- Classify all lots in one ancestor walk. Aggregate each lot once; never rescan the
-- recursive relation per lot (the original correlated scans took ~33 s on the linked project).
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
  SELECT l.id lot_id,l.block,e.*,ARRAY[e.id] path,0 depth,false cycle
  FROM public.commercial_lots l JOIN entities e ON e.id=l.entity_id WHERE l.project_id=project
  UNION ALL
  SELECT w.lot_id,w.block,e.*,w.path||e.id,w.depth+1,e.id=ANY(w.path)
  FROM walk w JOIN entities e ON e.id=w.parent_entity_id WHERE NOT w.cycle AND w.depth<64
 ), facts AS (
  SELECT w.lot_id,
   (array_agg(w.pavilion ORDER BY w.depth) FILTER(WHERE w.depth>0 AND w.pavilion IS NOT NULL))[1] pavilion,
   (array_agg(w.segment ORDER BY w.depth) FILTER(WHERE w.segment IS NOT NULL))[1] segment,
   bool_or(w.cycle OR w.depth=64 OR w.is_archived OR w.parent_missing) broken,
   bool_or(w.classification='PAVILION' AND w.pavilion IS NULL) unknown_pavilion,
   bool_or(w.depth=0 AND (w.classification IN ('INTERNAL_STAND','PAVILION') OR w.metadata?'pavilionPublicIdentifier' OR w.metadata?'pavilionModuleKey' OR coalesce(w.block,'')~*'^P[0-9]+$')) interior,
   bool_or(w.classification='QUADRA' AND w.block IS NOT NULL AND upper(w.public_identifier)<> 'QUADRA-'||upper(btrim(w.block))) block_conflict
  FROM walk w GROUP BY w.lot_id
 ) SELECT lot_id,CASE WHEN broken OR unknown_pavilion THEN NULL WHEN pavilion IS NOT NULL THEN pavilion WHEN interior OR block_conflict THEN NULL
  WHEN segment='espaco-automovel' THEN 'automotive' WHEN segment='exporural' THEN 'exporural'
  WHEN segment='industria-comercio-servicos' THEN 'external_ics' END,
  CASE WHEN broken THEN 'PARENT_INVALID' WHEN unknown_pavilion THEN 'PAVILION_UNREGISTERED' WHEN pavilion IS NOT NULL THEN NULL
   WHEN interior THEN 'INTERIOR_WITHOUT_PARENT' WHEN block_conflict THEN 'BLOCK_CONFLICT' WHEN segment IS NULL THEN 'SEGMENT_MISSING' END FROM facts
$$;
REVOKE ALL ON FUNCTION public._financial_scenario_lots(uuid) FROM PUBLIC,anon,authenticated;
