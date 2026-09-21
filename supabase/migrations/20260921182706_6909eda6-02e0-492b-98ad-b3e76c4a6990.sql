BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('commercial-map:pavilion-1:m141:2026.4-p1.3', 0));

CREATE TEMP TABLE _p1_m141_baseline ON COMMIT DROP AS
SELECT
  module.id AS entity_id,
  module.project_id,
  module.parent_entity_id AS pavilion_id,
  module.public_identifier,
  lot.id AS lot_id,
  lot.status,
  (to_jsonb(lot) - 'official_area_sqm' - 'updated_at') AS protected_lot_state,
  geometry.id AS geometry_id,
  geometry.version AS geometry_version
FROM public.map_entities module
JOIN public.commercial_lots lot
  ON lot.project_id = module.project_id
  AND lot.entity_id = module.id
  AND lot.archived_at IS NULL
JOIN public.map_entity_geometries geometry
  ON geometry.project_id = module.project_id
  AND geometry.entity_id = module.id
  AND geometry.is_current = true
WHERE module.public_identifier = 'B1-M141'
  AND module.classification = 'INTERNAL_STAND'
  AND module.is_archived = false;

DO $$
BEGIN
  IF (SELECT count(*) FROM _p1_m141_baseline) <> 1
     OR (SELECT count(*) FROM public.map_entities pavilion JOIN _p1_m141_baseline baseline ON baseline.pavilion_id = pavilion.id WHERE pavilion.public_identifier = 'B1' AND pavilion.classification = 'PAVILION' AND pavilion.is_archived = false) <> 1
     OR (SELECT count(*) FROM public.map_entities module JOIN _p1_m141_baseline baseline ON baseline.pavilion_id = module.parent_entity_id WHERE module.classification = 'INTERNAL_STAND' AND module.is_archived = false) <> 189
     OR (SELECT official_area_sqm FROM public.commercial_lots WHERE id = (SELECT lot_id FROM _p1_m141_baseline)) NOT IN (19.35::numeric, 18.00::numeric)
  THEN
    RAISE EXCEPTION 'PAVILION_1_M141_BASELINE_INVALID';
  END IF;
END;
$$;

CREATE TEMP TABLE _p1_m141_commercial_snapshot ON COMMIT DROP AS
SELECT
  (SELECT coalesce(jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id), '[]'::jsonb) FROM public.lot_prices row_value WHERE row_value.lot_id = baseline.lot_id) AS prices,
  (SELECT coalesce(jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id), '[]'::jsonb) FROM public.lot_reservations row_value WHERE row_value.lot_id = baseline.lot_id) AS reservations,
  (SELECT coalesce(jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id), '[]'::jsonb) FROM public.lot_negotiations row_value WHERE row_value.lot_id = baseline.lot_id) AS negotiations,
  (SELECT coalesce(jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id), '[]'::jsonb) FROM public.lot_sales row_value WHERE row_value.lot_id = baseline.lot_id) AS sales,
  (SELECT coalesce(jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id), '[]'::jsonb) FROM public.lot_contracts row_value WHERE row_value.lot_id = baseline.lot_id) AS contracts,
  (SELECT coalesce(jsonb_agg(to_jsonb(version_value) ORDER BY version_value.id), '[]'::jsonb) FROM public.lot_contract_versions version_value JOIN public.lot_contracts contract_value ON contract_value.id = version_value.contract_id WHERE contract_value.lot_id = baseline.lot_id) AS contract_versions,
  (SELECT coalesce(jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id), '[]'::jsonb) FROM public.lot_status_history row_value WHERE row_value.lot_id = baseline.lot_id) AS status_history,
  (SELECT coalesce(jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id), '[]'::jsonb) FROM public.map_lot_lineage row_value WHERE row_value.source_lot_id = baseline.lot_id OR row_value.target_lot_id = baseline.lot_id) AS lineage
FROM _p1_m141_baseline baseline;

CREATE TEMP TABLE _p1_m141_frame ON COMMIT DROP AS
WITH parent_bounds AS (
  SELECT
    baseline.*,
    min((point->>0)::numeric) AS min_x,
    max((point->>0)::numeric) AS max_x,
    min((point->>1)::numeric) AS min_z,
    max((point->>1)::numeric) AS max_z
  FROM _p1_m141_baseline baseline
  JOIN public.map_entity_geometries geometry
    ON geometry.project_id = baseline.project_id
    AND geometry.entity_id = baseline.pavilion_id
    AND geometry.is_current = true
  CROSS JOIN LATERAL jsonb_array_elements(geometry.geometry->'coordinates'->0) point
  GROUP BY baseline.entity_id, baseline.project_id, baseline.pavilion_id, baseline.public_identifier, baseline.lot_id, baseline.status, baseline.protected_lot_state, baseline.geometry_id, baseline.geometry_version
), available AS (
  SELECT
    *,
    (min_x + max_x) / 2 AS center_x,
    (min_z + max_z) / 2 AS center_z,
    (max_z - min_z) - 2 * LEAST(max_z - min_z, max_x - min_x) * 0.09 AS clear_width,
    (max_x - min_x) - 2 * LEAST(max_z - min_z, max_x - min_x) * 0.09 AS clear_depth
  FROM parent_bounds
)
SELECT
  *,
  22.84 * LEAST(clear_width / 22.84, clear_depth / 52.70) AS frame_width,
  52.70 * LEAST(clear_width / 22.84, clear_depth / 52.70) AS frame_depth,
  LEAST(clear_width / 22.84, clear_depth / 52.70) AS uniform_scale,
  cos(pi() / 2)::numeric AS cosine,
  sin(pi() / 2)::numeric AS sine
FROM available;

CREATE TEMP TABLE _p1_m141_target ON COMMIT DROP AS
WITH metric_points(ordinality, metric_x, metric_z) AS (
  VALUES
    (1, 48.00::numeric, 0.00::numeric),
    (2, 52.50::numeric, 0.00::numeric),
    (3, 52.50::numeric, 4.50::numeric),
    (4, 49.50::numeric, 4.50::numeric),
    (5, 49.50::numeric, 3.00::numeric),
    (6, 48.00::numeric, 3.00::numeric),
    (7, 48.00::numeric, 0.00::numeric)
), normalized AS (
  SELECT
    ordinality,
    0.02 + metric_x / 52.70 * 0.96 AS normalized_x,
    0.02 + metric_z / 22.84 * 0.96 AS normalized_z
  FROM metric_points
), rings AS (
  SELECT
    jsonb_agg(jsonb_build_array(normalized_x, normalized_z) ORDER BY ordinality) AS normalized_ring,
    jsonb_agg(
      jsonb_build_array(
        frame.center_x + ((1 - normalized_z - 0.5) * frame.frame_width) * frame.cosine + ((normalized_x - 0.5) * frame.frame_depth) * frame.sine,
        frame.center_z - ((1 - normalized_z - 0.5) * frame.frame_width) * frame.sine + ((normalized_x - 0.5) * frame.frame_depth) * frame.cosine
      ) ORDER BY ordinality
    ) AS world_ring
  FROM normalized
  CROSS JOIN _p1_m141_frame frame
)
SELECT
  frame.*,
  rings.normalized_ring,
  jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(rings.world_ring)) AS geometry,
  0.02 + 50.25 / 52.70 * 0.96 AS label_normalized_x,
  0.02 + 1.50 / 22.84 * 0.96 AS label_normalized_z
FROM _p1_m141_frame frame
CROSS JOIN rings;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _p1_m141_target
    WHERE frame_width <= 0
      OR frame_depth <= 0
      OR abs(frame_depth / frame_width - 52.70 / 22.84) > 0.0000000001
      OR NOT extensions.ST_IsValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(geometry::text), 0))
  ) THEN
    RAISE EXCEPTION 'PAVILION_1_M141_TARGET_GEOMETRY_INVALID';
  END IF;
END;
$$;

ALTER TABLE public.map_entity_geometries DISABLE TRIGGER map_geometry_layer_lock_before_write;

UPDATE public.map_entity_geometries geometry
SET
  geometry = target.geometry,
  version = geometry.version + 1,
  change_reason = 'Atualização oficial B1-M141 — footprint métrico em L de 18,00 m²',
  updated_at = transaction_timestamp()
FROM _p1_m141_target target
WHERE geometry.id = target.geometry_id
  AND geometry.geometry IS DISTINCT FROM target.geometry;

ALTER TABLE public.map_entity_geometries ENABLE TRIGGER map_geometry_layer_lock_before_write;

UPDATE public.map_entities module
SET
  metadata = module.metadata || jsonb_build_object(
    'layoutRevision', '2026.4-p1.3',
    'planCoordinateTransform', 'quarter-turn-clockwise',
    'projectionFit', 'metric-contain',
    'metricReference', jsonb_build_object('widthM', 52.70, 'depthM', 22.84),
    'projectionFrame', jsonb_build_object('width', target.frame_width, 'depth', target.frame_depth, 'uniformScale', target.uniform_scale),
    'normalizedFootprint', jsonb_build_object(
      'centerX', 0.02 + 50.25 / 52.70 * 0.96,
      'centerZ', 0.02 + 2.25 / 22.84 * 0.96,
      'width', 4.50 / 52.70 * 0.96,
      'depth', 4.50 / 22.84 * 0.96
    ),
    'normalizedFootprintPolygon', target.normalized_ring,
    'renderParts', jsonb_build_array(
      jsonb_build_object('centerX', 0.02 + 50.25 / 52.70 * 0.96, 'centerZ', 0.02 + 1.50 / 22.84 * 0.96, 'width', 4.50 / 52.70 * 0.96, 'depth', 3.00 / 22.84 * 0.96),
      jsonb_build_object('centerX', 0.02 + 51.00 / 52.70 * 0.96, 'centerZ', 0.02 + 3.75 / 22.84 * 0.96, 'width', 3.00 / 52.70 * 0.96, 'depth', 1.50 / 22.84 * 0.96)
    ),
    'normalizedLabelAnchor', jsonb_build_array(target.label_normalized_x, target.label_normalized_z),
    'labelAnchor', jsonb_build_array(
      target.center_x + ((1 - target.label_normalized_z - 0.5) * target.frame_width) * target.cosine + ((target.label_normalized_x - 0.5) * target.frame_depth) * target.sine,
      target.center_z - ((1 - target.label_normalized_z - 0.5) * target.frame_width) * target.sine + ((target.label_normalized_x - 0.5) * target.frame_depth) * target.cosine
    ),
    'areaM2', 18.00,
    'areaAssignment', 'official-written',
    'officialMeasurements', true
  ),
  updated_at = transaction_timestamp()
FROM _p1_m141_target target
WHERE module.id = target.entity_id
  AND (
    module.metadata->>'layoutRevision' IS DISTINCT FROM '2026.4-p1.3'
    OR module.metadata->>'areaM2' IS DISTINCT FROM '18.00'
    OR module.metadata->'normalizedFootprintPolygon' IS DISTINCT FROM target.normalized_ring
  );

UPDATE public.commercial_lots lot
SET
  official_area_sqm = 18.00,
  area_validation_status = 'VALIDATED',
  updated_at = transaction_timestamp()
FROM _p1_m141_baseline baseline
WHERE lot.id = baseline.lot_id
  AND (lot.official_area_sqm IS DISTINCT FROM 18.00::numeric OR lot.area_validation_status IS DISTINCT FROM 'VALIDATED');

UPDATE public.map_entities pavilion
SET
  metadata = pavilion.metadata || jsonb_build_object(
    'layoutRevision', '2026.4-p1.3',
    'moduleCount', 189,
    'modularAreaM2', 586.50,
    'totalAreaM2', 1201.50
  ),
  updated_at = transaction_timestamp()
FROM _p1_m141_baseline baseline
WHERE pavilion.id = baseline.pavilion_id
  AND (
    pavilion.metadata->>'layoutRevision' IS DISTINCT FROM '2026.4-p1.3'
    OR pavilion.metadata->>'modularAreaM2' IS DISTINCT FROM '586.50'
  );

DO $$
DECLARE
  before_state record;
  after_prices jsonb;
  after_reservations jsonb;
  after_negotiations jsonb;
  after_sales jsonb;
  after_contracts jsonb;
  after_contract_versions jsonb;
  after_status_history jsonb;
  after_lineage jsonb;
BEGIN
  SELECT * INTO before_state FROM _p1_m141_commercial_snapshot;
  SELECT coalesce(jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id), '[]'::jsonb) INTO after_prices FROM public.lot_prices row_value WHERE row_value.lot_id = (SELECT lot_id FROM _p1_m141_baseline);
  SELECT coalesce(jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id), '[]'::jsonb) INTO after_reservations FROM public.lot_reservations row_value WHERE row_value.lot_id = (SELECT lot_id FROM _p1_m141_baseline);
  SELECT coalesce(jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id), '[]'::jsonb) INTO after_negotiations FROM public.lot_negotiations row_value WHERE row_value.lot_id = (SELECT lot_id FROM _p1_m141_baseline);
  SELECT coalesce(jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id), '[]'::jsonb) INTO after_sales FROM public.lot_sales row_value WHERE row_value.lot_id = (SELECT lot_id FROM _p1_m141_baseline);
  SELECT coalesce(jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id), '[]'::jsonb) INTO after_contracts FROM public.lot_contracts row_value WHERE row_value.lot_id = (SELECT lot_id FROM _p1_m141_baseline);
  SELECT coalesce(jsonb_agg(to_jsonb(version_value) ORDER BY version_value.id), '[]'::jsonb) INTO after_contract_versions FROM public.lot_contract_versions version_value JOIN public.lot_contracts contract_value ON contract_value.id = version_value.contract_id WHERE contract_value.lot_id = (SELECT lot_id FROM _p1_m141_baseline);
  SELECT coalesce(jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id), '[]'::jsonb) INTO after_status_history FROM public.lot_status_history row_value WHERE row_value.lot_id = (SELECT lot_id FROM _p1_m141_baseline);
  SELECT coalesce(jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id), '[]'::jsonb) INTO after_lineage FROM public.map_lot_lineage row_value WHERE row_value.source_lot_id = (SELECT lot_id FROM _p1_m141_baseline) OR row_value.target_lot_id = (SELECT lot_id FROM _p1_m141_baseline);

  IF before_state.prices IS DISTINCT FROM after_prices
     OR before_state.reservations IS DISTINCT FROM after_reservations
     OR before_state.negotiations IS DISTINCT FROM after_negotiations
     OR before_state.sales IS DISTINCT FROM after_sales
     OR before_state.contracts IS DISTINCT FROM after_contracts
     OR before_state.contract_versions IS DISTINCT FROM after_contract_versions
     OR before_state.status_history IS DISTINCT FROM after_status_history
     OR before_state.lineage IS DISTINCT FROM after_lineage
     OR EXISTS (SELECT 1 FROM public.commercial_lots lot JOIN _p1_m141_baseline baseline ON baseline.lot_id = lot.id WHERE (to_jsonb(lot) - 'official_area_sqm' - 'updated_at') IS DISTINCT FROM baseline.protected_lot_state)
     OR (SELECT round(sum(lot.official_area_sqm), 2) FROM public.commercial_lots lot JOIN public.map_entities module ON module.id = lot.entity_id JOIN _p1_m141_baseline baseline ON module.parent_entity_id = baseline.pavilion_id WHERE module.classification = 'INTERNAL_STAND' AND module.is_archived = false AND lot.archived_at IS NULL) IS DISTINCT FROM 586.50::numeric
     OR (SELECT official_area_sqm FROM public.commercial_lots WHERE id = (SELECT lot_id FROM _p1_m141_baseline)) IS DISTINCT FROM 18.00::numeric
     OR EXISTS (SELECT 1 FROM public.map_entity_geometries geometry JOIN _p1_m141_target target ON target.geometry_id = geometry.id WHERE geometry.geometry IS DISTINCT FROM target.geometry OR NOT extensions.ST_IsValid(geometry.native_geometry))
  THEN
    RAISE EXCEPTION 'PAVILION_1_M141_FINAL_STATE_INVALID';
  END IF;
END;
$$;

COMMIT;