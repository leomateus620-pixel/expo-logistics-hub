-- Exporural 2026.4 official-fidelity geometry rollout.
-- Additive only: refreshes the canonical segment contract and installs the
-- explicit map.admin apply/rollback RPCs without mutating geometry on deploy.
-- The apply RPC preserves all 95 commercial lots and archives only the five
-- retired, seed-managed, non-commercial reference structures.

CREATE OR REPLACE FUNCTION public.ensure_commission_map_segments(_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.map_projects WHERE id = _project_id) THEN
    RAISE EXCEPTION 'MAP_PROJECT_NOT_FOUND';
  END IF;

  INSERT INTO public.map_segments (
    project_id, slug, name, display_name, source_reference, boundary_data,
    camera_config, visual_config, required_capability
  )
  VALUES
    (
      _project_id,
      'exporural',
      'Exporural',
      'Exporural',
      'Perímetro cadastral oficial Exporural 2026.4',
      '{"resolution":"explicit-entity-union","expectedEntityCount":111,"expectedLotCount":95,"blockIdentifiers":["QUADRA-R","QUADRA-S"],"perimeter":["Rua Ubiretama","Rua Bruno Schwartz","Rua Gustavo Bessel","Rua Emanuel Brachmann"],"excludedIdentifiers":["B7","B8","D3","B35","B36","D6-01","D6-02","D6-03"]}'::jsonb
        || jsonb_build_object('lineageBaselineAt', transaction_timestamp()),
      '{"direction":[0.62,0.72,0.46],"padding":1.08,"minDistanceRatio":0.12,"maxDistanceRatio":2.2,"bounds":{"minX":-2.9,"maxX":57.8,"minZ":-37.6,"maxZ":-7.7}}'::jsonb,
      '{"surface":"#657F3F","edge":"#405527","accent":"#A8BE72","foreground":"#1F2C16"}'::jsonb,
      'exporural_access'
    ),
    (
      _project_id,
      'industria-comercio-servicos',
      'Indústria, Comércio e Serviços',
      'Indústria, Comércio e Serviços',
      'Anexo 2 — contorno azul do núcleo comercial',
      '{"resolution":"explicit-entity-union","expectedEntityCount":140,"expectedLotCount":103,"blockIdentifiers":["QUADRA-M","QUADRA-G","QUADRA-L","QUADRA-F","QUADRA-J","QUADRA-E","QUADRA-I","QUADRA-D"],"excludedIdentifiers":["Q-G-03","Q-G-04","QUADRA-N","B7","B28","D4","QUADRA-C","QUADRA-B","QUADRA-A","C1","B11","B12","B13","B14","B15","B18","B21","B25","B26","B27","B30","B31","B32","B42-02","G","B8","B9","B10","B39"]}'::jsonb
        || jsonb_build_object('lineageBaselineAt', transaction_timestamp()),
      '{"direction":[0.58,0.7,0.64],"padding":1.12,"minDistanceRatio":0.1,"maxDistanceRatio":2.05,"bounds":{"minX":-24.4582,"maxX":16.3636,"minZ":-11.6727,"maxZ":25.4182}}'::jsonb,
      '{"surface":"#347786","edge":"#173F4A","accent":"#70A9B4","foreground":"#10292F"}'::jsonb,
      'industria_comercio_servicos_access'
    )
  ON CONFLICT (project_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    source_reference = EXCLUDED.source_reference,
    boundary_data = EXCLUDED.boundary_data || jsonb_build_object(
      'lineageBaselineAt', COALESCE(
        map_segments.boundary_data->'lineageBaselineAt',
        EXCLUDED.boundary_data->'lineageBaselineAt'
      )
    ),
    camera_config = EXCLUDED.camera_config,
    visual_config = EXCLUDED.visual_config,
    required_capability = EXCLUDED.required_capability,
    is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_commission_map_segments(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_commission_map_segments(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_commission_map_segments(uuid) TO service_role;

SELECT public.ensure_commission_map_segments(project.id)
FROM public.map_projects project;

CREATE OR REPLACE FUNCTION public.resolve_commission_map_segment_slug(
  _public_identifier text,
  _metadata jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    -- Exclude retired structures before evaluating areaCode from older seeds.
    WHEN upper(COALESCE(_public_identifier, '')) = ANY (ARRAY[
      'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
    ]) THEN NULL
    WHEN upper(COALESCE(_public_identifier, '')) <> ALL (ARRAY['B7', 'B8', 'D3'])
      AND (
        upper(COALESCE(_public_identifier, '')) IN (
          'EXPORURAL', 'QUADRA-R', 'QUADRA-S',
          'RUA-BRUNO-SCHWARTZ', 'RUA-JOHAN-MULLER', 'RUA-GUSTAVO-BESSEL',
          'RUA-15-NOVEMBRO', 'RUA-EMANUEL-BRACHMANN',
          'RUA-PASTOR-ALBERT-LEHENBAUER', 'RUA-UBIRETAMA',
          'B37', 'B38', 'C4', 'E-01', 'E-02', 'E-06'
        )
        OR upper(COALESCE(_public_identifier, '')) ~ '^Q-[RS]-[0-9]{2}$'
        OR upper(COALESCE(_metadata->>'block', '')) IN ('R', 'S')
        OR upper(COALESCE(_metadata->>'areaCode', '')) = 'EXPORURAL'
      )
    THEN 'exporural'
    WHEN upper(COALESCE(_public_identifier, '')) <> ALL (ARRAY[
      'Q-G-03', 'Q-G-04', 'QUADRA-N', 'B7', 'B28', 'D4',
      'QUADRA-C', 'QUADRA-B', 'QUADRA-A', 'C1',
      'B11', 'B12', 'B13', 'B14', 'B15', 'B18', 'B21',
      'B25', 'B26', 'B27', 'B30', 'B31', 'B32', 'B42-02',
      'G', 'B8', 'B9', 'B10', 'B39'
    ])
      AND (
        upper(COALESCE(_public_identifier, '')) IN (
          'B1', 'B2', 'B3', 'B4', 'B5', 'B6',
          'B16', 'B17', 'B19', 'B23', 'B24', 'B33', 'B34', 'B40', 'B41',
          'C2', 'C3', 'D1', 'D2', 'D3',
          'E-18', 'E-19', 'E-20', 'E-22', 'E-23', 'E-24',
          'RUA-URUGUAI', 'RUA-MONTEVIDEU', 'CALCADA-ARVOREDO'
        )
        OR upper(COALESCE(_public_identifier, '')) ~ '^QUADRA-(M|G|L|F|J|E|I|D)$'
        OR upper(COALESCE(_public_identifier, '')) ~ '^Q-(M|G|L|F|J|E|I|D)-[0-9]{2}$'
        OR upper(COALESCE(_metadata->>'block', '')) IN ('M', 'G', 'L', 'F', 'J', 'E', 'I', 'D')
      )
    THEN 'industria-comercio-servicos'
    ELSE NULL
  END;
$$;

-- Deliberately no top-level map_entities mutation: the 111 baseline makes the
-- commission segment fail closed while the five retired rows are still active.
-- The admin-only apply RPC snapshots first, then archives/cleans those rows and
-- updates the 111 payload entities, whose canonical trigger assigns Exporural.

CREATE TABLE IF NOT EXISTS public.map_reference_migration_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.map_projects(id) ON DELETE CASCADE,
  area_code text NOT NULL,
  source_revision text NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  snapshot jsonb NOT NULL,
  apply_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  rolled_back_at timestamptz,
  rolled_back_by uuid REFERENCES auth.users(id),
  rollback_reason text,
  CONSTRAINT map_reference_migration_snapshots_status_check
    CHECK (status IN ('PENDING', 'APPLIED', 'ROLLED_BACK'))
);

ALTER TABLE public.map_reference_migration_snapshots
  ADD COLUMN IF NOT EXISTS payload_hash text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS apply_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS rolled_back_at timestamptz,
  ADD COLUMN IF NOT EXISTS rolled_back_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rollback_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS map_reference_migration_snapshots_one_active_revision
  ON public.map_reference_migration_snapshots(project_id, area_code, source_revision)
  WHERE status = 'APPLIED';

ALTER TABLE public.map_reference_migration_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS map_reference_migration_snapshots_select ON public.map_reference_migration_snapshots;
CREATE POLICY map_reference_migration_snapshots_select
  ON public.map_reference_migration_snapshots
  FOR SELECT TO authenticated
  USING (public.map_has_explicit_capability(org_id, 'map.admin'));

REVOKE ALL ON TABLE public.map_reference_migration_snapshots FROM PUBLIC;
GRANT SELECT ON TABLE public.map_reference_migration_snapshots TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_exporural_reference_2026(
  p_org_id uuid,
  p_source_revision text,
  p_entities jsonb,
  p_lots jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.map_projects%ROWTYPE;
  v_existing public.map_entities%ROWTYPE;
  v_current_geometry public.map_entity_geometries%ROWTYPE;
  v_existing_lot public.commercial_lots%ROWTYPE;
  v_current_calibration public.map_calibrations%ROWTYPE;
  v_technical_calibration public.map_calibrations%ROWTYPE;
  v_active_snapshot public.map_reference_migration_snapshots%ROWTYPE;
  v_entity jsonb;
  v_lot jsonb;
  v_geometry jsonb;
  v_metadata jsonb;
  v_identifier text;
  v_parent_identifier text;
  v_layer_key text;
  v_layer_id uuid;
  v_parent_id uuid;
  v_entity_id uuid;
  v_lot_id uuid;
  v_auxiliary_id uuid;
  v_calibration_id uuid;
  v_calibration_version integer;
  v_geometry_version integer;
  v_snapshot_id uuid;
  v_payload_hash text;
  v_applied_at timestamptz;
  v_official_area numeric;
  v_metadata_official_area numeric;
  v_calculated_area numeric;
  v_area_difference_percent numeric;
  v_map_units_per_meter constant numeric := 0.15;
  v_primary_control_distance_meters constant numeric := 30;
  v_primary_control_point_a constant jsonb := '[16.519090909090906, -37.04727272727273]'::jsonb;
  v_primary_control_point_b constant jsonb := '[16.519090909090906, -32.54727272727273]'::jsonb;
  v_reference_width constant numeric := 120;
  v_reference_height constant numeric := 90.545455;
  v_reference_crop_x constant numeric := 600;
  v_reference_crop_y constant numeric := 900;
  v_reference_crop_width constant numeric := 5500;
  v_reference_crop_height constant numeric := 4150;
  v_coordinate_tolerance constant numeric := 0.00000001;
  v_excluded_entity_ids uuid[] := '{}'::uuid[];
  v_inserted_entity_ids uuid[] := '{}'::uuid[];
  v_inserted_lot_ids uuid[] := '{}'::uuid[];
  v_inserted_price_ids uuid[] := '{}'::uuid[];
  v_inserted_status_history_ids uuid[] := '{}'::uuid[];
  v_inserted_lineage_ids uuid[] := '{}'::uuid[];
  v_calibration_created boolean := false;
  v_state_is_current boolean := false;
  v_geometry_changed boolean := false;
  v_calibration_changed boolean := false;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_geometry_updates integer := 0;
  v_lot_updates integer := 0;
  v_retired_archived integer := 0;
BEGIN
  IF p_org_id IS NULL OR NOT public.map_has_explicit_capability(p_org_id, 'map.admin') THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;

  IF trim(coalesce(p_source_revision, '')) <> '2026.4'
    OR jsonb_typeof(p_entities) <> 'array'
    OR jsonb_array_length(p_entities) <> 111
    OR jsonb_typeof(p_lots) <> 'array'
    OR jsonb_array_length(p_lots) <> 95
  THEN
    RAISE EXCEPTION 'INVALID_EXPORURAL_2026_PAYLOAD';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('commercial-map:exporural:' || p_org_id::text, 0));

  SELECT *
  INTO v_project
  FROM public.map_projects
  WHERE org_id = p_org_id AND is_archived = false
  ORDER BY updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'MAP_PROJECT_NOT_FOUND'; END IF;

  v_payload_hash := md5(p_source_revision || '|' || p_entities::text || '|' || p_lots::text);

  SELECT *
  INTO v_active_snapshot
  FROM public.map_reference_migration_snapshots
  WHERE project_id = v_project.id
    AND area_code = 'EXPORURAL'
    AND source_revision = p_source_revision
    AND status = 'APPLIED'
  ORDER BY applied_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_active_snapshot.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'EXPORURAL_REFERENCE_PAYLOAD_CONFLICT';
    END IF;

    SELECT
      v_project.reference_revision = p_source_revision
      AND (
        SELECT count(*)
        FROM public.map_entities entity
        WHERE entity.project_id = v_project.id
          AND entity.is_archived = false
          AND upper(entity.public_identifier) IN (
            SELECT upper(trim(item->>'publicIdentifier'))
            FROM jsonb_array_elements(p_entities) item
          )
          AND entity.metadata->>'geometryRevision' = '2026.4-exporural.1'
      ) = 111
      AND (
        SELECT count(*)
        FROM public.commercial_lots lot
        WHERE lot.project_id = v_project.id
          AND lot.archived_at IS NULL
          AND upper(lot.public_identifier) IN (
            SELECT upper(trim(item->>'publicIdentifier'))
            FROM jsonb_array_elements(p_lots) item
          )
          AND lot.area_validation_status = 'VALIDATED'
      ) = 95
      AND (
        SELECT count(*)
        FROM public.map_entities entity
        JOIN public.map_entity_geometries geometry
          ON geometry.entity_id = entity.id AND geometry.is_current = true
        WHERE entity.project_id = v_project.id
          AND entity.is_archived = false
          AND upper(entity.public_identifier) IN (
            SELECT upper(trim(item->>'publicIdentifier'))
            FROM jsonb_array_elements(p_entities) item
          )
      ) = 111
      AND NOT EXISTS (
        SELECT 1
        FROM public.map_entities retired
        WHERE retired.project_id = v_project.id
          AND retired.is_archived = false
          AND upper(retired.public_identifier) = ANY (ARRAY[
            'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
          ])
      )
      AND (
        SELECT count(*)
        FROM public.map_entities retired
        WHERE retired.project_id = v_project.id
          AND retired.is_archived = true
          AND upper(retired.public_identifier) = ANY (ARRAY[
            'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
          ])
          AND retired.metadata->>'archivedByReferenceRevision' = p_source_revision
          AND retired.metadata->>'migrationSnapshotId' = v_active_snapshot.id::text
      ) = 5
      AND NOT EXISTS (
        SELECT 1
        FROM public.map_entities entity
        JOIN public.map_entity_geometries geometry
          ON geometry.entity_id = entity.id AND geometry.is_current = true
        LEFT JOIN public.map_calibrations calibration
          ON calibration.project_id = geometry.project_id
          AND calibration.version = geometry.calibration_version
        WHERE entity.project_id = v_project.id
          AND entity.is_archived = false
          AND upper(entity.public_identifier) IN (
            SELECT upper(trim(item->>'publicIdentifier'))
            FROM jsonb_array_elements(p_entities) item
          )
          AND (
            calibration.id IS NULL
            OR calibration.status <> 'VALIDATED'
            OR calibration.map_units_per_meter IS DISTINCT FROM v_map_units_per_meter
          )
      )
    INTO v_state_is_current;

    IF NOT v_state_is_current THEN
      RAISE EXCEPTION 'EXPORURAL_REFERENCE_ALREADY_APPLIED_WITH_DRIFT:%', v_active_snapshot.id;
    END IF;

    RETURN v_active_snapshot.apply_result || jsonb_build_object(
      'projectId', v_project.id,
      'snapshotId', v_active_snapshot.id,
      'referenceRevision', p_source_revision,
      'geometryRevision', '2026.4-exporural.1',
      'changed', false
    );
  END IF;

  -- Close the preflight/write TOCTOU window. Geometry writers lock their current
  -- row, while lot creation locks the project; taking both lock families here
  -- serializes target, protected and persisted sellable geometry until commit.
  PERFORM entity.id
  FROM public.map_entities entity
  WHERE entity.project_id = v_project.id
    AND (
      entity.is_sellable = true
      OR upper(entity.public_identifier) IN (
        SELECT upper(trim(item->>'publicIdentifier'))
        FROM jsonb_array_elements(p_entities) item
      )
      OR upper(entity.public_identifier) IN ('B7', 'B8', 'D3')
      OR upper(entity.public_identifier) = ANY (ARRAY[
        'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
      ])
    )
  ORDER BY entity.id
  FOR UPDATE OF entity;

  PERFORM geometry.id
  FROM public.map_entity_geometries geometry
  JOIN public.map_entities entity ON entity.id = geometry.entity_id
  WHERE geometry.project_id = v_project.id
    AND geometry.is_current = true
    AND (
      entity.is_sellable = true
      OR upper(entity.public_identifier) IN (
        SELECT upper(trim(item->>'publicIdentifier'))
        FROM jsonb_array_elements(p_entities) item
      )
      OR upper(entity.public_identifier) IN ('B7', 'B8', 'D3')
      OR upper(entity.public_identifier) = ANY (ARRAY[
        'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
      ])
    )
  ORDER BY geometry.id
  FOR UPDATE OF geometry;

  PERFORM lot.id
  FROM public.commercial_lots lot
  WHERE lot.project_id = v_project.id
    AND (
      upper(lot.public_identifier) IN (
        SELECT upper(trim(item->>'publicIdentifier'))
        FROM jsonb_array_elements(p_lots) item
      )
      OR upper(lot.public_identifier) = ANY (ARRAY[
        'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
      ])
      OR lot.entity_id IN (
        SELECT entity.id
        FROM public.map_entities entity
        WHERE entity.project_id = v_project.id
          AND upper(entity.public_identifier) = ANY (ARRAY[
            'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
          ])
      )
    )
  ORDER BY lot.id
  FOR UPDATE OF lot;

  IF EXISTS (
    SELECT 1
    FROM public.commercial_lots lot
    WHERE lot.project_id = v_project.id
      AND lot.archived_at IS NOT NULL
      AND upper(lot.public_identifier) IN (
        SELECT upper(trim(item->>'publicIdentifier'))
        FROM jsonb_array_elements(p_lots) item
      )
  ) THEN
    RAISE EXCEPTION 'EXPORURAL_ARCHIVED_LOT_REQUIRES_MANUAL_REVIEW';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT upper(trim(item->>'publicIdentifier')) AS identifier, count(*) AS total
      FROM jsonb_array_elements(p_entities) AS item
      GROUP BY upper(trim(item->>'publicIdentifier'))
    ) candidate
    WHERE coalesce(identifier, '') = '' OR total > 1
  ) THEN
    RAISE EXCEPTION 'INVALID_OR_DUPLICATE_EXPORURAL_ENTITY';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_entities) AS item
    WHERE upper(trim(item->>'publicIdentifier')) = ANY (ARRAY[
      'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
    ])
  ) THEN
    RAISE EXCEPTION 'EXPORURAL_RETIRED_ENTITY_IN_PAYLOAD';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_entities) AS item
    WHERE upper(trim(item->>'publicIdentifier')) NOT IN (
      'EXPORURAL', 'QUADRA-R', 'QUADRA-S',
      'RUA-BRUNO-SCHWARTZ', 'RUA-JOHAN-MULLER', 'RUA-GUSTAVO-BESSEL',
      'RUA-15-NOVEMBRO', 'RUA-EMANUEL-BRACHMANN',
      'RUA-PASTOR-ALBERT-LEHENBAUER', 'RUA-UBIRETAMA',
      'B37', 'B38', 'C4',
      'E-01', 'E-02', 'E-06'
    )
      AND upper(trim(item->>'publicIdentifier')) !~ '^Q-[RS]-[0-9]{2}$'
  ) THEN
    RAISE EXCEPTION 'EXPORURAL_ENTITY_OUTSIDE_ALLOWLIST';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_entities) AS item
    WHERE jsonb_typeof(item->'geometry') <> 'object'
      OR item#>>'{geometry,type}' <> 'Polygon'
      OR jsonb_typeof(item#>'{geometry,coordinates}') <> 'array'
      OR jsonb_typeof(item->'metadata') <> 'object'
      OR item#>>'{metadata,areaCode}' <> 'EXPORURAL'
      OR item#>>'{metadata,geometryRevision}' <> '2026.4-exporural.1'
      OR lower(coalesce(item#>>'{metadata,seedManaged}', 'false')) <> 'true'
  ) THEN
    RAISE EXCEPTION 'INVALID_EXPORURAL_ENTITY_METADATA';
  END IF;

  -- Every retained polygon carries its official PDF-space source ring. Verify
  -- both metadata shape and the deterministic PDF->scene transform so a client
  -- cannot submit corrected metadata with stale interactive geometry.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_entities) item
    WHERE jsonb_typeof(item#>'{metadata,sourcePdfPolygon}') IS DISTINCT FROM 'array'
      OR jsonb_typeof(item#>'{geometry,coordinates,0}') IS DISTINCT FROM 'array'
  ) THEN
    RAISE EXCEPTION 'INVALID_EXPORURAL_SOURCE_POLYGON_METADATA';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_entities) item
    WHERE jsonb_array_length(item#>'{metadata,sourcePdfPolygon}') < 3
      OR jsonb_array_length(item#>'{geometry,coordinates,0}')
        <> jsonb_array_length(item#>'{metadata,sourcePdfPolygon}') + 1
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(item#>'{metadata,sourcePdfPolygon}') source_point
        WHERE jsonb_typeof(source_point) IS DISTINCT FROM 'array'
          OR jsonb_array_length(source_point) <> 2
          OR jsonb_typeof(source_point->0) IS DISTINCT FROM 'number'
          OR jsonb_typeof(source_point->1) IS DISTINCT FROM 'number'
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(item#>'{geometry,coordinates,0}') scene_point
        WHERE jsonb_typeof(scene_point) IS DISTINCT FROM 'array'
          OR jsonb_array_length(scene_point) <> 2
          OR jsonb_typeof(scene_point->0) IS DISTINCT FROM 'number'
          OR jsonb_typeof(scene_point->1) IS DISTINCT FROM 'number'
      )
  ) THEN
    RAISE EXCEPTION 'INVALID_EXPORURAL_SOURCE_POLYGON_METADATA';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_entities) item
    WHERE EXISTS (
      SELECT 1
      FROM jsonb_array_elements(item#>'{metadata,sourcePdfPolygon}')
        WITH ORDINALITY source_point(value, ordinal)
      JOIN jsonb_array_elements(item#>'{geometry,coordinates,0}')
        WITH ORDINALITY scene_point(value, ordinal)
        USING (ordinal)
      WHERE abs(
        (scene_point.value->>0)::numeric
          - (
            (((source_point.value->>0)::numeric - v_reference_crop_x)
              / v_reference_crop_width) * v_reference_width
            - v_reference_width / 2
          )
      ) > v_coordinate_tolerance
        OR abs(
          (scene_point.value->>1)::numeric
            - (
              (((source_point.value->>1)::numeric - v_reference_crop_y)
                / v_reference_crop_height) * v_reference_height
              - v_reference_height / 2
            )
        ) > v_coordinate_tolerance
    )
      OR abs(
        ((item#>'{geometry,coordinates,0}'->0->>0)::numeric)
          - (
            item#>'{geometry,coordinates,0}'
              -> (jsonb_array_length(item#>'{geometry,coordinates,0}') - 1)
              ->> 0
          )::numeric
      ) > v_coordinate_tolerance
      OR abs(
        ((item#>'{geometry,coordinates,0}'->0->>1)::numeric)
          - (
            item#>'{geometry,coordinates,0}'
              -> (jsonb_array_length(item#>'{geometry,coordinates,0}') - 1)
              ->> 1
          )::numeric
      ) > v_coordinate_tolerance
  ) THEN
    RAISE EXCEPTION 'EXPORURAL_SOURCE_SCENE_GEOMETRY_MISMATCH';
  END IF;

  -- EXPORURAL_FIDELITY_EXPECTATIONS_BEGIN
  -- These source-space rings are the canonical 2026.4 controls for the two
  -- segment perimeters, every retained street and the blocks affected by the
  -- Emanuel/R47/R57 correction. The transform check above separately proves
  -- that the submitted interactive geometry is derived from the same rings.
  IF EXISTS (
    WITH expected(identifier, source_polygon) AS (
      VALUES
        ('EXPORURAL', '[[3985,1265],[6008,1265],[6008,2372],[5966,2372],[5880,2570],[5832,2640],[5700,2660],[5600,2645],[5500,2615],[5370,2520],[5140,2490],[5100,2482],[4980,2482],[4100,2438],[3994,2438],[3984,2438],[3984,2445],[3945,2445],[3940,2418],[3687,2418],[3562,2388],[3541,2180],[3244,2167],[3230,2080],[3230,1760],[3945,1760],[3945,1265]]'::jsonb),
        ('QUADRA-R', '[[3230,1760],[5966,1760],[5966,2372],[5880,2570],[5832,2640],[5700,2660],[5600,2645],[5500,2615],[5370,2520],[5140,2490],[5100,2482],[4980,2482],[4100,2438],[3994,2438],[3984,2438],[3984,2445],[3945,2445],[3940,2418],[3687,2418],[3562,2388],[3541,2180],[3244,2167],[3230,2080]]'::jsonb),
        ('QUADRA-S', '[[3985,1265],[6008,1265],[6008,1762],[3985,1762]]'::jsonb),
        ('RUA-BRUNO-SCHWARTZ', '[[3984,1484],[5966,1484],[5966,1518],[3984,1518]]'::jsonb),
        ('RUA-JOHAN-MULLER', '[[3984,1726],[5966,1726],[5966,1762],[3984,1762]]'::jsonb),
        ('RUA-GUSTAVO-BESSEL', '[[3230,2058],[3985,2058],[3985,2041],[5966,2041],[5966,2078],[3985,2078],[3985,2080],[3230,2080]]'::jsonb),
        ('RUA-EMANUEL-BRACHMANN', '[[5227,2333],[5966,2333],[5966,2372],[5227,2372]]'::jsonb),
        ('RUA-15-NOVEMBRO', '[[5188,1265],[5227,1265],[5227,2372],[5188,2372]]'::jsonb),
        ('RUA-PASTOR-ALBERT-LEHENBAUER', '[[3968,1265],[4004,1265],[4004,1484],[3985,1518],[3984,1726],[3984,2445],[3945,2445],[3945,1758],[3963,1726],[3963,1518],[3968,1484]]'::jsonb),
        ('RUA-UBIRETAMA', '[[5966,1265],[6008,1265],[6008,2080],[5960,2320],[5880,2570],[5832,2640],[5800,2618],[5842,2550],[5920,2310],[5966,2070]]'::jsonb),
        ('Q-R-44', '[[5531.776595224498,2080],[5614.154862149983,2080],[5614.154862149983,2332],[5531.776595224498,2332],[5523.925531741499,2328],[5520,2320],[5520,2092],[5523.925531741499,2084]]'::jsonb),
        ('Q-R-45', '[[5614.154862149983,2080],[5707.9358641341105,2080],[5707.9358641341105,2332],[5614.154862149983,2332]]'::jsonb),
        ('Q-R-46', '[[5707.9358641341105,2080],[5801.716866118238,2080],[5801.716866118238,2332],[5707.9358641341105,2332]]'::jsonb),
        ('Q-R-47', '[[5801.716866118238,2080],[5940,2080],[5888.09550058965,2332],[5801.716866118238,2332]]'::jsonb),
        ('Q-R-56', '[[5378,2374],[5507,2374],[5507,2592.8697916666665],[5378,2500.279190891473]]'::jsonb),
        ('Q-R-57', '[[5507,2374],[5606,2374],[5606,2604.8697916666665],[5507,2592.8697916666665]]'::jsonb),
        ('Q-R-58', '[[5606,2374],[5699.367664566018,2374],[5699.367664566018,2620],[5606,2604.8697916666665]]'::jsonb),
        ('Q-R-59', '[[5699.367664566018,2374],[5829.403889669505,2374],[5822.110383623609,2410],[5798.4064889744495,2480],[5771.055841302344,2555],[5747.351946653184,2605],[5725.471428515499,2620],[5699.367664566018,2620]]'::jsonb)
    ),
    actual AS (
      SELECT
        upper(trim(item->>'publicIdentifier')) AS identifier,
        item#>'{metadata,sourcePdfPolygon}' AS source_polygon
      FROM jsonb_array_elements(p_entities) item
    )
    SELECT 1
    FROM expected
    LEFT JOIN actual USING (identifier)
    WHERE actual.identifier IS NULL
      OR actual.source_polygon IS DISTINCT FROM expected.source_polygon
  ) THEN
    RAISE EXCEPTION 'EXPORURAL_OFFICIAL_FIDELITY_POLYGON_MISMATCH';
  END IF;
  -- EXPORURAL_FIDELITY_EXPECTATIONS_END

  IF (
    SELECT count(*)
    FROM jsonb_array_elements(p_entities) item
    WHERE upper(item->>'publicIdentifier') ~ '^Q-R-[0-9]{2}$'
  ) <> 59 OR (
    SELECT count(*)
    FROM jsonb_array_elements(p_entities) item
    WHERE upper(item->>'publicIdentifier') ~ '^Q-S-[0-9]{2}$'
  ) <> 36 THEN
    RAISE EXCEPTION 'INVALID_EXPORURAL_LOT_INVENTORY';
  END IF;

  IF EXISTS (
    WITH expected AS (
      SELECT 'Q-R-' || lpad(series::text, 2, '0') AS identifier
      FROM generate_series(1, 59) series
      UNION ALL
      SELECT 'Q-S-' || lpad(series::text, 2, '0')
      FROM generate_series(1, 36) series
    ),
    actual AS (
      SELECT upper(trim(item->>'publicIdentifier')) AS identifier
      FROM jsonb_array_elements(p_entities) item
      WHERE upper(trim(item->>'publicIdentifier')) ~ '^Q-[RS]-[0-9]{2}$'
    ),
    differences AS (
      (SELECT identifier FROM expected EXCEPT SELECT identifier FROM actual)
      UNION ALL
      (SELECT identifier FROM actual EXCEPT SELECT identifier FROM expected)
    )
    SELECT 1 FROM differences
  ) THEN
    RAISE EXCEPTION 'INVALID_EXPORURAL_EXACT_LOT_INVENTORY';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT upper(trim(item->>'publicIdentifier')) AS identifier, count(*) AS total
      FROM jsonb_array_elements(p_lots) AS item
      GROUP BY upper(trim(item->>'publicIdentifier'))
    ) candidate
    WHERE identifier !~ '^Q-[RS]-[0-9]{2}$' OR total > 1
  ) THEN
    RAISE EXCEPTION 'INVALID_OR_DUPLICATE_EXPORURAL_LOT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_entities) entity
    WHERE upper(trim(entity->>'publicIdentifier')) ~ '^Q-[RS]-[0-9]{2}$'
      AND (
        entity->>'classification' <> 'SELLABLE_LOT'
        OR lower(coalesce(entity->>'isSellable', 'false')) <> 'true'
        OR trim(entity->>'layerKey') <> 'commercial'
        OR upper(trim(entity->>'parentPublicIdentifier'))
          <> 'QUADRA-' || substring(upper(trim(entity->>'publicIdentifier')) from 3 for 1)
        OR upper(trim(entity#>>'{metadata,block}'))
          <> substring(upper(trim(entity->>'publicIdentifier')) from 3 for 1)
        OR lpad(trim(entity#>>'{metadata,lotNumber}'), 2, '0')
          <> right(upper(trim(entity->>'publicIdentifier')), 2)
      )
  ) THEN
    RAISE EXCEPTION 'INVALID_EXPORURAL_COMMERCIAL_ENTITY';
  END IF;

  IF EXISTS (
    (
      SELECT upper(trim(item->>'publicIdentifier'))
      FROM jsonb_array_elements(p_lots) item
      EXCEPT
      SELECT upper(trim(item->>'publicIdentifier'))
      FROM jsonb_array_elements(p_entities) item
      WHERE item->>'classification' = 'SELLABLE_LOT'
        AND lower(coalesce(item->>'isSellable', 'false')) = 'true'
    )
    UNION ALL
    (
      SELECT upper(trim(item->>'publicIdentifier'))
      FROM jsonb_array_elements(p_entities) item
      WHERE item->>'classification' = 'SELLABLE_LOT'
        AND lower(coalesce(item->>'isSellable', 'false')) = 'true'
      EXCEPT
      SELECT upper(trim(item->>'publicIdentifier'))
      FROM jsonb_array_elements(p_lots) item
    )
  ) THEN
    RAISE EXCEPTION 'EXPORURAL_LOT_ENTITY_SET_MISMATCH';
  END IF;

  FOR v_lot IN SELECT value FROM jsonb_array_elements(p_lots)
  LOOP
    v_identifier := upper(trim(v_lot->>'publicIdentifier'));
    v_official_area := nullif(v_lot->>'officialAreaSqm', '')::numeric;

    IF upper(trim(v_lot->>'block')) <> substring(v_identifier from 3 for 1)
      OR lpad(trim(v_lot->>'lotNumber'), 2, '0') <> right(v_identifier, 2)
    THEN
      RAISE EXCEPTION 'INVALID_EXPORURAL_LOT_IDENTITY:%', v_identifier;
    END IF;

    SELECT
      extensions.ST_Area(
        public.map_polygon_from_geojson(
          jsonb_build_object(
            'type', 'Polygon',
            'coordinates', entity#>'{geometry,coordinates}'
          )
        )
      ) / (v_map_units_per_meter * v_map_units_per_meter),
      nullif(entity#>>'{metadata,officialAreaSqm}', '')::numeric
    INTO v_calculated_area, v_metadata_official_area
    FROM jsonb_array_elements(p_entities) entity
    WHERE upper(trim(entity->>'publicIdentifier')) = v_identifier
      AND entity->>'classification' = 'SELLABLE_LOT'
      AND lower(coalesce(entity->>'isSellable', 'false')) = 'true';

    IF v_official_area IS NULL OR v_official_area <= 0
      OR v_calculated_area IS NULL OR v_calculated_area <= 0
      OR v_metadata_official_area IS NULL
      OR v_metadata_official_area IS DISTINCT FROM v_official_area
    THEN
      RAISE EXCEPTION 'INVALID_EXPORURAL_AREA:%', v_identifier;
    END IF;

    v_area_difference_percent := abs(v_calculated_area - v_official_area) / v_official_area * 100;
    IF v_area_difference_percent > 0.15 THEN
      RAISE EXCEPTION 'EXPORURAL_AREA_TOLERANCE_EXCEEDED:%:%',
        v_identifier, v_area_difference_percent;
    END IF;

    IF nullif(v_lot->>'calculatedAreaSqm', '') IS NOT NULL
      AND abs((v_lot->>'calculatedAreaSqm')::numeric - v_calculated_area)
        / v_calculated_area * 100 > 0.15
    THEN
      RAISE EXCEPTION 'EXPORURAL_CLIENT_AREA_STALE:%', v_identifier;
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM public.map_entities retired
    WHERE retired.project_id = v_project.id
      AND upper(retired.public_identifier) = ANY (ARRAY[
        'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
      ])
  ) <> 5 OR (
    SELECT count(DISTINCT upper(retired.public_identifier))
    FROM public.map_entities retired
    WHERE retired.project_id = v_project.id
      AND upper(retired.public_identifier) = ANY (ARRAY[
        'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
      ])
  ) <> 5 THEN
    RAISE EXCEPTION 'EXPORURAL_RETIRED_ENTITY_SET_MISMATCH';
  END IF;

  IF (
    SELECT count(*)
    FROM public.map_entities retired
    WHERE retired.project_id = v_project.id
      AND retired.is_archived = false
      AND upper(retired.public_identifier) = ANY (ARRAY[
        'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
      ])
  ) NOT IN (0, 5) THEN
    RAISE EXCEPTION 'EXPORURAL_RETIRED_ENTITY_PARTIAL_STATE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_entities retired
    WHERE retired.project_id = v_project.id
      AND retired.is_archived = true
      AND upper(retired.public_identifier) = ANY (ARRAY[
        'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
      ])
      AND (
        retired.segment_id IS NOT NULL
        OR retired.metadata->>'archivedByReferenceRevision' IS DISTINCT FROM '2026.4'
        OR retired.metadata->>'archiveReason'
          IS DISTINCT FROM 'OFFICIAL_EXPORURAL_2026_4_REFERENCE_REMOVAL'
        OR NOT EXISTS (
          SELECT 1
          FROM public.map_reference_migration_snapshots prior_snapshot
          WHERE prior_snapshot.id::text = retired.metadata->>'migrationSnapshotId'
            AND prior_snapshot.project_id = v_project.id
            AND prior_snapshot.area_code = 'EXPORURAL'
            AND prior_snapshot.source_revision = '2026.4'
            AND prior_snapshot.status IN ('APPLIED', 'ROLLED_BACK')
        )
      )
  ) THEN
    RAISE EXCEPTION 'EXPORURAL_RETIRED_TOMBSTONE_REQUIRES_MANUAL_REVIEW';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_entities retired
    WHERE retired.project_id = v_project.id
      AND upper(retired.public_identifier) = ANY (ARRAY[
        'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
      ])
      AND upper(coalesce(retired.metadata->>'areaCode', '')) <> 'EXPORURAL'
  ) THEN
    RAISE EXCEPTION 'EXPORURAL_RETIRED_ENTITY_SCOPE_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_entities retired
    WHERE retired.project_id = v_project.id
      AND upper(retired.public_identifier) = ANY (ARRAY[
        'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
      ])
      AND (
        lower(coalesce(retired.metadata->>'seedManaged', 'false')) <> 'true'
        OR retired.is_sellable IS DISTINCT FROM false
        OR retired.classification = 'SELLABLE_LOT'
      )
  ) THEN
    RAISE EXCEPTION 'EXPORURAL_RETIRED_ENTITY_NOT_INERT_SEED';
  END IF;

  IF (
    SELECT count(*)
    FROM public.map_entities retired
    JOIN public.map_entity_geometries geometry
      ON geometry.entity_id = retired.id
      AND geometry.project_id = retired.project_id
      AND geometry.is_current = true
    WHERE retired.project_id = v_project.id
      AND upper(retired.public_identifier) = ANY (ARRAY[
        'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
      ])
  ) <> 5 THEN
    RAISE EXCEPTION 'EXPORURAL_RETIRED_ENTITY_GEOMETRY_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.commercial_lots lot
    LEFT JOIN public.map_entities retired ON retired.id = lot.entity_id
    WHERE lot.project_id = v_project.id
      AND (
        upper(lot.public_identifier) = ANY (ARRAY[
          'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
        ])
        OR (
          retired.project_id = v_project.id
          AND upper(retired.public_identifier) = ANY (ARRAY[
            'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
          ])
        )
      )
  ) THEN
    RAISE EXCEPTION 'EXPORURAL_RETIRED_ENTITY_HAS_COMMERCIAL_LOT';
  END IF;

  SELECT coalesce(array_agg(entity.id), '{}'::uuid[])
  INTO v_excluded_entity_ids
  FROM public.map_entities entity
  WHERE entity.project_id = v_project.id
    AND (
      upper(entity.public_identifier) IN (
        SELECT upper(trim(item->>'publicIdentifier'))
        FROM jsonb_array_elements(p_entities) item
      )
      OR upper(entity.public_identifier) = ANY (ARRAY[
        'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
      ])
    );

  IF EXISTS (
    WITH candidates AS (
      SELECT
        upper(item->>'publicIdentifier') AS identifier,
        item->>'classification' AS classification,
        extensions.ST_SetSRID(
          extensions.ST_GeomFromGeoJSON(
            jsonb_build_object(
              'type', 'Polygon',
              'coordinates', item#>'{geometry,coordinates}'
            )::text
          ),
          0
        ) AS geom
      FROM jsonb_array_elements(p_entities) item
    )
    SELECT 1
    FROM candidates
    WHERE NOT extensions.ST_IsValid(geom)
      OR extensions.ST_IsEmpty(geom)
      OR extensions.ST_Area(geom) <= 0.00000001
  ) THEN
    RAISE EXCEPTION 'INVALID_EXPORURAL_GEOMETRY';
  END IF;

  IF EXISTS (
    WITH lots AS (
      SELECT
        upper(item->>'publicIdentifier') AS identifier,
        extensions.ST_SetSRID(
          extensions.ST_GeomFromGeoJSON(
            jsonb_build_object('type', 'Polygon', 'coordinates', item#>'{geometry,coordinates}')::text
          ),
          0
        ) AS geom
      FROM jsonb_array_elements(p_entities) item
      WHERE item->>'classification' = 'SELLABLE_LOT'
    )
    SELECT 1
    FROM lots a
    JOIN lots b ON a.identifier < b.identifier
    WHERE extensions.ST_Area(extensions.ST_Intersection(a.geom, b.geom)) > 0.00000001
  ) THEN
    RAISE EXCEPTION 'EXPORURAL_LOT_OVERLAP';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_entities) item
    WHERE item->>'classification' = 'SELLABLE_LOT'
      AND public.map_geometry_overlaps_sellable(
        v_project.id,
        jsonb_build_object(
          'type', 'Polygon',
          'coordinates', item#>'{geometry,coordinates}'
        ),
        v_excluded_entity_ids
      )
  ) THEN
    RAISE EXCEPTION 'EXPORURAL_PERSISTED_SELLABLE_OVERLAP';
  END IF;

  IF EXISTS (
    WITH candidates AS (
      SELECT
        upper(item->>'publicIdentifier') AS identifier,
        item->>'classification' AS classification,
        extensions.ST_SetSRID(
          extensions.ST_GeomFromGeoJSON(
            jsonb_build_object('type', 'Polygon', 'coordinates', item#>'{geometry,coordinates}')::text
          ),
          0
        ) AS geom
      FROM jsonb_array_elements(p_entities) item
    )
    SELECT 1
    FROM candidates lot
    JOIN candidates road ON road.classification = 'ROAD'
    WHERE lot.classification = 'SELLABLE_LOT'
      AND extensions.ST_Area(extensions.ST_Intersection(lot.geom, road.geom)) > 0.00000001
  ) THEN
    RAISE EXCEPTION 'EXPORURAL_LOT_ROAD_OVERLAP';
  END IF;

  IF EXISTS (
    WITH incoming_lots AS (
      SELECT extensions.ST_SetSRID(
        extensions.ST_GeomFromGeoJSON(
          jsonb_build_object('type', 'Polygon', 'coordinates', item#>'{geometry,coordinates}')::text
        ),
        0
      ) AS geom
      FROM jsonb_array_elements(p_entities) item
      WHERE item->>'classification' = 'SELLABLE_LOT'
    )
    SELECT 1
    FROM incoming_lots incoming
    JOIN public.map_entities protected
      ON protected.project_id = v_project.id
      AND protected.public_identifier IN ('B7', 'B8', 'D3')
      AND protected.is_archived = false
    JOIN public.map_entity_geometries protected_geometry
      ON protected_geometry.entity_id = protected.id
      AND protected_geometry.is_current = true
    WHERE extensions.ST_Area(
      extensions.ST_Intersection(incoming.geom, protected_geometry.native_geometry)
    ) > 0.00000001
  ) THEN
    RAISE EXCEPTION 'EXPORURAL_PROTECTED_STRUCTURE_OVERLAP';
  END IF;

  WITH target_identifiers AS (
    SELECT upper(trim(item->>'publicIdentifier')) AS identifier
    FROM jsonb_array_elements(p_entities) item
  ),
  retired_identifiers AS (
    SELECT unnest(ARRAY[
      'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
    ]) AS identifier
  ),
  affected_entities AS (
    SELECT entity.*
    FROM public.map_entities entity
    WHERE entity.project_id = v_project.id
      AND (
        upper(entity.public_identifier) IN (SELECT identifier FROM target_identifiers)
        OR upper(entity.public_identifier) IN (SELECT identifier FROM retired_identifiers)
      )
  ),
  affected_lots AS (
    SELECT lot.*
    FROM public.commercial_lots lot
    WHERE lot.project_id = v_project.id
      AND (
        lot.entity_id IN (SELECT id FROM affected_entities)
        OR upper(lot.public_identifier) IN (
          SELECT upper(trim(item->>'publicIdentifier'))
          FROM jsonb_array_elements(p_lots) item
        )
      )
  )
  INSERT INTO public.map_reference_migration_snapshots (
    org_id, project_id, area_code, source_revision, payload_hash,
    status, snapshot, created_by
  )
  SELECT
    p_org_id,
    v_project.id,
    'EXPORURAL',
    p_source_revision,
    v_payload_hash,
    'PENDING',
    jsonb_build_object(
      'schemaVersion', 3,
      'project', to_jsonb(v_project),
      'calibrations', coalesce((
        SELECT jsonb_agg(to_jsonb(calibration) ORDER BY calibration.version)
        FROM public.map_calibrations calibration
        WHERE calibration.project_id = v_project.id
      ), '[]'::jsonb),
      'entities', coalesce((
        SELECT jsonb_agg(to_jsonb(entity) ORDER BY entity.public_identifier)
        FROM affected_entities entity
      ), '[]'::jsonb),
      'geometries', coalesce((
        SELECT jsonb_agg((to_jsonb(geometry) - 'native_geometry') ORDER BY geometry.entity_id)
        FROM public.map_entity_geometries geometry
        WHERE geometry.entity_id IN (SELECT id FROM affected_entities)
          AND geometry.is_current = true
      ), '[]'::jsonb),
      'geometryVersions', coalesce((
        SELECT jsonb_agg(to_jsonb(version) ORDER BY version.entity_id, version.version)
        FROM public.map_geometry_versions version
        WHERE version.entity_id IN (SELECT id FROM affected_entities)
      ), '[]'::jsonb),
      'lots', coalesce((
        SELECT jsonb_agg(to_jsonb(lot) ORDER BY lot.public_identifier)
        FROM affected_lots lot
      ), '[]'::jsonb),
      'lotPrices', coalesce((
        SELECT jsonb_agg(to_jsonb(price) ORDER BY price.created_at)
        FROM public.lot_prices price
        WHERE price.lot_id IN (SELECT id FROM affected_lots)
      ), '[]'::jsonb),
      'lotReservations', coalesce((
        SELECT jsonb_agg(to_jsonb(reservation) ORDER BY reservation.created_at)
        FROM public.lot_reservations reservation
        WHERE reservation.lot_id IN (SELECT id FROM affected_lots)
      ), '[]'::jsonb),
      'lotNegotiations', coalesce((
        SELECT jsonb_agg(to_jsonb(negotiation) ORDER BY negotiation.created_at)
        FROM public.lot_negotiations negotiation
        WHERE negotiation.lot_id IN (SELECT id FROM affected_lots)
      ), '[]'::jsonb),
      'lotSales', coalesce((
        SELECT jsonb_agg(to_jsonb(sale) ORDER BY sale.created_at)
        FROM public.lot_sales sale
        WHERE sale.lot_id IN (SELECT id FROM affected_lots)
      ), '[]'::jsonb),
      'lotContracts', coalesce((
        SELECT jsonb_agg(to_jsonb(contract) ORDER BY contract.created_at)
        FROM public.lot_contracts contract
        WHERE contract.lot_id IN (SELECT id FROM affected_lots)
      ), '[]'::jsonb),
      'lotContractVersions', coalesce((
        SELECT jsonb_agg(to_jsonb(contract_version) ORDER BY contract_version.contract_id, contract_version.version)
        FROM public.lot_contract_versions contract_version
        WHERE contract_version.contract_id IN (
          SELECT contract.id
          FROM public.lot_contracts contract
          WHERE contract.lot_id IN (SELECT id FROM affected_lots)
        )
      ), '[]'::jsonb),
      'lotStatusHistory', coalesce((
        SELECT jsonb_agg(to_jsonb(history) ORDER BY history.changed_at)
        FROM public.lot_status_history history
        WHERE history.lot_id IN (SELECT id FROM affected_lots)
      ), '[]'::jsonb),
      'lotLineage', coalesce((
        SELECT jsonb_agg(to_jsonb(lineage) ORDER BY lineage.created_at)
        FROM public.map_lot_lineage lineage
        WHERE lineage.source_lot_id IN (SELECT id FROM affected_lots)
          OR lineage.target_lot_id IN (SELECT id FROM affected_lots)
      ), '[]'::jsonb),
      'targetIdentifiers', (
        SELECT jsonb_agg(identifier ORDER BY identifier)
        FROM target_identifiers
      ),
      'retiredIdentifiers', (
        SELECT jsonb_agg(identifier ORDER BY identifier)
        FROM retired_identifiers
      )
    ),
    auth.uid()
  RETURNING id INTO v_snapshot_id;

  SELECT *
  INTO v_current_calibration
  FROM public.map_calibrations
  WHERE project_id = v_project.id
  ORDER BY version DESC
  LIMIT 1
  FOR UPDATE;

  SELECT *
  INTO v_technical_calibration
  FROM public.map_calibrations
  WHERE project_id = v_project.id
    AND status = 'VALIDATED'
    AND map_units_per_meter = v_map_units_per_meter
    AND known_distance_meters = v_primary_control_distance_meters
    AND point_a = v_primary_control_point_a
    AND point_b = v_primary_control_point_b
  ORDER BY version DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_calibration_id := v_technical_calibration.id;
    v_calibration_version := v_technical_calibration.version;
  ELSE
    SELECT coalesce(max(version), 0) + 1
    INTO v_calibration_version
    FROM public.map_calibrations
    WHERE project_id = v_project.id;

    INSERT INTO public.map_calibrations (
      project_id, reference_image_path, opacity, is_locked,
      image_offset_x, image_offset_y, image_scale_x, image_scale_y,
      image_rotation_degrees, point_a, point_b, known_distance_meters,
      map_units_per_meter, status, version, invalidated_reason, created_by
    ) VALUES (
      v_project.id,
      v_current_calibration.reference_image_path,
      coalesce(v_current_calibration.opacity, 0.2),
      true,
      coalesce(v_current_calibration.image_offset_x, 0),
      coalesce(v_current_calibration.image_offset_y, 0),
      coalesce(v_current_calibration.image_scale_x, 1),
      coalesce(v_current_calibration.image_scale_y, 1),
      coalesce(v_current_calibration.image_rotation_degrees, 0),
      v_primary_control_point_a,
      v_primary_control_point_b,
      v_primary_control_distance_meters,
      v_map_units_per_meter,
      'VALIDATED',
      v_calibration_version,
      NULL,
      auth.uid()
    )
    RETURNING id INTO v_calibration_id;
    v_calibration_created := true;
  END IF;

  IF abs(
    sqrt(
      power((v_primary_control_point_b->>0)::numeric - (v_primary_control_point_a->>0)::numeric, 2)
      + power((v_primary_control_point_b->>1)::numeric - (v_primary_control_point_a->>1)::numeric, 2)
    ) / v_primary_control_distance_meters
    - v_map_units_per_meter
  ) > 0.000000001 THEN
    RAISE EXCEPTION 'EXPORURAL_TECHNICAL_CALIBRATION_INVALID';
  END IF;

  UPDATE public.map_entities retired
  SET is_archived = true,
      verification_status = 'ARCHIVED',
      segment_id = NULL,
      metadata = (
        COALESCE(retired.metadata, '{}'::jsonb)
          - 'segmentId'
          - 'segmentCode'
          - 'segmentName'
      ) || jsonb_build_object(
        'archivedByReferenceRevision', p_source_revision,
        'migrationSnapshotId', v_snapshot_id,
        'removedFromExporuralSegment', true,
        'archiveReason', 'OFFICIAL_EXPORURAL_2026_4_REFERENCE_REMOVAL'
      ),
      updated_by = auth.uid(),
      updated_at = now()
  WHERE retired.project_id = v_project.id
    AND lower(coalesce(retired.metadata->>'seedManaged', 'false')) = 'true'
    AND upper(coalesce(retired.metadata->>'areaCode', '')) = 'EXPORURAL'
    AND retired.is_sellable IS NOT DISTINCT FROM false
    AND retired.classification IS DISTINCT FROM 'SELLABLE_LOT'
    AND upper(retired.public_identifier) = ANY (ARRAY[
      'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
    ]);
  GET DIAGNOSTICS v_retired_archived = ROW_COUNT;

  IF v_retired_archived <> 5 THEN
    RAISE EXCEPTION 'EXPORURAL_RETIRED_ENTITY_ARCHIVE_COUNT_MISMATCH:%', v_retired_archived;
  END IF;

  FOR v_entity IN
    SELECT value
    FROM jsonb_array_elements(p_entities)
    ORDER BY CASE
      WHEN value->>'publicIdentifier' = 'EXPORURAL' THEN 0
      WHEN value->>'publicIdentifier' IN ('QUADRA-R', 'QUADRA-S') THEN 1
      ELSE 2
    END
  LOOP
    v_identifier := upper(trim(v_entity->>'publicIdentifier'));
    v_layer_key := trim(v_entity->>'layerKey');
    v_parent_identifier := nullif(trim(v_entity->>'parentPublicIdentifier'), '');
    v_geometry := jsonb_build_object(
      'type', 'Polygon',
      'coordinates', v_entity#>'{geometry,coordinates}'
    );
    v_metadata := v_entity->'metadata' || jsonb_build_object(
      'technicalCalibrationVersion', v_calibration_version,
      'mapUnitsPerMeter', v_map_units_per_meter,
      'calculatedAreaSource', 'POSTGIS_VALIDATED_CALIBRATION',
      'migrationSnapshotId', v_snapshot_id
    );

    SELECT id INTO v_layer_id
    FROM public.map_layers
    WHERE project_id = v_project.id AND layer_key = v_layer_key;
    IF v_layer_id IS NULL THEN RAISE EXCEPTION 'EXPORURAL_LAYER_NOT_FOUND:%', v_layer_key; END IF;

    v_parent_id := NULL;
    IF v_parent_identifier IS NOT NULL THEN
      SELECT id INTO v_parent_id
      FROM public.map_entities
      WHERE project_id = v_project.id
        AND upper(public_identifier) = upper(v_parent_identifier)
        AND is_archived = false;
      IF v_parent_id IS NULL THEN
        RAISE EXCEPTION 'EXPORURAL_PARENT_NOT_FOUND:%:%', v_identifier, v_parent_identifier;
      END IF;
    END IF;

    SELECT * INTO v_existing
    FROM public.map_entities
    WHERE project_id = v_project.id AND upper(public_identifier) = v_identifier
    FOR UPDATE;

    IF FOUND AND v_existing.metadata->>'seedManaged' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'EXPORURAL_MANUAL_ENTITY_CONFLICT:%', v_identifier;
    END IF;

    IF v_existing.id IS NULL THEN
      INSERT INTO public.map_entities (
        project_id, layer_id, parent_entity_id, public_identifier, name, description,
        classification, verification_status, is_sellable, is_archived, metadata,
        created_by, updated_by
      ) VALUES (
        v_project.id,
        v_layer_id,
        v_parent_id,
        v_identifier,
        v_entity->>'name',
        nullif(v_entity->>'description', ''),
        v_entity->>'classification',
        v_entity->>'verificationStatus',
        coalesce((v_entity->>'isSellable')::boolean, false),
        false,
        v_metadata || jsonb_build_object(
          'createdByExporuralSnapshotId', v_snapshot_id,
          'createdByReferenceRevision', p_source_revision
        ),
        auth.uid(),
        auth.uid()
      )
      RETURNING id INTO v_entity_id;
      v_inserted_entity_ids := array_append(v_inserted_entity_ids, v_entity_id);
      v_inserted := v_inserted + 1;
    ELSE
      v_entity_id := v_existing.id;
      UPDATE public.map_entities
      SET layer_id = v_layer_id,
          parent_entity_id = v_parent_id,
          name = v_entity->>'name',
          description = nullif(v_entity->>'description', ''),
          classification = v_entity->>'classification',
          verification_status = v_entity->>'verificationStatus',
          is_sellable = coalesce((v_entity->>'isSellable')::boolean, false),
          is_archived = false,
          metadata = (
            map_entities.metadata
            - 'rolledBackBySnapshotId'
            - 'rolledBackAt'
          ) || v_metadata,
          updated_by = auth.uid(),
          updated_at = now()
      WHERE id = v_entity_id;
      v_updated := v_updated + 1;
    END IF;

    SELECT * INTO v_current_geometry
    FROM public.map_entity_geometries
    WHERE entity_id = v_entity_id AND is_current = true
    FOR UPDATE;

    IF v_current_geometry.id IS NULL THEN
      SELECT coalesce(max(version), 0) + 1
      INTO v_geometry_version
      FROM (
        SELECT version
        FROM public.map_entity_geometries
        WHERE entity_id = v_entity_id
        UNION ALL
        SELECT version
        FROM public.map_geometry_versions
        WHERE entity_id = v_entity_id
      ) versions;

      INSERT INTO public.map_entity_geometries (
        project_id, entity_id, geometry, elevation, extrusion_height, rotation,
        calibration_version, version, is_current, change_reason, created_by
      ) VALUES (
        v_project.id,
        v_entity_id,
        v_geometry,
        coalesce((v_entity#>>'{geometry,elevation}')::numeric, 0),
        coalesce((v_entity#>>'{geometry,extrusionHeight}')::numeric, 0.15),
        coalesce((v_entity#>>'{geometry,rotation}')::numeric, 0),
        v_calibration_version,
        v_geometry_version,
        true,
        'Implantação direcionada Exporural 2026.4; snapshot ' || v_snapshot_id,
        auth.uid()
      );
      v_geometry_updates := v_geometry_updates + 1;
    ELSE
      v_geometry_changed :=
        v_current_geometry.geometry IS DISTINCT FROM v_geometry
        OR v_current_geometry.elevation IS DISTINCT FROM coalesce((v_entity#>>'{geometry,elevation}')::numeric, 0)
        OR v_current_geometry.extrusion_height IS DISTINCT FROM coalesce((v_entity#>>'{geometry,extrusionHeight}')::numeric, 0.15)
        OR v_current_geometry.rotation IS DISTINCT FROM coalesce((v_entity#>>'{geometry,rotation}')::numeric, 0);
      v_calibration_changed :=
        v_current_geometry.calibration_version IS DISTINCT FROM v_calibration_version;

      IF v_calibration_changed AND NOT v_geometry_changed THEN
        INSERT INTO public.map_geometry_versions (
          geometry_id, project_id, entity_id, geometry, elevation, extrusion_height,
          rotation, calibration_version, version, change_reason, created_by, created_at
        ) VALUES (
          v_current_geometry.id,
          v_current_geometry.project_id,
          v_current_geometry.entity_id,
          v_current_geometry.geometry,
          v_current_geometry.elevation,
          v_current_geometry.extrusion_height,
          v_current_geometry.rotation,
          v_current_geometry.calibration_version,
          v_current_geometry.version,
          v_current_geometry.change_reason,
          v_current_geometry.created_by,
          v_current_geometry.created_at
        );
      END IF;

      IF v_geometry_changed OR v_calibration_changed THEN
      UPDATE public.map_entity_geometries
      SET geometry = v_geometry,
          elevation = coalesce((v_entity#>>'{geometry,elevation}')::numeric, 0),
          extrusion_height = coalesce((v_entity#>>'{geometry,extrusionHeight}')::numeric, 0.15),
          rotation = coalesce((v_entity#>>'{geometry,rotation}')::numeric, 0),
          calibration_version = v_calibration_version,
          version = v_current_geometry.version + 1,
          change_reason = 'Revisão dirigida Exporural 2026.4; snapshot ' || v_snapshot_id,
          created_by = auth.uid(),
          updated_at = now()
      WHERE id = v_current_geometry.id;
      v_geometry_updates := v_geometry_updates + 1;
      END IF;
    END IF;
  END LOOP;

  FOR v_lot IN SELECT value FROM jsonb_array_elements(p_lots)
  LOOP
    v_identifier := upper(trim(v_lot->>'publicIdentifier'));
    v_official_area := (v_lot->>'officialAreaSqm')::numeric;

    SELECT
      entity.id,
      extensions.ST_Area(geometry.native_geometry)
        / (calibration.map_units_per_meter * calibration.map_units_per_meter)
    INTO v_entity_id, v_calculated_area
    FROM public.map_entities entity
    JOIN public.map_entity_geometries geometry
      ON geometry.entity_id = entity.id AND geometry.is_current = true
    JOIN public.map_calibrations calibration
      ON calibration.project_id = geometry.project_id
      AND calibration.version = geometry.calibration_version
      AND calibration.status = 'VALIDATED'
    WHERE entity.project_id = v_project.id
      AND upper(entity.public_identifier) = v_identifier
      AND entity.is_archived = false
      AND entity.classification = 'SELLABLE_LOT'
      AND entity.is_sellable = true;

    IF v_entity_id IS NULL OR v_calculated_area IS NULL THEN
      RAISE EXCEPTION 'EXPORURAL_LOT_ENTITY_OR_CALIBRATION_NOT_FOUND:%', v_identifier;
    END IF;

    v_area_difference_percent := abs(v_calculated_area - v_official_area) / v_official_area * 100;
    IF v_area_difference_percent > 0.15 THEN
      RAISE EXCEPTION 'EXPORURAL_PERSISTED_AREA_TOLERANCE_EXCEEDED:%:%',
        v_identifier, v_area_difference_percent;
    END IF;

    IF jsonb_typeof(coalesce(v_lot->'infrastructure', '[]'::jsonb)) <> 'array' THEN
      RAISE EXCEPTION 'INVALID_EXPORURAL_LOT_INFRASTRUCTURE:%', v_identifier;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.commercial_lots conflict
      WHERE conflict.project_id = v_project.id
        AND upper(conflict.public_identifier) = v_identifier
        AND conflict.entity_id <> v_entity_id
    ) THEN
      RAISE EXCEPTION 'EXPORURAL_COMMERCIAL_LOT_IDENTITY_CONFLICT:%', v_identifier;
    END IF;

    SELECT *
    INTO v_existing_lot
    FROM public.commercial_lots
    WHERE entity_id = v_entity_id
    FOR UPDATE;

    IF v_existing_lot.id IS NULL THEN
      INSERT INTO public.commercial_lots (
        project_id, entity_id, public_identifier, block, lot_number, level_label,
        display_name, description, status, official_area_sqm, calculated_area_sqm,
        area_validation_status, infrastructure, has_electricity, has_water,
        has_internet, is_corner, is_covered, accessibility_notes, created_by, updated_by
      ) VALUES (
        v_project.id,
        v_entity_id,
        v_identifier,
        nullif(trim(v_lot->>'block'), ''),
        nullif(trim(v_lot->>'lotNumber'), ''),
        nullif(trim(v_lot->>'levelLabel'), ''),
        coalesce(nullif(trim(v_lot->>'displayName'), ''), v_identifier),
        nullif(trim(v_lot->>'description'), ''),
        'BLOCKED',
        v_official_area,
        round(v_calculated_area, 4),
        'VALIDATED',
        coalesce(v_lot->'infrastructure', '[]'::jsonb),
        coalesce((nullif(v_lot->>'hasElectricity', ''))::boolean, false),
        coalesce((nullif(v_lot->>'hasWater', ''))::boolean, false),
        coalesce((nullif(v_lot->>'hasInternet', ''))::boolean, false),
        coalesce((nullif(v_lot->>'isCorner', ''))::boolean, false),
        coalesce((nullif(v_lot->>'isCovered', ''))::boolean, false),
        nullif(trim(v_lot->>'accessibilityNotes'), ''),
        auth.uid(),
        auth.uid()
      )
      RETURNING id INTO v_lot_id;
      v_inserted_lot_ids := array_append(v_inserted_lot_ids, v_lot_id);

      INSERT INTO public.lot_prices (
        lot_id, pricing_mode, base_price, price_per_sqm, asking_price,
        minimum_price, is_active, created_by
      ) VALUES (
        v_lot_id, 'NOT_FOR_SALE', NULL, NULL, NULL, NULL, true, auth.uid()
      )
      RETURNING id INTO v_auxiliary_id;
      v_inserted_price_ids := array_append(v_inserted_price_ids, v_auxiliary_id);

      INSERT INTO public.lot_status_history (
        lot_id, previous_status, new_status, reason, changed_by
      ) VALUES (
        v_lot_id,
        NULL,
        'BLOCKED',
        'Lote cadastral Exporural 2026.4 criado bloqueado; snapshot ' || v_snapshot_id,
        auth.uid()
      )
      RETURNING id INTO v_auxiliary_id;
      v_inserted_status_history_ids := array_append(v_inserted_status_history_ids, v_auxiliary_id);
    ELSE
      v_lot_id := v_existing_lot.id;
      UPDATE public.commercial_lots
      SET public_identifier = v_identifier,
          block = nullif(trim(v_lot->>'block'), ''),
          lot_number = nullif(trim(v_lot->>'lotNumber'), ''),
          level_label = nullif(trim(v_lot->>'levelLabel'), ''),
          display_name = coalesce(nullif(trim(v_lot->>'displayName'), ''), v_identifier),
          description = nullif(trim(v_lot->>'description'), ''),
          official_area_sqm = v_official_area,
          calculated_area_sqm = round(v_calculated_area, 4),
          area_validation_status = 'VALIDATED',
          updated_by = auth.uid(),
          updated_at = now()
      WHERE id = v_existing_lot.id;
    END IF;

    v_lot_updates := v_lot_updates + 1;
  END LOOP;

  UPDATE public.map_projects
  SET reference_revision = p_source_revision,
      active_version = greatest(active_version + 1, 5),
      is_published = false,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = v_project.id
  RETURNING * INTO v_project;

  v_applied_at := clock_timestamp();
  v_metadata := jsonb_build_object(
    'projectId', v_project.id,
    'snapshotId', v_snapshot_id,
    'referenceRevision', p_source_revision,
    'geometryRevision', '2026.4-exporural.1',
    'changed', true,
    'entitiesInserted', v_inserted,
    'entitiesUpdated', v_updated,
    'geometriesVersioned', v_geometry_updates,
    'lotsValidated', v_lot_updates,
    'commercialLotsPreserved', 95,
    'retiredSeedEntitiesArchived', v_retired_archived,
    'retiredIdentifiers', jsonb_build_array(
      'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
    ),
    'calibrationId', v_calibration_id,
    'calibrationVersion', v_calibration_version,
    'calibrationCreated', v_calibration_created,
    'mapUnitsPerMeter', v_map_units_per_meter,
    'calibrationEvidence', jsonb_build_object(
      'source', 'Anexos cadastrais Exporural 2026',
      'primaryControlMeters', v_primary_control_distance_meters,
      'pointA', v_primary_control_point_a,
      'pointB', v_primary_control_point_b,
      'repeatedControls', jsonb_build_array(
        'Quadra S: módulos repetidos de 30,00 m x 15,00 m',
        'Quadra R: módulos oficiais de 500,00 m2',
        'Corredores transversais cotados em 6,00 m'
      )
    ),
    'insertedEntityIds', to_jsonb(v_inserted_entity_ids),
    'insertedLotIds', to_jsonb(v_inserted_lot_ids),
    'insertedPriceIds', to_jsonb(v_inserted_price_ids),
    'insertedStatusHistoryIds', to_jsonb(v_inserted_status_history_ids),
    'insertedLineageIds', to_jsonb(v_inserted_lineage_ids),
    'projectVersionAfter', v_project.active_version,
    'appliedAt', v_applied_at
  );

  UPDATE public.map_reference_migration_snapshots
  SET status = 'APPLIED',
      apply_result = v_metadata,
      applied_at = v_applied_at
  WHERE id = v_snapshot_id;

  INSERT INTO public.map_activity_logs (
    org_id, project_id, action, reason, before_state, after_state, actor_user_id
  ) VALUES (
    p_org_id,
    v_project.id,
    'EXPORURAL_REFERENCE_2026_APPLIED',
    'Revisão cartográfica oficial Exporural 2026.4; cinco estruturas seed não comerciais removidas',
    (SELECT snapshot->'project' FROM public.map_reference_migration_snapshots WHERE id = v_snapshot_id),
    v_metadata,
    auth.uid()
  );

  RETURN v_metadata;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_exporural_reference_2026(uuid, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_exporural_reference_2026(uuid, text, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.rollback_exporural_reference_2026(
  p_org_id uuid,
  p_snapshot_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_snapshot public.map_reference_migration_snapshots%ROWTYPE;
  v_project public.map_projects%ROWTYPE;
  v_before_project public.map_projects%ROWTYPE;
  v_before_entity public.map_entities%ROWTYPE;
  v_before_geometry public.map_entity_geometries%ROWTYPE;
  v_current_geometry public.map_entity_geometries%ROWTYPE;
  v_before_lot public.commercial_lots%ROWTYPE;
  v_current_lot public.commercial_lots%ROWTYPE;
  v_item jsonb;
  v_applied_at timestamptz;
  v_inserted_id uuid;
  v_geometry_changed boolean;
  v_calibration_changed boolean;
  v_entities_restored integer := 0;
  v_geometries_restored integer := 0;
  v_lots_restored integer := 0;
  v_created_entities_archived integer := 0;
  v_created_lots_archived integer := 0;
  v_retired_tombstones_preserved integer := 0;
  v_calibration_invalidated boolean := false;
  v_result jsonb;
BEGIN
  IF p_org_id IS NULL
    OR NOT public.map_has_explicit_capability(p_org_id, 'map.admin')
  THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'EXPORURAL_ROLLBACK_REASON_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('commercial-map:exporural:' || p_org_id::text, 0)
  );

  SELECT *
  INTO v_snapshot
  FROM public.map_reference_migration_snapshots
  WHERE id = p_snapshot_id
    AND org_id = p_org_id
    AND area_code = 'EXPORURAL'
    AND source_revision IN ('2026.3', '2026.4')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXPORURAL_ROLLBACK_SNAPSHOT_NOT_FOUND';
  END IF;
  IF v_snapshot.status = 'ROLLED_BACK' THEN
    RETURN jsonb_build_object(
      'projectId', v_snapshot.project_id,
      'snapshotId', v_snapshot.id,
      'referenceRevision', v_snapshot.source_revision,
      'changed', false,
      'rolledBackAt', v_snapshot.rolled_back_at
    );
  END IF;
  IF v_snapshot.status <> 'APPLIED' OR v_snapshot.applied_at IS NULL THEN
    RAISE EXCEPTION 'EXPORURAL_ROLLBACK_SNAPSHOT_NOT_APPLIED';
  END IF;

  SELECT *
  INTO v_project
  FROM public.map_projects
  WHERE id = v_snapshot.project_id
    AND org_id = p_org_id
    AND is_archived = false
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MAP_PROJECT_NOT_FOUND';
  END IF;

  SELECT *
  INTO v_before_project
  FROM jsonb_populate_record(
    NULL::public.map_projects,
    v_snapshot.snapshot->'project'
  );
  v_applied_at := v_snapshot.applied_at;

  IF v_project.reference_revision IS DISTINCT FROM v_snapshot.source_revision
    OR v_project.active_version IS DISTINCT FROM
      nullif(v_snapshot.apply_result->>'projectVersionAfter', '')::integer
    OR v_project.updated_at > v_applied_at
  THEN
    RAISE EXCEPTION 'EXPORURAL_ROLLBACK_PROJECT_DRIFT';
  END IF;

  IF EXISTS (
    WITH affected_entity_ids AS (
      SELECT (item->>'id')::uuid AS id
      FROM jsonb_array_elements(v_snapshot.snapshot->'entities') item
      UNION
      SELECT value::uuid
      FROM jsonb_array_elements_text(
        coalesce(v_snapshot.apply_result->'insertedEntityIds', '[]'::jsonb)
      ) value
    )
    SELECT 1
    FROM public.map_entities entity
    WHERE entity.id IN (SELECT id FROM affected_entity_ids)
      AND entity.updated_at > v_applied_at
  ) OR EXISTS (
    WITH affected_entity_ids AS (
      SELECT (item->>'id')::uuid AS id
      FROM jsonb_array_elements(v_snapshot.snapshot->'entities') item
      UNION
      SELECT value::uuid
      FROM jsonb_array_elements_text(
        coalesce(v_snapshot.apply_result->'insertedEntityIds', '[]'::jsonb)
      ) value
    )
    SELECT 1
    FROM public.map_entity_geometries geometry
    WHERE geometry.entity_id IN (SELECT id FROM affected_entity_ids)
      AND geometry.is_current = true
      AND geometry.updated_at > v_applied_at
  ) OR EXISTS (
    WITH affected_lot_ids AS (
      SELECT (item->>'id')::uuid AS id
      FROM jsonb_array_elements(v_snapshot.snapshot->'lots') item
      UNION
      SELECT value::uuid
      FROM jsonb_array_elements_text(
        coalesce(v_snapshot.apply_result->'insertedLotIds', '[]'::jsonb)
      ) value
    )
    SELECT 1
    FROM public.commercial_lots lot
    WHERE lot.id IN (SELECT id FROM affected_lot_ids)
      AND lot.updated_at > v_applied_at
  ) THEN
    RAISE EXCEPTION 'EXPORURAL_ROLLBACK_MAP_STATE_DRIFT';
  END IF;

  IF EXISTS (
    WITH affected_lot_ids AS (
      SELECT (item->>'id')::uuid AS id
      FROM jsonb_array_elements(v_snapshot.snapshot->'lots') item
      UNION
      SELECT value::uuid
      FROM jsonb_array_elements_text(
        coalesce(v_snapshot.apply_result->'insertedLotIds', '[]'::jsonb)
      ) value
    )
    SELECT 1
    FROM public.lot_prices price
    WHERE price.lot_id IN (SELECT id FROM affected_lot_ids)
      AND price.created_at > v_applied_at
    UNION ALL
    SELECT 1
    FROM public.lot_reservations reservation
    WHERE reservation.lot_id IN (SELECT id FROM affected_lot_ids)
      AND greatest(reservation.created_at, reservation.updated_at) > v_applied_at
    UNION ALL
    SELECT 1
    FROM public.lot_negotiations negotiation
    WHERE negotiation.lot_id IN (SELECT id FROM affected_lot_ids)
      AND greatest(negotiation.created_at, negotiation.updated_at) > v_applied_at
    UNION ALL
    SELECT 1
    FROM public.lot_sales sale
    WHERE sale.lot_id IN (SELECT id FROM affected_lot_ids)
      AND greatest(sale.created_at, coalesce(sale.reverted_at, sale.created_at)) > v_applied_at
    UNION ALL
    SELECT 1
    FROM public.lot_contracts contract
    WHERE contract.lot_id IN (SELECT id FROM affected_lot_ids)
      AND greatest(contract.created_at, contract.updated_at) > v_applied_at
    UNION ALL
    SELECT 1
    FROM public.lot_contract_versions contract_version
    JOIN public.lot_contracts contract ON contract.id = contract_version.contract_id
    WHERE contract.lot_id IN (SELECT id FROM affected_lot_ids)
      AND contract_version.uploaded_at > v_applied_at
    UNION ALL
    SELECT 1
    FROM public.lot_status_history history
    WHERE history.lot_id IN (SELECT id FROM affected_lot_ids)
      AND history.changed_at > v_applied_at
    UNION ALL
    SELECT 1
    FROM public.map_lot_lineage lineage
    WHERE (
        lineage.source_lot_id IN (SELECT id FROM affected_lot_ids)
        OR lineage.target_lot_id IN (SELECT id FROM affected_lot_ids)
      )
      AND lineage.created_at > v_applied_at
  ) THEN
    RAISE EXCEPTION 'EXPORURAL_ROLLBACK_COMMERCIAL_STATE_DRIFT';
  END IF;

  DELETE FROM public.map_lot_lineage
  WHERE id IN (
    SELECT value::uuid
    FROM jsonb_array_elements_text(
      coalesce(v_snapshot.apply_result->'insertedLineageIds', '[]'::jsonb)
    ) value
  );

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(v_snapshot.snapshot->'entities')
  LOOP
    SELECT *
    INTO v_before_entity
    FROM jsonb_populate_record(NULL::public.map_entities, v_item);

    -- The five explicit removals are a semantic invariant of the official
    -- reference, not geometry to be reactivated. A 2026.4 rollback therefore
    -- keeps their audited tombstones while restoring the other 111 entities.
    IF v_snapshot.source_revision = '2026.4'
      AND upper(v_before_entity.public_identifier) = ANY (ARRAY[
        'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
      ])
    THEN
      UPDATE public.map_entities retired
      SET is_archived = true,
          verification_status = 'ARCHIVED',
          segment_id = NULL,
          metadata = (
            COALESCE(retired.metadata, '{}'::jsonb)
              - 'segmentId'
              - 'segmentCode'
              - 'segmentName'
          ) || jsonb_build_object(
            'archivedByReferenceRevision', v_snapshot.source_revision,
            'migrationSnapshotId', v_snapshot.id,
            'removedFromExporuralSegment', true,
            'archiveReason', 'OFFICIAL_EXPORURAL_2026_4_REFERENCE_REMOVAL',
            'rollbackTombstonePreservedAt', clock_timestamp(),
            'rollbackTombstoneReason', trim(p_reason)
          ),
          updated_by = auth.uid(),
          updated_at = now()
      WHERE retired.id = v_before_entity.id
        AND retired.project_id = v_project.id
        AND retired.is_archived = true
        AND retired.segment_id IS NULL
        AND retired.metadata->>'archivedByReferenceRevision' = '2026.4'
        AND retired.metadata->>'migrationSnapshotId' = v_snapshot.id::text;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'EXPORURAL_ROLLBACK_RETIRED_TOMBSTONE_DRIFT:%',
          v_before_entity.public_identifier;
      END IF;

      v_retired_tombstones_preserved := v_retired_tombstones_preserved + 1;
      CONTINUE;
    END IF;

    UPDATE public.map_entities
    SET layer_id = v_before_entity.layer_id,
        parent_entity_id = v_before_entity.parent_entity_id,
        public_identifier = v_before_entity.public_identifier,
        name = v_before_entity.name,
        description = v_before_entity.description,
        classification = v_before_entity.classification,
        verification_status = v_before_entity.verification_status,
        is_sellable = v_before_entity.is_sellable,
        is_archived = v_before_entity.is_archived,
        metadata = v_before_entity.metadata,
        updated_by = auth.uid(),
        updated_at = now()
    WHERE id = v_before_entity.id
      AND project_id = v_project.id;
    IF FOUND THEN
      v_entities_restored := v_entities_restored + 1;
    END IF;
  END LOOP;

  IF v_snapshot.source_revision = '2026.4'
    AND v_retired_tombstones_preserved <> 5
  THEN
    RAISE EXCEPTION 'EXPORURAL_ROLLBACK_RETIRED_TOMBSTONE_COUNT_MISMATCH:%',
      v_retired_tombstones_preserved;
  END IF;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(v_snapshot.snapshot->'geometries')
  LOOP
    SELECT *
    INTO v_before_geometry
    FROM jsonb_populate_record(NULL::public.map_entity_geometries, v_item);

    SELECT *
    INTO v_current_geometry
    FROM public.map_entity_geometries
    WHERE entity_id = v_before_geometry.entity_id
      AND is_current = true
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'EXPORURAL_ROLLBACK_CURRENT_GEOMETRY_MISSING:%',
        v_before_geometry.entity_id;
    END IF;

    v_geometry_changed :=
      v_current_geometry.geometry IS DISTINCT FROM v_before_geometry.geometry
      OR v_current_geometry.elevation IS DISTINCT FROM v_before_geometry.elevation
      OR v_current_geometry.extrusion_height IS DISTINCT FROM v_before_geometry.extrusion_height
      OR v_current_geometry.rotation IS DISTINCT FROM v_before_geometry.rotation;
    v_calibration_changed :=
      v_current_geometry.calibration_version IS DISTINCT FROM
        v_before_geometry.calibration_version;

    IF v_calibration_changed AND NOT v_geometry_changed THEN
      INSERT INTO public.map_geometry_versions (
        geometry_id, project_id, entity_id, geometry, elevation, extrusion_height,
        rotation, calibration_version, version, change_reason, created_by, created_at
      ) VALUES (
        v_current_geometry.id,
        v_current_geometry.project_id,
        v_current_geometry.entity_id,
        v_current_geometry.geometry,
        v_current_geometry.elevation,
        v_current_geometry.extrusion_height,
        v_current_geometry.rotation,
        v_current_geometry.calibration_version,
        v_current_geometry.version,
        v_current_geometry.change_reason,
        v_current_geometry.created_by,
        v_current_geometry.created_at
      );
    END IF;

    IF v_geometry_changed OR v_calibration_changed THEN
      UPDATE public.map_entity_geometries
      SET geometry = v_before_geometry.geometry,
          elevation = v_before_geometry.elevation,
          extrusion_height = v_before_geometry.extrusion_height,
          rotation = v_before_geometry.rotation,
          calibration_version = v_before_geometry.calibration_version,
          version = v_current_geometry.version + 1,
          change_reason = 'Rollback auditado da Exporural '
            || v_snapshot.source_revision || '; snapshot ' || v_snapshot.id,
          created_by = auth.uid(),
          created_at = now(),
          updated_at = now()
      WHERE id = v_current_geometry.id;
      v_geometries_restored := v_geometries_restored + 1;
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(v_snapshot.snapshot->'lots')
  LOOP
    SELECT *
    INTO v_before_lot
    FROM jsonb_populate_record(NULL::public.commercial_lots, v_item);

    SELECT *
    INTO v_current_lot
    FROM public.commercial_lots
    WHERE id = v_before_lot.id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'EXPORURAL_ROLLBACK_LOT_MISSING:%', v_before_lot.id;
    END IF;

    IF v_current_lot.status IS DISTINCT FROM v_before_lot.status THEN
      INSERT INTO public.lot_status_history (
        lot_id, previous_status, new_status, reason, changed_by
      ) VALUES (
        v_before_lot.id,
        v_current_lot.status,
        v_before_lot.status,
        'Rollback auditado da Exporural '
          || v_snapshot.source_revision || '; snapshot ' || v_snapshot.id,
        auth.uid()
      );
    END IF;

    UPDATE public.commercial_lots
    SET entity_id = v_before_lot.entity_id,
        public_identifier = v_before_lot.public_identifier,
        block = v_before_lot.block,
        lot_number = v_before_lot.lot_number,
        level_label = v_before_lot.level_label,
        display_name = v_before_lot.display_name,
        description = v_before_lot.description,
        status = v_before_lot.status,
        official_area_sqm = v_before_lot.official_area_sqm,
        calculated_area_sqm = v_before_lot.calculated_area_sqm,
        area_validation_status = v_before_lot.area_validation_status,
        frontage_meters = v_before_lot.frontage_meters,
        depth_meters = v_before_lot.depth_meters,
        infrastructure = v_before_lot.infrastructure,
        has_electricity = v_before_lot.has_electricity,
        has_water = v_before_lot.has_water,
        has_internet = v_before_lot.has_internet,
        is_corner = v_before_lot.is_corner,
        is_covered = v_before_lot.is_covered,
        accessibility_notes = v_before_lot.accessibility_notes,
        commercial_notes = v_before_lot.commercial_notes,
        internal_notes = v_before_lot.internal_notes,
        archived_at = v_before_lot.archived_at,
        superseded_by_lot_id = v_before_lot.superseded_by_lot_id,
        updated_by = auth.uid(),
        updated_at = now()
    WHERE id = v_before_lot.id;
    v_lots_restored := v_lots_restored + 1;
  END LOOP;

  FOR v_inserted_id IN
    SELECT value::uuid
    FROM jsonb_array_elements_text(
      coalesce(v_snapshot.apply_result->'insertedLotIds', '[]'::jsonb)
    ) value
  LOOP
    SELECT *
    INTO v_current_lot
    FROM public.commercial_lots
    WHERE id = v_inserted_id
    FOR UPDATE;

    IF FOUND AND (
      v_current_lot.status IS DISTINCT FROM 'UNAVAILABLE'
      OR v_current_lot.archived_at IS NULL
    ) THEN
      IF v_current_lot.status IS DISTINCT FROM 'UNAVAILABLE' THEN
        INSERT INTO public.lot_status_history (
          lot_id, previous_status, new_status, reason, changed_by
        ) VALUES (
          v_current_lot.id,
          v_current_lot.status,
          'UNAVAILABLE',
          'Lote criado pela revisão Exporural arquivado no rollback; snapshot ' || v_snapshot.id,
          auth.uid()
        );
      END IF;

      UPDATE public.commercial_lots
      SET status = 'UNAVAILABLE',
          archived_at = now(),
          internal_notes = concat_ws(
            E'\n',
            internal_notes,
            'Arquivado pelo rollback da revisão Exporural; snapshot ' || v_snapshot.id
          ),
          updated_by = auth.uid(),
          updated_at = now()
      WHERE id = v_current_lot.id;
      v_created_lots_archived := v_created_lots_archived + 1;
    END IF;
  END LOOP;

  FOR v_inserted_id IN
    SELECT value::uuid
    FROM jsonb_array_elements_text(
      coalesce(v_snapshot.apply_result->'insertedEntityIds', '[]'::jsonb)
    ) value
  LOOP
    UPDATE public.map_entities
    SET is_archived = true,
        verification_status = 'ARCHIVED',
        metadata = metadata || jsonb_build_object(
          'rolledBackBySnapshotId', v_snapshot.id,
          'rolledBackAt', clock_timestamp()
        ),
        updated_by = auth.uid(),
        updated_at = now()
    WHERE id = v_inserted_id
      AND project_id = v_project.id
      AND is_archived = false;
    IF FOUND THEN
      v_created_entities_archived := v_created_entities_archived + 1;
    END IF;
  END LOOP;

  IF coalesce((v_snapshot.apply_result->>'calibrationCreated')::boolean, false) THEN
    UPDATE public.map_calibrations
    SET status = 'INVALIDATED',
        invalidated_reason =
          'Calibração técnica Exporural ' || v_snapshot.source_revision
          || ' invalidada pelo rollback do snapshot ' || v_snapshot.id
    WHERE id = nullif(v_snapshot.apply_result->>'calibrationId', '')::uuid
      AND project_id = v_project.id
      AND status = 'VALIDATED';
    v_calibration_invalidated := FOUND;
  END IF;

  UPDATE public.map_projects
  SET reference_revision = v_before_project.reference_revision,
      active_version = v_project.active_version + 1,
      is_published = false,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = v_project.id
  RETURNING * INTO v_project;

  v_result := jsonb_build_object(
    'projectId', v_project.id,
    'snapshotId', v_snapshot.id,
    'referenceRevision', v_before_project.reference_revision,
    'changed', true,
    'entitiesRestored', v_entities_restored,
    'geometriesRestored', v_geometries_restored,
    'lotsRestored', v_lots_restored,
    'createdEntitiesArchived', v_created_entities_archived,
    'createdLotsArchived', v_created_lots_archived,
    'retiredTombstonesPreserved', v_retired_tombstones_preserved,
    'calibrationInvalidated', v_calibration_invalidated,
    'projectVersionAfterRollback', v_project.active_version,
    'isPublished', false,
    'rolledBackAt', clock_timestamp()
  );

  UPDATE public.map_reference_migration_snapshots
  SET status = 'ROLLED_BACK',
      rolled_back_at = clock_timestamp(),
      rolled_back_by = auth.uid(),
      rollback_reason = trim(p_reason)
  WHERE id = v_snapshot.id;

  INSERT INTO public.map_activity_logs (
    org_id, project_id, action, reason, before_state, after_state, actor_user_id
  ) VALUES (
    p_org_id,
    v_project.id,
    'EXPORURAL_REFERENCE_2026_ROLLED_BACK',
    trim(p_reason),
    v_snapshot.apply_result,
    v_result,
    auth.uid()
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_exporural_reference_2026(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollback_exporural_reference_2026(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.apply_exporural_reference_2026(uuid, text, jsonb, jsonb) IS
  'Explicit map.admin-only Exporural 2026.4 rollout. Validates inventory, official/calculated area tolerance, topology, roads and protected structures; versions geometry and preserves all commercial state.';

COMMENT ON FUNCTION public.rollback_exporural_reference_2026(uuid, uuid, text) IS
  'Authorized, drift-guarded rollback for Exporural 2026.3/2026.4 snapshots. A 2026.4 rollback restores the 111 geometry/lot set but preserves B35, B36 and D6-01..03 as archived, unsegmented audit tombstones; it never republishes automatically.';

COMMENT ON TABLE public.map_reference_migration_snapshots IS
  'Complete pre-write snapshots and operation state for directed map-reference migrations, including authorized rollback evidence.';