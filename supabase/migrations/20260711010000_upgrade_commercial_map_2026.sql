-- Fenasoja Commercial Map 2026
-- Additive, explicit reference synchronization. Commercial history is never
-- inferred from the official artwork and is never replaced by this migration.

ALTER TABLE public.map_projects
  ADD COLUMN IF NOT EXISTS reference_revision text;

COMMENT ON COLUMN public.map_projects.reference_revision IS
  'Version of the official cartographic reference last explicitly synchronized into this project.';

ALTER TABLE public.map_entities
  DROP CONSTRAINT IF EXISTS map_entities_classification_check;

ALTER TABLE public.map_entities
  ADD CONSTRAINT map_entities_classification_check CHECK (classification IN (
    'SELLABLE_LOT', 'INTERNAL_STAND', 'QUADRA', 'PAVILION', 'BUILDING', 'RESTAURANT',
    'FOOD_AREA', 'EVENT_VENUE', 'RESTROOM', 'CHEMICAL_RESTROOM', 'GATE', 'PARKING',
    'ROAD', 'PEDESTRIAN_PATH', 'GREEN_AREA', 'TREE', 'WATER', 'ADMINISTRATION',
    'SECURITY', 'EMERGENCY', 'SERVICE', 'ATTRACTION', 'LIVESTOCK_AREA',
    'RURAL_EXHIBITION', 'RESTRICTED_AREA', 'LANDMARK', 'OTHER'
  ));

COMMENT ON CONSTRAINT map_entities_classification_check ON public.map_entities IS
  'Supported commercial-map entity classes, including 2026 quadras and event venues.';

CREATE OR REPLACE FUNCTION public.sync_commercial_map_reference_2026(
  p_org_id uuid,
  p_project jsonb,
  p_layers jsonb,
  p_entities jsonb,
  p_lots jsonb,
  p_calibration jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.map_projects%ROWTYPE;
  v_existing_entity public.map_entities%ROWTYPE;
  v_current_geometry public.map_entity_geometries%ROWTYPE;
  v_current_calibration public.map_calibrations%ROWTYPE;
  v_layer jsonb;
  v_entity jsonb;
  v_lot jsonb;
  v_geometry jsonb;
  v_metadata jsonb;
  v_infrastructure jsonb;
  v_revision text;
  v_previous_revision text;
  v_identifier text;
  v_entity_identifier text;
  v_parent_identifier text;
  v_layer_key text;
  v_classification text;
  v_coordinate_system text;
  v_project_id uuid;
  v_layer_id uuid;
  v_entity_id uuid;
  v_parent_id uuid;
  v_existing_lot_id uuid;
  v_geometry_id uuid;
  v_reference_width numeric(14,6);
  v_reference_height numeric(14,6);
  v_elevation numeric(14,6);
  v_extrusion_height numeric(14,6);
  v_rotation numeric(14,6);
  v_calibration_opacity numeric(4,3);
  v_calibration_offset_x numeric(14,6);
  v_calibration_offset_y numeric(14,6);
  v_calibration_scale_x numeric(12,6);
  v_calibration_scale_y numeric(12,6);
  v_calibration_rotation numeric(12,6);
  v_known_distance numeric(14,6);
  v_map_units_per_meter numeric(18,9);
  v_calibration_path text;
  v_point_a jsonb;
  v_point_b jsonb;
  v_calibration_version integer;
  v_geometry_version integer;
  v_affected integer;
  v_change_count integer := 0;
  v_inserted_entities integer := 0;
  v_updated_entities integer := 0;
  v_updated_geometries integer := 0;
  v_created_lots integer := 0;
  v_archived_seed_entities integer := 0;
  v_preserved_commercial_entities integer := 0;
  v_preserved_manual_entities integer := 0;
  v_created_project boolean := false;
  v_replace_project_identity boolean := false;
  v_is_sellable boolean;
  v_is_managed boolean;
  v_has_commercial_lot boolean;
  v_safe_seed_lot boolean;
  v_preserve_commercial_entity boolean;
  v_preserve_manual_entity boolean;
  v_geometry_changed boolean;
  v_reference_changed boolean;
  v_insert_calibration boolean := false;
  v_protected_entity_ids uuid[] := '{}'::uuid[];
BEGIN
  IF p_org_id IS NULL OR NOT public.map_has_explicit_capability(p_org_id, 'map.admin') THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;

  IF jsonb_typeof(p_project) <> 'object'
    OR jsonb_typeof(p_layers) <> 'array'
    OR jsonb_array_length(p_layers) = 0
    OR jsonb_array_length(p_layers) > 50
    OR jsonb_typeof(p_entities) <> 'array'
    OR jsonb_array_length(p_entities) = 0
    OR jsonb_array_length(p_entities) > 5000
    OR jsonb_typeof(p_lots) <> 'array'
    OR jsonb_array_length(p_lots) > 5000
    OR jsonb_typeof(p_calibration) <> 'object'
  THEN
    RAISE EXCEPTION 'INVALID_REFERENCE_2026_PAYLOAD';
  END IF;

  v_revision := trim(coalesce(p_project->>'referenceRevision', ''));
  IF v_revision !~ '^2026([.]|$)' THEN
    RAISE EXCEPTION 'INVALID_REFERENCE_2026_REVISION';
  END IF;
  IF coalesce(trim(p_project->>'name'), '') = '' THEN
    RAISE EXCEPTION 'INVALID_REFERENCE_2026_PROJECT';
  END IF;

  v_reference_width := coalesce((nullif(p_project->>'referenceWidth', ''))::numeric, 120);
  v_reference_height := coalesce((nullif(p_project->>'referenceHeight', ''))::numeric, 67.5);
  v_coordinate_system := coalesce(nullif(p_project->>'coordinateSystem', ''), 'LOCAL_NORMALIZED');
  IF v_reference_width <= 0 OR v_reference_height <= 0
    OR v_coordinate_system NOT IN ('LOCAL_NORMALIZED', 'GEOREFERENCED')
  THEN
    RAISE EXCEPTION 'INVALID_REFERENCE_2026_DIMENSIONS';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT lower(trim(item->>'key')) AS identifier, count(*) AS total
      FROM jsonb_array_elements(p_layers) AS item
      GROUP BY lower(trim(item->>'key'))
    ) AS candidate
    WHERE coalesce(candidate.identifier, '') = '' OR candidate.total > 1
  ) THEN
    RAISE EXCEPTION 'INVALID_OR_DUPLICATE_REFERENCE_2026_LAYER';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT upper(trim(item->>'publicIdentifier')) AS identifier, count(*) AS total
      FROM jsonb_array_elements(p_entities) AS item
      GROUP BY upper(trim(item->>'publicIdentifier'))
    ) AS candidate
    WHERE coalesce(candidate.identifier, '') = '' OR candidate.total > 1
  ) THEN
    RAISE EXCEPTION 'INVALID_OR_DUPLICATE_REFERENCE_2026_ENTITY';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_entities) AS item
    WHERE jsonb_typeof(item->'metadata') IS DISTINCT FROM 'object'
      OR lower(coalesce(item#>>'{metadata,seedManaged}', 'false')) <> 'true'
      OR coalesce(item#>>'{metadata,sourceRevision}', '') <> v_revision
      OR jsonb_typeof(item->'geometry') IS DISTINCT FROM 'object'
  ) THEN
    RAISE EXCEPTION 'UNMANAGED_REFERENCE_2026_ENTITY';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT upper(trim(item->>'publicIdentifier')) AS identifier, count(*) AS total
      FROM jsonb_array_elements(p_lots) AS item
      GROUP BY upper(trim(item->>'publicIdentifier'))
    ) AS candidate
    WHERE coalesce(candidate.identifier, '') = '' OR candidate.total > 1
  ) THEN
    RAISE EXCEPTION 'INVALID_OR_DUPLICATE_REFERENCE_2026_LOT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_lots) AS item
    WHERE coalesce(trim(item->>'entityPublicIdentifier'), '') = ''
      OR item ?| ARRAY[
        'currentBuyer', 'buyerName', 'companyName', 'documentNumber', 'contactName',
        'responsibleName', 'salespersonName', 'contractNumber', 'reservationExpiresAt', 'saleDate'
      ]
  ) THEN
    RAISE EXCEPTION 'REFERENCE_2026_LOT_CONTAINS_COMMERCIAL_DATA';
  END IF;

  -- Serializes creation/synchronization for one organization, including the
  -- no-project-yet case that cannot be protected by a row lock.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':commercial-map-reference-2026', 0));

  SELECT *
  INTO v_project
  FROM public.map_projects
  WHERE org_id = p_org_id AND is_archived = false
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.map_projects (
      org_id, name, description, coordinate_system, reference_width, reference_height,
      reference_revision, active_version, is_published, created_by, updated_by
    ) VALUES (
      p_org_id,
      trim(p_project->>'name'),
      p_project->>'description',
      v_coordinate_system,
      v_reference_width,
      v_reference_height,
      v_revision,
      1,
      false,
      auth.uid(),
      auth.uid()
    )
    RETURNING * INTO v_project;
    v_created_project := true;
    v_change_count := v_change_count + 1;
  ELSE
    v_previous_revision := v_project.reference_revision;
    v_replace_project_identity := coalesce(v_project.reference_revision, '') LIKE '2024%'
      OR (
        v_project.reference_revision IS NULL
        AND lower(v_project.name || ' ' || coalesce(v_project.description, '')) LIKE '%fenasoja%'
        AND lower(v_project.name || ' ' || coalesce(v_project.description, '')) LIKE '%refer%'
        AND (v_project.name || ' ' || coalesce(v_project.description, '')) LIKE '%2024%'
      );

    IF (
      v_project.coordinate_system IS DISTINCT FROM v_coordinate_system
      OR v_project.reference_width IS DISTINCT FROM v_reference_width
      OR v_project.reference_height IS DISTINCT FROM v_reference_height
    ) AND (
      EXISTS (SELECT 1 FROM public.commercial_lots l WHERE l.project_id = v_project.id)
      OR EXISTS (
        SELECT 1
        FROM public.map_entities e
        WHERE e.project_id = v_project.id
          AND e.is_archived = false
          AND lower(coalesce(e.metadata->>'seedManaged', 'false')) <> 'true'
          AND coalesce(e.metadata->>'sourceRevision', '') NOT LIKE '2024%'
          AND NOT (
            lower(coalesce(e.metadata->>'source', '')) LIKE '%fenasoja%'
            AND coalesce(e.metadata->>'source', '') LIKE '%2024%'
          )
      )
    ) THEN
      RAISE EXCEPTION 'MAP_REFERENCE_DIMENSIONS_CONFLICT';
    END IF;

    UPDATE public.map_projects
    SET name = CASE WHEN v_replace_project_identity THEN trim(p_project->>'name') ELSE name END,
        description = CASE WHEN v_replace_project_identity THEN p_project->>'description' ELSE description END,
        coordinate_system = v_coordinate_system,
        reference_width = v_reference_width,
        reference_height = v_reference_height,
        reference_revision = v_revision,
        updated_by = auth.uid(),
        updated_at = now()
    WHERE id = v_project.id
      AND (
        (v_replace_project_identity AND name IS DISTINCT FROM trim(p_project->>'name'))
        OR (v_replace_project_identity AND description IS DISTINCT FROM p_project->>'description')
        OR coordinate_system IS DISTINCT FROM v_coordinate_system
        OR reference_width IS DISTINCT FROM v_reference_width
        OR reference_height IS DISTINCT FROM v_reference_height
        OR reference_revision IS DISTINCT FROM v_revision
      );
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    v_change_count := v_change_count + v_affected;

    SELECT * INTO v_project FROM public.map_projects WHERE id = v_project.id;
  END IF;

  v_project_id := v_project.id;

  -- A new calibration row is a new reference revision. Existing calibration
  -- rows remain immutable historical evidence rather than being overwritten.
  v_calibration_path := nullif(p_calibration->>'referenceImagePath', '');
  v_calibration_opacity := coalesce((nullif(p_calibration->>'opacity', ''))::numeric, 0.28);
  v_calibration_offset_x := coalesce((nullif(p_calibration->>'imageOffsetX', ''))::numeric, 0);
  v_calibration_offset_y := coalesce((nullif(p_calibration->>'imageOffsetY', ''))::numeric, 0);
  v_calibration_scale_x := coalesce((nullif(p_calibration->>'imageScaleX', ''))::numeric, 1);
  v_calibration_scale_y := coalesce((nullif(p_calibration->>'imageScaleY', ''))::numeric, 1);
  v_calibration_rotation := coalesce((nullif(p_calibration->>'imageRotationDegrees', ''))::numeric, 0);
  v_known_distance := (nullif(p_calibration->>'knownDistanceMeters', ''))::numeric;
  v_map_units_per_meter := (nullif(p_calibration->>'mapUnitsPerMeter', ''))::numeric;
  v_point_a := nullif(p_calibration->'pointA', 'null'::jsonb);
  v_point_b := nullif(p_calibration->'pointB', 'null'::jsonb);

  IF v_calibration_opacity < 0 OR v_calibration_opacity > 1
    OR v_calibration_scale_x <= 0 OR v_calibration_scale_y <= 0
    OR (v_known_distance IS NOT NULL AND v_known_distance <= 0)
    OR (v_map_units_per_meter IS NOT NULL AND v_map_units_per_meter <= 0)
  THEN
    RAISE EXCEPTION 'INVALID_REFERENCE_2026_CALIBRATION';
  END IF;

  SELECT *
  INTO v_current_calibration
  FROM public.map_calibrations
  WHERE project_id = v_project_id
  ORDER BY version DESC
  LIMIT 1;

  v_insert_calibration := NOT FOUND
    OR v_created_project
    OR v_previous_revision IS DISTINCT FROM v_revision;

  IF v_insert_calibration THEN
    SELECT coalesce(max(version), 0) + 1
    INTO v_calibration_version
    FROM public.map_calibrations
    WHERE project_id = v_project_id;

    INSERT INTO public.map_calibrations (
      project_id, reference_image_path, opacity, is_locked,
      image_offset_x, image_offset_y, image_scale_x, image_scale_y, image_rotation_degrees,
      point_a, point_b, known_distance_meters, map_units_per_meter,
      status, version, invalidated_reason, created_by
    ) VALUES (
      v_project_id,
      v_calibration_path,
      v_calibration_opacity,
      coalesce((nullif(p_calibration->>'isLocked', ''))::boolean, true),
      v_calibration_offset_x,
      v_calibration_offset_y,
      v_calibration_scale_x,
      v_calibration_scale_y,
      v_calibration_rotation,
      v_point_a,
      v_point_b,
      v_known_distance,
      v_map_units_per_meter,
      'UNVALIDATED',
      v_calibration_version,
      'Referência oficial ' || v_revision || ' importada; requer validação cartográfica antes da publicação.',
      auth.uid()
    );
    v_change_count := v_change_count + 1;
  ELSE
    v_calibration_version := v_current_calibration.version;
  END IF;

  FOR v_layer IN SELECT value FROM jsonb_array_elements(p_layers)
  LOOP
    v_layer_key := lower(trim(v_layer->>'key'));
    INSERT INTO public.map_layers (
      project_id, layer_key, name, description, color, opacity, is_visible, is_locked, sort_order
    ) VALUES (
      v_project_id,
      v_layer_key,
      trim(v_layer->>'name'),
      v_layer->>'description',
      coalesce(nullif(v_layer->>'color', ''), '#64748b'),
      coalesce((nullif(v_layer->>'opacity', ''))::numeric, 1),
      coalesce((nullif(v_layer->>'isVisible', ''))::boolean, true),
      coalesce((nullif(v_layer->>'isLocked', ''))::boolean, false),
      coalesce((nullif(v_layer->>'sortOrder', ''))::integer, 0)
    )
    ON CONFLICT (project_id, layer_key) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        color = EXCLUDED.color,
        opacity = EXCLUDED.opacity,
        is_visible = EXCLUDED.is_visible,
        is_locked = EXCLUDED.is_locked,
        sort_order = EXCLUDED.sort_order,
        updated_at = now()
    WHERE v_replace_project_identity
      AND (public.map_layers.name, public.map_layers.description, public.map_layers.color,
           public.map_layers.opacity, public.map_layers.is_visible, public.map_layers.is_locked,
           public.map_layers.sort_order)
        IS DISTINCT FROM
            (EXCLUDED.name, EXCLUDED.description, EXCLUDED.color, EXCLUDED.opacity,
             EXCLUDED.is_visible, EXCLUDED.is_locked, EXCLUDED.sort_order);
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    v_change_count := v_change_count + v_affected;
  END LOOP;

  -- First pass: upsert every managed entity and its geometry. Parent links are
  -- resolved only after all identifiers exist.
  FOR v_entity IN SELECT value FROM jsonb_array_elements(p_entities)
  LOOP
    v_identifier := upper(trim(v_entity->>'publicIdentifier'));
    v_layer_key := lower(trim(v_entity->>'layerKey'));
    v_classification := trim(v_entity->>'classification');
    v_metadata := coalesce(v_entity->'metadata', '{}'::jsonb)
      || jsonb_build_object('seedManaged', true, 'sourceRevision', v_revision);
    v_is_sellable := CASE
      WHEN v_entity ? 'isSellable' THEN coalesce((v_entity->>'isSellable')::boolean, false)
      ELSE v_classification IN ('SELLABLE_LOT', 'INTERNAL_STAND')
    END;

    IF coalesce(trim(v_entity->>'name'), '') = '' OR coalesce(v_classification, '') = '' THEN
      RAISE EXCEPTION 'INVALID_REFERENCE_2026_ENTITY:%', v_identifier;
    END IF;
    IF v_is_sellable AND v_classification NOT IN ('SELLABLE_LOT', 'INTERNAL_STAND') THEN
      RAISE EXCEPTION 'INVALID_REFERENCE_2026_SELLABLE_ENTITY:%', v_identifier;
    END IF;

    SELECT id INTO v_layer_id
    FROM public.map_layers
    WHERE project_id = v_project_id AND layer_key = v_layer_key;
    IF v_layer_id IS NULL THEN
      RAISE EXCEPTION 'REFERENCE_2026_LAYER_NOT_FOUND:%', v_layer_key;
    END IF;

    v_geometry := jsonb_build_object('type', 'Polygon', 'coordinates', v_entity#>'{geometry,coordinates}');
    PERFORM public.map_polygon_from_geojson(v_geometry);
    v_elevation := coalesce((nullif(v_entity#>>'{geometry,elevation}', ''))::numeric, 0);
    v_extrusion_height := coalesce((nullif(v_entity#>>'{geometry,extrusionHeight}', ''))::numeric, 0.15);
    v_rotation := coalesce((nullif(v_entity#>>'{geometry,rotation}', ''))::numeric, 0);
    IF v_elevation < 0 OR v_extrusion_height < 0 THEN
      RAISE EXCEPTION 'INVALID_REFERENCE_2026_GEOMETRY:%', v_identifier;
    END IF;

    IF (SELECT count(*) FROM public.map_entities e
        WHERE e.project_id = v_project_id AND upper(e.public_identifier) = v_identifier) > 1 THEN
      RAISE EXCEPTION 'AMBIGUOUS_MAP_IDENTIFIER_CONFLICT:%', v_identifier;
    END IF;

    v_entity_id := NULL;
    SELECT e.id
    INTO v_entity_id
    FROM public.map_entities e
    WHERE e.project_id = v_project_id AND upper(e.public_identifier) = v_identifier
    LIMIT 1
    FOR UPDATE;

    IF v_entity_id IS NULL THEN
      IF v_is_sellable AND public.map_geometry_overlaps_sellable(v_project_id, v_geometry, '{}'::uuid[]) THEN
        RAISE EXCEPTION 'MAP_GEOMETRY_OVERLAP:%', v_identifier;
      END IF;

      INSERT INTO public.map_entities (
        project_id, layer_id, parent_entity_id, public_identifier, name, description,
        classification, verification_status, is_sellable, is_archived, metadata,
        created_by, updated_by
      ) VALUES (
        v_project_id,
        v_layer_id,
        NULL,
        v_identifier,
        trim(v_entity->>'name'),
        v_entity->>'description',
        v_classification,
        'NEEDS_REVIEW',
        v_is_sellable,
        false,
        v_metadata,
        auth.uid(),
        auth.uid()
      ) RETURNING id INTO v_entity_id;

      INSERT INTO public.map_entity_geometries (
        project_id, entity_id, geometry, elevation, extrusion_height, rotation,
        calibration_version, version, is_current, change_reason, created_by
      ) VALUES (
        v_project_id,
        v_entity_id,
        v_geometry,
        v_elevation,
        v_extrusion_height,
        v_rotation,
        v_calibration_version,
        1,
        true,
        'Importação controlada da referência cartográfica oficial ' || v_revision,
        auth.uid()
      );
      v_inserted_entities := v_inserted_entities + 1;
      v_change_count := v_change_count + 1;
    ELSE
      SELECT * INTO v_existing_entity
      FROM public.map_entities
      WHERE id = v_entity_id;

      v_is_managed := lower(coalesce(v_existing_entity.metadata->>'seedManaged', 'false')) = 'true'
        OR (
          v_existing_entity.is_sellable = false
          AND NOT EXISTS (SELECT 1 FROM public.commercial_lots l WHERE l.entity_id = v_existing_entity.id)
          AND (
            coalesce(v_existing_entity.metadata->>'sourceRevision', '') LIKE '2024%'
            OR (
              lower(coalesce(v_existing_entity.metadata->>'source', '')) LIKE '%fenasoja%'
              AND coalesce(v_existing_entity.metadata->>'source', '') LIKE '%2024%'
            )
          )
        );
      IF NOT v_is_managed THEN
        RAISE EXCEPTION 'MAP_REFERENCE_IDENTIFIER_CONFLICT:%', v_identifier;
      END IF;
      IF EXISTS (SELECT 1 FROM public.commercial_lots l WHERE l.entity_id = v_existing_entity.id)
        AND v_classification NOT IN ('SELLABLE_LOT', 'INTERNAL_STAND')
      THEN
        RAISE EXCEPTION 'MAP_REFERENCE_COMMERCIAL_ENTITY_CONFLICT:%', v_identifier;
      END IF;

      v_geometry_id := NULL;
      SELECT g.id
      INTO v_geometry_id
      FROM public.map_entity_geometries g
      WHERE g.entity_id = v_entity_id AND g.is_current = true
      FOR UPDATE;
      IF v_geometry_id IS NOT NULL THEN
        SELECT * INTO v_current_geometry FROM public.map_entity_geometries WHERE id = v_geometry_id;
        v_geometry_changed := v_current_geometry.geometry IS DISTINCT FROM v_geometry
          OR v_current_geometry.elevation IS DISTINCT FROM v_elevation
          OR v_current_geometry.extrusion_height IS DISTINCT FROM v_extrusion_height
          OR v_current_geometry.rotation IS DISTINCT FROM v_rotation;
      ELSE
        v_geometry_changed := true;
      END IF;
      v_preserve_manual_entity := v_existing_entity.verification_status = 'VERIFIED'
        OR (
          v_geometry_id IS NOT NULL
          AND lower(coalesce(v_current_geometry.change_reason, '')) NOT LIKE '%refer%oficial%'
        );
      v_reference_changed := coalesce(v_existing_entity.metadata->>'sourceRevision', '') IS DISTINCT FROM v_revision
        OR v_geometry_changed;

      SELECT EXISTS (
        SELECT 1 FROM public.commercial_lots l WHERE l.entity_id = v_entity_id
      ) INTO v_has_commercial_lot;
      v_safe_seed_lot := false;
      IF v_has_commercial_lot THEN
        SELECT EXISTS (
          SELECT 1
          FROM public.commercial_lots l
          WHERE l.entity_id = v_entity_id
            AND l.archived_at IS NULL
            AND l.status = 'BLOCKED'
            AND l.area_validation_status = 'UNVALIDATED'
            AND l.official_area_sqm IS NULL
            AND l.calculated_area_sqm IS NULL
            AND l.frontage_meters IS NULL
            AND l.depth_meters IS NULL
            AND l.commercial_notes IS NULL
            AND l.internal_notes IS NULL
            AND EXISTS (
              SELECT 1 FROM public.lot_prices price
              WHERE price.lot_id = l.id
                AND price.is_active = true
                AND price.pricing_mode = 'NOT_FOR_SALE'
                AND price.base_price IS NULL
                AND price.price_per_sqm IS NULL
                AND price.asking_price IS NULL
                AND price.minimum_price IS NULL
            )
            AND NOT EXISTS (
              SELECT 1 FROM public.lot_prices price
              WHERE price.lot_id = l.id
                AND (
                  price.pricing_mode <> 'NOT_FOR_SALE'
                  OR price.base_price IS NOT NULL
                  OR price.price_per_sqm IS NOT NULL
                  OR price.asking_price IS NOT NULL
                  OR price.minimum_price IS NOT NULL
                )
            )
            AND NOT EXISTS (SELECT 1 FROM public.lot_reservations record WHERE record.lot_id = l.id)
            AND NOT EXISTS (SELECT 1 FROM public.lot_negotiations record WHERE record.lot_id = l.id)
            AND NOT EXISTS (SELECT 1 FROM public.lot_sales record WHERE record.lot_id = l.id)
            AND NOT EXISTS (SELECT 1 FROM public.lot_contracts record WHERE record.lot_id = l.id)
            AND NOT EXISTS (
              SELECT 1 FROM public.lot_status_history history
              WHERE history.lot_id = l.id AND history.previous_status IS NOT NULL
            )
        ) INTO v_safe_seed_lot;
        v_safe_seed_lot := v_safe_seed_lot AND (
          v_geometry_id IS NULL
          OR lower(coalesce(v_current_geometry.change_reason, '')) LIKE '%refer%oficial%'
        );
      END IF;
      v_preserve_commercial_entity := v_has_commercial_lot AND NOT v_safe_seed_lot;
      IF v_preserve_manual_entity OR v_preserve_commercial_entity THEN
        IF coalesce(v_existing_entity.metadata->>'sourceRevision', '') IS DISTINCT FROM v_revision THEN
          UPDATE public.map_entities
          SET verification_status = 'NEEDS_REVIEW',
              metadata = metadata || jsonb_build_object(
                'preservedFromReferenceRevision', nullif(v_existing_entity.metadata->>'sourceRevision', ''),
                'referenceReviewRequiredFor', v_revision
              ),
              updated_by = auth.uid(),
              updated_at = now()
          WHERE id = v_entity_id
            AND (
              verification_status IS DISTINCT FROM 'NEEDS_REVIEW'
              OR metadata->>'preservedFromReferenceRevision'
                IS DISTINCT FROM nullif(v_existing_entity.metadata->>'sourceRevision', '')
              OR metadata->>'referenceReviewRequiredFor' IS DISTINCT FROM v_revision
            );
          GET DIAGNOSTICS v_affected = ROW_COUNT;
          v_updated_entities := v_updated_entities + v_affected;
          v_change_count := v_change_count + v_affected;
        END IF;
        v_protected_entity_ids := array_append(v_protected_entity_ids, v_entity_id);
        IF v_preserve_manual_entity THEN
          v_preserved_manual_entities := v_preserved_manual_entities + 1;
        END IF;
        IF v_preserve_commercial_entity THEN
          v_preserved_commercial_entities := v_preserved_commercial_entities + 1;
        END IF;
        CONTINUE;
      END IF;

      IF v_is_sellable
        AND public.map_geometry_overlaps_sellable(v_project_id, v_geometry, ARRAY[v_entity_id])
      THEN
        RAISE EXCEPTION 'MAP_GEOMETRY_OVERLAP:%', v_identifier;
      END IF;

      UPDATE public.map_entities
      SET layer_id = v_layer_id,
          public_identifier = v_identifier,
          name = trim(v_entity->>'name'),
          description = v_entity->>'description',
          classification = v_classification,
          verification_status = CASE
            WHEN v_reference_changed OR is_archived THEN 'NEEDS_REVIEW'
            ELSE verification_status
          END,
          is_sellable = v_is_sellable,
          is_archived = false,
          metadata = metadata || v_metadata,
          updated_by = auth.uid(),
          updated_at = now()
      WHERE id = v_entity_id
        AND (
          layer_id IS DISTINCT FROM v_layer_id
          OR public_identifier IS DISTINCT FROM v_identifier
          OR name IS DISTINCT FROM trim(v_entity->>'name')
          OR description IS DISTINCT FROM v_entity->>'description'
          OR classification IS DISTINCT FROM v_classification
          OR (v_reference_changed AND verification_status IS DISTINCT FROM 'NEEDS_REVIEW')
          OR is_sellable IS DISTINCT FROM v_is_sellable
          OR is_archived = true
          OR metadata IS DISTINCT FROM metadata || v_metadata
        );
      GET DIAGNOSTICS v_affected = ROW_COUNT;
      v_updated_entities := v_updated_entities + v_affected;
      v_change_count := v_change_count + v_affected;

      IF v_geometry_id IS NULL THEN
        SELECT coalesce(max(version), 0) + 1
        INTO v_geometry_version
        FROM public.map_entity_geometries
        WHERE entity_id = v_entity_id;
        INSERT INTO public.map_entity_geometries (
          project_id, entity_id, geometry, elevation, extrusion_height, rotation,
          calibration_version, version, is_current, change_reason, created_by
        ) VALUES (
          v_project_id, v_entity_id, v_geometry, v_elevation, v_extrusion_height, v_rotation,
          v_calibration_version, v_geometry_version, true,
          'Restauração versionada pela referência oficial ' || v_revision, auth.uid()
        );
        v_updated_geometries := v_updated_geometries + 1;
        v_change_count := v_change_count + 1;
      ELSIF v_geometry_changed THEN
        UPDATE public.map_entity_geometries
        SET geometry = v_geometry,
            elevation = v_elevation,
            extrusion_height = v_extrusion_height,
            rotation = v_rotation,
            calibration_version = v_calibration_version,
            version = version + 1,
            change_reason = 'Atualização versionada para a referência oficial ' || v_revision,
            created_by = auth.uid(),
            created_at = now(),
            updated_at = now()
        WHERE id = v_geometry_id;
        v_updated_geometries := v_updated_geometries + 1;
        v_change_count := v_change_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- Second pass: resolve quadra/pavilion ownership by stable public identifier.
  FOR v_entity IN SELECT value FROM jsonb_array_elements(p_entities)
  LOOP
    v_identifier := upper(trim(v_entity->>'publicIdentifier'));
    v_parent_identifier := upper(trim(coalesce(
      nullif(v_entity->>'parentPublicIdentifier', ''),
      nullif(v_entity#>>'{metadata,parentPublicIdentifier}', '')
    )));
    SELECT id INTO v_entity_id
    FROM public.map_entities
    WHERE project_id = v_project_id AND public_identifier = v_identifier;
    IF v_entity_id = ANY(v_protected_entity_ids) THEN
      CONTINUE;
    END IF;

    v_parent_id := NULL;
    IF coalesce(v_parent_identifier, '') <> '' THEN
      SELECT id INTO v_parent_id
      FROM public.map_entities
      WHERE project_id = v_project_id
        AND upper(public_identifier) = v_parent_identifier
        AND is_archived = false;
      IF v_parent_id IS NULL THEN
        RAISE EXCEPTION 'REFERENCE_2026_PARENT_NOT_FOUND:%', v_parent_identifier;
      END IF;
      IF v_parent_id = v_entity_id THEN
        RAISE EXCEPTION 'REFERENCE_2026_SELF_PARENT:%', v_identifier;
      END IF;
    END IF;

    UPDATE public.map_entities
    SET parent_entity_id = v_parent_id,
        updated_by = auth.uid(),
        updated_at = now()
    WHERE id = v_entity_id AND parent_entity_id IS DISTINCT FROM v_parent_id;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    v_updated_entities := v_updated_entities + v_affected;
    v_change_count := v_change_count + v_affected;
  END LOOP;

  -- Numbered 2026 lots are created in a deliberately non-commercial state.
  -- An existing lot is only identity-checked; every commercial field and all
  -- dependent records remain untouched.
  FOR v_lot IN SELECT value FROM jsonb_array_elements(p_lots)
  LOOP
    v_identifier := upper(trim(v_lot->>'publicIdentifier'));
    v_entity_identifier := upper(trim(v_lot->>'entityPublicIdentifier'));
    SELECT id INTO v_entity_id
    FROM public.map_entities
    WHERE project_id = v_project_id
      AND upper(public_identifier) = v_entity_identifier
      AND is_archived = false;
    IF v_entity_id IS NULL THEN
      RAISE EXCEPTION 'REFERENCE_2026_LOT_ENTITY_NOT_FOUND:%', v_entity_identifier;
    END IF;

    IF (SELECT count(*)
        FROM public.commercial_lots l
        WHERE l.project_id = v_project_id
          AND (upper(l.public_identifier) = v_identifier OR l.entity_id = v_entity_id)) > 1 THEN
      RAISE EXCEPTION 'AMBIGUOUS_COMMERCIAL_LOT_CONFLICT:%', v_identifier;
    END IF;

    v_existing_lot_id := NULL;
    SELECT l.id INTO v_existing_lot_id
    FROM public.commercial_lots l
    WHERE l.project_id = v_project_id
      AND (upper(l.public_identifier) = v_identifier OR l.entity_id = v_entity_id)
    LIMIT 1
    FOR UPDATE;

    IF v_existing_lot_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.commercial_lots l
        WHERE l.id = v_existing_lot_id
          AND l.entity_id = v_entity_id
          AND upper(l.public_identifier) = v_identifier
      ) THEN
        RAISE EXCEPTION 'COMMERCIAL_LOT_IDENTITY_CONFLICT:%', v_identifier;
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1
        FROM public.map_entities e
        WHERE e.id = v_entity_id
          AND e.classification IN ('SELLABLE_LOT', 'INTERNAL_STAND')
          AND e.is_sellable = true
          AND lower(coalesce(e.metadata->>'seedManaged', 'false')) = 'true'
          AND e.metadata->>'sourceRevision' = v_revision
      ) THEN
        RAISE EXCEPTION 'INVALID_REFERENCE_2026_LOT_ENTITY:%', v_entity_identifier;
      END IF;

      v_infrastructure := coalesce(v_lot->'infrastructure', '[]'::jsonb);
      IF jsonb_typeof(v_infrastructure) <> 'array' THEN
        RAISE EXCEPTION 'INVALID_REFERENCE_2026_LOT_INFRASTRUCTURE:%', v_identifier;
      END IF;

      INSERT INTO public.commercial_lots (
        project_id, entity_id, public_identifier, block, lot_number, level_label,
        display_name, description, status, official_area_sqm, calculated_area_sqm,
        area_validation_status, frontage_meters, depth_meters, infrastructure,
        has_electricity, has_water, has_internet, is_corner, is_covered,
        accessibility_notes, commercial_notes, internal_notes,
        created_by, updated_by
      ) VALUES (
        v_project_id,
        v_entity_id,
        v_identifier,
        nullif(trim(v_lot->>'block'), ''),
        nullif(trim(v_lot->>'lotNumber'), ''),
        nullif(trim(v_lot->>'levelLabel'), ''),
        coalesce(nullif(trim(v_lot->>'displayName'), ''), v_identifier),
        v_lot->>'description',
        'BLOCKED',
        NULL,
        NULL,
        'UNVALIDATED',
        NULL,
        NULL,
        v_infrastructure,
        coalesce((nullif(v_lot->>'hasElectricity', ''))::boolean, false),
        coalesce((nullif(v_lot->>'hasWater', ''))::boolean, false),
        coalesce((nullif(v_lot->>'hasInternet', ''))::boolean, false),
        coalesce((nullif(v_lot->>'isCorner', ''))::boolean, false),
        coalesce((nullif(v_lot->>'isCovered', ''))::boolean, false),
        v_lot->>'accessibilityNotes',
        NULL,
        NULL,
        auth.uid(),
        auth.uid()
      ) RETURNING id INTO v_existing_lot_id;

      INSERT INTO public.lot_prices (
        lot_id, pricing_mode, base_price, price_per_sqm, asking_price, minimum_price,
        is_active, created_by
      ) VALUES (
        v_existing_lot_id, 'NOT_FOR_SALE', NULL, NULL, NULL, NULL, true, auth.uid()
      );

      INSERT INTO public.lot_status_history (
        lot_id, previous_status, new_status, reason, changed_by
      ) VALUES (
        v_existing_lot_id, NULL, 'BLOCKED',
        'Lote numerado importado da referência oficial ' || v_revision || '; validação comercial pendente.',
        auth.uid()
      );

      v_created_lots := v_created_lots + 1;
      v_change_count := v_change_count + 1;
    END IF;
  END LOOP;

  -- Only unmistakable obsolete seed entities without a commercial lot may be
  -- archived. This covers the 2024 bootstrap and older managed revisions while
  -- leaving manual entities and anything with commercial state untouched.
  UPDATE public.map_entities e
  SET is_archived = true,
      verification_status = 'ARCHIVED',
      metadata = e.metadata || jsonb_build_object(
        'seedManaged', true,
        'archivedByReferenceRevision', v_revision
      ),
      updated_by = auth.uid(),
      updated_at = now()
  WHERE e.project_id = v_project_id
    AND e.is_archived = false
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_entities) incoming
      WHERE upper(trim(incoming->>'publicIdentifier')) = upper(e.public_identifier)
    )
    AND NOT EXISTS (SELECT 1 FROM public.commercial_lots l WHERE l.entity_id = e.id)
    AND e.verification_status <> 'VERIFIED'
    AND NOT EXISTS (
      SELECT 1
      FROM public.map_entity_geometries geometry
      WHERE geometry.entity_id = e.id
        AND geometry.is_current = true
        AND lower(coalesce(geometry.change_reason, '')) NOT LIKE '%refer%oficial%'
    )
    AND (
      coalesce(e.metadata->>'sourceRevision', '') LIKE '2024%'
      OR (
        lower(coalesce(e.metadata->>'seedManaged', 'false')) = 'true'
        AND coalesce(e.metadata->>'sourceRevision', '') <> ''
        AND e.metadata->>'sourceRevision' <> v_revision
      )
      OR (
        lower(coalesce(e.metadata->>'source', '')) LIKE '%fenasoja%'
        AND coalesce(e.metadata->>'source', '') LIKE '%2024%'
      )
    );
  GET DIAGNOSTICS v_archived_seed_entities = ROW_COUNT;
  v_change_count := v_change_count + v_archived_seed_entities;

  -- The 2026 source contains no lake/water feature. Hide the now-empty legacy
  -- water layer only when this is an identified 2024 seed upgrade; never alter
  -- a manually maintained layer that still owns an active water entity.
  UPDATE public.map_layers layer
  SET is_visible = false,
      opacity = 0,
      updated_at = now()
  WHERE v_replace_project_identity
    AND layer.project_id = v_project_id
    AND layer.layer_key = 'water'
    AND (layer.is_visible = true OR layer.opacity <> 0)
    AND NOT EXISTS (
      SELECT 1
      FROM public.map_entities entity
      WHERE entity.layer_id = layer.id
        AND entity.is_archived = false
        AND entity.classification = 'WATER'
    );
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  v_change_count := v_change_count + v_affected;

  IF NOT v_created_project AND v_change_count > 0 THEN
    UPDATE public.map_projects
    SET active_version = active_version + 1,
        is_published = false,
        updated_by = auth.uid(),
        updated_at = now()
    WHERE id = v_project_id
    RETURNING * INTO v_project;
  ELSE
    SELECT * INTO v_project FROM public.map_projects WHERE id = v_project_id;
  END IF;

  IF v_change_count > 0 THEN
    INSERT INTO public.map_activity_logs (
      org_id, project_id, action, before_state, after_state, reason, actor_user_id
    ) VALUES (
      p_org_id,
      v_project_id,
      'MAP_REFERENCE_2026_SYNCED',
      jsonb_build_object(
        'referenceRevision', v_previous_revision,
        'activeVersion', CASE WHEN v_created_project THEN NULL ELSE v_project.active_version - 1 END
      ),
      jsonb_build_object(
        'referenceRevision', v_revision,
        'activeVersion', v_project.active_version,
        'changed', true,
        'insertedEntities', v_inserted_entities,
        'updatedEntities', v_updated_entities,
        'updatedGeometries', v_updated_geometries,
        'createdBlockedLots', v_created_lots,
        'archivedSeedEntities', v_archived_seed_entities,
        'preservedManualEntities', v_preserved_manual_entities,
        'preservedCommercialEntities', v_preserved_commercial_entities,
        'preservedExistingLots', jsonb_array_length(p_lots) - v_created_lots
      ),
      'Sincronização explícita e protegida da referência cartográfica oficial ' || v_revision,
      auth.uid()
    );
  END IF;

  RETURN v_project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_commercial_map_reference_2026(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_commercial_map_reference_2026(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.sync_commercial_map_reference_2026(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) IS
  'Explicit map.admin-only 2026 reference sync. Rejects manual identifier conflicts, versions geometry, and never overwrites existing commercial records.';
