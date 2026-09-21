-- Pavilhão 13 / B5 — planta oficial Fenasoja 2028 (desenho set/2026).
-- Escopo exclusivo: geometria, áreas oficiais e metadados de fonte dos 103 módulos B5.
BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('commercial-map:pavilion-13:2028.1-p13.2:' || project.id::text, 0))
FROM public.map_projects project
WHERE project.is_archived = false
ORDER BY project.id;

CREATE TEMP TABLE _b5_2028_baseline ON COMMIT DROP AS
SELECT entity.id AS entity_id, entity.project_id, entity.public_identifier,
       entity.metadata, lot.id AS lot_id, lot.status,
       lot.official_area_sqm, lot.area_validation_status
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
WHERE pavilion.public_identifier = 'B5'
  AND pavilion.classification = 'PAVILION'
  AND pavilion.is_archived = false;

CREATE TEMP TABLE _b5_2028_price_baseline ON COMMIT DROP AS
SELECT price.id, to_jsonb(price) AS row_state
FROM public.lot_prices price
JOIN _b5_2028_baseline baseline ON baseline.lot_id = price.lot_id;

DO $$
BEGIN
  IF (SELECT count(*) FROM _b5_2028_baseline) <> 103
    OR (SELECT count(DISTINCT entity_id) FROM _b5_2028_baseline) <> 103
    OR (SELECT count(DISTINCT lot_id) FROM _b5_2028_baseline) <> 103
    OR EXISTS (
      SELECT 1 FROM generate_series(1, 103) number
      LEFT JOIN _b5_2028_baseline baseline
        ON baseline.public_identifier = 'B5-M' || lpad(number::text, 3, '0')
      WHERE baseline.entity_id IS NULL
    )
  THEN RAISE EXCEPTION 'PAVILION_13_2028_IDENTITY_BASELINE_INVALID';
  END IF;
END;
$$;

CREATE TEMP TABLE _b5_2028_runs(
  first_n integer, last_n integer, left_m numeric, top_m numeric,
  width_m numeric, depth_m numeric, direction text
) ON COMMIT DROP;
INSERT INTO _b5_2028_runs VALUES
  (1,15,16.8,22.8,3,15,'z-decreasing'),
  (16,24,16.8,6,3,9,'z-decreasing'),
  (27,29,8.4,0,3,3,'x-decreasing'),
  (30,53,9.9,9.25,3,24,'z-increasing'),
  (54,77,6.9,9.25,3,24,'z-decreasing'),
  (80,88,0,6,3,9,'z-increasing'),
  (89,103,0,22.8,3,15,'z-increasing');

CREATE TEMP TABLE _b5_2028_metric_cells ON COMMIT DROP AS
WITH regular AS (
  SELECT number AS module_number,
         CASE WHEN run.direction LIKE 'x-%' THEN run.width_m / (run.last_n-run.first_n+1) ELSE run.width_m END AS width_m,
         CASE WHEN run.direction LIKE 'z-%' THEN run.depth_m / (run.last_n-run.first_n+1) ELSE run.depth_m END AS depth_m,
         CASE WHEN run.direction LIKE 'x-%' THEN
           run.left_m + (CASE WHEN run.direction='x-decreasing' THEN run.last_n-number ELSE number-run.first_n END)
             * run.width_m/(run.last_n-run.first_n+1)
         ELSE run.left_m END AS left_m,
         CASE WHEN run.direction LIKE 'z-%' THEN
           run.top_m + (CASE WHEN run.direction='z-decreasing' THEN run.last_n-number ELSE number-run.first_n END)
             * run.depth_m/(run.last_n-run.first_n+1)
         ELSE run.top_m END AS top_m
  FROM _b5_2028_runs run
  CROSS JOIN LATERAL generate_series(run.first_n, run.last_n) number
), all_cells AS (
  SELECT module_number,
         jsonb_build_array(
           jsonb_build_array(left_m,top_m), jsonb_build_array(left_m+width_m,top_m),
           jsonb_build_array(left_m+width_m,top_m+depth_m), jsonb_build_array(left_m,top_m+depth_m),
           jsonb_build_array(left_m,top_m)
         ) AS metric_ring,
         jsonb_build_array(left_m+width_m/2,top_m+depth_m/2) AS metric_label,
         3.00::numeric AS area_sqm
  FROM regular
  UNION ALL SELECT 25,'[[19.8,0],[19.8,6],[16.8,6],[16.8,3],[19.8,0]]'::jsonb,'[18.3,4.5]'::jsonb,13.50
  UNION ALL SELECT 26,'[[13.8,0],[19.8,0],[16.8,3],[13.8,3],[13.8,0]]'::jsonb,'[16.2,1.35]'::jsonb,13.50
  UNION ALL SELECT 78,'[[0,0],[6,0],[6,3],[3,3],[0,0]]'::jsonb,'[3.6,1.35]'::jsonb,13.50
  UNION ALL SELECT 79,'[[0,0],[3,3],[3,6],[0,6],[0,0]]'::jsonb,'[1.5,4.5]'::jsonb,13.50
)
SELECT * FROM all_cells;

DO $$
BEGIN
  IF (SELECT count(*) FROM _b5_2028_metric_cells) <> 103
    OR (SELECT round(sum(area_sqm),2) FROM _b5_2028_metric_cells) IS DISTINCT FROM 351.00::numeric
    OR EXISTS (
      SELECT 1 FROM _b5_2028_metric_cells
      WHERE module_number IN (25,26,78,79) AND area_sqm IS DISTINCT FROM 13.50::numeric
    )
    OR EXISTS (
      SELECT 1 FROM _b5_2028_metric_cells
      WHERE module_number NOT IN (25,26,78,79) AND area_sqm IS DISTINCT FROM 3.00::numeric
    )
  THEN RAISE EXCEPTION 'PAVILION_13_2028_METRIC_INVENTORY_INVALID';
  END IF;
END;
$$;

CREATE TEMP TABLE _b5_2028_frame ON COMMIT DROP AS
WITH bounds AS (
  SELECT pavilion.id AS pavilion_id, pavilion.project_id,
         geometry.elevation, geometry.calibration_version,
         min((point->>0)::numeric) AS min_x, max((point->>0)::numeric) AS max_x,
         min((point->>1)::numeric) AS min_z, max((point->>1)::numeric) AS max_z
  FROM public.map_entities pavilion
  JOIN public.map_entity_geometries geometry
    ON geometry.project_id=pavilion.project_id AND geometry.entity_id=pavilion.id AND geometry.is_current=true
  CROSS JOIN LATERAL jsonb_array_elements(geometry.geometry->'coordinates'->0) point
  WHERE pavilion.public_identifier='B5' AND pavilion.classification='PAVILION' AND pavilion.is_archived=false
  GROUP BY pavilion.id,pavilion.project_id,geometry.elevation,geometry.calibration_version
), available AS (
  SELECT *, (min_x+max_x)/2 AS center_x, (min_z+max_z)/2 AS center_z,
    (max_x-min_x)-2*LEAST(max_x-min_x,max_z-min_z)*0.025-2*LEAST(max_x-min_x,max_z-min_z)*0.065 AS clear_width,
    (max_z-min_z)-2*LEAST(max_x-min_x,max_z-min_z)*0.025-2*LEAST(max_x-min_x,max_z-min_z)*0.065 AS clear_depth
  FROM bounds
), fitted AS (
  SELECT *, LEAST(clear_width/19.8,clear_depth/37.8) AS scale
  FROM available
)
SELECT *, 19.8*scale AS frame_width,37.8*scale AS frame_depth,
       center_z+(clear_depth-37.8*scale)/2 AS frame_center_z
FROM fitted;

CREATE TEMP TABLE _b5_2028_cells ON COMMIT DROP AS
WITH normalized AS (
  SELECT baseline.*, metric.module_number,metric.area_sqm,
         (SELECT jsonb_agg(jsonb_build_array((point->>0)::numeric/19.8,(point->>1)::numeric/37.8) ORDER BY ordinality)
          FROM jsonb_array_elements(metric.metric_ring) WITH ORDINALITY ring_point(point,ordinality)) AS normalized_ring,
         jsonb_build_array((metric.metric_label->>0)::numeric/19.8,(metric.metric_label->>1)::numeric/37.8) AS normalized_label_anchor
  FROM _b5_2028_baseline baseline
  JOIN _b5_2028_metric_cells metric
    ON baseline.public_identifier='B5-M'||lpad(metric.module_number::text,3,'0')
), projected AS (
  SELECT normalized.*,frame.pavilion_id,frame.elevation,frame.calibration_version,
         frame.center_x,frame.frame_center_z,frame.frame_width,frame.frame_depth,
         (SELECT jsonb_agg(jsonb_build_array(
             frame.center_x-(((point->>0)::numeric-0.5)*frame.frame_width),
             frame.frame_center_z-(((point->>1)::numeric-0.5)*frame.frame_depth)
           ) ORDER BY ordinality)
          FROM jsonb_array_elements(normalized.normalized_ring) WITH ORDINALITY ring_point(point,ordinality)) AS world_ring,
         frame.center_x-(((normalized.normalized_label_anchor->>0)::numeric-0.5)*frame.frame_width) AS world_label_x,
         frame.frame_center_z-(((normalized.normalized_label_anchor->>1)::numeric-0.5)*frame.frame_depth) AS world_label_z
  FROM normalized JOIN _b5_2028_frame frame USING(project_id)
)
SELECT *,jsonb_build_object('type','Polygon','coordinates',jsonb_build_array(world_ring)) AS geometry
FROM projected;

DO $$
BEGIN
  IF (SELECT count(*) FROM _b5_2028_cells) <> 103
    OR EXISTS (SELECT 1 FROM _b5_2028_cells WHERE NOT extensions.ST_IsValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(geometry::text),0)))
    OR EXISTS (
      SELECT 1 FROM _b5_2028_cells a JOIN _b5_2028_cells b
        ON b.project_id=a.project_id AND b.module_number>a.module_number
      WHERE extensions.ST_Area(extensions.ST_Intersection(
        extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(a.geometry::text),0),
        extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(b.geometry::text),0)))>0.00000001
    )
  THEN RAISE EXCEPTION 'PAVILION_13_2028_GEOMETRY_STAGE_INVALID';
  END IF;
END;
$$;

ALTER TABLE public.map_entity_geometries DISABLE TRIGGER map_geometry_layer_lock_before_write;

UPDATE public.map_entity_geometries geometry
SET geometry=staged.geometry,
    version=geometry.version+1,
    change_reason='Planta oficial Pavilhão 13 — Fenasoja 2028 (desenho set/2026)',
    updated_at=transaction_timestamp()
FROM _b5_2028_cells staged
WHERE geometry.project_id=staged.project_id
  AND geometry.entity_id=staged.entity_id
  AND geometry.is_current=true
  AND geometry.geometry IS DISTINCT FROM staged.geometry;

ALTER TABLE public.map_entity_geometries ENABLE TRIGGER map_geometry_layer_lock_before_write;

UPDATE public.commercial_lots lot
SET official_area_sqm=staged.area_sqm,
    area_validation_status=CASE WHEN staged.module_number IN (25,26,78,79) THEN 'VALIDATED' ELSE 'CALCULATED' END,
    updated_at=transaction_timestamp()
FROM _b5_2028_cells staged
WHERE lot.id=staged.lot_id
  AND (lot.official_area_sqm IS DISTINCT FROM staged.area_sqm
    OR lot.area_validation_status IS DISTINCT FROM CASE WHEN staged.module_number IN (25,26,78,79) THEN 'VALIDATED' ELSE 'CALCULATED' END);

UPDATE public.map_entities entity
SET metadata=entity.metadata||jsonb_build_object(
      'source','Planta Pavilhão 13 — Fenasoja 2028 (desenho set/2026).pdf',
      'sourceRevision','2028.1','sourceDrawingDate','2026-09','referenceYear',2028,
      'layoutRevision','2028.1-p13.2','normalizedFootprintPolygon',staged.normalized_ring,
      'normalizedLabelAnchor',staged.normalized_label_anchor,
      'labelAnchor',jsonb_build_array(staged.world_label_x,staged.world_label_z),
      'areaM2',staged.area_sqm,
      'areaAssignment',CASE WHEN staged.module_number IN (25,26,78,79) THEN 'official-written' ELSE 'official-modular-grid' END,
      'officialMeasurements',true
    ),updated_at=transaction_timestamp()
FROM _b5_2028_cells staged
WHERE entity.id=staged.entity_id;

UPDATE public.map_entities pavilion
SET metadata=pavilion.metadata||jsonb_build_object(
      'source','Planta Pavilhão 13 — Fenasoja 2028 (desenho set/2026).pdf',
      'sourceRevision','2028.1','sourceDrawingDate','2026-09','referenceYear',2028,
      'layoutRevision','2028.1-p13.2','moduleCount',103,'modularAreaM2',351.00,'totalAreaM2',709.00,
      'metricReference',jsonb_build_object('widthM',19.8,'depthM',37.8,'inset',0)
    ),updated_at=transaction_timestamp()
WHERE pavilion.public_identifier='B5' AND pavilion.classification='PAVILION' AND pavilion.is_archived=false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM _b5_2028_baseline baseline
    JOIN public.map_entities entity ON entity.id=baseline.entity_id
    JOIN public.commercial_lots lot ON lot.id=baseline.lot_id
    WHERE entity.public_identifier IS DISTINCT FROM baseline.public_identifier
       OR lot.status IS DISTINCT FROM baseline.status
  )
    OR EXISTS (
      SELECT 1 FROM _b5_2028_price_baseline baseline
      LEFT JOIN public.lot_prices price ON price.id=baseline.id
      WHERE price.id IS NULL OR to_jsonb(price) IS DISTINCT FROM baseline.row_state
    )
    OR (SELECT count(*) FROM public.lot_prices price JOIN _b5_2028_baseline baseline ON baseline.lot_id=price.lot_id)
       <> (SELECT count(*) FROM _b5_2028_price_baseline)
    OR (SELECT round(sum(lot.official_area_sqm),2) FROM public.commercial_lots lot JOIN _b5_2028_baseline baseline ON baseline.lot_id=lot.id)
       IS DISTINCT FROM 351.00::numeric
    OR EXISTS (
      SELECT 1 FROM _b5_2028_cells staged
      JOIN public.map_entity_geometries geometry ON geometry.entity_id=staged.entity_id AND geometry.project_id=staged.project_id AND geometry.is_current=true
      WHERE geometry.geometry IS DISTINCT FROM staged.geometry
    )
    OR EXISTS (
      SELECT 1 FROM public.map_entities entity JOIN _b5_2028_baseline baseline ON baseline.entity_id=entity.id
      WHERE entity.metadata->>'layoutRevision'<>'2028.1-p13.2' OR entity.metadata->>'referenceYear'<>'2028'
    )
  THEN RAISE EXCEPTION 'PAVILION_13_2028_FINAL_STATE_INVALID';
  END IF;
END;
$$;

COMMIT;