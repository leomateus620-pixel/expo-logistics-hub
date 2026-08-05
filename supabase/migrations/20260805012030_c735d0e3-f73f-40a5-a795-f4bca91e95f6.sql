CREATE OR REPLACE FUNCTION public.archive_map_geometry_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.geometry IS DISTINCT FROM NEW.geometry
     OR OLD.elevation IS DISTINCT FROM NEW.elevation
     OR OLD.extrusion_height IS DISTINCT FROM NEW.extrusion_height
     OR OLD.rotation IS DISTINCT FROM NEW.rotation THEN
    INSERT INTO public.map_geometry_versions (
      geometry_id, project_id, entity_id, geometry, elevation, extrusion_height, rotation,
      calibration_version, version, change_reason, created_by, created_at
    ) VALUES (
      OLD.id, OLD.project_id, OLD.entity_id, OLD.geometry, OLD.elevation, OLD.extrusion_height, OLD.rotation,
      OLD.calibration_version, OLD.version, OLD.change_reason, OLD.created_by, OLD.created_at
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS map_geometry_archive_before_update ON public.map_entity_geometries;
CREATE TRIGGER map_geometry_archive_before_update
  BEFORE UPDATE ON public.map_entity_geometries
  FOR EACH ROW EXECUTE FUNCTION public.archive_map_geometry_revision();

CREATE OR REPLACE FUNCTION public.enforce_map_layer_geometry_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_org_id uuid; v_locked boolean;
BEGIN
  SELECT p.org_id, l.is_locked INTO v_org_id, v_locked
  FROM public.map_entities e
  JOIN public.map_layers l ON l.id = e.layer_id
  JOIN public.map_projects p ON p.id = e.project_id
  WHERE e.id = NEW.entity_id;
  IF v_locked AND NOT public.map_has_explicit_capability(v_org_id, 'map.admin') THEN RAISE EXCEPTION 'MAP_LAYER_LOCKED'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS map_geometry_layer_lock_before_write ON public.map_entity_geometries;
CREATE TRIGGER map_geometry_layer_lock_before_write
  BEFORE INSERT OR UPDATE ON public.map_entity_geometries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_map_layer_geometry_lock();

CREATE OR REPLACE FUNCTION public.set_map_layer_lock(p_layer_id uuid, p_is_locked boolean, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_layer public.map_layers%ROWTYPE; v_org_id uuid;
BEGIN
  SELECT * INTO v_layer FROM public.map_layers WHERE id = p_layer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MAP_LAYER_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_layer.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_layers') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;
  UPDATE public.map_layers SET is_locked = p_is_locked, updated_at = now() WHERE id = p_layer_id;
  INSERT INTO public.map_activity_logs (org_id, project_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (
    v_org_id, v_layer.project_id, 'LAYER_LOCK_CHANGED',
    jsonb_build_object('layerId', v_layer.id, 'locked', v_layer.is_locked),
    jsonb_build_object('layerId', v_layer.id, 'locked', p_is_locked), p_reason, auth.uid()
  );
  RETURN p_is_locked;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_map_entity_verification(p_entity_id uuid, p_status text, p_reason text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_entity public.map_entities%ROWTYPE; v_org_id uuid; v_area_status text;
BEGIN
  SELECT * INTO v_entity FROM public.map_entities WHERE id = p_entity_id AND is_archived = false FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MAP_ENTITY_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_entity.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.admin') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF p_status NOT IN ('NEEDS_REVIEW', 'VERIFIED') THEN RAISE EXCEPTION 'INVALID_VERIFICATION_STATUS'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;
  IF p_status = 'VERIFIED' THEN
    IF (SELECT status FROM public.map_calibrations WHERE project_id = v_entity.project_id ORDER BY version DESC LIMIT 1) IS DISTINCT FROM 'VALIDATED' THEN
      RAISE EXCEPTION 'VALIDATED_CALIBRATION_REQUIRED';
    END IF;
    IF v_entity.is_sellable THEN
      SELECT area_validation_status INTO v_area_status FROM public.commercial_lots WHERE entity_id = v_entity.id AND archived_at IS NULL;
      IF v_area_status <> 'VALIDATED' THEN RAISE EXCEPTION 'OFFICIAL_AREA_REQUIRED_FOR_VERIFICATION'; END IF;
    END IF;
  END IF;
  UPDATE public.map_entities SET verification_status = p_status, updated_by = auth.uid(), updated_at = now() WHERE id = v_entity.id;
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (
    v_org_id, v_entity.project_id, v_entity.id, 'ENTITY_VERIFICATION_CHANGED',
    jsonb_build_object('status', v_entity.verification_status), jsonb_build_object('status', p_status), p_reason, auth.uid()
  );
  RETURN p_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_commercial_map(p_project_id uuid, p_reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_project public.map_projects%ROWTYPE; v_version integer;
BEGIN
  SELECT * INTO v_project FROM public.map_projects WHERE id = p_project_id AND is_archived = false FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MAP_PROJECT_NOT_FOUND'; END IF;
  IF NOT public.map_has_explicit_capability(v_project.org_id, 'map.admin') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;
  IF (SELECT status FROM public.map_calibrations WHERE project_id = p_project_id ORDER BY version DESC LIMIT 1) IS DISTINCT FROM 'VALIDATED' THEN
    RAISE EXCEPTION 'VALIDATED_CALIBRATION_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.map_entities WHERE project_id = p_project_id AND is_archived = false AND verification_status <> 'VERIFIED') THEN
    RAISE EXCEPTION 'UNVERIFIED_MAP_ENTITIES';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.map_entities WHERE project_id = p_project_id AND is_archived = false) THEN
    RAISE EXCEPTION 'EMPTY_MAP_PROJECT';
  END IF;
  UPDATE public.map_projects
  SET is_published = true, active_version = active_version + 1, updated_by = auth.uid(), updated_at = now()
  WHERE id = p_project_id
  RETURNING active_version INTO v_version;
  INSERT INTO public.map_activity_logs (org_id, project_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (
    v_project.org_id, p_project_id, 'MAP_PUBLISHED',
    jsonb_build_object('published', v_project.is_published, 'version', v_project.active_version),
    jsonb_build_object('published', true, 'version', v_version), p_reason, auth.uid()
  );
  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_commercial_map(
  p_org_id uuid,
  p_project jsonb,
  p_layers jsonb,
  p_entities jsonb,
  p_calibration jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_id uuid;
  v_layer_id uuid;
  v_entity_id uuid;
  v_layer jsonb;
  v_entity jsonb;
  v_geometry jsonb;
BEGIN
  IF NOT public.map_has_explicit_capability(p_org_id, 'map.admin') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF EXISTS (SELECT 1 FROM public.map_projects WHERE org_id = p_org_id AND is_archived = false) THEN
    RAISE EXCEPTION 'MAP_PROJECT_ALREADY_EXISTS';
  END IF;
  IF jsonb_typeof(p_project) <> 'object'
    OR jsonb_typeof(p_layers) <> 'array'
    OR jsonb_array_length(p_layers) = 0
    OR jsonb_array_length(p_layers) > 50
    OR jsonb_typeof(p_entities) <> 'array'
    OR jsonb_array_length(p_entities) > 1000
  THEN
    RAISE EXCEPTION 'INVALID_BOOTSTRAP_PAYLOAD';
  END IF;

  INSERT INTO public.map_projects (
    org_id, name, description, coordinate_system, reference_width, reference_height,
    active_version, is_published, created_by, updated_by
  ) VALUES (
    p_org_id,
    trim(p_project->>'name'),
    p_project->>'description',
    coalesce(p_project->>'coordinateSystem', 'LOCAL_NORMALIZED'),
    coalesce((p_project->>'referenceWidth')::numeric, 120),
    coalesce((p_project->>'referenceHeight')::numeric, 67.5),
    1, false, auth.uid(), auth.uid()
  ) RETURNING id INTO v_project_id;

  FOR v_layer IN SELECT value FROM jsonb_array_elements(p_layers)
  LOOP
    INSERT INTO public.map_layers (
      project_id, layer_key, name, description, color, opacity, is_visible, is_locked, sort_order
    ) VALUES (
      v_project_id,
      trim(v_layer->>'key'),
      trim(v_layer->>'name'),
      v_layer->>'description',
      coalesce(v_layer->>'color', '#64748b'),
      coalesce((v_layer->>'opacity')::numeric, 1),
      coalesce((v_layer->>'isVisible')::boolean, true),
      coalesce((v_layer->>'isLocked')::boolean, false),
      coalesce((v_layer->>'sortOrder')::integer, 0)
    );
  END LOOP;

  FOR v_entity IN SELECT value FROM jsonb_array_elements(p_entities)
  LOOP
    SELECT id INTO v_layer_id
    FROM public.map_layers
    WHERE project_id = v_project_id AND layer_key = v_entity->>'layerKey';
    IF NOT FOUND THEN RAISE EXCEPTION 'BOOTSTRAP_LAYER_NOT_FOUND'; END IF;
    v_geometry := jsonb_build_object('type', 'Polygon', 'coordinates', v_entity#>'{geometry,coordinates}');
    PERFORM public.map_polygon_from_geojson(v_geometry);

    INSERT INTO public.map_entities (
      project_id, layer_id, public_identifier, name, description, classification,
      verification_status, is_sellable, metadata, created_by, updated_by
    ) VALUES (
      v_project_id, v_layer_id, trim(v_entity->>'publicIdentifier'), trim(v_entity->>'name'),
      v_entity->>'description', v_entity->>'classification', 'NEEDS_REVIEW', false,
      coalesce(v_entity->'metadata', '{}'::jsonb), auth.uid(), auth.uid()
    ) RETURNING id INTO v_entity_id;

    INSERT INTO public.map_entity_geometries (
      project_id, entity_id, geometry, elevation, extrusion_height, rotation,
      calibration_version, version, is_current, change_reason, created_by
    ) VALUES (
      v_project_id, v_entity_id, v_geometry,
      coalesce((v_entity#>>'{geometry,elevation}')::numeric, 0),
      coalesce((v_entity#>>'{geometry,extrusionHeight}')::numeric, 0.15),
      coalesce((v_entity#>>'{geometry,rotation}')::numeric, 0),
      NULL, 1, true, 'Importação da referência cartográfica oficial 2024', auth.uid()
    );
  END LOOP;

  INSERT INTO public.map_calibrations (
    project_id, reference_image_path, opacity, is_locked, status, version, created_by
  ) VALUES (
    v_project_id, NULL, coalesce((p_calibration->>'opacity')::numeric, 0.28), true,
    'UNVALIDATED', 1, auth.uid()
  );
  INSERT INTO public.map_activity_logs (org_id, project_id, action, after_state, reason, actor_user_id)
  VALUES (
    p_org_id, v_project_id, 'MAP_BOOTSTRAPPED',
    jsonb_build_object('layers', jsonb_array_length(p_layers), 'entities', jsonb_array_length(p_entities)),
    'Implantação controlada da referência oficial 2024', auth.uid()
  );
  RETURN v_project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_commercial_lot(
  p_project_id uuid,
  p_layer_id uuid,
  p_parent_entity_id uuid,
  p_public_identifier text,
  p_display_name text,
  p_description text,
  p_classification text,
  p_geometry jsonb,
  p_elevation numeric,
  p_extrusion_height numeric,
  p_block text,
  p_lot_number text,
  p_level_label text,
  p_official_area_sqm numeric,
  p_area_validation_status text,
  p_frontage_meters numeric,
  p_depth_meters numeric,
  p_pricing_mode text,
  p_fixed_total numeric,
  p_price_per_sqm numeric,
  p_asking_price numeric,
  p_minimum_price numeric,
  p_calibration_version integer,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_entity_id uuid;
  v_lot_id uuid;
  v_status text;
  v_asking_price numeric;
  v_calculated_area numeric;
BEGIN
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = p_project_id AND is_archived = false FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MAP_PROJECT_NOT_FOUND'; END IF;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_lots') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF p_classification NOT IN ('SELLABLE_LOT', 'INTERNAL_STAND') THEN RAISE EXCEPTION 'INVALID_SELLABLE_CLASSIFICATION'; END IF;
  IF coalesce(trim(p_public_identifier), '') = '' OR coalesce(trim(p_display_name), '') = '' THEN RAISE EXCEPTION 'LOT_IDENTIFICATION_REQUIRED'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'CHANGE_REASON_REQUIRED'; END IF;
  PERFORM public.map_polygon_from_geojson(p_geometry);
  IF public.map_geometry_overlaps_sellable(p_project_id, p_geometry) THEN RAISE EXCEPTION 'MAP_GEOMETRY_OVERLAP'; END IF;
  IF p_elevation < 0 OR p_extrusion_height < 0 THEN RAISE EXCEPTION 'INVALID_GEOMETRY_DIMENSION'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.map_layers WHERE id = p_layer_id AND project_id = p_project_id AND layer_key = 'commercial') THEN
    RAISE EXCEPTION 'INVALID_COMMERCIAL_LAYER';
  END IF;
  IF p_parent_entity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.map_entities WHERE id = p_parent_entity_id AND project_id = p_project_id AND is_archived = false) THEN
    RAISE EXCEPTION 'INVALID_PARENT_ENTITY';
  END IF;
  IF p_area_validation_status NOT IN ('UNVALIDATED', 'VALIDATED') THEN RAISE EXCEPTION 'INVALID_AREA_VALIDATION_STATUS'; END IF;
  IF p_area_validation_status = 'VALIDATED' AND (p_official_area_sqm IS NULL OR p_official_area_sqm <= 0) THEN
    RAISE EXCEPTION 'OFFICIAL_AREA_REQUIRED';
  END IF;
  IF p_pricing_mode NOT IN ('FIXED_TOTAL', 'PRICE_PER_SQUARE_METER', 'NEGOTIABLE', 'NOT_FOR_SALE') THEN RAISE EXCEPTION 'INVALID_PRICING_MODE'; END IF;
  IF p_calibration_version IS NOT NULL THEN
    SELECT extensions.ST_Area(public.map_polygon_from_geojson(p_geometry)) / (map_units_per_meter * map_units_per_meter)
    INTO v_calculated_area
    FROM public.map_calibrations
    WHERE project_id = p_project_id AND version = p_calibration_version AND status = 'VALIDATED';
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_CALIBRATION_VERSION'; END IF;
  END IF;

  v_status := CASE WHEN p_pricing_mode = 'NOT_FOR_SALE' THEN 'UNAVAILABLE' ELSE 'AVAILABLE' END;
  IF p_pricing_mode = 'FIXED_TOTAL' THEN
    IF p_fixed_total IS NULL OR p_fixed_total < 0 THEN RAISE EXCEPTION 'FIXED_TOTAL_REQUIRED'; END IF;
    v_asking_price := p_fixed_total;
  ELSIF p_pricing_mode = 'PRICE_PER_SQUARE_METER' THEN
    IF p_area_validation_status <> 'VALIDATED' OR p_official_area_sqm IS NULL OR p_price_per_sqm IS NULL OR p_price_per_sqm < 0 THEN
      RAISE EXCEPTION 'VALIDATED_AREA_REQUIRED_FOR_SQM_PRICE';
    END IF;
    v_asking_price := p_official_area_sqm * p_price_per_sqm;
  ELSE
    v_asking_price := NULL;
  END IF;
  IF p_asking_price IS NOT NULL AND v_asking_price IS NOT NULL AND abs(p_asking_price - v_asking_price) > 0.01 THEN
    RAISE EXCEPTION 'ASKING_PRICE_MISMATCH';
  END IF;
  IF p_minimum_price IS NOT NULL AND v_asking_price IS NOT NULL AND p_minimum_price > v_asking_price THEN
    RAISE EXCEPTION 'MINIMUM_PRICE_ABOVE_ASKING_PRICE';
  END IF;

  INSERT INTO public.map_entities (
    project_id, layer_id, parent_entity_id, public_identifier, name, description, classification,
    verification_status, is_sellable, metadata, created_by, updated_by
  ) VALUES (
    p_project_id, p_layer_id, p_parent_entity_id, upper(trim(p_public_identifier)), trim(p_display_name), p_description,
    p_classification, 'NEEDS_REVIEW', true,
    jsonb_build_object('officialMeasurements', p_area_validation_status = 'VALIDATED', 'createdFrom', 'COMMERCIAL_TRACING_EDITOR'),
    auth.uid(), auth.uid()
  ) RETURNING id INTO v_entity_id;

  INSERT INTO public.map_entity_geometries (
    project_id, entity_id, geometry, elevation, extrusion_height, rotation, calibration_version,
    version, is_current, change_reason, created_by
  ) VALUES (
    p_project_id, v_entity_id, p_geometry, p_elevation, p_extrusion_height, 0, p_calibration_version,
    1, true, p_reason, auth.uid()
  );

  INSERT INTO public.commercial_lots (
    project_id, entity_id, public_identifier, block, lot_number, level_label, display_name, description, status,
    official_area_sqm, calculated_area_sqm, area_validation_status, frontage_meters, depth_meters, created_by, updated_by
  ) VALUES (
    p_project_id, v_entity_id, upper(trim(p_public_identifier)), nullif(trim(p_block), ''), nullif(trim(p_lot_number), ''), nullif(trim(p_level_label), ''),
    trim(p_display_name), p_description, v_status, p_official_area_sqm, v_calculated_area, p_area_validation_status,
    p_frontage_meters, p_depth_meters, auth.uid(), auth.uid()
  ) RETURNING id INTO v_lot_id;

  INSERT INTO public.lot_prices (
    lot_id, pricing_mode, base_price, price_per_sqm, asking_price, minimum_price, is_active, created_by
  ) VALUES (
    v_lot_id, p_pricing_mode, p_fixed_total, p_price_per_sqm, v_asking_price, p_minimum_price, true, auth.uid()
  );
  INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
  VALUES (v_lot_id, NULL, v_status, p_reason, auth.uid());
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, after_state, reason, actor_user_id)
  VALUES (
    v_org_id, p_project_id, v_entity_id, v_lot_id, 'LOT_CREATED',
    jsonb_build_object('identifier', upper(trim(p_public_identifier)), 'classification', p_classification, 'status', v_status),
    p_reason, auth.uid()
  );
  RETURN v_entity_id;
END;
$$;