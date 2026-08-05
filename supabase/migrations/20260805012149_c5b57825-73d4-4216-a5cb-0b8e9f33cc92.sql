CREATE OR REPLACE FUNCTION public.split_commercial_lot(
  p_source_lot_id uuid,
  p_first_identifier text,
  p_first_name text,
  p_first_geometry jsonb,
  p_second_identifier text,
  p_second_name text,
  p_second_geometry jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source public.commercial_lots%ROWTYPE;
  v_source_entity public.map_entities%ROWTYPE;
  v_source_geometry public.map_entity_geometries%ROWTYPE;
  v_org_id uuid;
  v_child jsonb;
  v_entity_id uuid;
  v_lot_id uuid;
  v_entity_ids uuid[] := '{}'::uuid[];
  v_lot_ids uuid[] := '{}'::uuid[];
BEGIN
  SELECT * INTO v_source FROM public.commercial_lots WHERE id = p_source_lot_id FOR UPDATE;
  IF NOT FOUND OR v_source.archived_at IS NOT NULL THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_source.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_lots') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_source.status NOT IN ('AVAILABLE', 'BLOCKED', 'UNAVAILABLE') THEN RAISE EXCEPTION 'LOT_HAS_ACTIVE_COMMERCIAL_FLOW'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;
  IF upper(trim(p_first_identifier)) = upper(trim(p_second_identifier)) THEN RAISE EXCEPTION 'DUPLICATE_CHILD_IDENTIFIER'; END IF;
  IF EXISTS (SELECT 1 FROM public.lot_contracts WHERE lot_id = p_source_lot_id AND is_active = true)
    OR EXISTS (SELECT 1 FROM public.lot_reservations WHERE lot_id = p_source_lot_id AND status = 'ACTIVE')
    OR EXISTS (SELECT 1 FROM public.lot_negotiations WHERE lot_id = p_source_lot_id AND status = 'ACTIVE')
  THEN
    RAISE EXCEPTION 'LOT_HAS_LINKED_RECORDS';
  END IF;
  SELECT * INTO v_source_entity FROM public.map_entities WHERE id = v_source.entity_id;
  SELECT * INTO v_source_geometry FROM public.map_entity_geometries WHERE entity_id = v_source.entity_id AND is_current = true;
  PERFORM public.map_polygon_from_geojson(p_first_geometry);
  PERFORM public.map_polygon_from_geojson(p_second_geometry);
  IF extensions.ST_Area(extensions.ST_Intersection(
      public.map_polygon_from_geojson(p_first_geometry), public.map_polygon_from_geojson(p_second_geometry)
    )) > 0.00000001
    OR NOT extensions.ST_Equals(
      extensions.ST_Union(public.map_polygon_from_geojson(p_first_geometry), public.map_polygon_from_geojson(p_second_geometry)),
      v_source_geometry.native_geometry
    )
  THEN
    RAISE EXCEPTION 'INVALID_SPLIT_TOPOLOGY';
  END IF;
  IF public.map_geometry_overlaps_sellable(v_source.project_id, p_first_geometry, ARRAY[v_source.entity_id])
    OR public.map_geometry_overlaps_sellable(v_source.project_id, p_second_geometry, ARRAY[v_source.entity_id])
  THEN
    RAISE EXCEPTION 'MAP_GEOMETRY_OVERLAP';
  END IF;

  FOR v_child IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('identifier', p_first_identifier, 'name', p_first_name, 'geometry', p_first_geometry),
    jsonb_build_object('identifier', p_second_identifier, 'name', p_second_name, 'geometry', p_second_geometry)
  ))
  LOOP
    IF coalesce(trim(v_child->>'identifier'), '') = '' OR coalesce(trim(v_child->>'name'), '') = '' THEN
      RAISE EXCEPTION 'LOT_IDENTIFICATION_REQUIRED';
    END IF;
    INSERT INTO public.map_entities (
      project_id, layer_id, parent_entity_id, public_identifier, name, description, classification,
      verification_status, is_sellable, metadata, created_by, updated_by
    ) VALUES (
      v_source.project_id, v_source_entity.layer_id, v_source_entity.parent_entity_id,
      upper(trim(v_child->>'identifier')), trim(v_child->>'name'), v_source.description,
      v_source_entity.classification, 'NEEDS_REVIEW', true,
      jsonb_build_object('createdFrom', 'LOT_SPLIT', 'sourceLotId', v_source.id), auth.uid(), auth.uid()
    ) RETURNING id INTO v_entity_id;
    INSERT INTO public.map_entity_geometries (
      project_id, entity_id, geometry, elevation, extrusion_height, rotation, calibration_version,
      version, is_current, change_reason, created_by
    ) VALUES (
      v_source.project_id, v_entity_id, v_child->'geometry', v_source_geometry.elevation,
      v_source_geometry.extrusion_height, v_source_geometry.rotation, v_source_geometry.calibration_version,
      1, true, p_reason, auth.uid()
    );
    INSERT INTO public.commercial_lots (
      project_id, entity_id, public_identifier, block, level_label, display_name, description, status,
      area_validation_status, created_by, updated_by
    ) VALUES (
      v_source.project_id, v_entity_id, upper(trim(v_child->>'identifier')), v_source.block, v_source.level_label,
      trim(v_child->>'name'), v_source.description, 'BLOCKED', 'UNVALIDATED', auth.uid(), auth.uid()
    ) RETURNING id INTO v_lot_id;
    INSERT INTO public.lot_prices (lot_id, pricing_mode, is_active, created_by)
    VALUES (v_lot_id, 'NEGOTIABLE', true, auth.uid());
    INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
    VALUES (v_lot_id, NULL, 'BLOCKED', 'Aguardando validação após divisão: ' || p_reason, auth.uid());
    INSERT INTO public.map_lot_lineage (source_lot_id, target_lot_id, relationship, created_by)
    VALUES (v_source.id, v_lot_id, 'SPLIT_FROM', auth.uid());
    v_entity_ids := array_append(v_entity_ids, v_entity_id);
    v_lot_ids := array_append(v_lot_ids, v_lot_id);
  END LOOP;

  UPDATE public.commercial_lots
  SET status = 'UNAVAILABLE', archived_at = now(), updated_by = auth.uid(), updated_at = now()
  WHERE id = v_source.id;
  UPDATE public.map_entities
  SET is_archived = true, verification_status = 'ARCHIVED', updated_by = auth.uid(), updated_at = now()
  WHERE id = v_source.entity_id;
  INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
  VALUES (v_source.id, v_source.status, 'UNAVAILABLE', p_reason, auth.uid());
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (
    v_org_id, v_source.project_id, v_source.entity_id, v_source.id, 'LOT_SPLIT',
    jsonb_build_object('identifier', v_source.public_identifier, 'status', v_source.status),
    jsonb_build_object('targetLotIds', to_jsonb(v_lot_ids), 'targetEntityIds', to_jsonb(v_entity_ids)),
    p_reason, auth.uid()
  );
  RETURN jsonb_build_object('lotIds', to_jsonb(v_lot_ids), 'entityIds', to_jsonb(v_entity_ids));
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_commercial_lots(
  p_source_lot_ids uuid[],
  p_public_identifier text,
  p_display_name text,
  p_geometry jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_first public.commercial_lots%ROWTYPE;
  v_second public.commercial_lots%ROWTYPE;
  v_first_entity public.map_entities%ROWTYPE;
  v_second_entity public.map_entities%ROWTYPE;
  v_first_geometry public.map_entity_geometries%ROWTYPE;
  v_second_geometry public.map_entity_geometries%ROWTYPE;
  v_org_id uuid;
  v_entity_id uuid;
  v_lot_id uuid;
BEGIN
  IF array_length(p_source_lot_ids, 1) <> 2 OR p_source_lot_ids[1] = p_source_lot_ids[2] THEN RAISE EXCEPTION 'TWO_DISTINCT_LOTS_REQUIRED'; END IF;
  SELECT * INTO v_first FROM public.commercial_lots WHERE id = p_source_lot_ids[1] FOR UPDATE;
  IF NOT FOUND OR v_first.archived_at IS NOT NULL THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT * INTO v_second FROM public.commercial_lots WHERE id = p_source_lot_ids[2] FOR UPDATE;
  IF NOT FOUND OR v_second.archived_at IS NOT NULL THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  IF v_first.project_id <> v_second.project_id THEN RAISE EXCEPTION 'LOTS_FROM_DIFFERENT_PROJECTS'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_first.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_lots') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_first.status NOT IN ('AVAILABLE', 'BLOCKED', 'UNAVAILABLE') OR v_second.status NOT IN ('AVAILABLE', 'BLOCKED', 'UNAVAILABLE') THEN
    RAISE EXCEPTION 'LOT_HAS_ACTIVE_COMMERCIAL_FLOW';
  END IF;
  IF coalesce(trim(p_public_identifier), '') = '' OR coalesce(trim(p_display_name), '') = '' THEN RAISE EXCEPTION 'LOT_IDENTIFICATION_REQUIRED'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;
  IF EXISTS (SELECT 1 FROM public.lot_contracts WHERE lot_id = ANY(p_source_lot_ids) AND is_active = true)
    OR EXISTS (SELECT 1 FROM public.lot_reservations WHERE lot_id = ANY(p_source_lot_ids) AND status = 'ACTIVE')
    OR EXISTS (SELECT 1 FROM public.lot_negotiations WHERE lot_id = ANY(p_source_lot_ids) AND status = 'ACTIVE')
  THEN
    RAISE EXCEPTION 'LOT_HAS_LINKED_RECORDS';
  END IF;
  SELECT * INTO v_first_entity FROM public.map_entities WHERE id = v_first.entity_id;
  SELECT * INTO v_second_entity FROM public.map_entities WHERE id = v_second.entity_id;
  IF v_first_entity.classification <> v_second_entity.classification THEN RAISE EXCEPTION 'INCOMPATIBLE_LOT_CLASSIFICATIONS'; END IF;
  SELECT * INTO v_first_geometry FROM public.map_entity_geometries WHERE entity_id = v_first.entity_id AND is_current = true;
  SELECT * INTO v_second_geometry FROM public.map_entity_geometries WHERE entity_id = v_second.entity_id AND is_current = true;
  PERFORM public.map_polygon_from_geojson(p_geometry);
  IF NOT extensions.ST_Touches(v_first_geometry.native_geometry, v_second_geometry.native_geometry)
    OR NOT extensions.ST_Equals(
      extensions.ST_Union(v_first_geometry.native_geometry, v_second_geometry.native_geometry),
      public.map_polygon_from_geojson(p_geometry)
    )
  THEN
    RAISE EXCEPTION 'LOTS_NOT_ADJACENT_OR_INVALID_MERGE';
  END IF;
  IF public.map_geometry_overlaps_sellable(v_first.project_id, p_geometry, ARRAY[v_first.entity_id, v_second.entity_id]) THEN
    RAISE EXCEPTION 'MAP_GEOMETRY_OVERLAP';
  END IF;

  INSERT INTO public.map_entities (
    project_id, layer_id, parent_entity_id, public_identifier, name, description, classification,
    verification_status, is_sellable, metadata, created_by, updated_by
  ) VALUES (
    v_first.project_id, v_first_entity.layer_id,
    CASE WHEN v_first_entity.parent_entity_id IS NOT DISTINCT FROM v_second_entity.parent_entity_id THEN v_first_entity.parent_entity_id ELSE NULL END,
    upper(trim(p_public_identifier)), trim(p_display_name), coalesce(v_first.description, v_second.description),
    v_first_entity.classification, 'NEEDS_REVIEW', true,
    jsonb_build_object('createdFrom', 'LOT_MERGE', 'sourceLotIds', to_jsonb(p_source_lot_ids)), auth.uid(), auth.uid()
  ) RETURNING id INTO v_entity_id;
  INSERT INTO public.map_entity_geometries (
    project_id, entity_id, geometry, elevation, extrusion_height, rotation, calibration_version,
    version, is_current, change_reason, created_by
  ) VALUES (
    v_first.project_id, v_entity_id, p_geometry,
    LEAST(v_first_geometry.elevation, v_second_geometry.elevation),
    GREATEST(v_first_geometry.extrusion_height, v_second_geometry.extrusion_height), 0,
    CASE WHEN v_first_geometry.calibration_version IS NOT DISTINCT FROM v_second_geometry.calibration_version THEN v_first_geometry.calibration_version ELSE NULL END,
    1, true, p_reason, auth.uid()
  );
  INSERT INTO public.commercial_lots (
    project_id, entity_id, public_identifier, block, level_label, display_name, description, status,
    area_validation_status, created_by, updated_by
  ) VALUES (
    v_first.project_id, v_entity_id, upper(trim(p_public_identifier)),
    CASE WHEN v_first.block IS NOT DISTINCT FROM v_second.block THEN v_first.block ELSE NULL END,
    CASE WHEN v_first.level_label IS NOT DISTINCT FROM v_second.level_label THEN v_first.level_label ELSE NULL END,
    trim(p_display_name), coalesce(v_first.description, v_second.description), 'BLOCKED',
    'UNVALIDATED', auth.uid(), auth.uid()
  ) RETURNING id INTO v_lot_id;
  INSERT INTO public.lot_prices (lot_id, pricing_mode, is_active, created_by)
  VALUES (v_lot_id, 'NEGOTIABLE', true, auth.uid());
  INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
  VALUES (v_lot_id, NULL, 'BLOCKED', 'Aguardando validação após mesclagem: ' || p_reason, auth.uid());
  INSERT INTO public.map_lot_lineage (source_lot_id, target_lot_id, relationship, created_by)
  VALUES (v_first.id, v_lot_id, 'MERGED_FROM', auth.uid()), (v_second.id, v_lot_id, 'MERGED_FROM', auth.uid());

  UPDATE public.commercial_lots
  SET status = 'UNAVAILABLE', archived_at = now(), superseded_by_lot_id = v_lot_id,
      updated_by = auth.uid(), updated_at = now()
  WHERE id = ANY(p_source_lot_ids);
  UPDATE public.map_entities
  SET is_archived = true, verification_status = 'ARCHIVED', updated_by = auth.uid(), updated_at = now()
  WHERE id IN (v_first.entity_id, v_second.entity_id);
  INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
  VALUES
    (v_first.id, v_first.status, 'UNAVAILABLE', p_reason, auth.uid()),
    (v_second.id, v_second.status, 'UNAVAILABLE', p_reason, auth.uid());
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (
    v_org_id, v_first.project_id, v_entity_id, v_lot_id, 'LOTS_MERGED',
    jsonb_build_object('sourceLotIds', to_jsonb(p_source_lot_ids)),
    jsonb_build_object('targetLotId', v_lot_id, 'targetEntityId', v_entity_id), p_reason, auth.uid()
  );
  RETURN jsonb_build_object('lotId', v_lot_id, 'entityId', v_entity_id);
END;
$$;