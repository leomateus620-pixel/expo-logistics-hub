-- Pavilhão 3 / B6 — planta oficial Fenasoja 2028 (desenho set/2026).
-- Escopo exclusivo: âncoras das ilhas e footprint do B6-M036.
BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('commercial-map:pavilion-3:2028.1-p3.4:' || project.id::text, 0))
FROM public.map_projects project
WHERE project.is_archived = false
ORDER BY project.id;

CREATE TEMP TABLE _b6_2028_baseline ON COMMIT DROP AS
SELECT entity.id AS entity_id, entity.project_id, entity.public_identifier,
       entity.metadata, lot.id AS lot_id, lot.status
FROM public.map_entities pavilion
JOIN public.map_entities entity
  ON entity.project_id = pavilion.project_id
 AND entity.parent_entity_id = pavilion.id
 AND entity.classification = 'INTERNAL_STAND'
 AND entity.is_archived = false
JOIN public.commercial_lots lot
  ON lot.project_id = entity.project_id
 AND lot.entity_id = entity.id
 AND lot.archived_at IS NULL
WHERE pavilion.public_identifier = 'B6'
  AND pavilion.classification = 'PAVILION'
  AND pavilion.is_archived = false;

CREATE TEMP TABLE _b6_2028_price_baseline ON COMMIT DROP AS
SELECT price.id, to_jsonb(price) AS row_state
FROM public.lot_prices price
JOIN _b6_2028_baseline baseline ON baseline.lot_id = price.lot_id;

DO $$
BEGIN
  IF (SELECT count(*) FROM _b6_2028_baseline) <> 214
    OR (SELECT count(DISTINCT entity_id) FROM _b6_2028_baseline) <> 214
    OR (SELECT count(DISTINCT lot_id) FROM _b6_2028_baseline) <> 214
    OR EXISTS (
      SELECT 1 FROM generate_series(1, 214) number
      LEFT JOIN _b6_2028_baseline baseline
        ON baseline.public_identifier = 'B6-M' || lpad(number::text, 3, '0')
      WHERE baseline.entity_id IS NULL
    )
  THEN RAISE EXCEPTION 'PAVILION_3_2028_IDENTITY_BASELINE_INVALID';
  END IF;

  IF (SELECT round(sum(lot.official_area_sqm), 2)
      FROM public.commercial_lots lot
      JOIN _b6_2028_baseline baseline ON baseline.lot_id = lot.id)
      IS DISTINCT FROM 663.00::numeric
    OR (SELECT official_area_sqm FROM public.commercial_lots
        WHERE id = (SELECT lot_id FROM _b6_2028_baseline WHERE public_identifier = 'B6-M036'))
      IS DISTINCT FROM 24.00::numeric
  THEN RAISE EXCEPTION 'PAVILION_3_2028_OFFICIAL_AREA_BASELINE_INVALID';
  END IF;
END;
$$;

CREATE TEMP TABLE _b6_2028_footprint ON COMMIT DROP AS
WITH bounds AS (
  SELECT pavilion.id AS pavilion_id, pavilion.project_id,
         geometry.elevation, geometry.calibration_version,
         min((point->>0)::numeric) AS min_x, max((point->>0)::numeric) AS max_x,
         min((point->>1)::numeric) AS min_z, max((point->>1)::numeric) AS max_z
  FROM public.map_entities pavilion
  JOIN public.map_entity_geometries geometry
    ON geometry.project_id = pavilion.project_id
   AND geometry.entity_id = pavilion.id
   AND geometry.is_current = true
  CROSS JOIN LATERAL jsonb_array_elements(geometry.geometry->'coordinates'->0) point
  WHERE pavilion.public_identifier = 'B6'
    AND pavilion.classification = 'PAVILION'
    AND pavilion.is_archived = false
  GROUP BY pavilion.id, pavilion.project_id, geometry.elevation, geometry.calibration_version
)
SELECT *, (min_x + max_x) / 2 AS pavilion_center_x,
       (min_z + max_z) / 2 AS pavilion_center_z,
       (max_x - min_x) - 2 * LEAST(max_x - min_x, max_z - min_z) * 0.025
         - 2 * LEAST(max_x - min_x, max_z - min_z) * 0.065 AS clear_width,
       (max_z - min_z) - 2 * LEAST(max_x - min_x, max_z - min_z) * 0.025
         - 2 * LEAST(max_x - min_x, max_z - min_z) * 0.065 AS clear_depth
FROM bounds;

CREATE TEMP TABLE _b6_2028_cells ON COMMIT DROP AS
WITH constants AS (
  SELECT 0.0015::numeric AS gap,
         (0.47::numeric - 0.0015::numeric * 27) / 28 AS cell_depth
), modules AS (
  SELECT baseline.*,
         (baseline.metadata->>'moduleNumber')::integer AS module_number,
         CASE
           WHEN (baseline.metadata->>'moduleNumber')::integer BETWEEN 48 AND 79 THEN 0.3275::numeric
           WHEN (baseline.metadata->>'moduleNumber')::integer BETWEEN 80 AND 111 THEN 0.4325::numeric
           WHEN (baseline.metadata->>'moduleNumber')::integer BETWEEN 112 AND 143 THEN 0.5975::numeric
           WHEN (baseline.metadata->>'moduleNumber')::integer BETWEEN 144 AND 175 THEN 0.7025::numeric
           ELSE (baseline.metadata->'normalizedFootprint'->>'centerX')::numeric
         END AS center_x,
         (baseline.metadata->'normalizedFootprint'->>'centerZ')::numeric AS center_z,
         (baseline.metadata->'normalizedFootprint'->>'width')::numeric AS width,
         (baseline.metadata->'normalizedFootprint'->>'depth')::numeric AS depth
  FROM _b6_2028_baseline baseline
  WHERE (baseline.metadata->>'moduleNumber')::integer = 36
     OR (baseline.metadata->>'moduleNumber')::integer BETWEEN 48 AND 175
), normalized AS (
  SELECT modules.*,
    CASE WHEN module_number = 36 THEN jsonb_build_array(
      jsonb_build_array(0.0275, 0.52 + cell_depth * 16 + gap * 16),
      jsonb_build_array(0.1025, 0.52 + cell_depth * 16 + gap * 16),
      jsonb_build_array(0.1025, 0.52 + cell_depth * 18 + gap * 16),
      jsonb_build_array(0.1775, 0.52 + cell_depth * 18 + gap * 16),
      jsonb_build_array(0.1775, 0.52 + cell_depth * 21 + gap * 16),
      jsonb_build_array(0.0275, 0.52 + cell_depth * 21 + gap * 16),
      jsonb_build_array(0.0275, 0.52 + cell_depth * 16 + gap * 16)
    ) ELSE jsonb_build_array(
      jsonb_build_array(center_x - width / 2, center_z - depth / 2),
      jsonb_build_array(center_x + width / 2, center_z - depth / 2),
      jsonb_build_array(center_x + width / 2, center_z + depth / 2),
      jsonb_build_array(center_x - width / 2, center_z + depth / 2),
      jsonb_build_array(center_x - width / 2, center_z - depth / 2)
    ) END AS normalized_ring,
    CASE WHEN module_number = 36 THEN jsonb_build_array(
      jsonb_build_object('centerX', 0.065, 'centerZ', 0.52 + cell_depth * 18.5 + gap * 16,
                         'width', 0.075, 'depth', cell_depth * 5),
      jsonb_build_object('centerX', 0.14, 'centerZ', 0.52 + cell_depth * 19.5 + gap * 16,
                         'width', 0.075, 'depth', cell_depth * 3)
    ) ELSE jsonb_build_array(jsonb_build_object(
      'centerX', center_x, 'centerZ', center_z, 'width', width, 'depth', depth
    )) END AS render_parts,
    CASE WHEN module_number = 36
      THEN jsonb_build_array(0.1025, 0.52 + cell_depth * 19.5 + gap * 16)
      ELSE jsonb_build_array(center_x, center_z)
    END AS normalized_label_anchor
  FROM modules CROSS JOIN constants
), projected AS (
  SELECT normalized.*,
         footprint.pavilion_id,
         footprint.elevation,
         footprint.calibration_version,
         footprint.pavilion_center_x,
         footprint.pavilion_center_z,
         footprint.clear_width,
         footprint.clear_depth,
         world.world_ring,
         pavilion_center_x - (((normalized_label_anchor->>0)::numeric - 0.5) * clear_width) AS world_label_x,
         pavilion_center_z - (((normalized_label_anchor->>1)::numeric - 0.5) * clear_depth) AS world_label_z
  FROM normalized
  JOIN _b6_2028_footprint footprint USING (project_id)
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_array(
      footprint.pavilion_center_x - (((point->>0)::numeric - 0.5) * footprint.clear_width),
      footprint.pavilion_center_z - (((point->>1)::numeric - 0.5) * footprint.clear_depth)
    ) ORDER BY ordinality) AS world_ring
    FROM jsonb_array_elements(normalized.normalized_ring)
      WITH ORDINALITY ring_point(point, ordinality)
  ) world
)
SELECT *, jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(world_ring)) AS geometry
FROM projected;

DO $$
BEGIN
  IF (SELECT count(*) FROM _b6_2028_cells) <> 129
    OR EXISTS (
      SELECT 1 FROM _b6_2028_cells
      WHERE NOT extensions.ST_IsValid(
        extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(geometry::text), 0)
      )
    )
    OR EXISTS (
      SELECT 1 FROM _b6_2028_cells left_module
      JOIN _b6_2028_cells right_module ON right_module.entity_id > left_module.entity_id
      WHERE extensions.ST_Area(extensions.ST_Intersection(
        extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(left_module.geometry::text), 0),
        extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(right_module.geometry::text), 0)
      )) > 0.00000001
    )
  THEN RAISE EXCEPTION 'PAVILION_3_2028_GEOMETRY_STAGE_INVALID';
  END IF;
END;
$$;

ALTER TABLE public.map_entity_geometries DISABLE TRIGGER map_geometry_layer_lock_before_write;

UPDATE public.map_entity_geometries geometry
SET geometry = staged.geometry,
    version = geometry.version + 1,
    change_reason = 'Planta oficial Pavilhão 3 — Fenasoja 2028 (desenho set/2026)',
    updated_at = transaction_timestamp()
FROM _b6_2028_cells staged
WHERE geometry.project_id = staged.project_id
  AND geometry.entity_id = staged.entity_id
  AND geometry.is_current = true
  AND geometry.geometry IS DISTINCT FROM staged.geometry;

ALTER TABLE public.map_entity_geometries ENABLE TRIGGER map_geometry_layer_lock_before_write;

UPDATE public.map_entities entity
SET metadata = entity.metadata || jsonb_build_object(
      'source', 'Planta Pavilhão 3 — Fenasoja 2028 (desenho set/2026).pdf',
      'sourceRevision', '2028.1', 'sourceDrawingDate', '2026-09',
      'referenceYear', 2028, 'layoutRevision', '2028.1-p3.4',
      'normalizedFootprint', CASE WHEN staged.module_number = 36
        THEN jsonb_build_object(
          'centerX', 0.1025,
          'centerZ', ((staged.normalized_ring->0->>1)::numeric + (staged.normalized_ring->4->>1)::numeric) / 2,
          'width', 0.15,
          'depth', (staged.normalized_ring->4->>1)::numeric - (staged.normalized_ring->0->>1)::numeric
        ) ELSE jsonb_build_object(
          'centerX', staged.center_x, 'centerZ', staged.center_z,
          'width', staged.width, 'depth', staged.depth
        ) END,
      'normalizedFootprintPolygon', staged.normalized_ring,
      'renderParts', staged.render_parts,
      'normalizedLabelAnchor', staged.normalized_label_anchor,
      'labelAnchor', jsonb_build_array(staged.world_label_x, staged.world_label_z),
      'areaM2', CASE WHEN staged.module_number = 36 THEN 24.00 ELSE 3.00 END,
      'areaAssignment', CASE WHEN staged.module_number = 36 THEN 'official-written' ELSE 'official-modular-grid' END,
      'officialMeasurements', true
    ),
    updated_at = transaction_timestamp()
FROM _b6_2028_cells staged
WHERE entity.id = staged.entity_id;

UPDATE public.map_entities entity
SET metadata = entity.metadata || jsonb_build_object(
      'source', 'Planta Pavilhão 3 — Fenasoja 2028 (desenho set/2026).pdf',
      'sourceRevision', '2028.1', 'sourceDrawingDate', '2026-09',
      'referenceYear', 2028, 'layoutRevision', '2028.1-p3.4',
      'areaM2', 3.00, 'areaAssignment', 'official-modular-grid',
      'officialMeasurements', true
    ),
    updated_at = transaction_timestamp()
WHERE entity.id IN (SELECT entity_id FROM _b6_2028_baseline)
  AND entity.id NOT IN (SELECT entity_id FROM _b6_2028_cells);

UPDATE public.map_entities pavilion
SET metadata = pavilion.metadata || jsonb_build_object(
      'source', 'Planta Pavilhão 3 — Fenasoja 2028 (desenho set/2026).pdf',
      'sourceRevision', '2028.1', 'sourceDrawingDate', '2026-09',
      'referenceYear', 2028, 'layoutRevision', '2028.1-p3.4',
      'moduleCount', 214, 'modularAreaM2', 663.00, 'totalAreaM2', 1423.00
    ),
    updated_at = transaction_timestamp()
WHERE pavilion.public_identifier = 'B6'
  AND pavilion.classification = 'PAVILION'
  AND pavilion.is_archived = false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM _b6_2028_baseline baseline
    JOIN public.map_entities entity ON entity.id = baseline.entity_id
    JOIN public.commercial_lots lot ON lot.id = baseline.lot_id
    WHERE entity.public_identifier IS DISTINCT FROM baseline.public_identifier
       OR lot.status IS DISTINCT FROM baseline.status
  )
    OR EXISTS (
      SELECT 1 FROM _b6_2028_price_baseline baseline
      LEFT JOIN public.lot_prices price ON price.id = baseline.id
      WHERE price.id IS NULL OR to_jsonb(price) IS DISTINCT FROM baseline.row_state
    )
    OR (SELECT count(*) FROM public.lot_prices price
        JOIN _b6_2028_baseline baseline ON baseline.lot_id = price.lot_id)
       <> (SELECT count(*) FROM _b6_2028_price_baseline)
    OR (SELECT round(sum(lot.official_area_sqm), 2)
        FROM public.commercial_lots lot
        JOIN _b6_2028_baseline baseline ON baseline.lot_id = lot.id)
      IS DISTINCT FROM 663.00::numeric
    OR EXISTS (
      SELECT 1 FROM _b6_2028_cells staged
      JOIN public.map_entity_geometries geometry
        ON geometry.entity_id = staged.entity_id
       AND geometry.project_id = staged.project_id
       AND geometry.is_current = true
      WHERE geometry.geometry IS DISTINCT FROM staged.geometry
    )
    OR EXISTS (
      SELECT 1 FROM public.map_entities entity
      JOIN _b6_2028_baseline baseline ON baseline.entity_id = entity.id
      WHERE entity.metadata->>'layoutRevision' <> '2028.1-p3.4'
         OR entity.metadata->>'referenceYear' <> '2028'
    )
  THEN RAISE EXCEPTION 'PAVILION_3_2028_FINAL_STATE_INVALID';
  END IF;
END;
$$;

COMMIT;