BEGIN;

-- Keep price rules and overrides intact. Stage totals are effective amounts;
-- the table totals remain available independently for internal pricing.
CREATE OR REPLACE VIEW public.commercial_lot_pricing_2028 WITH (security_invoker = on) AS
WITH lot_base AS (
  SELECT l.id lot_id, l.project_id, l.entity_id, l.public_identifier,
    CASE WHEN l.block ~ '^P[0-9]+$' THEN NULL::text ELSE l.block END block,
    l.status, l.cession_id, l.official_area_sqm, l.area_validation_status,
    nullif(regexp_replace(coalesce(l.lot_number,''),'\D','','g'),'')::int lot_num,
    CASE WHEN l.block ~ '^P[0-9]+$' THEN l.block END pavilion,
    coalesce(ca.classification,'NOT_AUDITED') corner_status,
    coalesce(ca.classification,'')='CORNER_CONFIRMED' corner_confirmed,
    CASE WHEN e.metadata->>'pricingGroup'='quadra-r-01-12' AND l.block='R'
      AND l.public_identifier='EXPORURAL-AREA-56878' THEN 1 END pricing_group_num,
    l.commercial_unit, l.unit_quantity, l.commercial_package_role, fp.base_price AS fixed_total
  FROM public.commercial_lots l JOIN public.map_entities e ON e.id=l.entity_id
  LEFT JOIN public.commercial_lot_corner_audit ca ON ca.lot_id=l.id
  LEFT JOIN public.lot_prices fp ON l.commercial_unit IN ('FOOD_POINT','FIXED_PACKAGE') AND l.commercial_package_role IS DISTINCT FROM 'COMPONENT' AND fp.lot_id=l.id
    AND fp.is_active AND fp.pricing_mode='FIXED_TOTAL' AND fp.base_price>0 AND fp.price_per_sqm IS NULL
  WHERE l.archived_at IS NULL AND NOT e.is_archived
), matched AS (
  SELECT b.lot_id, r.stage, r.id rule_id, r.label,
    CASE WHEN b.pricing_group_num=1 AND r.stage='SEGUNDA_ETAPA' AND r.block='R'
      AND r.range_start=1 AND r.range_end=12 THEN 30.25::numeric ELSE r.price_per_sqm END price_per_sqm,
    rank() OVER(PARTITION BY b.lot_id,r.stage ORDER BY r.priority DESC) rnk
  FROM lot_base b JOIN public.commercial_price_rules r ON r.is_active AND r.exercise=2028
    AND r.scope_type<>'EXCLUSION' AND (r.project_id IS NULL OR r.project_id=b.project_id)
    AND (r.pavilion_identifier IS NULL OR r.pavilion_identifier=b.pavilion)
    AND (r.block IS NULL OR r.block=b.block) AND (r.pavilion_identifier IS NOT NULL OR r.block IS NOT NULL)
    AND (r.range_start IS NULL OR coalesce(b.pricing_group_num,b.lot_num) BETWEEN r.range_start AND r.range_end)
    AND (r.is_corner IS NULL OR r.is_corner=b.corner_confirmed)
  WHERE b.commercial_unit='SQUARE_METER'
), top_matches AS (
  SELECT lot_id, stage, rule_id, label, price_per_sqm, count(*) OVER(PARTITION BY lot_id,stage) tie_count
  FROM matched WHERE rnk=1
), resolved AS (
  SELECT b.*, ren.rule_id renovacao_rule_id, ren.label renovacao_rule_label, ren.price_per_sqm rule_ren_ppsqm,
    ren.tie_count ren_tie, seg.rule_id segunda_rule_id, seg.label segunda_rule_label,
    seg.price_per_sqm rule_seg_ppsqm, seg.tie_count seg_tie, ovr.total ren_override, ovs.total seg_override
  FROM lot_base b
  LEFT JOIN top_matches ren ON ren.lot_id=b.lot_id AND ren.stage='RENOVACAO'
  LEFT JOIN top_matches seg ON seg.lot_id=b.lot_id AND seg.stage='SEGUNDA_ETAPA'
  LEFT JOIN public.commercial_lot_price_overrides ovr ON b.commercial_unit='SQUARE_METER' AND ovr.lot_id=b.lot_id AND ovr.stage='RENOVACAO'
  LEFT JOIN public.commercial_lot_price_overrides ovs ON b.commercial_unit='SQUARE_METER' AND ovs.lot_id=b.lot_id AND ovs.stage='SEGUNDA_ETAPA'
), calc AS (
  SELECT r.*,
    CASE WHEN commercial_unit IN ('FOOD_POINT','FIXED_PACKAGE') THEN fixed_total
      WHEN official_area_sqm>0 AND ren_tie=1 THEN round(official_area_sqm*rule_ren_ppsqm,2) END ren_default,
    CASE WHEN commercial_unit IN ('FOOD_POINT','FIXED_PACKAGE') THEN fixed_total
      WHEN official_area_sqm>0 AND seg_tie=1 THEN round(official_area_sqm*rule_seg_ppsqm,2) END seg_default
  FROM resolved r
)
SELECT lot_id, project_id, public_identifier, pavilion, block, lot_num, status, corner_status,
  corner_confirmed, official_area_sqm, area_validation_status, renovacao_rule_id,
  CASE WHEN commercial_unit='FIXED_PACKAGE' AND fixed_total IS NOT NULL THEN 'Locação do Parque Stallonne'
    WHEN commercial_unit='FOOD_POINT' AND fixed_total IS NOT NULL THEN 'Preço oficial por ponto'
    WHEN ren_override IS NOT NULL THEN 'Valor manual' ELSE renovacao_rule_label END renovacao_rule_label,
  (CASE WHEN ren_override IS NOT NULL THEN round(ren_override/nullif(official_area_sqm,0),2)
    ELSE rule_ren_ppsqm END)::numeric(12,2) renovacao_price_per_sqm,
  segunda_rule_id,
  CASE WHEN commercial_unit='FIXED_PACKAGE' AND fixed_total IS NOT NULL THEN 'Locação do Parque Stallonne'
    WHEN commercial_unit='FOOD_POINT' AND fixed_total IS NOT NULL THEN 'Preço oficial por ponto'
    WHEN seg_override IS NOT NULL THEN 'Valor manual' ELSE segunda_rule_label END segunda_rule_label,
  (CASE WHEN seg_override IS NOT NULL THEN round(seg_override/nullif(official_area_sqm,0),2)
    ELSE rule_seg_ppsqm END)::numeric(12,2) segunda_price_per_sqm,
  CASE WHEN cession_id IS NOT NULL THEN 0 ELSE coalesce(ren_override,ren_default) END renovacao_total,
  CASE WHEN cession_id IS NOT NULL THEN 0 ELSE coalesce(seg_override,seg_default) END segunda_total,
  CASE WHEN cession_id IS NOT NULL THEN 'EXCLUIDO' WHEN commercial_package_role='COMPONENT' THEN 'SEM_REGRA'
    WHEN commercial_unit IN ('FOOD_POINT','FIXED_PACKAGE') THEN CASE WHEN fixed_total IS NOT NULL THEN 'OK' ELSE 'SEM_REGRA' END
    WHEN ren_override IS NOT NULL AND seg_override IS NOT NULL THEN 'OK'
    WHEN coalesce(official_area_sqm,0)<=0 THEN 'SEM_AREA'
    WHEN (ren_override IS NULL AND coalesce(ren_tie,0)>1) OR (seg_override IS NULL AND coalesce(seg_tie,0)>1) THEN 'REGRA_AMBIGUA'
    WHEN pavilion='P7' AND coalesce(ren_override,ren_default) IS NOT NULL THEN 'OK'
    WHEN (ren_override IS NULL AND renovacao_rule_id IS NULL) OR (seg_override IS NULL AND segunda_rule_id IS NULL) THEN 'SEM_REGRA'
    ELSE 'OK' END resolution_status,
  ren_default renovacao_default_total, seg_default segunda_default_total, (ren_override IS NOT NULL) renovacao_is_manual,
  (seg_override IS NOT NULL) segunda_is_manual, entity_id, commercial_unit, unit_quantity,
  coalesce(ren_override,ren_default) renovacao_table_total, coalesce(seg_override,seg_default) segunda_table_total
FROM calc;

CREATE OR REPLACE VIEW public.commercial_sale_eligibility WITH (security_invoker = on) AS
WITH hist AS (
  SELECT lot_id, count(*) FILTER (WHERE reason IS DISTINCT FROM
    'Lote numerado importado da referência oficial 2026.3; validação comercial pendente.') commercial_entries
  FROM public.lot_status_history GROUP BY lot_id
), base AS (
  SELECT l.id lot_id, l.project_id, l.public_identifier, l.block, l.status, l.cession_id, l.official_area_sqm,
    p.resolution_status, (l.block='P7' AND p.renovacao_total IS NULL) is_unpriced_pavilion,
    EXISTS (SELECT 1 FROM public.lot_sales s WHERE s.lot_id=l.id AND coalesce(s.status,'ACTIVE')<>'REVERTED') has_active_sale,
    EXISTS (SELECT 1 FROM public.lot_reservations r WHERE r.lot_id=l.id AND r.status='ACTIVE') has_active_reservation,
    EXISTS (SELECT 1 FROM public.lot_negotiations n WHERE n.lot_id=l.id AND n.status='ACTIVE') has_active_negotiation,
    EXISTS (SELECT 1 FROM public.lot_contracts c WHERE c.lot_id=l.id AND c.is_active
      AND (l.commercial_unit='SQUARE_METER' OR EXISTS (
        SELECT 1 FROM public.lot_sales s WHERE s.id=c.sale_id AND s.status IN ('OPEN','CONFIRMED')
      ))) has_active_contract,
    l.archived_at, coalesce(h.commercial_entries,0) commercial_entries, l.commercial_unit,
    l.commercial_package_role, l.commercial_package_reconciliation_pending,
    (l.commercial_unit='FOOD_POINT' AND EXISTS (
      SELECT 1 FROM public.map_entities e
      JOIN public.map_segments s ON s.id=e.segment_id AND s.project_id=l.project_id AND s.slug='gastronomia' AND s.is_active
      JOIN public.map_entities a ON a.id=e.parent_entity_id AND a.project_id=l.project_id AND NOT a.is_archived AND NOT a.is_sellable
      JOIN public.map_entity_geometries g ON g.entity_id=a.id AND g.project_id=l.project_id AND g.is_current
      WHERE e.id=l.entity_id AND e.project_id=l.project_id AND e.classification='FOOD_POINT' AND NOT e.is_archived
    )) has_valid_anchor
  FROM public.commercial_lots l LEFT JOIN hist h ON h.lot_id=l.id
  LEFT JOIN public.commercial_lot_pricing_2028 p ON p.lot_id=l.id
), decisions AS (
  SELECT *,
    CASE WHEN status IN ('AVAILABLE','RESERVED','IN_NEGOTIATION') THEN 'COMMERCIAL_OPEN'
      WHEN commercial_unit='SQUARE_METER' AND status='BLOCKED' AND commercial_entries=0 THEN 'TECHNICAL_BLOCK'
      WHEN status='BLOCKED' THEN 'COMMERCIAL_BLOCK' ELSE 'CLOSED' END status_origin,
    CASE WHEN archived_at IS NOT NULL THEN 'ARQUIVADO'
      WHEN cession_id IS NOT NULL THEN 'ESPACO_CEDIDO'
      WHEN commercial_package_role='COMPONENT' THEN 'INCLUIDO_NO_PACOTE'
      WHEN commercial_package_reconciliation_pending THEN 'CONCILIACAO_PENDENTE'
      WHEN commercial_unit='FOOD_POINT' AND NOT has_valid_anchor THEN 'ESTRUTURA_INVALIDA'
      WHEN commercial_unit='SQUARE_METER' AND coalesce(official_area_sqm,0)<=0 THEN 'SEM_AREA_OFICIAL'
      WHEN resolution_status IS DISTINCT FROM 'OK' THEN 'SEM_PRECO_2028'
      WHEN has_active_sale THEN 'VENDA_ATIVA' WHEN has_active_reservation THEN 'RESERVA_ATIVA'
      WHEN has_active_negotiation THEN 'NEGOCIACAO_ATIVA' WHEN has_active_contract THEN 'CONTRATO_ATIVO'
      WHEN status='AVAILABLE' OR (commercial_unit='SQUARE_METER' AND
        (status IN ('RESERVED','IN_NEGOTIATION') OR (status='BLOCKED' AND commercial_entries=0))) THEN NULL
      WHEN status='BLOCKED' THEN 'BLOQUEIO_COMERCIAL_EXPLICITO' ELSE 'STATUS_NAO_VENDAVEL' END ineligible_reason
  FROM base
)
SELECT lot_id, project_id, public_identifier, block, status, official_area_sqm, resolution_status, is_unpriced_pavilion,
  has_active_sale, has_active_reservation, has_active_negotiation, has_active_contract, status_origin,
  ineligible_reason, ineligible_reason IS NULL AS is_sellable, commercial_unit
FROM decisions;

-- This report is also the source of its exports. Keep historical sales in
-- scoped; only the current commercial inventory loses the assigned spaces.
DO $report$
DECLARE
  previous text := pg_get_functiondef('public.workers_map_commercial_report(uuid,jsonb)'::regprocedure);
  anchor constant text := 'inventory AS MATERIALIZED (SELECT * FROM scoped WHERE archived_at IS NULL AND NOT entity_archived';
  revised text := anchor || ' AND cession_id IS NULL';
BEGIN
  IF strpos(previous,revised)>0 THEN RETURN; END IF;
  IF strpos(previous,anchor)=0 THEN RAISE EXCEPTION 'Commercial inventory report definition changed'; END IF;
  EXECUTE replace(previous,anchor,revised);
END $report$;

NOTIFY pgrst,'reload schema';
COMMIT;
