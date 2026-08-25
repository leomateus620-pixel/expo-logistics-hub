-- Pavilhão 1 — correção de projeção do croqui oficial 52,70 m × 22,84 m.
-- A migration anterior preserva a planta no referencial da fonte. Esta revisão
-- aplica a rotação horária do croqui antes da rotação externa do edifício B1 e
-- usa uma única escala métrica nos dois eixos.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('commercial-map:pavilion-1-axis-projection:2026.4-p1.2', 0)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.map_projects project
    WHERE project.is_archived = false
  ) THEN
    RAISE EXCEPTION 'PAVILION_1_AXIS_ACTIVE_PROJECT_PRECONDITION_FAILED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    WHERE project.is_archived = false
      AND (
        SELECT count(*)
        FROM public.map_entities pavilion
        WHERE pavilion.project_id = project.id
          AND pavilion.public_identifier = 'B1'
          AND pavilion.classification = 'PAVILION'
          AND pavilion.is_archived = false
      ) <> 1
  ) THEN
    RAISE EXCEPTION 'PAVILION_1_AXIS_PARENT_PRECONDITION_FAILED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_projects project
    JOIN public.map_entities pavilion
      ON pavilion.project_id = project.id
      AND pavilion.public_identifier = 'B1'
      AND pavilion.classification = 'PAVILION'
      AND pavilion.is_archived = false
    WHERE project.is_archived = false
      AND (
        SELECT count(*)
        FROM public.map_entities entity
        JOIN public.commercial_lots lot
          ON lot.project_id = entity.project_id
          AND lot.entity_id = entity.id
          AND lot.archived_at IS NULL
        JOIN public.map_entity_geometries geometry
          ON geometry.project_id = entity.project_id
          AND geometry.entity_id = entity.id
          AND geometry.is_current = true
        WHERE entity.project_id = project.id
          AND entity.parent_entity_id = pavilion.id
          AND entity.classification = 'INTERNAL_STAND'
          AND entity.is_archived = false
          AND entity.public_identifier
            ~ '^B1-M(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-9])$'
          AND upper(COALESCE(entity.metadata->>'pavilionPublicIdentifier', '')) = 'B1'
          AND upper(COALESCE(entity.metadata->>'pavilionModuleKey', ''))
            ~ '^B1:MODULE:(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-9])$'
          AND entity.metadata->>'layoutRevision' = '2026.4-p1.1'
          AND jsonb_typeof(entity.metadata->'normalizedFootprint') = 'object'
          AND jsonb_typeof(entity.metadata->'normalizedFootprintPolygon') = 'array'
          AND jsonb_array_length(entity.metadata->'normalizedFootprintPolygon') >= 5
          AND jsonb_typeof(entity.metadata->'normalizedLabelAnchor') = 'array'
          AND jsonb_array_length(entity.metadata->'normalizedLabelAnchor') = 2
          AND jsonb_typeof(entity.metadata->'renderParts') = 'array'
          AND jsonb_array_length(entity.metadata->'renderParts') >= 1
      ) <> 189
  ) THEN
    RAISE EXCEPTION 'PAVILION_1_AXIS_MODULE_PRECONDITION_FAILED';
  END IF;
END;
$$;

CREATE TEMP TABLE _p1_axis_source ON COMMIT DROP AS
SELECT
  project.id AS project_id,
  project.org_id,
  pavilion.id AS pavilion_id,
  entity.id AS entity_id,
  entity.public_identifier,
  (entity.metadata->>'moduleNumber')::integer AS module_number,
  entity.metadata->'pavilionModuleKey' AS pavilion_module_key,
  entity.metadata->'normalizedFootprint' AS normalized_footprint,
  entity.metadata->'normalizedFootprintPolygon' AS normalized_ring,
  entity.metadata->'normalizedLabelAnchor' AS normalized_label_anchor,
  entity.metadata->'renderParts' AS render_parts,
  entity.metadata->>'orientation' AS module_orientation,
  entity.metadata->>'sequenceOrientation' AS sequence_orientation,
  entity.metadata->>'group' AS group_key,
  entity.metadata->>'cluster' AS cluster_key,
  geometry.elevation,
  geometry.calibration_version
FROM public.map_projects project
JOIN public.map_entities pavilion
  ON pavilion.project_id = project.id
  AND pavilion.public_identifier = 'B1'
  AND pavilion.classification = 'PAVILION'
  AND pavilion.is_archived = false
JOIN public.map_entities entity
  ON entity.project_id = project.id
  AND entity.parent_entity_id = pavilion.id
  AND entity.classification = 'INTERNAL_STAND'
  AND entity.is_archived = false
JOIN public.map_entity_geometries geometry
  ON geometry.project_id = entity.project_id
  AND geometry.entity_id = entity.id
  AND geometry.is_current = true
JOIN public.commercial_lots lot
  ON lot.project_id = entity.project_id
  AND lot.entity_id = entity.id
  AND lot.archived_at IS NULL
WHERE project.is_archived = false
  AND entity.public_identifier
    ~ '^B1-M(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-9])$'
  AND upper(COALESCE(entity.metadata->>'pavilionPublicIdentifier', '')) = 'B1'
  AND upper(COALESCE(entity.metadata->>'pavilionModuleKey', ''))
    ~ '^B1:MODULE:(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-9])$'
  AND entity.metadata->>'layoutRevision' = '2026.4-p1.1'
  AND jsonb_typeof(entity.metadata->'normalizedFootprint') = 'object'
  AND jsonb_typeof(entity.metadata->'normalizedFootprintPolygon') = 'array'
  AND jsonb_array_length(entity.metadata->'normalizedFootprintPolygon') >= 5
  AND jsonb_typeof(entity.metadata->'normalizedLabelAnchor') = 'array'
  AND jsonb_array_length(entity.metadata->'normalizedLabelAnchor') = 2
  AND jsonb_typeof(entity.metadata->'renderParts') = 'array'
  AND jsonb_array_length(entity.metadata->'renderParts') >= 1;

CREATE UNIQUE INDEX ON _p1_axis_source(project_id, module_number);
CREATE UNIQUE INDEX ON _p1_axis_source(project_id, public_identifier);
CREATE UNIQUE INDEX ON _p1_axis_source(project_id, pavilion_module_key);

CREATE TEMP TABLE _p1_axis_parent_frames ON COMMIT DROP AS
WITH parent_bounds AS (
  SELECT
    project.id AS project_id,
    pavilion.id AS pavilion_id,
    geometry.geometry AS parent_geometry,
    min((point->>0)::numeric) AS min_x,
    max((point->>0)::numeric) AS max_x,
    min((point->>1)::numeric) AS min_z,
    max((point->>1)::numeric) AS max_z
  FROM public.map_projects project
  JOIN public.map_entities pavilion
    ON pavilion.project_id = project.id
    AND pavilion.public_identifier = 'B1'
    AND pavilion.classification = 'PAVILION'
    AND pavilion.is_archived = false
  JOIN public.map_entity_geometries geometry
    ON geometry.project_id = pavilion.project_id
    AND geometry.entity_id = pavilion.id
    AND geometry.is_current = true
  CROSS JOIN LATERAL jsonb_array_elements(geometry.geometry->'coordinates'->0) point
  WHERE project.is_archived = false
  GROUP BY project.id, pavilion.id, geometry.geometry
), clear_bounds AS (
  SELECT
    *,
    (min_x + max_x) / 2 AS pavilion_center_x,
    (min_z + max_z) / 2 AS pavilion_center_z,
    max_z - min_z AS model_width,
    max_x - min_x AS model_depth,
    LEAST(max_z - min_z, max_x - min_x) AS short_side
  FROM parent_bounds
), available AS (
  SELECT
    *,
    model_width - 2 * short_side * 0.025 - 2 * short_side * 0.065 AS clear_width,
    model_depth - 2 * short_side * 0.025 - 2 * short_side * 0.065 AS clear_depth
  FROM clear_bounds
), scaled AS (
  SELECT
    *,
    LEAST(clear_width / 22.84, clear_depth / 52.70) AS uniform_scale
  FROM available
)
SELECT
  *,
  22.84 * uniform_scale AS frame_width,
  52.70 * uniform_scale AS frame_depth,
  round((pi() / 2)::numeric, 6) AS facing_radians,
  cos(pi() / 2)::numeric AS cosine,
  sin(pi() / 2)::numeric AS sine
FROM scaled;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _p1_axis_parent_frames
    WHERE clear_width <= 0
      OR clear_depth <= 0
      OR uniform_scale <= 0
      OR frame_width > clear_width + 0.00000001
      OR frame_depth > clear_depth + 0.00000001
      OR abs(frame_depth / frame_width - 52.70 / 22.84) > 0.0000000001
  ) THEN
    RAISE EXCEPTION 'PAVILION_1_AXIS_METRIC_FRAME_INVALID';
  END IF;
END;
$$;

CREATE TEMP TABLE _p1_axis_staged ON COMMIT DROP AS
WITH projected AS (
  SELECT
    source.*,
    frame.parent_geometry,
    frame.pavilion_center_x,
    frame.pavilion_center_z,
    frame.clear_width,
    frame.clear_depth,
    frame.frame_width,
    frame.frame_depth,
    frame.uniform_scale,
    frame.facing_radians,
    frame.cosine,
    frame.sine,
    world.world_ring,
    frame.pavilion_center_x
      + ((1 - (source.normalized_label_anchor->>1)::numeric - 0.5) * frame.frame_width)
        * frame.cosine
      + (((source.normalized_label_anchor->>0)::numeric - 0.5) * frame.frame_depth)
        * frame.sine AS world_label_x,
    frame.pavilion_center_z
      - ((1 - (source.normalized_label_anchor->>1)::numeric - 0.5) * frame.frame_width)
        * frame.sine
      + (((source.normalized_label_anchor->>0)::numeric - 0.5) * frame.frame_depth)
        * frame.cosine AS world_label_z
  FROM _p1_axis_source source
  JOIN _p1_axis_parent_frames frame USING (project_id, pavilion_id)
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_array(
        frame.pavilion_center_x
          + ((1 - (point->>1)::numeric - 0.5) * frame.frame_width) * frame.cosine
          + (((point->>0)::numeric - 0.5) * frame.frame_depth) * frame.sine,
        frame.pavilion_center_z
          - ((1 - (point->>1)::numeric - 0.5) * frame.frame_width) * frame.sine
          + (((point->>0)::numeric - 0.5) * frame.frame_depth) * frame.cosine
      )
      ORDER BY ordinality
    ) AS world_ring
    FROM jsonb_array_elements(source.normalized_ring)
      WITH ORDINALITY ring_point(point, ordinality)
  ) world
)
SELECT
  projected.*,
  jsonb_build_object(
    'type', 'Polygon',
    'coordinates', jsonb_build_array(world_ring)
  ) AS geometry,
  jsonb_build_object(
    'layoutRevision', '2026.4-p1.2',
    'planCoordinateTransform', 'quarter-turn-clockwise',
    'projectionFit', 'metric-contain',
    'metricReference', jsonb_build_object('widthM', 52.70, 'depthM', 22.84),
    'projectionFrame', jsonb_build_object(
      'width', frame_width,
      'depth', frame_depth,
      'uniformScale', uniform_scale
    ),
    'normalizedFootprint', normalized_footprint,
    'normalizedFootprintPolygon', normalized_ring,
    'normalizedLabelAnchor', normalized_label_anchor,
    'renderParts', render_parts,
    'labelAnchor', jsonb_build_array(world_label_x, world_label_z)
  ) AS structural_metadata
FROM projected;

DO $$
BEGIN
  IF (SELECT count(*) FROM _p1_axis_staged)
      <> 189 * (SELECT count(*) FROM public.map_projects WHERE is_archived = false)
    OR EXISTS (
      SELECT 1
      FROM _p1_axis_staged staged
      WHERE NOT extensions.ST_IsValid(
        extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(staged.geometry::text), 0)
      )
        OR NOT extensions.ST_Covers(
          extensions.ST_SetSRID(
            extensions.ST_GeomFromGeoJSON(staged.parent_geometry::text),
            0
          ),
          extensions.ST_SetSRID(
            extensions.ST_GeomFromGeoJSON(staged.geometry::text),
            0
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM _p1_axis_staged left_module
      JOIN _p1_axis_staged right_module
        ON right_module.project_id = left_module.project_id
        AND right_module.module_number > left_module.module_number
      WHERE extensions.ST_Area(extensions.ST_Intersection(
        extensions.ST_SetSRID(
          extensions.ST_GeomFromGeoJSON(left_module.geometry::text),
          0
        ),
        extensions.ST_SetSRID(
          extensions.ST_GeomFromGeoJSON(right_module.geometry::text),
          0
        )
      )) > 0.00000001
    )
  THEN
    RAISE EXCEPTION 'PAVILION_1_AXIS_STAGED_GEOMETRY_INVALID';
  END IF;
END;
$$;

CREATE TEMP TABLE _p1_axis_entity_snapshot ON COMMIT DROP AS
SELECT
  entity.id AS entity_id,
  to_jsonb(entity) - 'metadata' - 'updated_at' AS entity_state,
  COALESCE(entity.metadata, '{}'::jsonb)
    - 'layoutRevision'
    - 'planCoordinateTransform'
    - 'projectionFit'
    - 'metricReference'
    - 'projectionFrame'
    - 'normalizedFootprint'
    - 'normalizedFootprintPolygon'
    - 'normalizedLabelAnchor'
    - 'renderParts'
    - 'labelAnchor' AS non_structural_metadata
FROM _p1_axis_staged staged
JOIN public.map_entities entity ON entity.id = staged.entity_id;

CREATE TEMP TABLE _p1_axis_commercial_snapshot ON COMMIT DROP AS
SELECT
  lot.id AS lot_id,
  to_jsonb(lot) AS lot_state,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
    FROM public.lot_prices row WHERE row.lot_id = lot.id), '[]'::jsonb) AS prices,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
    FROM public.lot_reservations row WHERE row.lot_id = lot.id), '[]'::jsonb) AS reservations,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
    FROM public.lot_negotiations row WHERE row.lot_id = lot.id), '[]'::jsonb) AS negotiations,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
    FROM public.lot_sales row WHERE row.lot_id = lot.id), '[]'::jsonb) AS sales,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
    FROM public.lot_contracts row WHERE row.lot_id = lot.id), '[]'::jsonb) AS contracts,
  COALESCE((SELECT jsonb_agg(to_jsonb(version) ORDER BY version.id)
    FROM public.lot_contracts contract
    JOIN public.lot_contract_versions version ON version.contract_id = contract.id
    WHERE contract.lot_id = lot.id), '[]'::jsonb) AS contract_versions,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
    FROM public.lot_status_history row WHERE row.lot_id = lot.id), '[]'::jsonb) AS status_history,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
    FROM public.map_lot_lineage row
    WHERE row.source_lot_id = lot.id OR row.target_lot_id = lot.id), '[]'::jsonb) AS lineage
FROM _p1_axis_staged staged
JOIN public.commercial_lots lot
  ON lot.project_id = staged.project_id
  AND lot.entity_id = staged.entity_id
  AND lot.archived_at IS NULL;

UPDATE public.map_entities entity
SET
  metadata = COALESCE(entity.metadata, '{}'::jsonb) || staged.structural_metadata,
  updated_at = transaction_timestamp()
FROM _p1_axis_staged staged
WHERE entity.id = staged.entity_id
  AND entity.project_id = staged.project_id
  AND COALESCE(entity.metadata, '{}'::jsonb) || staged.structural_metadata
    IS DISTINCT FROM entity.metadata;

ALTER TABLE public.map_entity_geometries
  DISABLE TRIGGER map_geometry_layer_lock_before_write;

UPDATE public.map_entity_geometries geometry
SET
  geometry = staged.geometry,
  elevation = staged.elevation,
  extrusion_height = 0,
  rotation = staged.facing_radians,
  calibration_version = staged.calibration_version,
  version = geometry.version + 1,
  change_reason = 'Correção métrica de eixos do Pavilhão 1 — planta oficial 2026',
  updated_at = transaction_timestamp()
FROM _p1_axis_staged staged
WHERE geometry.project_id = staged.project_id
  AND geometry.entity_id = staged.entity_id
  AND geometry.is_current = true
  AND (
    geometry.geometry IS DISTINCT FROM staged.geometry
    OR geometry.elevation IS DISTINCT FROM staged.elevation
    OR geometry.extrusion_height IS DISTINCT FROM 0::numeric
    OR geometry.rotation IS DISTINCT FROM staged.facing_radians
    OR geometry.calibration_version IS DISTINCT FROM staged.calibration_version
  );

ALTER TABLE public.map_entity_geometries
  ENABLE TRIGGER map_geometry_layer_lock_before_write;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _p1_axis_entity_snapshot snapshot
    JOIN public.map_entities entity ON entity.id = snapshot.entity_id
    WHERE snapshot.entity_state
        IS DISTINCT FROM to_jsonb(entity) - 'metadata' - 'updated_at'
      OR snapshot.non_structural_metadata IS DISTINCT FROM (
        COALESCE(entity.metadata, '{}'::jsonb)
          - 'layoutRevision'
          - 'planCoordinateTransform'
          - 'projectionFit'
          - 'metricReference'
          - 'projectionFrame'
          - 'normalizedFootprint'
          - 'normalizedFootprintPolygon'
          - 'normalizedLabelAnchor'
          - 'renderParts'
          - 'labelAnchor'
      )
  ) THEN
    RAISE EXCEPTION 'PAVILION_1_AXIS_ENTITY_STATE_CHANGED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _p1_axis_commercial_snapshot snapshot
    JOIN public.commercial_lots lot ON lot.id = snapshot.lot_id
    WHERE snapshot.lot_state IS DISTINCT FROM to_jsonb(lot)
      OR snapshot.prices IS DISTINCT FROM COALESCE((
        SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
        FROM public.lot_prices row WHERE row.lot_id = lot.id
      ), '[]'::jsonb)
      OR snapshot.reservations IS DISTINCT FROM COALESCE((
        SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
        FROM public.lot_reservations row WHERE row.lot_id = lot.id
      ), '[]'::jsonb)
      OR snapshot.negotiations IS DISTINCT FROM COALESCE((
        SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
        FROM public.lot_negotiations row WHERE row.lot_id = lot.id
      ), '[]'::jsonb)
      OR snapshot.sales IS DISTINCT FROM COALESCE((
        SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
        FROM public.lot_sales row WHERE row.lot_id = lot.id
      ), '[]'::jsonb)
      OR snapshot.contracts IS DISTINCT FROM COALESCE((
        SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
        FROM public.lot_contracts row WHERE row.lot_id = lot.id
      ), '[]'::jsonb)
      OR snapshot.contract_versions IS DISTINCT FROM COALESCE((
        SELECT jsonb_agg(to_jsonb(version) ORDER BY version.id)
        FROM public.lot_contracts contract
        JOIN public.lot_contract_versions version ON version.contract_id = contract.id
        WHERE contract.lot_id = lot.id
      ), '[]'::jsonb)
      OR snapshot.status_history IS DISTINCT FROM COALESCE((
        SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
        FROM public.lot_status_history row WHERE row.lot_id = lot.id
      ), '[]'::jsonb)
      OR snapshot.lineage IS DISTINCT FROM COALESCE((
        SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id)
        FROM public.map_lot_lineage row
        WHERE row.source_lot_id = lot.id OR row.target_lot_id = lot.id
      ), '[]'::jsonb)
  ) THEN
    RAISE EXCEPTION 'PAVILION_1_AXIS_COMMERCIAL_STATE_CHANGED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _p1_axis_staged staged
    JOIN public.map_entities entity ON entity.id = staged.entity_id
    LEFT JOIN public.map_entity_geometries geometry
      ON geometry.project_id = staged.project_id
      AND geometry.entity_id = staged.entity_id
      AND geometry.is_current = true
    WHERE entity.public_identifier IS DISTINCT FROM staged.public_identifier
      OR entity.metadata->>'layoutRevision' IS DISTINCT FROM '2026.4-p1.2'
      OR entity.metadata->>'planCoordinateTransform'
        IS DISTINCT FROM 'quarter-turn-clockwise'
      OR entity.metadata->>'projectionFit' IS DISTINCT FROM 'metric-contain'
      OR entity.metadata->'metricReference'
        IS DISTINCT FROM jsonb_build_object('widthM', 52.70, 'depthM', 22.84)
      OR entity.metadata->'normalizedFootprint'
        IS DISTINCT FROM staged.normalized_footprint
      OR entity.metadata->'normalizedFootprintPolygon'
        IS DISTINCT FROM staged.normalized_ring
      OR entity.metadata->'normalizedLabelAnchor'
        IS DISTINCT FROM staged.normalized_label_anchor
      OR entity.metadata->'renderParts' IS DISTINCT FROM staged.render_parts
      OR entity.metadata->'areaM2' IS DISTINCT FROM 'null'::jsonb
      OR geometry.id IS NULL
      OR geometry.geometry IS DISTINCT FROM staged.geometry
      OR geometry.rotation IS DISTINCT FROM staged.facing_radians
  ) THEN
    RAISE EXCEPTION 'PAVILION_1_AXIS_FINAL_STATE_INVALID';
  END IF;
END;
$$;

COMMIT;