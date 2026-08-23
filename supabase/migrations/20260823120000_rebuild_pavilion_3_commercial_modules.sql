-- Pavilhão 3 - Comércio: persisted, neutral and commercially operable module inventory.
-- The migration is deliberately additive. Existing commercial rows are never overwritten;
-- conflicting identities abort the transaction instead of guessing which history to retain.

BEGIN;

CREATE TEMP TABLE _pavilion3_previous_lineage_baselines ON COMMIT DROP AS
SELECT
  segment.id AS segment_id,
  segment.boundary_data->'lineageBaselineAt' AS lineage_baseline_at
FROM public.map_segments segment
WHERE segment.slug IN ('exporural', 'industria-comercio-servicos');

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
      'Anexo 2 — contorno azul do núcleo comercial; Pavilhão 3 oficial 2026',
      '{"resolution":"explicit-entity-union","expectedEntityCount":354,"expectedLotCount":317,"blockIdentifiers":["QUADRA-M","QUADRA-G","QUADRA-L","QUADRA-F","QUADRA-J","QUADRA-E","QUADRA-I","QUADRA-D"],"excludedIdentifiers":["Q-G-03","Q-G-04","QUADRA-N","B7","B28","D4","QUADRA-C","QUADRA-B","QUADRA-A","C1","B11","B12","B13","B14","B15","B18","B21","B25","B26","B27","B30","B31","B32","B42-02","G","B8","B9","B10","B39"]}'::jsonb
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
    -- Pavilhao 3 children use an immutable metadata key first and a strict,
    -- bounded public identifier as the canonical fallback.
    WHEN (
      upper(COALESCE(_public_identifier, ''))
        ~ '^B6-M(00[1-9]|0[1-9][0-9]|1[0-9]{2}|20[0-9]|21[0-4])$'
      OR (
        upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B6'
        AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
          ~ '^B6:MODULE:(00[1-9]|0[1-9][0-9]|1[0-9]{2}|20[0-9]|21[0-4])$'
      )
    )
    THEN 'industria-comercio-servicos'
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

SELECT public.ensure_commission_map_segments(project.id)
FROM public.map_projects project;

SELECT pg_advisory_xact_lock(
  hashtextextended('commercial-map:pavilion-3:' || project.id::text, 0)
)
FROM public.map_projects project
WHERE project.is_archived = false
ORDER BY project.id;

CREATE TEMP TABLE _pavilion3_module_runs (
  run_id text PRIMARY KEY,
  start_number integer NOT NULL,
  end_number integer NOT NULL,
  center_x numeric NOT NULL,
  center_z numeric NOT NULL,
  width numeric NOT NULL,
  depth numeric NOT NULL,
  sequence_orientation text NOT NULL,
  module_orientation text NOT NULL,
  group_key text NOT NULL,
  cluster_key text NOT NULL
) ON COMMIT DROP;

INSERT INTO _pavilion3_module_runs VALUES
  ('perimeter-01-19',       1,  19, 0.0650, 0.2600, 0.0750, 0.3600, 'Z+', 'east-west',  'perimeter-west',  'perimeter-01-19'),
  ('perimeter-20-36',      20,  36, 0.0650, 0.6800, 0.0750, 0.3200, 'Z+', 'east-west',  'perimeter-west',  'perimeter-20-36'),
  ('perimeter-37-40',      37,  40, 0.2850, 0.9100, 0.1800, 0.0750, 'X+', 'north-south','perimeter-south', 'perimeter-37-40'),
  ('perimeter-41-47',      41,  47, 0.6400, 0.9100, 0.3000, 0.0750, 'X+', 'north-south','perimeter-south', 'perimeter-41-47'),
  ('island-1-west-leg',    48,  75, 0.3275, 0.4800, 0.0950, 0.5600, 'Z+', 'east-west',  'island-1',        'island-1-west-leg'),
  ('island-1-south-cap',   76,  83, 0.3800, 0.8100, 0.2000, 0.0800, 'X+', 'north-south','island-1',        'island-1-south-cap'),
  ('island-1-east-leg',    84, 111, 0.4325, 0.4800, 0.0950, 0.5600, 'Z-', 'east-west',  'island-1',        'island-1-east-leg'),
  ('island-2-west-leg',   112, 139, 0.5975, 0.4800, 0.0950, 0.5600, 'Z+', 'east-west',  'island-2',        'island-2-west-leg'),
  ('island-2-south-cap',  140, 147, 0.6500, 0.8100, 0.2000, 0.0800, 'X+', 'north-south','island-2',        'island-2-south-cap'),
  ('island-2-east-leg',   148, 175, 0.7025, 0.4800, 0.0950, 0.5600, 'Z-', 'east-west',  'island-2',        'island-2-east-leg'),
  ('perimeter-176-214',   176, 214, 0.9400, 0.4800, 0.0750, 0.7600, 'Z+', 'east-west',  'perimeter-east',  'perimeter-176-214');

CREATE TEMP TABLE _pavilion3_module_cells ON COMMIT DROP AS
WITH expanded AS (
  SELECT
    run.*,
    module_number,
    (run.end_number - run.start_number + 1) AS module_count,
    CASE
      WHEN run.sequence_orientation = 'Z-'
        THEN run.end_number - module_number
      ELSE module_number - run.start_number
    END AS spatial_index
  FROM _pavilion3_module_runs run
  CROSS JOIN LATERAL generate_series(run.start_number, run.end_number) module_number
), measured AS (
  SELECT
    expanded.*,
    0.0015::numeric AS module_gap,
    CASE
      WHEN sequence_orientation = 'X+'
        THEN (width - 0.0015::numeric * (module_count - 1)) / module_count
      ELSE (depth - 0.0015::numeric * (module_count - 1)) / module_count
    END AS cell_length
  FROM expanded
)
SELECT
  module_number,
  'B6-M' || lpad(module_number::text, 3, '0') AS public_identifier,
  'B6:module:' || lpad(module_number::text, 3, '0') AS pavilion_module_key,
  CASE
    WHEN module_number < 100 THEN lpad(module_number::text, 2, '0')
    ELSE module_number::text
  END AS lot_number,
  run_id,
  group_key,
  cluster_key,
  sequence_orientation,
  module_orientation,
  CASE
    WHEN sequence_orientation = 'X+'
      THEN center_x - width / 2
        + spatial_index * (cell_length + module_gap) + cell_length / 2
    ELSE center_x
  END AS center_x,
  CASE
    WHEN sequence_orientation = 'X+' THEN center_z
    ELSE center_z - depth / 2
      + spatial_index * (cell_length + module_gap) + cell_length / 2
  END AS center_z,
  CASE WHEN sequence_orientation = 'X+' THEN cell_length ELSE width END AS width,
  CASE WHEN sequence_orientation = 'X+' THEN depth ELSE cell_length END AS depth,
  module_number IN (6, 156, 157, 158, 159) AS has_source_discrepancy
FROM measured;

DO $$
BEGIN
  IF (SELECT count(*) FROM _pavilion3_module_cells) <> 214
    OR (SELECT count(DISTINCT module_number) FROM _pavilion3_module_cells) <> 214
    OR (SELECT min(module_number) FROM _pavilion3_module_cells) <> 1
    OR (SELECT max(module_number) FROM _pavilion3_module_cells) <> 214
  THEN
    RAISE EXCEPTION 'PAVILION3_MODULE_SEED_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _pavilion3_module_cells
    WHERE width <= 0 OR depth <= 0
  ) THEN
    RAISE EXCEPTION 'PAVILION3_MODULE_GEOMETRY_INVALID';
  END IF;
END;
$$;

-- One authoritative B6 pavilion and one current footprint are required for
-- every active project. Case variants and duplicate aliases are identity drift.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    WHERE project.is_archived = false
      AND (
        SELECT count(*)
        FROM public.map_entities pavilion
        WHERE pavilion.project_id = project.id
          AND pavilion.is_archived = false
          AND upper(pavilion.public_identifier) = 'B6'
      ) <> 1
  ) THEN
    RAISE EXCEPTION 'PAVILION3_PARENT_IDENTITY_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    JOIN public.map_entities pavilion
      ON pavilion.project_id = project.id
      AND pavilion.is_archived = false
      AND upper(pavilion.public_identifier) = 'B6'
    WHERE project.is_archived = false
      AND (
        pavilion.public_identifier <> 'B6'
        OR pavilion.classification <> 'PAVILION'
        OR (
          SELECT count(*)
          FROM public.map_entity_geometries geometry
          WHERE geometry.entity_id = pavilion.id
            AND geometry.project_id = project.id
            AND geometry.is_current = true
        ) <> 1
      )
  ) THEN
    RAISE EXCEPTION 'PAVILION3_PARENT_GEOMETRY_CONFLICT';
  END IF;
END;
$$;

CREATE TEMP TABLE _pavilion3_project_footprints ON COMMIT DROP AS
SELECT
  project.id AS project_id,
  project.org_id,
  pavilion.id AS pavilion_id,
  module_layer.id AS layer_id,
  segment.id AS segment_id,
  pavilion_geometry.elevation,
  pavilion_geometry.calibration_version,
  bounds.min_x,
  bounds.max_x,
  bounds.min_z,
  bounds.max_z,
  (bounds.min_x + bounds.max_x) / 2 AS pavilion_center_x,
  (bounds.min_z + bounds.max_z) / 2 AS pavilion_center_z,
  LEAST(bounds.max_x - bounds.min_x, bounds.max_z - bounds.min_z) AS short_side,
  (bounds.max_x - bounds.min_x)
    - 2 * (LEAST(bounds.max_x - bounds.min_x, bounds.max_z - bounds.min_z) * 0.025)
    - 2 * (LEAST(bounds.max_x - bounds.min_x, bounds.max_z - bounds.min_z) * 0.065)
      AS clear_width,
  (bounds.max_z - bounds.min_z)
    - 2 * (LEAST(bounds.max_x - bounds.min_x, bounds.max_z - bounds.min_z) * 0.025)
    - 2 * (LEAST(bounds.max_x - bounds.min_x, bounds.max_z - bounds.min_z) * 0.065)
      AS clear_depth
FROM public.map_projects project
JOIN public.map_entities pavilion
  ON pavilion.project_id = project.id
  AND pavilion.is_archived = false
  AND pavilion.public_identifier = 'B6'
  AND pavilion.classification = 'PAVILION'
JOIN public.map_layers module_layer
  ON module_layer.project_id = project.id
  AND module_layer.layer_key = 'commercial'
JOIN public.map_entity_geometries pavilion_geometry
  ON pavilion_geometry.project_id = project.id
  AND pavilion_geometry.entity_id = pavilion.id
  AND pavilion_geometry.is_current = true
JOIN public.map_segments segment
  ON segment.project_id = project.id
  AND segment.slug = 'industria-comercio-servicos'
  AND segment.is_active = true
CROSS JOIN LATERAL (
  SELECT
    min((point->>0)::numeric) AS min_x,
    max((point->>0)::numeric) AS max_x,
    min((point->>1)::numeric) AS min_z,
    max((point->>1)::numeric) AS max_z
  FROM jsonb_array_elements(pavilion_geometry.geometry->'coordinates'->0) point
) bounds
WHERE project.is_archived = false;

DO $$
BEGIN
  IF (SELECT count(*) FROM _pavilion3_project_footprints)
      <> (SELECT count(*) FROM public.map_projects WHERE is_archived = false)
    OR EXISTS (
      SELECT 1
      FROM _pavilion3_project_footprints
      WHERE clear_width <= 0 OR clear_depth <= 0 OR short_side <= 0
    )
  THEN
    RAISE EXCEPTION 'PAVILION3_CLEAR_FOOTPRINT_INVALID';
  END IF;
END;
$$;

CREATE TEMP TABLE _pavilion3_staged_modules ON COMMIT DROP AS
WITH projected AS (
  SELECT
    footprint.*,
    cell.*,
    -- B6 faces PI radians. Rotating the pavilion-local center by PI mirrors
    -- both local axes while retaining each rectangle's width and depth.
    footprint.pavilion_center_x - (cell.center_x - 0.5) * footprint.clear_width
      AS world_center_x,
    footprint.pavilion_center_z - (cell.center_z - 0.5) * footprint.clear_depth
      AS world_center_z,
    cell.width * footprint.clear_width AS world_width,
    cell.depth * footprint.clear_depth AS world_depth
  FROM _pavilion3_project_footprints footprint
  CROSS JOIN _pavilion3_module_cells cell
)
SELECT
  projected.*,
  jsonb_build_object(
    'type', 'Polygon',
    'coordinates', jsonb_build_array(jsonb_build_array(
      jsonb_build_array(world_center_x - world_width / 2, world_center_z - world_depth / 2),
      jsonb_build_array(world_center_x + world_width / 2, world_center_z - world_depth / 2),
      jsonb_build_array(world_center_x + world_width / 2, world_center_z + world_depth / 2),
      jsonb_build_array(world_center_x - world_width / 2, world_center_z + world_depth / 2),
      jsonb_build_array(world_center_x - world_width / 2, world_center_z - world_depth / 2)
    ))
  ) AS geometry,
  jsonb_build_object(
    'seedManaged', true,
    'sourceRevision', '2026.4',
    'layoutRevision', '2026.4-p3.1',
    'source', 'Anexos oficiais 1 e 2 — Pavilhão 3 — Comércio',
    'cartographicConfidence', 'official_visual_reference',
    'buyerDataImported', false,
    'parentPublicIdentifier', 'B6',
    'pavilionPublicIdentifier', 'B6',
    'pavilionModuleKey', pavilion_module_key,
    'pavilionNumber', 3,
    'moduleNumber', module_number,
    'lotNumber', lot_number,
    'orientation', module_orientation,
    'group', group_key,
    'cluster', cluster_key,
    'moduleOrientation', module_orientation,
    'sequenceOrientation', sequence_orientation,
    'moduleGroup', group_key,
    'moduleCluster', cluster_key,
    'sortOrder', module_number,
    'type', 'commercial-lot',
    'moduleType', 'commercial-lot',
    'areaM2', NULL,
    'areaAssignment', 'unassigned',
    'officialMeasurements', false,
    'normalizedFootprint', jsonb_build_object(
      'centerX', center_x, 'centerZ', center_z, 'width', width, 'depth', depth
    ),
    'normalizedLabelAnchor', jsonb_build_array(center_x, center_z),
    'labelAnchor', jsonb_build_array(world_center_x, world_center_z),
    'sourceDiscrepancy', CASE
      WHEN has_source_discrepancy THEN 'official-range-omission'
      ELSE NULL
    END,
    'segmentId', 'industria-comercio-servicos',
    'segmentCode', 'INDUSTRIA_COMERCIO_SERVICOS',
    'segmentName', 'Indústria, Comércio e Serviços'
  ) AS canonical_metadata
FROM projected;

DO $$
BEGIN
  IF (SELECT count(*) FROM _pavilion3_staged_modules)
      <> 214 * (SELECT count(*) FROM public.map_projects WHERE is_archived = false)
    OR EXISTS (
      SELECT project_id
      FROM _pavilion3_staged_modules
      GROUP BY project_id
      HAVING count(*) <> 214 OR count(DISTINCT public_identifier) <> 214
    )
  THEN
    RAISE EXCEPTION 'PAVILION3_PROJECT_MODULE_STAGE_INVALID';
  END IF;
END;
$$;

-- Existing rows may be reused only when every stable identity dimension agrees.
-- Commercial status, notes, prices, reservations, negotiations, sales and
-- contracts are intentionally absent from this structural preflight/update.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.map_entities entity
    JOIN _pavilion3_staged_modules staged
      ON staged.project_id = entity.project_id
      AND upper(staged.public_identifier) = upper(entity.public_identifier)
    WHERE entity.public_identifier <> staged.public_identifier
      OR entity.is_archived = true
      OR entity.classification <> 'INTERNAL_STAND'
      OR entity.is_sellable = false
      OR entity.parent_entity_id IS DISTINCT FROM staged.pavilion_id
      OR entity.layer_id IS DISTINCT FROM staged.layer_id
      OR entity.segment_id IS NOT NULL
        AND entity.segment_id IS DISTINCT FROM staged.segment_id
      OR entity.metadata->>'pavilionPublicIdentifier' IS NOT NULL
        AND upper(entity.metadata->>'pavilionPublicIdentifier') <> 'B6'
      OR entity.metadata->>'pavilionModuleKey' IS NOT NULL
        AND upper(entity.metadata->>'pavilionModuleKey') <> upper(staged.pavilion_module_key)
      OR entity.metadata->>'moduleNumber' IS NOT NULL
        AND entity.metadata->>'moduleNumber' <> staged.module_number::text
  ) THEN
    RAISE EXCEPTION 'PAVILION3_ENTITY_IDENTITY_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_entities entity
    JOIN _pavilion3_staged_modules staged
      ON staged.project_id = entity.project_id
      AND upper(COALESCE(entity.metadata->>'pavilionModuleKey', ''))
        = upper(staged.pavilion_module_key)
    WHERE entity.public_identifier IS DISTINCT FROM staged.public_identifier
  ) THEN
    RAISE EXCEPTION 'PAVILION3_MODULE_KEY_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _pavilion3_project_footprints footprint
    JOIN public.map_entities entity
      ON entity.project_id = footprint.project_id
      AND entity.parent_entity_id = footprint.pavilion_id
      AND entity.classification = 'INTERNAL_STAND'
      AND entity.is_archived = false
    LEFT JOIN _pavilion3_staged_modules staged
      ON staged.project_id = entity.project_id
      AND staged.public_identifier = entity.public_identifier
    WHERE staged.public_identifier IS NULL
  ) THEN
    RAISE EXCEPTION 'PAVILION3_UNEXPECTED_INTERNAL_STAND_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.commercial_lots lot
    JOIN _pavilion3_staged_modules staged
      ON staged.project_id = lot.project_id
      AND upper(staged.public_identifier) = upper(lot.public_identifier)
    LEFT JOIN public.map_entities entity
      ON entity.project_id = staged.project_id
      AND entity.public_identifier = staged.public_identifier
    WHERE lot.public_identifier <> staged.public_identifier
      OR lot.archived_at IS NOT NULL
      OR entity.id IS NULL
      OR lot.entity_id IS DISTINCT FROM entity.id
      OR lot.lot_number IS DISTINCT FROM staged.lot_number
  ) THEN
    RAISE EXCEPTION 'PAVILION3_COMMERCIAL_LOT_IDENTITY_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_entities entity
    JOIN _pavilion3_staged_modules staged
      ON staged.project_id = entity.project_id
      AND staged.public_identifier = entity.public_identifier
    JOIN public.commercial_lots lot ON lot.entity_id = entity.id
    WHERE lot.project_id IS DISTINCT FROM staged.project_id
      OR lot.public_identifier IS DISTINCT FROM staged.public_identifier
      OR lot.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PAVILION3_ENTITY_LOT_LINK_CONFLICT';
  END IF;
END;
$$;

CREATE TEMP TABLE _pavilion3_created_entities (
  entity_id uuid PRIMARY KEY
) ON COMMIT DROP;

WITH inserted AS (
  INSERT INTO public.map_entities (
    id, project_id, layer_id, parent_entity_id, public_identifier,
    name, description, classification, verification_status,
    is_sellable, is_archived, segment_id, metadata,
    created_by, updated_by, created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    staged.project_id,
    staged.layer_id,
    staged.pavilion_id,
    staged.public_identifier,
    'Módulo ' || staged.lot_number,
    NULL,
    'INTERNAL_STAND',
    'VERIFIED',
    true,
    false,
    staged.segment_id,
    staged.canonical_metadata,
    NULL,
    NULL,
    transaction_timestamp(),
    transaction_timestamp()
  FROM _pavilion3_staged_modules staged
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.map_entities entity
    WHERE entity.project_id = staged.project_id
      AND entity.public_identifier = staged.public_identifier
  )
  ON CONFLICT (project_id, public_identifier) DO NOTHING
  RETURNING id
)
INSERT INTO _pavilion3_created_entities (entity_id)
SELECT id FROM inserted;

-- Canonical structural metadata may be repaired on a compatible pre-existing
-- entity. No commercial fields live on this table and no unrelated metadata is removed.
UPDATE public.map_entities entity
SET
  segment_id = staged.segment_id,
  verification_status = 'VERIFIED',
  metadata = COALESCE(entity.metadata, '{}'::jsonb) || staged.canonical_metadata,
  updated_at = transaction_timestamp()
FROM _pavilion3_staged_modules staged
WHERE entity.project_id = staged.project_id
  AND entity.public_identifier = staged.public_identifier
  AND (
    entity.segment_id IS DISTINCT FROM staged.segment_id
    OR entity.verification_status IS DISTINCT FROM 'VERIFIED'
    OR entity.metadata IS DISTINCT FROM
      (COALESCE(entity.metadata, '{}'::jsonb) || staged.canonical_metadata)
  );

CREATE TEMP TABLE _pavilion3_entity_map ON COMMIT DROP AS
SELECT
  staged.*,
  entity.id AS entity_id
FROM _pavilion3_staged_modules staged
JOIN public.map_entities entity
  ON entity.project_id = staged.project_id
  AND entity.public_identifier = staged.public_identifier
  AND entity.is_archived = false;

DO $$
BEGIN
  IF (SELECT count(*) FROM _pavilion3_entity_map)
      <> (SELECT count(*) FROM _pavilion3_staged_modules)
    OR EXISTS (
      SELECT entity_id
      FROM _pavilion3_entity_map
      GROUP BY entity_id
      HAVING count(*) <> 1
    )
  THEN
    RAISE EXCEPTION 'PAVILION3_ENTITY_BACKFILL_INCOMPLETE';
  END IF;
END;
$$;

-- Migrations run without an authenticated map administrator. The narrow trigger
-- suspension is transactional and takes an ACCESS EXCLUSIVE lock; the archive
-- trigger map_geometry_archive_before_update remains enabled so every replaced
-- current geometry is versioned.
ALTER TABLE public.map_entity_geometries
  DISABLE TRIGGER map_geometry_layer_lock_before_write;

INSERT INTO public.map_entity_geometries (
  id, project_id, entity_id, geometry, elevation, extrusion_height,
  rotation, calibration_version, version, is_current, change_reason,
  created_by, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  staged.project_id,
  staged.entity_id,
  staged.geometry,
  staged.elevation,
  0,
  round(pi()::numeric, 6),
  staged.calibration_version,
  COALESCE((
    SELECT max(previous.version) + 1
    FROM public.map_entity_geometries previous
    WHERE previous.entity_id = staged.entity_id
  ), 1),
  true,
  'Correção estrutural oficial do Pavilhão 3 - Comércio',
  NULL,
  transaction_timestamp(),
  transaction_timestamp()
FROM _pavilion3_entity_map staged
WHERE NOT EXISTS (
  SELECT 1
  FROM public.map_entity_geometries geometry
  WHERE geometry.entity_id = staged.entity_id
    AND geometry.project_id = staged.project_id
    AND geometry.is_current = true
);

UPDATE public.map_entity_geometries geometry
SET
  geometry = staged.geometry,
  elevation = staged.elevation,
  extrusion_height = 0,
  rotation = round(pi()::numeric, 6),
  calibration_version = staged.calibration_version,
  version = geometry.version + 1,
  change_reason = 'Correção estrutural oficial do Pavilhão 3 - Comércio',
  updated_at = transaction_timestamp()
FROM _pavilion3_entity_map staged
WHERE geometry.entity_id = staged.entity_id
  AND geometry.project_id = staged.project_id
  AND geometry.is_current = true
  AND (
    geometry.geometry IS DISTINCT FROM staged.geometry
    OR geometry.elevation IS DISTINCT FROM staged.elevation
    OR geometry.extrusion_height IS DISTINCT FROM 0::numeric
    OR geometry.rotation IS DISTINCT FROM round(pi()::numeric, 6)
    OR geometry.calibration_version IS DISTINCT FROM staged.calibration_version
  );

ALTER TABLE public.map_entity_geometries
  ENABLE TRIGGER map_geometry_layer_lock_before_write;

CREATE TEMP TABLE _pavilion3_created_lots (
  lot_id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  entity_id uuid NOT NULL
) ON COMMIT DROP;

WITH inserted AS (
  INSERT INTO public.commercial_lots (
    id, project_id, entity_id, public_identifier, block, lot_number,
    level_label, display_name, description, status,
    official_area_sqm, calculated_area_sqm, area_validation_status,
    frontage_meters, depth_meters, infrastructure,
    has_electricity, has_water, has_internet, is_corner, is_covered,
    accessibility_notes, commercial_notes, internal_notes,
    archived_at, superseded_by_lot_id, created_by, updated_by,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    staged.project_id,
    staged.entity_id,
    staged.public_identifier,
    'P3',
    staged.lot_number,
    NULL,
    'Módulo ' || staged.lot_number,
    NULL,
    'BLOCKED',
    NULL,
    NULL,
    'UNVALIDATED',
    NULL,
    NULL,
    '[]'::jsonb,
    false,
    false,
    false,
    false,
    true,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    transaction_timestamp(),
    transaction_timestamp()
  FROM _pavilion3_entity_map staged
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.commercial_lots lot
    WHERE lot.entity_id = staged.entity_id
       OR (
         lot.project_id = staged.project_id
         AND lot.public_identifier = staged.public_identifier
       )
  )
  ON CONFLICT DO NOTHING
  RETURNING id, project_id, entity_id
)
INSERT INTO _pavilion3_created_lots (lot_id, project_id, entity_id)
SELECT id, project_id, entity_id FROM inserted;

INSERT INTO public.lot_prices (
  id, lot_id, pricing_mode, base_price, price_per_sqm,
  asking_price, minimum_price, is_active, valid_from, valid_until,
  created_by, created_at
)
SELECT
  gen_random_uuid(),
  created.lot_id,
  'NOT_FOR_SALE',
  NULL,
  NULL,
  NULL,
  NULL,
  true,
  transaction_timestamp(),
  NULL,
  NULL,
  transaction_timestamp()
FROM _pavilion3_created_lots created;

-- Validate neutral defaults only for rows created here. Reused rows retain all
-- prior commercial state by design, including legitimate parties and contracts.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _pavilion3_created_lots created
    JOIN public.commercial_lots lot ON lot.id = created.lot_id
    WHERE lot.status <> 'BLOCKED'
      OR lot.official_area_sqm IS NOT NULL
      OR lot.calculated_area_sqm IS NOT NULL
      OR lot.frontage_meters IS NOT NULL
      OR lot.depth_meters IS NOT NULL
      OR lot.area_validation_status <> 'UNVALIDATED'
      OR lot.commercial_notes IS NOT NULL
      OR lot.internal_notes IS NOT NULL
      OR lot.accessibility_notes IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PAVILION3_NEUTRAL_LOT_DEFAULTS_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _pavilion3_created_lots created
    LEFT JOIN public.lot_prices price
      ON price.lot_id = created.lot_id
      AND price.is_active = true
    WHERE price.id IS NULL
      OR price.pricing_mode <> 'NOT_FOR_SALE'
      OR price.base_price IS NOT NULL
      OR price.price_per_sqm IS NOT NULL
      OR price.asking_price IS NOT NULL
      OR price.minimum_price IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PAVILION3_NEUTRAL_PRICE_DEFAULTS_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1 FROM _pavilion3_created_lots created
    WHERE EXISTS (SELECT 1 FROM public.lot_reservations row WHERE row.lot_id = created.lot_id)
       OR EXISTS (SELECT 1 FROM public.lot_negotiations row WHERE row.lot_id = created.lot_id)
       OR EXISTS (SELECT 1 FROM public.lot_sales row WHERE row.lot_id = created.lot_id)
       OR EXISTS (SELECT 1 FROM public.lot_contracts row WHERE row.lot_id = created.lot_id)
  ) THEN
    RAISE EXCEPTION 'PAVILION3_NEUTRAL_COMMERCIAL_RELATIONS_INVALID';
  END IF;
END;
$$;

-- Verification for a canonical internal module validates its persisted geometry,
-- not an individual area that the official pavilion reference does not provide.
-- Every other sellable entity retains the existing validated-area requirement.
CREATE OR REPLACE FUNCTION public.set_map_entity_verification(
  p_entity_id uuid,
  p_status text,
  p_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entity public.map_entities%ROWTYPE;
  v_lot public.commercial_lots%ROWTYPE;
  v_org_id uuid;
  v_is_measurement_optional_pavilion_module boolean := false;
BEGIN
  SELECT *
  INTO v_entity
  FROM public.map_entities
  WHERE id = p_entity_id
    AND is_archived = false
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'MAP_ENTITY_NOT_FOUND'; END IF;

  SELECT org_id INTO v_org_id
  FROM public.map_projects
  WHERE id = v_entity.project_id;

  IF NOT public.map_has_explicit_capability(v_org_id, 'map.admin') THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;
  IF p_status NOT IN ('NEEDS_REVIEW', 'VERIFIED') THEN
    RAISE EXCEPTION 'INVALID_VERIFICATION_STATUS';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'CHANGE_REASON_REQUIRED';
  END IF;

  IF p_status = 'VERIFIED' THEN
    IF (
      SELECT status
      FROM public.map_calibrations
      WHERE project_id = v_entity.project_id
      ORDER BY version DESC
      LIMIT 1
    ) IS DISTINCT FROM 'VALIDATED' THEN
      RAISE EXCEPTION 'VALIDATED_CALIBRATION_REQUIRED';
    END IF;

    IF v_entity.is_sellable THEN
      SELECT *
      INTO v_lot
      FROM public.commercial_lots
      WHERE entity_id = v_entity.id
        AND archived_at IS NULL
      FOR UPDATE;

      IF NOT FOUND THEN RAISE EXCEPTION 'COMMERCIAL_LOT_NOT_FOUND'; END IF;

      v_is_measurement_optional_pavilion_module :=
        v_entity.classification = 'INTERNAL_STAND'
        AND upper(COALESCE(v_entity.metadata->>'pavilionPublicIdentifier', '')) = 'B6'
        AND upper(COALESCE(v_entity.metadata->>'pavilionModuleKey', ''))
          ~ '^B6:MODULE:(00[1-9]|0[1-9][0-9]|1[0-9]{2}|20[0-9]|21[0-4])$'
        AND v_lot.area_validation_status = 'UNVALIDATED'
        AND v_lot.official_area_sqm IS NULL
        AND v_lot.calculated_area_sqm IS NULL
        AND v_lot.frontage_meters IS NULL
        AND v_lot.depth_meters IS NULL;

      IF v_lot.area_validation_status <> 'VALIDATED'
        AND NOT v_is_measurement_optional_pavilion_module
      THEN
        RAISE EXCEPTION 'OFFICIAL_AREA_REQUIRED_FOR_VERIFICATION';
      END IF;
    END IF;
  END IF;

  UPDATE public.map_entities
  SET
    verification_status = p_status,
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = v_entity.id;

  INSERT INTO public.map_activity_logs (
    org_id, project_id, entity_id, action,
    before_state, after_state, reason, actor_user_id
  )
  VALUES (
    v_org_id,
    v_entity.project_id,
    v_entity.id,
    'ENTITY_VERIFICATION_CHANGED',
    jsonb_build_object('status', v_entity.verification_status),
    jsonb_build_object(
      'status', p_status,
      'measurementOptional', v_is_measurement_optional_pavilion_module
    ),
    p_reason,
    auth.uid()
  );

  RETURN p_status;
END;
$$;

REVOKE ALL ON FUNCTION public.set_map_entity_verification(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_map_entity_verification(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_commercial_lot_availability(
  p_lot_id uuid,
  p_status text,
  p_reason text
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lot public.commercial_lots%ROWTYPE;
  v_active_price public.lot_prices%ROWTYPE;
  v_org_id uuid;
  v_target_status text := upper(trim(COALESCE(p_status, '')));
  v_changed_at timestamptz := clock_timestamp();
  v_result_updated_at timestamptz;
  v_new_pricing_mode text;
BEGIN
  SELECT *
  INTO v_lot
  FROM public.commercial_lots
  WHERE id = p_lot_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'COMMERCIAL_LOT_NOT_FOUND'; END IF;

  SELECT project.org_id
  INTO v_org_id
  FROM public.map_projects project
  WHERE project.id = v_lot.project_id
    AND project.is_archived = false;

  IF v_org_id IS NULL THEN RAISE EXCEPTION 'MAP_PROJECT_NOT_FOUND'; END IF;
  IF NOT (
    public.map_has_explicit_capability(v_org_id, 'map.manage_sales')
    OR public.map_has_explicit_capability(v_org_id, 'map.manage_lots')
  ) THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;
  IF v_target_status NOT IN ('AVAILABLE', 'BLOCKED', 'UNAVAILABLE') THEN
    RAISE EXCEPTION 'INVALID_AVAILABILITY_STATUS';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'CHANGE_REASON_REQUIRED';
  END IF;
  IF v_lot.status IN ('RESERVED', 'IN_NEGOTIATION', 'SOLD') THEN
    RAISE EXCEPTION 'LOT_STATUS_TRANSITION_FORBIDDEN:%', v_lot.status;
  END IF;
  IF v_lot.status NOT IN ('AVAILABLE', 'BLOCKED', 'UNAVAILABLE') THEN
    RAISE EXCEPTION 'LOT_STATUS_TRANSITION_FORBIDDEN:%', v_lot.status;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.lot_reservations reservation
    WHERE reservation.lot_id = v_lot.id AND reservation.status = 'ACTIVE'
  ) OR EXISTS (
    SELECT 1 FROM public.lot_negotiations negotiation
    WHERE negotiation.lot_id = v_lot.id AND negotiation.status = 'ACTIVE'
  ) OR EXISTS (
    SELECT 1 FROM public.lot_sales sale
    WHERE sale.lot_id = v_lot.id AND sale.status = 'CONFIRMED'
  ) THEN
    RAISE EXCEPTION 'LOT_ACTIVE_COMMERCIAL_FLOW_FORBIDS_AVAILABILITY_CHANGE';
  END IF;

  IF v_lot.status = v_target_status THEN
    RETURN v_lot.updated_at;
  END IF;

  SELECT *
  INTO v_active_price
  FROM public.lot_prices
  WHERE lot_id = v_lot.id
    AND is_active = true
  ORDER BY valid_from DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  v_new_pricing_mode := CASE
    WHEN v_target_status = 'AVAILABLE'
      AND FOUND
      AND v_active_price.pricing_mode = 'NOT_FOR_SALE'
    THEN 'NEGOTIABLE'
    WHEN FOUND THEN v_active_price.pricing_mode
    ELSE NULL
  END;

  IF v_target_status = 'AVAILABLE'
    AND v_active_price.id IS NOT NULL
    AND v_active_price.pricing_mode = 'NOT_FOR_SALE'
  THEN
    UPDATE public.lot_prices
    SET
      is_active = false,
      valid_until = CASE
        WHEN v_changed_at > valid_from THEN v_changed_at
        ELSE valid_from + interval '1 microsecond'
      END
    WHERE id = v_active_price.id;

    INSERT INTO public.lot_prices (
      id, lot_id, pricing_mode, base_price, price_per_sqm,
      asking_price, minimum_price, is_active, valid_from, valid_until,
      created_by, created_at
    )
    VALUES (
      gen_random_uuid(),
      v_lot.id,
      'NEGOTIABLE',
      NULL,
      NULL,
      NULL,
      NULL,
      true,
      v_changed_at,
      NULL,
      auth.uid(),
      v_changed_at
    );
  END IF;

  UPDATE public.commercial_lots
  SET
    status = v_target_status,
    updated_by = auth.uid(),
    updated_at = v_changed_at
  WHERE id = v_lot.id
  RETURNING updated_at INTO v_result_updated_at;

  INSERT INTO public.lot_status_history (
    lot_id, previous_status, new_status, reason, changed_by, changed_at
  )
  VALUES (
    v_lot.id,
    v_lot.status,
    v_target_status,
    trim(p_reason),
    auth.uid(),
    v_changed_at
  );

  INSERT INTO public.map_activity_logs (
    org_id, project_id, entity_id, lot_id, action,
    before_state, after_state, reason, actor_user_id, created_at
  )
  VALUES (
    v_org_id,
    v_lot.project_id,
    v_lot.entity_id,
    v_lot.id,
    'LOT_AVAILABILITY_CHANGED',
    jsonb_build_object(
      'status', v_lot.status,
      'pricingMode', CASE WHEN v_active_price.id IS NULL THEN NULL ELSE v_active_price.pricing_mode END
    ),
    jsonb_build_object(
      'status', v_target_status,
      'pricingMode', v_new_pricing_mode
    ),
    trim(p_reason),
    auth.uid(),
    v_changed_at
  );

  RETURN v_result_updated_at;
END;
$$;

COMMENT ON FUNCTION public.set_commercial_lot_availability(uuid, text, text) IS
  'Auditably changes only lot availability states; protected sales states require their dedicated workflows.';

REVOKE ALL ON FUNCTION public.set_commercial_lot_availability(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_commercial_lot_availability(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_commercial_lot_availability(uuid, text, text) TO authenticated;

-- The migration succeeds only if the normalized inventory, neutral source
-- contract, resolver and both commission baselines are coherent in this same transaction.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    WHERE project.is_archived = false
      AND (
        SELECT count(*)
        FROM public.map_entities entity
        WHERE entity.project_id = project.id
          AND entity.parent_entity_id = (
            SELECT pavilion.id
            FROM public.map_entities pavilion
            WHERE pavilion.project_id = project.id
              AND pavilion.public_identifier = 'B6'
              AND pavilion.is_archived = false
          )
          AND entity.classification = 'INTERNAL_STAND'
          AND entity.is_archived = false
      ) <> 214
  ) THEN
    RAISE EXCEPTION 'PAVILION3_INTERNAL_STAND_INVENTORY_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _pavilion3_entity_map staged
    JOIN public.map_entities entity ON entity.id = staged.entity_id
    LEFT JOIN public.map_entity_geometries geometry
      ON geometry.entity_id = entity.id
      AND geometry.project_id = entity.project_id
      AND geometry.is_current = true
    LEFT JOIN public.commercial_lots lot
      ON lot.entity_id = entity.id
      AND lot.project_id = entity.project_id
      AND lot.archived_at IS NULL
    WHERE entity.parent_entity_id IS DISTINCT FROM staged.pavilion_id
      OR entity.layer_id IS DISTINCT FROM staged.layer_id
      OR entity.segment_id IS DISTINCT FROM staged.segment_id
      OR entity.classification <> 'INTERNAL_STAND'
      OR entity.is_sellable = false
      OR entity.verification_status <> 'VERIFIED'
      OR geometry.id IS NULL
      OR geometry.geometry IS DISTINCT FROM staged.geometry
      OR geometry.rotation IS DISTINCT FROM round(pi()::numeric, 6)
      OR lot.id IS NULL
      OR lot.public_identifier IS DISTINCT FROM staged.public_identifier
      OR lot.lot_number IS DISTINCT FROM staged.lot_number
  ) THEN
    RAISE EXCEPTION 'PAVILION3_PERSISTED_INVENTORY_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _pavilion3_entity_map staged
    JOIN public.map_entities entity ON entity.id = staged.entity_id
    WHERE (
      entity.metadata->>'sourceDiscrepancy' = 'official-range-omission'
    ) IS DISTINCT FROM (staged.module_number IN (6, 156, 157, 158, 159))
  ) OR EXISTS (
    SELECT project_id
    FROM _pavilion3_entity_map staged
    JOIN public.map_entities entity ON entity.id = staged.entity_id
    WHERE entity.metadata->>'sourceDiscrepancy' = 'official-range-omission'
    GROUP BY project_id
    HAVING count(*) <> 5
  ) THEN
    RAISE EXCEPTION 'PAVILION3_SOURCE_DISCREPANCY_INVENTORY_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _pavilion3_staged_modules staged
    WHERE public.resolve_commission_map_segment_slug(
      staged.public_identifier,
      '{}'::jsonb
    ) IS DISTINCT FROM 'industria-comercio-servicos'
      OR public.resolve_commission_map_segment_slug(
        NULL,
        jsonb_build_object(
          'pavilionPublicIdentifier', 'B6',
          'pavilionModuleKey', staged.pavilion_module_key
        )
      ) IS DISTINCT FROM 'industria-comercio-servicos'
  ) THEN
    RAISE EXCEPTION 'PAVILION3_CANONICAL_SEGMENT_RESOLVER_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _pavilion3_previous_lineage_baselines previous
    JOIN public.map_segments current ON current.id = previous.segment_id
    WHERE previous.lineage_baseline_at IS NOT NULL
      AND current.boundary_data->'lineageBaselineAt'
        IS DISTINCT FROM previous.lineage_baseline_at
  ) THEN
    RAISE EXCEPTION 'COMMISSION_SEGMENT_LINEAGE_BASELINE_CHANGED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    JOIN public.map_segments segment ON segment.project_id = project.id
    WHERE project.is_archived = false
      AND segment.slug IN ('exporural', 'industria-comercio-servicos')
      AND (
        segment.boundary_data->'lineageBaselineAt' IS NULL
        OR segment.boundary_data->>'expectedEntityCount' IS DISTINCT FROM CASE
          WHEN segment.slug = 'exporural' THEN '111' ELSE '354'
        END
        OR segment.boundary_data->>'expectedLotCount' IS DISTINCT FROM CASE
          WHEN segment.slug = 'exporural' THEN '95' ELSE '317'
        END
        OR NOT public.map_segment_is_complete(segment.id)
      )
  ) THEN
    RAISE EXCEPTION 'COMMISSION_SEGMENT_INVENTORY_VALIDATION_FAILED';
  END IF;

  IF EXISTS (
    SELECT project.id
    FROM public.map_projects project
    LEFT JOIN public.map_segments segment
      ON segment.project_id = project.id
      AND segment.is_active = true
      AND segment.slug IN ('exporural', 'industria-comercio-servicos')
    WHERE project.is_archived = false
    GROUP BY project.id
    HAVING count(segment.id) <> 2
  ) THEN
    RAISE EXCEPTION 'COMMISSION_SEGMENT_BASELINE_MISSING';
  END IF;
END;
$$;

COMMIT;
