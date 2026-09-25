CREATE TABLE public.commercial_lot_price_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.commercial_lots(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('RENOVACAO','SEGUNDA_ETAPA')),
  total numeric(14,2) NOT NULL CHECK (total >= 0 AND total <= 100000000),
  previous_total numeric(14,2),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lot_id, stage)
);
GRANT SELECT ON public.commercial_lot_price_overrides TO authenticated;
GRANT ALL ON public.commercial_lot_price_overrides TO service_role;
ALTER TABLE public.commercial_lot_price_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Map viewers read price overrides" ON public.commercial_lot_price_overrides
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id
  WHERE l.id = lot_id AND public.can_view_commercial_map(p.org_id)));

CREATE OR REPLACE VIEW public.commercial_lot_pricing_2028 AS
WITH lot_base AS (
  SELECT l.id AS lot_id, l.project_id, l.public_identifier,
    CASE WHEN l.block ~ '^P[0-9]+$' THEN NULL::text ELSE l.block END AS block,
    l.status, l.official_area_sqm, l.area_validation_status,
    NULLIF(regexp_replace(COALESCE(l.lot_number,''), '\D','','g'),'')::integer AS lot_num,
    CASE WHEN l.block ~ '^P[0-9]+$' THEN l.block ELSE NULL::text END AS pavilion,
    COALESCE(ca.classification,'NOT_AUDITED') AS corner_status,
    COALESCE(ca.classification,'') = 'CORNER_CONFIRMED' AS corner_confirmed
  FROM commercial_lots l JOIN map_entities e ON e.id = l.entity_id
  LEFT JOIN commercial_lot_corner_audit ca ON ca.lot_id = l.id
  WHERE l.archived_at IS NULL AND e.is_archived = false
), matched AS (
  SELECT b.lot_id, r_1.stage, r_1.id AS rule_id, r_1.label, r_1.price_per_sqm, r_1.priority,
    rank() OVER (PARTITION BY b.lot_id, r_1.stage ORDER BY r_1.priority DESC) AS rnk
  FROM lot_base b JOIN commercial_price_rules r_1 ON r_1.is_active AND r_1.exercise = 2028
    AND r_1.scope_type <> 'EXCLUSION' AND (r_1.project_id IS NULL OR r_1.project_id = b.project_id)
    AND (r_1.pavilion_identifier IS NULL OR r_1.pavilion_identifier = b.pavilion)
    AND (r_1.block IS NULL OR r_1.block = b.block)
    AND (r_1.pavilion_identifier IS NOT NULL OR r_1.block IS NOT NULL)
    AND (r_1.range_start IS NULL OR (b.lot_num IS NOT NULL AND b.lot_num >= r_1.range_start AND b.lot_num <= r_1.range_end))
    AND (r_1.is_corner IS NULL OR r_1.is_corner = b.corner_confirmed)
  WHERE b.pavilion IS DISTINCT FROM 'P7'
), top_matches AS (
  SELECT lot_id, stage, rule_id, label, price_per_sqm, count(*) OVER (PARTITION BY lot_id, stage) AS tie_count
  FROM matched WHERE rnk = 1
), resolved AS (
  SELECT b.*, ren.rule_id AS renovacao_rule_id, ren.label AS renovacao_rule_label,
    ren.price_per_sqm AS rule_ren_ppsqm, ren.tie_count AS ren_tie,
    seg.rule_id AS segunda_rule_id, seg.label AS segunda_rule_label,
    seg.price_per_sqm AS rule_seg_ppsqm, seg.tie_count AS seg_tie,
    ovr.total AS ren_override, ovs.total AS seg_override
  FROM lot_base b
  LEFT JOIN top_matches ren ON ren.lot_id = b.lot_id AND ren.stage = 'RENOVACAO'
  LEFT JOIN top_matches seg ON seg.lot_id = b.lot_id AND seg.stage = 'SEGUNDA_ETAPA'
  LEFT JOIN commercial_lot_price_overrides ovr ON ovr.lot_id = b.lot_id AND ovr.stage = 'RENOVACAO' AND b.pavilion IS DISTINCT FROM 'P7'
  LEFT JOIN commercial_lot_price_overrides ovs ON ovs.lot_id = b.lot_id AND ovs.stage = 'SEGUNDA_ETAPA' AND b.pavilion IS DISTINCT FROM 'P7'
), calc AS (
  SELECT r.*,
    CASE WHEN pavilion = 'P7' OR COALESCE(official_area_sqm,0) <= 0 OR COALESCE(ren_tie,0) <> 1 THEN NULL
      ELSE round(official_area_sqm * rule_ren_ppsqm, 2) END AS ren_default,
    CASE WHEN pavilion = 'P7' OR COALESCE(official_area_sqm,0) <= 0 OR COALESCE(seg_tie,0) <> 1 THEN NULL
      ELSE round(official_area_sqm * rule_seg_ppsqm, 2) END AS seg_default
  FROM resolved r
)
SELECT lot_id, project_id, public_identifier, pavilion, block, lot_num, status, corner_status, corner_confirmed,
  official_area_sqm, area_validation_status,
  renovacao_rule_id,
  CASE WHEN ren_override IS NOT NULL THEN 'Valor manual' ELSE renovacao_rule_label END AS renovacao_rule_label,
  (CASE WHEN ren_override IS NOT NULL THEN
    CASE WHEN COALESCE(official_area_sqm,0) > 0 THEN round(ren_override / official_area_sqm, 2) ELSE NULL END
    ELSE rule_ren_ppsqm END)::numeric(12,2) AS renovacao_price_per_sqm,
  segunda_rule_id,
  CASE WHEN seg_override IS NOT NULL THEN 'Valor manual' ELSE segunda_rule_label END AS segunda_rule_label,
  (CASE WHEN seg_override IS NOT NULL THEN
    CASE WHEN COALESCE(official_area_sqm,0) > 0 THEN round(seg_override / official_area_sqm, 2) ELSE NULL END
    ELSE rule_seg_ppsqm END)::numeric(12,2) AS segunda_price_per_sqm,
  COALESCE(ren_override, ren_default) AS renovacao_total,
  COALESCE(seg_override, seg_default) AS segunda_total,
  CASE
    WHEN pavilion = 'P7' THEN 'EXCLUIDO'
    WHEN ren_override IS NOT NULL AND seg_override IS NOT NULL THEN 'OK'
    WHEN COALESCE(official_area_sqm,0) <= 0 THEN 'SEM_AREA'
    WHEN (ren_override IS NULL AND COALESCE(ren_tie,0) > 1) OR (seg_override IS NULL AND COALESCE(seg_tie,0) > 1) THEN 'REGRA_AMBIGUA'
    WHEN (ren_override IS NULL AND renovacao_rule_id IS NULL) OR (seg_override IS NULL AND segunda_rule_id IS NULL) THEN 'SEM_REGRA'
    ELSE 'OK' END AS resolution_status,
  ren_default AS renovacao_default_total,
  seg_default AS segunda_default_total,
  (ren_override IS NOT NULL) AS renovacao_is_manual,
  (seg_override IS NOT NULL) AS segunda_is_manual
FROM calc;

CREATE OR REPLACE FUNCTION public.set_lot_price_override(p_lot_id uuid, p_stage text, p_total numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid; v_project uuid; v_pav text; v_before numeric; v_uid uuid := auth.uid(); v_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_stage NOT IN ('RENOVACAO','SEGUNDA_ETAPA') THEN RAISE EXCEPTION 'INVALID_STAGE'; END IF;
  IF p_total IS NULL OR p_total < 0 OR p_total > 100000000 OR p_total <> round(p_total,2) THEN RAISE EXCEPTION 'INVALID_VALUE'; END IF;
  SELECT p.org_id, l.project_id, l.block INTO v_org, v_project, v_pav
  FROM commercial_lots l JOIN map_projects p ON p.id = l.project_id WHERE l.id = p_lot_id AND l.archived_at IS NULL;
  IF v_org IS NULL THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  IF v_pav = 'P7' THEN RAISE EXCEPTION 'LOT_EXCLUDED'; END IF;
  v_role := public.get_user_org_role(v_uid, v_org);
  IF NOT (v_role IN ('admin','gestor') OR public.has_role(v_uid,'admin')
    OR public.map_has_explicit_capability(v_org,'map.edit') OR public.map_has_explicit_capability(v_org,'map.manage_lots')
    OR public.map_has_explicit_capability(v_org,'map.admin') OR public.map_has_explicit_capability(v_org,'full_access')) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT CASE WHEN p_stage='RENOVACAO' THEN renovacao_total ELSE segunda_total END INTO v_before
  FROM commercial_lot_pricing_2028 WHERE lot_id = p_lot_id;
  INSERT INTO commercial_lot_price_overrides(lot_id, stage, total, previous_total, updated_by)
  VALUES (p_lot_id, p_stage, round(p_total,2), v_before, v_uid)
  ON CONFLICT (lot_id, stage) DO UPDATE SET total = EXCLUDED.total, previous_total = v_before, updated_by = v_uid, updated_at = now();
  UPDATE commercial_lots SET updated_at = now() WHERE id = p_lot_id;
  INSERT INTO map_activity_logs(org_id, project_id, lot_id, action, before_state, after_state, actor_user_id)
  VALUES (v_org, v_project, p_lot_id, 'price_override_set',
    jsonb_build_object('stage', p_stage, 'total', v_before),
    jsonb_build_object('stage', p_stage, 'total', round(p_total,2)), v_uid);
  RETURN jsonb_build_object('lot_id', p_lot_id, 'stage', p_stage, 'previous_total', v_before, 'total', round(p_total,2));
END $$;

CREATE OR REPLACE FUNCTION public.clear_lot_price_override(p_lot_id uuid, p_stage text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid; v_project uuid; v_before numeric; v_after numeric; v_uid uuid := auth.uid(); v_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_stage NOT IN ('RENOVACAO','SEGUNDA_ETAPA') THEN RAISE EXCEPTION 'INVALID_STAGE'; END IF;
  SELECT p.org_id, l.project_id INTO v_org, v_project
  FROM commercial_lots l JOIN map_projects p ON p.id = l.project_id WHERE l.id = p_lot_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  v_role := public.get_user_org_role(v_uid, v_org);
  IF NOT (v_role IN ('admin','gestor') OR public.has_role(v_uid,'admin')
    OR public.map_has_explicit_capability(v_org,'map.edit') OR public.map_has_explicit_capability(v_org,'map.manage_lots')
    OR public.map_has_explicit_capability(v_org,'map.admin') OR public.map_has_explicit_capability(v_org,'full_access')) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  DELETE FROM commercial_lot_price_overrides WHERE lot_id = p_lot_id AND stage = p_stage RETURNING total INTO v_before;
  IF v_before IS NULL THEN RETURN jsonb_build_object('lot_id', p_lot_id, 'stage', p_stage, 'changed', false); END IF;
  SELECT CASE WHEN p_stage='RENOVACAO' THEN renovacao_total ELSE segunda_total END INTO v_after
  FROM commercial_lot_pricing_2028 WHERE lot_id = p_lot_id;
  UPDATE commercial_lots SET updated_at = now() WHERE id = p_lot_id;
  INSERT INTO map_activity_logs(org_id, project_id, lot_id, action, before_state, after_state, actor_user_id)
  VALUES (v_org, v_project, p_lot_id, 'price_override_cleared',
    jsonb_build_object('stage', p_stage, 'total', v_before),
    jsonb_build_object('stage', p_stage, 'total', v_after), v_uid);
  RETURN jsonb_build_object('lot_id', p_lot_id, 'stage', p_stage, 'changed', true, 'total', v_after);
END $$;

REVOKE ALL ON FUNCTION public.set_lot_price_override(uuid,text,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_lot_price_override(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lot_price_override(uuid,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_lot_price_override(uuid,text) TO authenticated;