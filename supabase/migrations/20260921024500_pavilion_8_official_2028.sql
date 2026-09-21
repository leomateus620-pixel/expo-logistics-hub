-- Pavilhão 8 / B4 — planta oficial Fenasoja 2028 (desenho set/2026).
-- Escopo exclusivo: geometria e metadados documentais dos 114 módulos B4.
BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('commercial-map:pavilion-8:2028.1-p8.2:' || project.id::text, 0))
FROM public.map_projects project
WHERE project.is_archived = false
ORDER BY project.id;

CREATE TEMP TABLE _b4_2028_baseline ON COMMIT DROP AS
SELECT entity.id AS entity_id, entity.project_id, entity.public_identifier,
       entity.parent_entity_id, lot.id AS lot_id, lot.status,
       lot.official_area_sqm, lot.area_validation_status
FROM public.map_entities pavilion
JOIN public.map_entities entity
  ON entity.project_id=pavilion.project_id AND entity.parent_entity_id=pavilion.id
 AND entity.classification='INTERNAL_STAND' AND entity.is_archived=false
JOIN public.commercial_lots lot
  ON lot.project_id=entity.project_id AND lot.entity_id=entity.id AND lot.archived_at IS NULL
WHERE pavilion.public_identifier='B4' AND pavilion.classification='PAVILION' AND pavilion.is_archived=false;

CREATE TEMP TABLE _b4_2028_commercial_snapshot ON COMMIT DROP AS
SELECT lot.id AS lot_id, to_jsonb(lot) AS lot_state,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.lot_prices row WHERE row.lot_id=lot.id),'[]'::jsonb) AS prices,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.lot_reservations row WHERE row.lot_id=lot.id),'[]'::jsonb) AS reservations,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.lot_negotiations row WHERE row.lot_id=lot.id),'[]'::jsonb) AS negotiations,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.lot_sales row WHERE row.lot_id=lot.id),'[]'::jsonb) AS sales,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.lot_contracts row WHERE row.lot_id=lot.id),'[]'::jsonb) AS contracts,
  COALESCE((SELECT jsonb_agg(to_jsonb(version) ORDER BY version.id) FROM public.lot_contracts contract JOIN public.lot_contract_versions version ON version.contract_id=contract.id WHERE contract.lot_id=lot.id),'[]'::jsonb) AS contract_versions,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.lot_status_history row WHERE row.lot_id=lot.id),'[]'::jsonb) AS status_history,
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.map_lot_lineage row WHERE row.source_lot_id=lot.id OR row.target_lot_id=lot.id),'[]'::jsonb) AS lineage
FROM public.commercial_lots lot JOIN _b4_2028_baseline baseline ON baseline.lot_id=lot.id;

DO $$
BEGIN
  IF (SELECT count(*) FROM _b4_2028_baseline) <> 114
    OR (SELECT count(DISTINCT entity_id) FROM _b4_2028_baseline) <> 114
    OR (SELECT count(DISTINCT lot_id) FROM _b4_2028_baseline) <> 114
    OR EXISTS (SELECT 1 FROM generate_series(1,114) number LEFT JOIN _b4_2028_baseline baseline ON baseline.public_identifier='B4-M'||lpad(number::text,3,'0') WHERE baseline.entity_id IS NULL)
    OR (SELECT round(sum(official_area_sqm),2) FROM _b4_2028_baseline) IS DISTINCT FROM 438.50::numeric
  THEN RAISE EXCEPTION 'PAVILION_8_2028_IDENTITY_BASELINE_INVALID'; END IF;
END;
$$;

CREATE TEMP TABLE _b4_2028_runs(
  run_id text, first_n integer, last_n integer, left_m numeric, top_m numeric,
  width_m numeric, depth_m numeric, direction text, orientation text,
  role text, group_key text, cluster_key text
) ON COMMIT DROP;
INSERT INTO _b4_2028_runs VALUES
 ('east-lower-01-20',1,20,17.7,14,4,20,'z-decreasing','east-west','perimeter','perimeter-east','east-lower-01-20'),
 ('east-upper-21-25',21,25,17.7,5,4,5,'z-decreasing','east-west','perimeter','perimeter-east','east-upper-21-25'),
 ('north-26-37',26,37,5.5,0,12,3,'x-decreasing','north-south','perimeter','perimeter-north','north-26-37'),
 ('central-east-38-63',38,63,10.85,6,3.5,26,'z-increasing','east-west','island','central-pair','central-east-38-63'),
 ('central-west-64-89',64,89,7.35,6,3.5,26,'z-decreasing','east-west','island','central-pair','central-west-64-89'),
 ('west-upper-91-100',91,100,0,5,4,10,'z-increasing','east-west','perimeter','perimeter-west','west-upper-91-100'),
 ('west-lower-101-114',101,114,0,19,4,14,'z-increasing','east-west','perimeter','perimeter-west','west-lower-101-114');

CREATE TEMP TABLE _b4_2028_metric_cells ON COMMIT DROP AS
WITH regular AS (
 SELECT number AS module_number, run.*,
   CASE WHEN direction LIKE 'x-%' THEN width_m/(last_n-first_n+1) ELSE width_m END AS cell_width,
   CASE WHEN direction LIKE 'z-%' THEN depth_m/(last_n-first_n+1) ELSE depth_m END AS cell_depth,
   CASE WHEN direction LIKE 'x-%' THEN left_m+(CASE WHEN direction='x-decreasing' THEN last_n-number ELSE number-first_n END)*width_m/(last_n-first_n+1) ELSE left_m END AS cell_left,
   CASE WHEN direction LIKE 'z-%' THEN top_m+(CASE WHEN direction='z-decreasing' THEN last_n-number ELSE number-first_n END)*depth_m/(last_n-first_n+1) ELSE top_m END AS cell_top
 FROM _b4_2028_runs run CROSS JOIN LATERAL generate_series(first_n,last_n) number
), cells AS (
 SELECT module_number,run_id,group_key,cluster_key,direction,orientation,role,
   jsonb_build_array(jsonb_build_array(cell_left,cell_top),jsonb_build_array(cell_left+cell_width,cell_top),jsonb_build_array(cell_left+cell_width,cell_top+cell_depth),jsonb_build_array(cell_left,cell_top+cell_depth),jsonb_build_array(cell_left,cell_top)) AS metric_ring,
   jsonb_build_array(jsonb_build_object('left',cell_left,'top',cell_top,'width',cell_width,'depth',cell_depth)) AS metric_parts,
   jsonb_build_array(cell_left+cell_width/2,cell_top+cell_depth/2) AS metric_label,
   CASE WHEN module_number BETWEEN 1 AND 25 OR module_number BETWEEN 91 AND 114 THEN 4.00 WHEN module_number BETWEEN 26 AND 37 THEN 3.00 ELSE 3.50 END::numeric AS area_sqm
 FROM regular
 UNION ALL SELECT 90,'northwest-90','perimeter-west','northwest-90','z-increasing','east-west','perimeter',
   '[[0,0],[5.5,0],[5.5,3],[4,3],[4,5],[0,5],[0,0]]'::jsonb,
   '[{"left":0,"top":0,"width":4,"depth":5},{"left":4,"top":0,"width":1.5,"depth":3}]'::jsonb,
   '[2,2.5]'::jsonb,24.50::numeric
)
SELECT * FROM cells;

DO $$
BEGIN
 IF (SELECT count(*) FROM _b4_2028_metric_cells)<>114
   OR (SELECT round(sum(area_sqm),2) FROM _b4_2028_metric_cells) IS DISTINCT FROM 438.50::numeric
   OR (SELECT area_sqm FROM _b4_2028_metric_cells WHERE module_number=90) IS DISTINCT FROM 24.50::numeric
   OR EXISTS (SELECT 1 FROM _b4_2028_metric_cells a JOIN _b4_2028_metric_cells b ON b.module_number>a.module_number WHERE extensions.ST_Area(extensions.ST_Intersection(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(jsonb_build_object('type','Polygon','coordinates',jsonb_build_array(a.metric_ring))::text),0),extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(jsonb_build_object('type','Polygon','coordinates',jsonb_build_array(b.metric_ring))::text),0)))>0.00000001)
 THEN RAISE EXCEPTION 'PAVILION_8_2028_METRIC_INVENTORY_INVALID'; END IF;
END;
$$;

CREATE TEMP TABLE _b4_2028_frame ON COMMIT DROP AS
WITH bounds AS (
 SELECT pavilion.id AS pavilion_id,pavilion.project_id,geometry.elevation,geometry.calibration_version,
  min((point->>0)::numeric) AS min_x,max((point->>0)::numeric) AS max_x,min((point->>1)::numeric) AS min_z,max((point->>1)::numeric) AS max_z
 FROM public.map_entities pavilion JOIN public.map_entity_geometries geometry ON geometry.project_id=pavilion.project_id AND geometry.entity_id=pavilion.id AND geometry.is_current=true
 CROSS JOIN LATERAL jsonb_array_elements(geometry.geometry->'coordinates'->0) point
 WHERE pavilion.public_identifier='B4' AND pavilion.classification='PAVILION' AND pavilion.is_archived=false
 GROUP BY pavilion.id,pavilion.project_id,geometry.elevation,geometry.calibration_version
), available AS (
 SELECT *,(min_x+max_x)/2 AS center_x,(min_z+max_z)/2 AS center_z,
  (max_x-min_x)-2*LEAST(max_x-min_x,max_z-min_z)*0.025-2*LEAST(max_x-min_x,max_z-min_z)*0.065 AS clear_width,
  (max_z-min_z)-2*LEAST(max_x-min_x,max_z-min_z)*0.025-2*LEAST(max_x-min_x,max_z-min_z)*0.065 AS clear_depth FROM bounds
), fitted AS (SELECT *,LEAST(clear_width/21.7,clear_depth/35.0) AS scale FROM available)
SELECT *,21.7*scale AS frame_width,35.0*scale AS frame_depth,center_z+(clear_depth-35.0*scale)/2 AS frame_center_z FROM fitted;

CREATE TEMP TABLE _b4_2028_cells ON COMMIT DROP AS
WITH normalized AS (
 SELECT baseline.*,metric.*,
  (SELECT jsonb_agg(jsonb_build_array((point->>0)::numeric/21.7,(point->>1)::numeric/35.0) ORDER BY ordinality) FROM jsonb_array_elements(metric.metric_ring) WITH ORDINALITY ring_point(point,ordinality)) AS normalized_ring,
  jsonb_build_array((metric.metric_label->>0)::numeric/21.7,(metric.metric_label->>1)::numeric/35.0) AS normalized_label_anchor,
  (SELECT jsonb_agg(jsonb_build_object('centerX',((part->>'left')::numeric+(part->>'width')::numeric/2)/21.7,'centerZ',((part->>'top')::numeric+(part->>'depth')::numeric/2)/35.0,'width',(part->>'width')::numeric/21.7,'depth',(part->>'depth')::numeric/35.0) ORDER BY ordinality) FROM jsonb_array_elements(metric.metric_parts) WITH ORDINALITY p(part,ordinality)) AS render_parts
 FROM _b4_2028_baseline baseline JOIN _b4_2028_metric_cells metric ON baseline.public_identifier='B4-M'||lpad(metric.module_number::text,3,'0')
), projected AS (
 SELECT normalized.*,frame.pavilion_id,frame.elevation,frame.calibration_version,frame.center_x,frame.frame_center_z,frame.frame_width,frame.frame_depth,
  (SELECT jsonb_agg(jsonb_build_array(frame.center_x-(((point->>0)::numeric-0.5)*frame.frame_width),frame.frame_center_z-(((point->>1)::numeric-0.5)*frame.frame_depth)) ORDER BY ordinality) FROM jsonb_array_elements(normalized.normalized_ring) WITH ORDINALITY ring_point(point,ordinality)) AS world_ring,
  frame.center_x-(((normalized.normalized_label_anchor->>0)::numeric-0.5)*frame.frame_width) AS world_label_x,
  frame.frame_center_z-(((normalized.normalized_label_anchor->>1)::numeric-0.5)*frame.frame_depth) AS world_label_z
 FROM normalized JOIN _b4_2028_frame frame USING(project_id)
)
SELECT *,jsonb_build_object('type','Polygon','coordinates',jsonb_build_array(world_ring)) AS geometry FROM projected;

DO $$
BEGIN
 IF (SELECT count(*) FROM _b4_2028_cells)<>114
   OR EXISTS (SELECT 1 FROM _b4_2028_cells WHERE NOT extensions.ST_IsValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(geometry::text),0)))
 THEN RAISE EXCEPTION 'PAVILION_8_2028_GEOMETRY_STAGE_INVALID'; END IF;
END;
$$;

ALTER TABLE public.map_entity_geometries DISABLE TRIGGER map_geometry_layer_lock_before_write;
UPDATE public.map_entity_geometries geometry
SET geometry=staged.geometry,version=geometry.version+1,change_reason='Planta oficial Pavilhão 8 — Fenasoja 2028 (desenho set/2026)',updated_at=transaction_timestamp()
FROM _b4_2028_cells staged
WHERE geometry.project_id=staged.project_id AND geometry.entity_id=staged.entity_id AND geometry.is_current=true AND geometry.geometry IS DISTINCT FROM staged.geometry;
ALTER TABLE public.map_entity_geometries ENABLE TRIGGER map_geometry_layer_lock_before_write;

UPDATE public.map_entities entity
SET metadata=entity.metadata||jsonb_build_object(
 'source','Planta PAVILHÃO 8 - Fenasoja 2028.pdf','sourceRevision','2028.1','sourceDrawingDate','2026-09','referenceYear',2028,'layoutRevision','2028.1-p8.2',
 'normalizedFootprint',jsonb_build_object('centerX',(SELECT avg((p->>0)::numeric) FROM jsonb_array_elements(staged.normalized_ring- (jsonb_array_length(staged.normalized_ring)-1)) p),'centerZ',(SELECT avg((p->>1)::numeric) FROM jsonb_array_elements(staged.normalized_ring- (jsonb_array_length(staged.normalized_ring)-1)) p),'width',(SELECT max((p->>0)::numeric)-min((p->>0)::numeric) FROM jsonb_array_elements(staged.normalized_ring) p),'depth',(SELECT max((p->>1)::numeric)-min((p->>1)::numeric) FROM jsonb_array_elements(staged.normalized_ring) p)),
 'normalizedFootprintPolygon',staged.normalized_ring,'renderParts',staged.render_parts,'normalizedLabelAnchor',staged.normalized_label_anchor,'labelAnchor',jsonb_build_array(staged.world_label_x,staged.world_label_z),
 'areaM2',staged.area_sqm,'areaAssignment',CASE WHEN staged.module_number=90 THEN 'official-written' ELSE 'official-modular-grid' END,'officialMeasurements',true,
 'group',staged.group_key,'cluster',staged.cluster_key,'orientation',staged.orientation,'sequenceOrientation',staged.direction
),updated_at=transaction_timestamp()
FROM _b4_2028_cells staged WHERE entity.id=staged.entity_id;

WITH runs AS (
 SELECT jsonb_agg(jsonb_build_object('id',run_id,'numberRange',jsonb_build_array(first_n,last_n),'role',role,'orientation',orientation,'sequenceOrientation',direction,'group',group_key,'cluster',cluster_key,'normalizedFootprint',jsonb_build_object('centerX',(left_m+width_m/2)/21.7,'centerZ',(top_m+depth_m/2)/35.0,'width',width_m/21.7,'depth',depth_m/35.0)) ORDER BY first_n) AS payload FROM (
  SELECT * FROM _b4_2028_runs UNION ALL SELECT 'northwest-90',90,90,0,0,5.5,5,'z-increasing','east-west','perimeter','perimeter-west','northwest-90'
 ) all_runs
), corridors AS (
 SELECT jsonb_agg(jsonb_build_object('id',id,'label',label,'kind',kind,'type','circulation-non-commercial','normalizedFootprint',jsonb_build_object('centerX',(left_m+width_m/2)/21.7,'centerZ',(top_m+depth_m/2)/35.0,'width',width_m/21.7,'depth',depth_m/35.0)) ORDER BY id) AS payload
 FROM (VALUES
 ('west-commercial-aisle','Corredor comercial esquerdo','main',4.00,5.00,3.35,29.00),('east-commercial-aisle','Corredor comercial direito','main',14.35,5.00,3.35,30.00),('north-distribution','Acesso à porta de emergência','access',5.50,3.00,12.20,3.00),('west-cross-access','Acesso lateral ao Pavilhão 13','cross',0.00,15.00,7.35,4.00),('east-cross-access','Acesso lateral ao Pavilhão 12','cross',14.35,10.00,7.35,4.00),('south-entrance','Entradas e saídas principais','access',4.00,32.00,13.70,3.00)
 ) c(id,label,kind,left_m,top_m,width_m,depth_m)
), supports AS (
 SELECT jsonb_agg(jsonb_build_object('id',id,'label',label,'kind',kind,'type','permanent-non-commercial','sourcePrecision','plan-traced','normalizedFootprint',jsonb_build_object('centerX',(left_m+width_m/2)/21.7,'centerZ',(top_m+depth_m/2)/35.0,'width',width_m/21.7,'depth',depth_m/35.0)) ORDER BY id) AS payload
 FROM (VALUES ('sanitarios','Sanitários','sanitary',0.00,-7.40,7.10,7.40),('cozinha','Cozinha','kitchen',7.10,-7.40,11.90,7.40),('apoio-cozinha','Apoio de serviço','service',19.00,-6.40,2.70,6.40)) s(id,label,kind,left_m,top_m,width_m,depth_m)
)
UPDATE public.map_entities pavilion SET
 name='Pavilhão 8 — Indústria, Comércio e Serviços',
 metadata=pavilion.metadata||jsonb_build_object(
  'source','Planta PAVILHÃO 8 - Fenasoja 2028.pdf','sourceRevision','2028.1','sourceDrawingDate','2026-09','referenceYear',2028,'layoutRevision','2028.1-p8.2','officialMeasurements',true,
  'internalOfficialPlan',jsonb_build_object('layoutRevision','2028.1-p8.2','source','Planta PAVILHÃO 8 - Fenasoja 2028.pdf','interpretation','official-reference-runs','projection',jsonb_build_object('coordinateTransform','identity','fit','metric-contain','metricWidthM',21.7,'metricDepthM',35.0,'alignX','center','alignZ','end'),'stats',jsonb_build_object('pavilionNumber',8,'moduleCount',114,'totalAreaM2',760.20,'modularAreaM2',438.50,'individualAreaM2',NULL),'legendNumberRanges','[[1,20],[21,37],[38,89],[90,114]]'::jsonb),
  'internalPlanRuns',runs.payload,'internalCorridors',corridors.payload,'internalSupportSpaces',supports.payload
 ),updated_at=transaction_timestamp()
FROM runs,corridors,supports
WHERE pavilion.public_identifier='B4' AND pavilion.classification='PAVILION' AND pavilion.is_archived=false;

DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM _b4_2028_baseline baseline JOIN public.map_entities entity ON entity.id=baseline.entity_id JOIN public.commercial_lots lot ON lot.id=baseline.lot_id WHERE entity.public_identifier IS DISTINCT FROM baseline.public_identifier OR entity.parent_entity_id IS DISTINCT FROM baseline.parent_entity_id OR lot.status IS DISTINCT FROM baseline.status OR lot.official_area_sqm IS DISTINCT FROM baseline.official_area_sqm OR lot.area_validation_status IS DISTINCT FROM baseline.area_validation_status)
 OR EXISTS (
  WITH current_state AS (
   SELECT lot.id AS lot_id,to_jsonb(lot) AS lot_state,
    COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.lot_prices row WHERE row.lot_id=lot.id),'[]'::jsonb) AS prices,
    COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.lot_reservations row WHERE row.lot_id=lot.id),'[]'::jsonb) AS reservations,
    COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.lot_negotiations row WHERE row.lot_id=lot.id),'[]'::jsonb) AS negotiations,
    COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.lot_sales row WHERE row.lot_id=lot.id),'[]'::jsonb) AS sales,
    COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.lot_contracts row WHERE row.lot_id=lot.id),'[]'::jsonb) AS contracts,
    COALESCE((SELECT jsonb_agg(to_jsonb(version) ORDER BY version.id) FROM public.lot_contracts contract JOIN public.lot_contract_versions version ON version.contract_id=contract.id WHERE contract.lot_id=lot.id),'[]'::jsonb) AS contract_versions,
    COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.lot_status_history row WHERE row.lot_id=lot.id),'[]'::jsonb) AS status_history,
    COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.map_lot_lineage row WHERE row.source_lot_id=lot.id OR row.target_lot_id=lot.id),'[]'::jsonb) AS lineage
   FROM public.commercial_lots lot JOIN _b4_2028_baseline baseline ON baseline.lot_id=lot.id
  ) SELECT 1 FROM _b4_2028_commercial_snapshot previous FULL JOIN current_state current USING(lot_id) WHERE current.lot_id IS NULL OR previous.lot_id IS NULL OR current.lot_state IS DISTINCT FROM previous.lot_state OR current.prices IS DISTINCT FROM previous.prices OR current.reservations IS DISTINCT FROM previous.reservations OR current.negotiations IS DISTINCT FROM previous.negotiations OR current.sales IS DISTINCT FROM previous.sales OR current.contracts IS DISTINCT FROM previous.contracts OR current.contract_versions IS DISTINCT FROM previous.contract_versions OR current.status_history IS DISTINCT FROM previous.status_history OR current.lineage IS DISTINCT FROM previous.lineage
 )
 OR EXISTS (SELECT 1 FROM _b4_2028_cells staged JOIN public.map_entity_geometries geometry ON geometry.entity_id=staged.entity_id AND geometry.project_id=staged.project_id AND geometry.is_current=true WHERE geometry.geometry IS DISTINCT FROM staged.geometry)
 OR EXISTS (SELECT 1 FROM public.map_entities entity JOIN _b4_2028_baseline baseline ON baseline.entity_id=entity.id WHERE entity.metadata->>'layoutRevision'<>'2028.1-p8.2' OR entity.metadata->>'referenceYear'<>'2028')
 OR EXISTS (SELECT 1 FROM public.map_entities pavilion WHERE pavilion.public_identifier='B4' AND pavilion.classification='PAVILION' AND not pavilion.is_archived AND (pavilion.name<>'Pavilhão 8 — Indústria, Comércio e Serviços' OR pavilion.metadata->'internalOfficialPlan'->>'layoutRevision'<>'2028.1-p8.2' OR pavilion.metadata->'internalOfficialPlan'->'projection'->>'metricDepthM'<>'35.0' OR jsonb_array_length(pavilion.metadata->'internalPlanRuns')<>8 OR jsonb_array_length(pavilion.metadata->'internalCorridors')<>6 OR jsonb_array_length(pavilion.metadata->'internalSupportSpaces')<>3))
 THEN RAISE EXCEPTION 'PAVILION_8_2028_FINAL_STATE_INVALID'; END IF;
END;
$$;

COMMIT;
