BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('commercial-map:pavilion-13:2028.2-p13.3:' || project.id::text, 0))
FROM public.map_projects project WHERE project.is_archived=false ORDER BY project.id;

CREATE TEMP TABLE _p13_parent ON COMMIT DROP AS
SELECT p.id pavilion_id,p.project_id,p.layer_id,p.segment_id,g.elevation,g.calibration_version,
 min((pt->>0)::numeric) min_x,max((pt->>0)::numeric) max_x,
 min((pt->>1)::numeric) min_z,max((pt->>1)::numeric) max_z
FROM public.map_entities p JOIN public.map_entity_geometries g ON g.entity_id=p.id AND g.is_current
CROSS JOIN LATERAL jsonb_array_elements(g.geometry->'coordinates'->0) pt
WHERE p.public_identifier='B5' AND p.classification='PAVILION' AND NOT p.is_archived
GROUP BY p.id,p.project_id,p.layer_id,p.segment_id,g.elevation,g.calibration_version;

CREATE TEMP TABLE _p13_old ON COMMIT DROP AS
SELECT e.id entity_id,e.project_id,e.public_identifier,l.id lot_id,l.status
FROM _p13_parent p JOIN public.map_entities e ON e.parent_entity_id=p.pavilion_id AND e.classification='INTERNAL_STAND' AND NOT e.is_archived
JOIN public.commercial_lots l ON l.entity_id=e.id AND l.archived_at IS NULL;

DO $$ BEGIN
 IF (SELECT count(*) FROM _p13_old) NOT IN (103,104)
 OR EXISTS(SELECT 1 FROM generate_series(1,103) n LEFT JOIN _p13_old o ON o.public_identifier='B5-M'||lpad(n::text,3,'0') WHERE o.entity_id IS NULL)
 THEN RAISE EXCEPTION 'PAVILION_13_IDENTITY_BASELINE_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM _p13_old WHERE status<>'AVAILABLE')
 OR EXISTS(SELECT 1 FROM public.lot_sales x JOIN _p13_old o ON o.lot_id=x.lot_id)
 OR EXISTS(SELECT 1 FROM public.lot_reservations x JOIN _p13_old o ON o.lot_id=x.lot_id)
 OR EXISTS(SELECT 1 FROM public.lot_negotiations x JOIN _p13_old o ON o.lot_id=x.lot_id)
 OR EXISTS(SELECT 1 FROM public.lot_contracts x JOIN _p13_old o ON o.lot_id=x.lot_id)
 OR EXISTS(SELECT 1 FROM public.lot_sale_order_items x JOIN _p13_old o ON o.lot_id=x.lot_id)
 THEN RAISE EXCEPTION 'PAVILION_13_COMMERCIAL_ACTIVITY_REQUIRES_RECONCILIATION'; END IF;
END $$;

CREATE TEMP TABLE _p13_runs(id text,a int,b int,x numeric,z numeric,w numeric,d numeric,dir text,orient text,role text,grp text,cluster text) ON COMMIT DROP;
INSERT INTO _p13_runs VALUES
('east-lower-01-15',1,15,16.8,22.8,3,15,'z-decreasing','east-west','perimeter','perimeter-east','east-01-26'),
('east-upper-16-24',16,24,16.8,6,3,9,'z-decreasing','east-west','perimeter','perimeter-east','east-01-26'),
('central-east-27-52',27,52,9.9,6,3,26,'z-increasing','east-west','island','central-pair','central-27-78'),
('central-west-53-78',53,78,6.9,6,3,26,'z-decreasing','east-west','island','central-pair','central-27-78'),
('west-upper-81-89',81,89,0,6,3,9,'z-increasing','east-west','perimeter','perimeter-west','west-79-104'),
('west-lower-90-104',90,104,0,22.8,3,15,'z-increasing','east-west','perimeter','perimeter-west','west-79-104');

CREATE TEMP TABLE _p13_metric ON COMMIT DROP AS
WITH r AS (
 SELECT q.*,n,
 CASE WHEN dir LIKE 'x-%' THEN w/(b-a+1) ELSE w END cw,
 CASE WHEN dir LIKE 'z-%' THEN d/(b-a+1) ELSE d END cd,
 CASE WHEN dir LIKE 'x-%' THEN x+(CASE WHEN dir='x-decreasing' THEN b-n ELSE n-a END)*w/(b-a+1) ELSE x END cx,
 CASE WHEN dir LIKE 'z-%' THEN z+(CASE WHEN dir='z-decreasing' THEN b-n ELSE n-a END)*d/(b-a+1) ELSE z END cz
 FROM _p13_runs q CROSS JOIN LATERAL generate_series(a,b) n
), c AS (
 SELECT n,id,orient,dir,role,grp,cluster,
 jsonb_build_array(jsonb_build_array(cx,cz),jsonb_build_array(cx+cw,cz),jsonb_build_array(cx+cw,cz+cd),jsonb_build_array(cx,cz+cd),jsonb_build_array(cx,cz)) ring,
 jsonb_build_array(cx+cw/2,cz+cd/2) label,3.00::numeric area FROM r
 UNION ALL SELECT 25,'northeast-irregular-25','east-west','z-increasing','perimeter','perimeter-east','east-01-26','[[19.8,0],[19.8,6],[16.8,6],[16.8,3],[19.8,0]]','[18.3,4.5]',13.50
 UNION ALL SELECT 26,'northeast-irregular-26','north-south','x-increasing','perimeter','perimeter-east','east-01-26','[[15.3,0],[19.8,0],[16.8,3],[15.3,3],[15.3,0]]','[17.25,1.35]',9.00
 UNION ALL SELECT 79,'northwest-irregular-79','north-south','x-increasing','perimeter','perimeter-west','west-79-104','[[0,0],[4.5,0],[4.5,3],[3,3],[0,0]]','[2.55,1.35]',9.00
 UNION ALL SELECT 80,'northwest-irregular-80','east-west','z-increasing','perimeter','perimeter-west','west-79-104','[[0,0],[3,3],[3,6],[0,6],[0,0]]','[1.5,4.5]',13.50
) SELECT n,id,orient,dir,role,grp,cluster,ring::jsonb,label::jsonb,area FROM c;

DO $$ BEGIN
 IF (SELECT count(*) FROM _p13_metric)<>104 OR (SELECT count(DISTINCT n) FROM _p13_metric)<>104
 OR (SELECT round(sum(area),2) FROM _p13_metric)<>345.00
 OR EXISTS(SELECT 1 FROM generate_series(1,104) n LEFT JOIN _p13_metric m USING(n) WHERE m.n IS NULL)
 THEN RAISE EXCEPTION 'PAVILION_13_METRIC_INVENTORY_INVALID'; END IF;
END $$;

CREATE TEMP TABLE _p13_stage ON COMMIT DROP AS
WITH f AS (
 SELECT p.*,(min_x+max_x)/2 center_x,(min_z+max_z)/2 center_z,
 (max_x-min_x)-2*least(max_x-min_x,max_z-min_z)*0.09 clear_w,
 (max_z-min_z)-2*least(max_x-min_x,max_z-min_z)*0.09 clear_d FROM _p13_parent p
), s AS (SELECT f.*,least(clear_w/19.8,clear_d/37.8) scale FROM f), n AS (
 SELECT s.*,m.*,'B5-M'||lpad(m.n::text,3,'0') public_identifier,
 (SELECT jsonb_agg(jsonb_build_array((pt->>0)::numeric/19.8,(pt->>1)::numeric/37.8) ORDER BY ord) FROM jsonb_array_elements(m.ring) WITH ORDINALITY p(pt,ord)) nr,
 jsonb_build_array((m.label->>0)::numeric/19.8,(m.label->>1)::numeric/37.8) nl,
 19.8*scale fw,37.8*scale fd,center_z+(clear_d-37.8*scale)/2 fz FROM s CROSS JOIN _p13_metric m
), w AS (
 SELECT n.*,(SELECT jsonb_agg(jsonb_build_array(center_x-(((pt->>0)::numeric-.5)*fw),fz-(((pt->>1)::numeric-.5)*fd)) ORDER BY ord) FROM jsonb_array_elements(n.nr) WITH ORDINALITY p(pt,ord)) wr,
 center_x-(((nl->>0)::numeric-.5)*fw) lx,fz-(((nl->>1)::numeric-.5)*fd) lz FROM n
) SELECT w.*,jsonb_build_object('type','Polygon','coordinates',jsonb_build_array(wr)) geometry FROM w;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM _p13_stage WHERE NOT extensions.ST_IsValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(geometry::text),0)))
 OR EXISTS(SELECT 1 FROM _p13_stage a JOIN _p13_stage b ON b.project_id=a.project_id AND b.n>a.n WHERE extensions.ST_Area(extensions.ST_Intersection(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(a.geometry::text),0),extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(b.geometry::text),0)))>0.00000001)
 THEN RAISE EXCEPTION 'PAVILION_13_GEOMETRY_INVALID'; END IF;
END $$;

INSERT INTO public.map_entities(id,project_id,layer_id,parent_entity_id,public_identifier,name,classification,verification_status,is_sellable,is_archived,metadata,created_at,updated_at)
SELECT gen_random_uuid(),project_id,layer_id,pavilion_id,public_identifier,'Módulo 104','INTERNAL_STAND','NEEDS_REVIEW',true,false,'{"buyerDataImported":false}',transaction_timestamp(),transaction_timestamp()
FROM _p13_stage s WHERE n=104 AND NOT EXISTS(SELECT 1 FROM public.map_entities e WHERE e.project_id=s.project_id AND e.public_identifier=s.public_identifier)
ON CONFLICT(project_id,public_identifier) DO NOTHING;

CREATE TEMP TABLE _p13_map ON COMMIT DROP AS SELECT s.*,e.id entity_id FROM _p13_stage s JOIN public.map_entities e ON e.project_id=s.project_id AND e.public_identifier=s.public_identifier AND NOT e.is_archived;

UPDATE public.map_entities e SET name='Módulo '||lpad(s.n::text,2,'0'),
metadata=(coalesce(e.metadata,'{}')-ARRAY['source','sourceRevision','layoutRevision','moduleNumber','lotNumber','pavilionModuleKey','areaM2','areaAssignment','normalizedFootprintPolygon','normalizedLabelAnchor','labelAnchor','orientation','sequenceOrientation','group','cluster','sortOrder'])||jsonb_build_object(
'source','Ajuste_Pav13_1.pdf (setembro/2026)','sourceRevision','2028.2','layoutRevision','2028.2-p13.3','sourceDrawingDate','2026-09','referenceYear',2028,'parentPublicIdentifier','B5','pavilionPublicIdentifier','B5','pavilionModuleKey','B5:module:'||lpad(s.n::text,3,'0'),'pavilionNumber',13,'commercialBlock','P13','moduleNumber',s.n,'lotNumber',lpad(s.n::text,2,'0'),'sortOrder',s.n,'type','commercial-lot','moduleType','commercial-lot','areaM2',s.area,'areaAssignment',CASE WHEN s.n IN(25,26,79,80) THEN 'official-written' ELSE 'official-modular-grid' END,'officialMeasurements',true,'normalizedFootprintPolygon',s.nr,'normalizedLabelAnchor',s.nl,'labelAnchor',jsonb_build_array(s.lx,s.lz),'orientation',s.orient,'sequenceOrientation',s.dir,'group',s.grp,'cluster',s.cluster,'segmentId','industria-comercio-servicos','segmentCode','INDUSTRIA_COMERCIO_SERVICOS','segmentName','Indústria, Comércio e Serviços'),updated_at=transaction_timestamp()
FROM _p13_map s WHERE e.id=s.entity_id;

ALTER TABLE public.map_entity_geometries DISABLE TRIGGER map_geometry_layer_lock_before_write;
INSERT INTO public.map_entity_geometries(id,project_id,entity_id,geometry,elevation,extrusion_height,rotation,calibration_version,version,is_current,change_reason,created_at,updated_at)
SELECT gen_random_uuid(),project_id,entity_id,geometry,elevation,0,0,calibration_version,1,true,'Ajuste oficial Pavilhão 13 — setembro/2026',transaction_timestamp(),transaction_timestamp()
FROM _p13_map s WHERE NOT EXISTS(SELECT 1 FROM public.map_entity_geometries g WHERE g.entity_id=s.entity_id AND g.is_current);
UPDATE public.map_entity_geometries g SET geometry=s.geometry,version=g.version+1,change_reason='Ajuste oficial Pavilhão 13 — setembro/2026',updated_at=transaction_timestamp()
FROM _p13_map s WHERE g.entity_id=s.entity_id AND g.is_current AND g.geometry IS DISTINCT FROM s.geometry;
ALTER TABLE public.map_entity_geometries ENABLE TRIGGER map_geometry_layer_lock_before_write;

INSERT INTO public.commercial_lots(id,project_id,entity_id,public_identifier,block,lot_number,display_name,status,official_area_sqm,area_validation_status,is_covered,created_at,updated_at)
SELECT gen_random_uuid(),project_id,entity_id,public_identifier,'P13','104','Módulo 104','AVAILABLE',3,'CALCULATED',true,transaction_timestamp(),transaction_timestamp()
FROM _p13_map s WHERE n=104 AND NOT EXISTS(SELECT 1 FROM public.commercial_lots l WHERE l.entity_id=s.entity_id OR (l.project_id=s.project_id AND l.public_identifier=s.public_identifier)) ON CONFLICT DO NOTHING;
UPDATE public.commercial_lots l SET lot_number=lpad(s.n::text,2,'0'),display_name='Módulo '||lpad(s.n::text,2,'0'),official_area_sqm=s.area,area_validation_status=CASE WHEN s.n IN(25,26,79,80) THEN 'VALIDATED' ELSE 'CALCULATED' END,updated_at=transaction_timestamp()
FROM _p13_map s WHERE l.entity_id=s.entity_id AND l.archived_at IS NULL;
INSERT INTO public.lot_prices(id,lot_id,pricing_mode,is_active,valid_from,source,created_at)
SELECT gen_random_uuid(),l.id,'NOT_FOR_SALE',true,transaction_timestamp(),'MANUAL',transaction_timestamp() FROM public.commercial_lots l JOIN _p13_map s ON s.entity_id=l.entity_id AND s.n=104 WHERE NOT EXISTS(SELECT 1 FROM public.lot_prices p WHERE p.lot_id=l.id);

WITH rp AS (SELECT jsonb_agg(jsonb_build_object('id',id,'numberRange',jsonb_build_array(a,b),'role',role,'group',grp,'cluster',cluster,'sequenceOrientation',dir,'orientation',orient,'normalizedFootprint',jsonb_build_object('centerX',(x+w/2)/19.8,'centerZ',(z+d/2)/37.8,'width',w/19.8,'depth',d/37.8)) ORDER BY a) payload FROM _p13_runs)
UPDATE public.map_entities p SET metadata=coalesce(p.metadata,'{}')||jsonb_build_object('source','Ajuste_Pav13_1.pdf (setembro/2026)','sourceRevision','2028.2','layoutRevision','2028.2-p13.3','moduleCount',104,'modularAreaM2',345.00,'totalAreaM2',709.00,'metricReference',jsonb_build_object('widthM',19.8,'depthM',37.8,'inset',0),'internalPlanRuns',rp.payload,'internalOfficialPlan',jsonb_build_object('layoutRevision','2028.2-p13.3','source','Ajuste_Pav13_1.pdf (setembro/2026)','interpretation','official-metric-polygons','projection',jsonb_build_object('coordinateTransform','identity','fit','metric-contain','metricWidthM',19.8,'metricDepthM',37.8,'alignX','center','alignZ','end'),'stats',jsonb_build_object('pavilionNumber',13,'moduleCount',104,'totalAreaM2',709,'modularAreaM2',345,'individualAreaM2',null),'legendNumberRanges','[[1,26],[27,78],[79,89],[90,104]]'::jsonb)),updated_at=transaction_timestamp() FROM rp WHERE p.public_identifier='B5' AND p.classification='PAVILION' AND NOT p.is_archived;

DO $$ BEGIN
 IF (SELECT count(*) FROM _p13_map)<>104
 OR (SELECT count(*) FROM public.commercial_lots l JOIN _p13_map s ON s.entity_id=l.entity_id WHERE l.archived_at IS NULL)<>104
 OR (SELECT round(sum(l.official_area_sqm),2) FROM public.commercial_lots l JOIN _p13_map s ON s.entity_id=l.entity_id WHERE l.archived_at IS NULL)<>345.00
 OR EXISTS(SELECT 1 FROM _p13_old o JOIN public.commercial_lots l ON l.id=o.lot_id WHERE l.status IS DISTINCT FROM o.status)
 OR EXISTS(SELECT 1 FROM _p13_map s JOIN public.map_entity_geometries g ON g.entity_id=s.entity_id AND g.is_current WHERE g.geometry IS DISTINCT FROM s.geometry)
 THEN RAISE EXCEPTION 'PAVILION_13_FINAL_STATE_INVALID'; END IF;
END $$;
COMMIT;