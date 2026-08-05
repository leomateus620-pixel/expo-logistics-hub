CREATE OR REPLACE FUNCTION public.save_map_geometry(
  p_geometry_id uuid,
  p_geometry jsonb,
  p_elevation numeric,
  p_extrusion_height numeric,
  p_rotation numeric,
  p_expected_version integer,
  p_change_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current public.map_entity_geometries%ROWTYPE;
  v_org_id uuid;
  v_calculated_area numeric;
BEGIN
  SELECT * INTO v_current
  FROM public.map_entity_geometries
  WHERE id = p_geometry_id AND is_current = true
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GEOMETRY_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_current.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.edit_geometry') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_current.version <> p_expected_version THEN RAISE EXCEPTION 'GEOMETRY_VERSION_CONFLICT'; END IF;
  IF coalesce(trim(p_change_reason), '') = '' THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;
  PERFORM public.map_polygon_from_geojson(p_geometry);
  IF EXISTS (SELECT 1 FROM public.map_entities WHERE id = v_current.entity_id AND is_sellable = true)
    AND public.map_geometry_overlaps_sellable(v_current.project_id, p_geometry, ARRAY[v_current.entity_id])
  THEN
    RAISE EXCEPTION 'MAP_GEOMETRY_OVERLAP';
  END IF;
  IF p_elevation < 0 OR p_extrusion_height < 0 THEN RAISE EXCEPTION 'INVALID_GEOMETRY_DIMENSION'; END IF;

  UPDATE public.map_entity_geometries
  SET geometry = p_geometry,
      elevation = p_elevation,
      extrusion_height = p_extrusion_height,
      rotation = p_rotation,
      version = version + 1,
      change_reason = p_change_reason,
      created_by = auth.uid(),
      updated_at = now()
  WHERE id = p_geometry_id;

  IF v_current.calibration_version IS NOT NULL THEN
    SELECT extensions.ST_Area(public.map_polygon_from_geojson(p_geometry)) / (map_units_per_meter * map_units_per_meter)
    INTO v_calculated_area
    FROM public.map_calibrations
    WHERE project_id = v_current.project_id AND version = v_current.calibration_version AND status = 'VALIDATED';
    UPDATE public.commercial_lots
    SET calculated_area_sqm = v_calculated_area, updated_by = auth.uid(), updated_at = now()
    WHERE entity_id = v_current.entity_id;
  END IF;

  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (
    v_org_id, v_current.project_id, v_current.entity_id, 'GEOMETRY_CHANGED',
    jsonb_build_object('geometry', v_current.geometry, 'version', v_current.version),
    jsonb_build_object('geometry', p_geometry, 'version', v_current.version + 1),
    p_change_reason, auth.uid()
  );
  RETURN v_current.version + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_map_calibration(
  p_project_id uuid,
  p_reference_image_path text,
  p_opacity numeric,
  p_is_locked boolean,
  p_image_offset_x numeric,
  p_image_offset_y numeric,
  p_image_scale_x numeric,
  p_image_scale_y numeric,
  p_image_rotation_degrees numeric,
  p_point_a jsonb,
  p_point_b jsonb,
  p_known_distance_meters numeric,
  p_map_units_per_meter numeric,
  p_status text,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org_id uuid; v_version integer; v_recalculated integer := 0;
BEGIN
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MAP_PROJECT_NOT_FOUND'; END IF;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.edit_geometry') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF p_status NOT IN ('UNVALIDATED', 'VALIDATED', 'INVALIDATED') THEN RAISE EXCEPTION 'INVALID_CALIBRATION_STATUS'; END IF;
  IF p_image_scale_x <= 0 OR p_image_scale_y <= 0 THEN RAISE EXCEPTION 'INVALID_REFERENCE_IMAGE_SCALE'; END IF;
  IF p_status = 'VALIDATED' AND (p_map_units_per_meter IS NULL OR p_map_units_per_meter <= 0 OR p_known_distance_meters IS NULL OR p_known_distance_meters <= 0) THEN
    RAISE EXCEPTION 'INVALID_CALIBRATION_SCALE';
  END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v_version FROM public.map_calibrations WHERE project_id = p_project_id;
  INSERT INTO public.map_calibrations (
    project_id, reference_image_path, opacity, is_locked,
    image_offset_x, image_offset_y, image_scale_x, image_scale_y, image_rotation_degrees,
    point_a, point_b,
    known_distance_meters, map_units_per_meter, status, version, invalidated_reason, created_by
  ) VALUES (
    p_project_id, p_reference_image_path, p_opacity, p_is_locked,
    p_image_offset_x, p_image_offset_y, p_image_scale_x, p_image_scale_y, p_image_rotation_degrees,
    p_point_a, p_point_b,
    p_known_distance_meters, p_map_units_per_meter, p_status, v_version,
    CASE WHEN p_status = 'INVALIDATED' THEN p_reason ELSE NULL END, auth.uid()
  );
  IF p_status = 'VALIDATED' THEN
    UPDATE public.commercial_lots lot
    SET calculated_area_sqm = extensions.ST_Area(geometry.native_geometry) / (p_map_units_per_meter * p_map_units_per_meter),
        updated_by = auth.uid(), updated_at = now()
    FROM public.map_entity_geometries geometry
    WHERE geometry.entity_id = lot.entity_id AND geometry.is_current = true AND lot.project_id = p_project_id AND lot.archived_at IS NULL;
    GET DIAGNOSTICS v_recalculated = ROW_COUNT;
  ELSIF p_status = 'INVALIDATED' THEN
    UPDATE public.commercial_lots SET calculated_area_sqm = NULL, updated_by = auth.uid(), updated_at = now()
    WHERE project_id = p_project_id AND archived_at IS NULL;
    GET DIAGNOSTICS v_recalculated = ROW_COUNT;
  END IF;
  UPDATE public.map_projects SET active_version = active_version + 1, updated_by = auth.uid(), updated_at = now() WHERE id = p_project_id;
  INSERT INTO public.map_activity_logs (org_id, project_id, action, after_state, reason, actor_user_id)
  VALUES (v_org_id, p_project_id, 'CALIBRATION_CHANGED', jsonb_build_object('version', v_version, 'status', p_status, 'map_units_per_meter', p_map_units_per_meter, 'recalculatedLots', v_recalculated), p_reason, auth.uid());
  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_commercial_lot(
  p_lot_id uuid,
  p_expected_updated_at timestamptz,
  p_patch jsonb,
  p_reason text
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lot public.commercial_lots%ROWTYPE;
  v_org_id uuid;
  v_pricing_mode text := p_patch->>'pricingMode';
  v_area_status text := p_patch->>'areaValidationStatus';
  v_official_area numeric := nullif(p_patch->>'officialAreaSqm', '')::numeric;
  v_fixed_total numeric := nullif(p_patch->>'fixedTotal', '')::numeric;
  v_price_per_sqm numeric := nullif(p_patch->>'pricePerSqm', '')::numeric;
  v_minimum_price numeric := nullif(p_patch->>'minimumPrice', '')::numeric;
  v_asking_price numeric;
  v_updated_at timestamptz;
  v_before jsonb;
BEGIN
  SELECT * INTO v_lot FROM public.commercial_lots WHERE id = p_lot_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_lot.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_lots') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_lot.updated_at <> p_expected_updated_at THEN RAISE EXCEPTION 'LOT_VERSION_CONFLICT'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;
  IF coalesce(trim(p_patch->>'publicIdentifier'), '') = '' OR coalesce(trim(p_patch->>'displayName'), '') = '' THEN
    RAISE EXCEPTION 'LOT_IDENTIFICATION_REQUIRED';
  END IF;
  IF v_area_status NOT IN ('UNVALIDATED', 'VALIDATED') THEN RAISE EXCEPTION 'INVALID_AREA_VALIDATION_STATUS'; END IF;
  IF v_area_status = 'VALIDATED' AND (v_official_area IS NULL OR v_official_area <= 0) THEN RAISE EXCEPTION 'OFFICIAL_AREA_REQUIRED'; END IF;
  IF v_pricing_mode NOT IN ('FIXED_TOTAL', 'PRICE_PER_SQUARE_METER', 'NEGOTIABLE', 'NOT_FOR_SALE') THEN RAISE EXCEPTION 'INVALID_PRICING_MODE'; END IF;
  IF jsonb_typeof(coalesce(p_patch->'infrastructure', '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'INVALID_INFRASTRUCTURE'; END IF;

  IF v_pricing_mode = 'FIXED_TOTAL' THEN
    IF v_fixed_total IS NULL OR v_fixed_total < 0 THEN RAISE EXCEPTION 'FIXED_TOTAL_REQUIRED'; END IF;
    v_asking_price := v_fixed_total;
  ELSIF v_pricing_mode = 'PRICE_PER_SQUARE_METER' THEN
    IF v_area_status <> 'VALIDATED' OR v_official_area IS NULL OR v_price_per_sqm IS NULL OR v_price_per_sqm < 0 THEN
      RAISE EXCEPTION 'VALIDATED_AREA_REQUIRED_FOR_SQM_PRICE';
    END IF;
    v_asking_price := v_official_area * v_price_per_sqm;
  ELSE
    v_asking_price := NULL;
  END IF;
  IF v_minimum_price IS NOT NULL AND (v_minimum_price < 0 OR (v_asking_price IS NOT NULL AND v_minimum_price > v_asking_price)) THEN
    RAISE EXCEPTION 'MINIMUM_PRICE_ABOVE_ASKING_PRICE';
  END IF;
  v_before := to_jsonb(v_lot) || jsonb_build_object(
    'price', (SELECT to_jsonb(price) FROM public.lot_prices price WHERE price.lot_id = v_lot.id AND price.is_active = true)
  );

  UPDATE public.map_entities
  SET public_identifier = upper(trim(p_patch->>'publicIdentifier')),
      name = trim(p_patch->>'displayName'),
      description = nullif(trim(p_patch->>'description'), ''),
      updated_by = auth.uid(), updated_at = now()
  WHERE id = v_lot.entity_id;
  UPDATE public.commercial_lots
  SET public_identifier = upper(trim(p_patch->>'publicIdentifier')),
      block = nullif(trim(p_patch->>'block'), ''),
      lot_number = nullif(trim(p_patch->>'lotNumber'), ''),
      level_label = nullif(trim(p_patch->>'levelLabel'), ''),
      display_name = trim(p_patch->>'displayName'),
      description = nullif(trim(p_patch->>'description'), ''),
      official_area_sqm = v_official_area,
      area_validation_status = v_area_status,
      frontage_meters = nullif(p_patch->>'frontageMeters', '')::numeric,
      depth_meters = nullif(p_patch->>'depthMeters', '')::numeric,
      infrastructure = coalesce(p_patch->'infrastructure', '[]'::jsonb),
      has_electricity = coalesce((p_patch->>'hasElectricity')::boolean, false),
      has_water = coalesce((p_patch->>'hasWater')::boolean, false),
      has_internet = coalesce((p_patch->>'hasInternet')::boolean, false),
      is_corner = coalesce((p_patch->>'isCorner')::boolean, false),
      is_covered = coalesce((p_patch->>'isCovered')::boolean, false),
      accessibility_notes = nullif(trim(p_patch->>'accessibilityNotes'), ''),
      commercial_notes = nullif(trim(p_patch->>'commercialNotes'), ''),
      internal_notes = nullif(trim(p_patch->>'internalNotes'), ''),
      updated_by = auth.uid(), updated_at = now()
  WHERE id = v_lot.id
  RETURNING updated_at INTO v_updated_at;

  UPDATE public.lot_prices SET is_active = false, valid_until = now() WHERE lot_id = v_lot.id AND is_active = true;
  INSERT INTO public.lot_prices (
    lot_id, pricing_mode, base_price, price_per_sqm, asking_price, minimum_price, is_active, created_by
  ) VALUES (
    v_lot.id, v_pricing_mode, v_fixed_total, v_price_per_sqm, v_asking_price, v_minimum_price, true, auth.uid()
  );
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (
    v_org_id, v_lot.project_id, v_lot.entity_id, v_lot.id, 'LOT_UPDATED', v_before,
    (SELECT to_jsonb(updated_lot) FROM public.commercial_lots updated_lot WHERE updated_lot.id = v_lot.id)
      || jsonb_build_object('pricingMode', v_pricing_mode, 'askingPrice', v_asking_price),
    p_reason, auth.uid()
  );
  RETURN v_updated_at;
END;
$$;