CREATE OR REPLACE VIEW public.commercial_lot_pricing_2028
WITH (security_invoker = on) AS
WITH lot_base AS (
  SELECT
    l.id AS lot_id,
    l.project_id,
    l.public_identifier,
    CASE WHEN l.block ~ '^P[0-9]+$' THEN NULL ELSE l.block END AS block,
    l.status,
    l.official_area_sqm,
    l.area_validation_status,
    NULLIF(regexp_replace(COALESCE(l.lot_number, ''), '\D', '', 'g'), '')::int AS lot_num,
    CASE WHEN l.block ~ '^P[0-9]+$' THEN l.block ELSE NULL END AS pavilion,
    COALESCE(ca.classification, 'NOT_AUDITED') AS corner_status,
    (COALESCE(ca.classification, '') = 'CORNER_CONFIRMED') AS corner_confirmed
  FROM public.commercial_lots l
  JOIN public.map_entities e ON e.id = l.entity_id
  LEFT JOIN public.commercial_lot_corner_audit ca ON ca.lot_id = l.id
  WHERE l.archived_at IS NULL AND e.is_archived = false
),
matched AS (
  SELECT
    b.lot_id,
    r.stage,
    r.id AS rule_id,
    r.label,
    r.price_per_sqm,
    r.priority,
    RANK() OVER (PARTITION BY b.lot_id, r.stage ORDER BY r.priority DESC) AS rnk
  FROM lot_base b
  JOIN public.commercial_price_rules r
    ON r.is_active
   AND r.exercise = 2028
   AND r.scope_type <> 'EXCLUSION'
   AND (r.project_id IS NULL OR r.project_id = b.project_id)
   AND (r.pavilion_identifier IS NULL OR r.pavilion_identifier = b.pavilion)
   AND (r.block IS NULL OR r.block = b.block)
   AND (r.pavilion_identifier IS NOT NULL OR r.block IS NOT NULL)
   AND (r.range_start IS NULL OR (b.lot_num IS NOT NULL AND b.lot_num BETWEEN r.range_start AND r.range_end))
   AND (r.is_corner IS NULL OR r.is_corner = b.corner_confirmed)
  WHERE b.pavilion IS DISTINCT FROM 'P7'
),
top_matches AS (
  SELECT lot_id, stage, rule_id, label, price_per_sqm, COUNT(*) OVER (PARTITION BY lot_id, stage) AS tie_count
  FROM matched
  WHERE rnk = 1
),
resolved AS (
  SELECT
    b.*,
    ren.rule_id AS renovacao_rule_id, ren.label AS renovacao_rule_label,
    ren.price_per_sqm AS renovacao_price_per_sqm, ren.tie_count AS renovacao_tie_count,
    seg.rule_id AS segunda_rule_id, seg.label AS segunda_rule_label,
    seg.price_per_sqm AS segunda_price_per_sqm, seg.tie_count AS segunda_tie_count
  FROM lot_base b
  LEFT JOIN top_matches ren ON ren.lot_id = b.lot_id AND ren.stage = 'RENOVACAO'
  LEFT JOIN top_matches seg ON seg.lot_id = b.lot_id AND seg.stage = 'SEGUNDA_ETAPA'
)
SELECT
  r.lot_id,
  r.project_id,
  r.public_identifier,
  r.pavilion,
  r.block,
  r.lot_num,
  r.status,
  r.corner_status,
  r.corner_confirmed,
  r.official_area_sqm,
  r.area_validation_status,
  r.renovacao_rule_id,
  r.renovacao_rule_label,
  r.renovacao_price_per_sqm,
  r.segunda_rule_id,
  r.segunda_rule_label,
  r.segunda_price_per_sqm,
  CASE WHEN r.pavilion = 'P7' THEN NULL
       WHEN COALESCE(r.official_area_sqm, 0) <= 0 THEN NULL
       WHEN COALESCE(r.renovacao_tie_count, 0) <> 1 THEN NULL
       ELSE ROUND(r.official_area_sqm * r.renovacao_price_per_sqm, 2) END AS renovacao_total,
  CASE WHEN r.pavilion = 'P7' THEN NULL
       WHEN COALESCE(r.official_area_sqm, 0) <= 0 THEN NULL
       WHEN COALESCE(r.segunda_tie_count, 0) <> 1 THEN NULL
       ELSE ROUND(r.official_area_sqm * r.segunda_price_per_sqm, 2) END AS segunda_total,
  CASE
    WHEN r.pavilion = 'P7' THEN 'EXCLUIDO'
    WHEN COALESCE(r.official_area_sqm, 0) <= 0 THEN 'SEM_AREA'
    WHEN COALESCE(r.renovacao_tie_count, 0) > 1 OR COALESCE(r.segunda_tie_count, 0) > 1 THEN 'REGRA_AMBIGUA'
    WHEN r.renovacao_rule_id IS NULL OR r.segunda_rule_id IS NULL THEN 'SEM_REGRA'
    ELSE 'OK'
  END AS resolution_status
FROM resolved r;

GRANT SELECT ON public.commercial_lot_pricing_2028 TO authenticated;
GRANT SELECT ON public.commercial_lot_pricing_2028 TO service_role;