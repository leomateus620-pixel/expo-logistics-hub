CREATE OR REPLACE FUNCTION public.set_lot_price_override(p_lot_id uuid, p_stage text, p_total numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid; v_project uuid; v_pav text; v_before numeric; v_uid uuid := auth.uid(); v_role text; v_name text;
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
  SELECT full_name INTO v_name FROM profiles WHERE user_id = v_uid LIMIT 1;
  SELECT CASE WHEN p_stage='RENOVACAO' THEN renovacao_total ELSE segunda_total END INTO v_before
  FROM commercial_lot_pricing_2028 WHERE lot_id = p_lot_id;
  INSERT INTO commercial_lot_price_overrides(lot_id, stage, total, previous_total, updated_by)
  VALUES (p_lot_id, p_stage, round(p_total,2), v_before, v_uid)
  ON CONFLICT (lot_id, stage) DO UPDATE SET total = EXCLUDED.total, previous_total = v_before, updated_by = v_uid, updated_at = now();
  UPDATE commercial_lots SET updated_at = now() WHERE id = p_lot_id;
  INSERT INTO map_activity_logs(org_id, project_id, lot_id, action, before_state, after_state, actor_user_id)
  VALUES (v_org, v_project, p_lot_id, 'price_override_set',
    jsonb_build_object('stage', p_stage, 'total', v_before),
    jsonb_build_object('stage', p_stage, 'total', round(p_total,2), 'actor_name', v_name), v_uid);
  RETURN jsonb_build_object('lot_id', p_lot_id, 'stage', p_stage, 'previous_total', v_before, 'total', round(p_total,2));
END $$;

CREATE OR REPLACE FUNCTION public.clear_lot_price_override(p_lot_id uuid, p_stage text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid; v_project uuid; v_before numeric; v_after numeric; v_uid uuid := auth.uid(); v_role text; v_name text;
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
  SELECT full_name INTO v_name FROM profiles WHERE user_id = v_uid LIMIT 1;
  DELETE FROM commercial_lot_price_overrides WHERE lot_id = p_lot_id AND stage = p_stage RETURNING total INTO v_before;
  IF v_before IS NULL THEN RETURN jsonb_build_object('lot_id', p_lot_id, 'stage', p_stage, 'changed', false); END IF;
  SELECT CASE WHEN p_stage='RENOVACAO' THEN renovacao_total ELSE segunda_total END INTO v_after
  FROM commercial_lot_pricing_2028 WHERE lot_id = p_lot_id;
  UPDATE commercial_lots SET updated_at = now() WHERE id = p_lot_id;
  INSERT INTO map_activity_logs(org_id, project_id, lot_id, action, before_state, after_state, actor_user_id)
  VALUES (v_org, v_project, p_lot_id, 'price_override_cleared',
    jsonb_build_object('stage', p_stage, 'total', v_before),
    jsonb_build_object('stage', p_stage, 'total', v_after, 'actor_name', v_name), v_uid);
  RETURN jsonb_build_object('lot_id', p_lot_id, 'stage', p_stage, 'changed', true, 'total', v_after);
END $$;