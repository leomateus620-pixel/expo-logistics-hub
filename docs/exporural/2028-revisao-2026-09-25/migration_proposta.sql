-- PROPOSTA NÃO APLICADA. Não colocar em supabase/migrations automaticamente.
-- Ordem, na mesma sessão: BEGIN; carregar_payload.sql revisado; este arquivo;
-- verificacao_pos_migracao.sql; COMMIT somente com todas as verificações aprovadas.
-- O payload entregue está bloqueado: UUIDs/aprovações/precondições pendentes.
-- Não executar apply_exporural_reference_2026 nem sync_commercial_map_reference_2026.

CREATE OR REPLACE FUNCTION pg_temp.exporural_review_state(p uuid, ids uuid[])
RETURNS jsonb LANGUAGE sql AS $state$
 SELECT jsonb_build_object(
  'project',(SELECT to_jsonb(x) FROM public.map_projects x WHERE x.id=p),
  'segments',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.map_segments x WHERE x.project_id=p AND x.slug='exporural'),'[]'),
  'entities',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.map_entities x WHERE x.id=ANY(ids)),'[]'),
  'geometries',COALESCE((SELECT jsonb_agg(to_jsonb(x) - 'native_geometry' ORDER BY x.id) FROM public.map_entity_geometries x WHERE x.entity_id=ANY(ids)),'[]'),
  'lots',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.commercial_lots x WHERE x.entity_id=ANY(ids)),'[]'),
  'prices',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_prices x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.entity_id=ANY(ids)),'[]'),
  'reservations',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_reservations x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.entity_id=ANY(ids)),'[]'),
  'negotiations',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_negotiations x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.entity_id=ANY(ids)),'[]'),
  'sales',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_sales x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.entity_id=ANY(ids)),'[]'),
  'contracts',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_contracts x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.entity_id=ANY(ids)),'[]'),
  'contract_versions',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_contract_versions x JOIN public.lot_contracts c ON c.id=x.contract_id JOIN public.commercial_lots l ON l.id=c.lot_id WHERE l.entity_id=ANY(ids)),'[]'),
  'lineage',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.map_lot_lineage x WHERE x.source_lot_id IN (SELECT id FROM public.commercial_lots WHERE entity_id=ANY(ids)) OR x.target_lot_id IN (SELECT id FROM public.commercial_lots WHERE entity_id=ANY(ids))),'[]')
 );
$state$;

DO $review$
DECLARE
 d jsonb; p uuid; org uuid; seg uuid; actor uuid := auth.uid(); rev text;
 payload_hash text; snapshot_id uuid; existing_snapshot public.map_reference_migration_snapshots%ROWTYPE;
 project public.map_projects%ROWTYPE; r record; oldrow record; geom public.map_entity_geometries%ROWTYPE;
 v_entity_id uuid; v_lot_id uuid; v_layer_id uuid; v_parent_id uuid; all_ids uuid[];
 before_state jsonb; after_state jsonb; outside_before text; outside_after text;
 current_entities integer; current_lots integer;
BEGIN
 IF (SELECT count(*) FROM exporural_review_payload)<>1 THEN RAISE EXCEPTION 'ONE_PAYLOAD_REQUIRED'; END IF;
 SELECT document INTO STRICT d FROM exporural_review_payload;
 p:=(d->>'project_id')::uuid; org:=(d->>'org_id')::uuid; seg:=(d->>'segment_id')::uuid; rev:=d->>'revision';
 IF p IS NULL OR org IS NULL OR seg IS NULL OR actor IS NULL
 OR NOT public.map_has_explicit_capability(org,'map.admin') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
 IF rev IS DISTINCT FROM '2028-exporural-2026-09-25.1'
 OR NOT coalesce((d->>'cartography_approved')::boolean,false)
 OR nullif(d->>'approval_reference','') IS NULL OR (d->>'approved_by')::uuid IS DISTINCT FROM actor
 THEN RAISE EXCEPTION 'EXPLICIT_CARTOGRAPHY_AND_LINEAGE_APPROVAL_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('commercial-map:exporural:'||org::text,0));
 SELECT * INTO STRICT project FROM public.map_projects WHERE id=p AND org_id=org AND NOT is_archived FOR UPDATE;
 PERFORM id FROM public.map_segments WHERE id=seg AND project_id=p AND slug='exporural' AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WRONG_SEGMENT'; END IF;
 payload_hash:=md5(d::text);
 SELECT * INTO existing_snapshot FROM public.map_reference_migration_snapshots
 WHERE project_id=p AND area_code='EXPORURAL' AND source_revision=rev AND status='APPLIED' FOR UPDATE;
 IF FOUND THEN
   IF existing_snapshot.payload_hash IS DISTINCT FROM payload_hash THEN RAISE EXCEPTION 'REVISION_PAYLOAD_CONFLICT'; END IF;
   SELECT array_agg(value::uuid) INTO all_ids FROM jsonb_array_elements_text(existing_snapshot.apply_result->'affectedEntityIds');
   IF md5(pg_temp.exporural_review_state(p,all_ids)::text) IS DISTINCT FROM existing_snapshot.apply_result->>'afterStateMd5'
   THEN RAISE EXCEPTION 'ALREADY_APPLIED_WITH_SUBSEQUENT_DRIFT'; END IF;
   RAISE NOTICE 'ALREADY_APPLIED_NO_CHANGES snapshot %',existing_snapshot.id;
   RETURN;
 END IF;
 IF project.active_version IS DISTINCT FROM (d->>'expected_project_version')::integer
 OR project.reference_revision IS DISTINCT FROM d->>'expected_project_revision'
 THEN RAISE EXCEPTION 'PROJECT_VERSION_CONFLICT'; END IF;

 CREATE TEMP TABLE exporural_old ON COMMIT DROP AS
 SELECT * FROM jsonb_to_recordset(d->'old_entities') AS x(previous_code text,entity_id uuid,lot_id uuid,
  expected_geometry_version integer,expected_geometry_md5 text,expected_entity_updated_at timestamptz,
  expected_lot_updated_at timestamptz,approved boolean,retire boolean,has_linked_history_resolved boolean);
 CREATE TEMP TABLE exporural_target ON COMMIT DROP AS
 SELECT x.*,coalesce(source_entity_id,gen_random_uuid()) AS resolved_entity_id,
  CASE WHEN kind='lot' THEN coalesce(source_lot_id,gen_random_uuid()) END AS resolved_lot_id
 FROM jsonb_to_recordset(d->'targets') AS x(code text,kind text,name text,block text,lot_number text,
  official_area_sqm numeric,calculated_area_sqm numeric,geometry jsonb,geometry_sha256 text,label_anchor jsonb,
  documented_width_m numeric,name_confirmed boolean,source_pdf_polygon jsonb,source_entity_id uuid,source_lot_id uuid,action text,
  approved boolean,approval_reference text);
 IF (SELECT count(*) FROM exporural_old)<>102 OR (SELECT count(*) FROM exporural_target)<>110
 OR EXISTS(SELECT 1 FROM exporural_old WHERE entity_id IS NULL OR approved IS DISTINCT FROM true OR retire IS NULL
  OR expected_geometry_version IS NULL OR expected_geometry_md5 IS NULL OR expected_entity_updated_at IS NULL)
 OR EXISTS(SELECT 1 FROM exporural_target WHERE approved IS DISTINCT FROM true OR nullif(approval_reference,'') IS NULL
  OR action IS NULL OR action NOT IN ('preserve','create') OR kind NOT IN ('lot','road')
  OR (action='preserve' AND source_entity_id IS NULL) OR (action='create' AND source_entity_id IS NOT NULL)
  OR (kind='lot' AND action='preserve' AND source_lot_id IS NULL)
  OR (action='create' AND source_lot_id IS NOT NULL) OR (kind='road' AND source_lot_id IS NOT NULL))
 THEN RAISE EXCEPTION 'UNRESOLVED_PHYSICAL_LINEAGE'; END IF;
 CREATE UNIQUE INDEX ON exporural_old(entity_id);
 CREATE UNIQUE INDEX ON exporural_old(lot_id) WHERE lot_id IS NOT NULL;
 CREATE UNIQUE INDEX ON exporural_target(code);
 CREATE UNIQUE INDEX ON exporural_target(resolved_entity_id);
 CREATE UNIQUE INDEX ON exporural_target(resolved_lot_id) WHERE resolved_lot_id IS NOT NULL;
 IF (SELECT count(*) FROM exporural_target WHERE kind='lot' AND block='R')<>65
 OR (SELECT count(*) FROM exporural_target WHERE kind='lot' AND block='S')<>35
 OR (SELECT sum(official_area_sqm) FROM exporural_target WHERE block='R')<>29564.26
 OR (SELECT sum(official_area_sqm) FROM exporural_target WHERE block='S')<>16203.53
 OR EXISTS(SELECT 1 FROM exporural_target WHERE kind='lot' AND
    (code IS DISTINCT FROM 'Q-'||block||'-'||lot_number OR
     NOT ((block='R' AND lot_number::integer BETWEEN 1 AND 65) OR (block='S' AND lot_number::integer BETWEEN 1 AND 35))))
 THEN RAISE EXCEPTION 'INVALID_100_LOT_INVENTORY'; END IF;

 -- Lock parents and all their dependent flows before rechecking the snapshot.
 PERFORM e.id FROM public.map_entities e JOIN exporural_old x ON x.entity_id=e.id ORDER BY e.id FOR UPDATE OF e;
 PERFORM l.id FROM public.commercial_lots l JOIN exporural_old x ON x.lot_id=l.id ORDER BY l.id FOR UPDATE OF l;
 PERFORM g.id FROM public.map_entity_geometries g JOIN exporural_old x ON x.entity_id=g.entity_id WHERE g.is_current FOR UPDATE OF g;
 PERFORM x.id FROM public.lot_prices x JOIN exporural_old o ON o.lot_id=x.lot_id FOR UPDATE OF x;
 PERFORM x.id FROM public.lot_reservations x JOIN exporural_old o ON o.lot_id=x.lot_id FOR UPDATE OF x;
 PERFORM x.id FROM public.lot_negotiations x JOIN exporural_old o ON o.lot_id=x.lot_id FOR UPDATE OF x;
 PERFORM x.id FROM public.lot_sales x JOIN exporural_old o ON o.lot_id=x.lot_id FOR UPDATE OF x;
 PERFORM x.id FROM public.lot_contracts x JOIN exporural_old o ON o.lot_id=x.lot_id FOR UPDATE OF x;
 PERFORM v.id FROM public.lot_contract_versions v JOIN public.lot_contracts c ON c.id=v.contract_id JOIN exporural_old o ON o.lot_id=c.lot_id FOR UPDATE OF v;

 IF EXISTS(SELECT 1 FROM exporural_old x LEFT JOIN public.map_entities e ON e.id=x.entity_id
  LEFT JOIN public.commercial_lots l ON l.id=x.lot_id
  LEFT JOIN public.map_entity_geometries g ON g.entity_id=e.id AND g.is_current
  WHERE e.id IS NULL OR e.project_id<>p OR e.segment_id IS DISTINCT FROM seg OR e.is_archived
  OR e.public_identifier IS DISTINCT FROM x.previous_code OR e.updated_at IS DISTINCT FROM x.expected_entity_updated_at
  OR g.version IS DISTINCT FROM x.expected_geometry_version OR md5(g.geometry::text) IS DISTINCT FROM x.expected_geometry_md5
  OR (x.lot_id IS NOT NULL AND (l.id IS NULL OR l.entity_id<>e.id OR l.project_id<>p OR l.archived_at IS NOT NULL
      OR l.updated_at IS DISTINCT FROM x.expected_lot_updated_at)))
 THEN RAISE EXCEPTION 'LIVE_UUID_OR_VERSION_CONFLICT'; END IF;
 IF (SELECT count(*) FROM exporural_old WHERE lot_id IS NOT NULL)<>95
 OR EXISTS(SELECT 1 FROM public.commercial_lots l WHERE l.project_id=p AND l.archived_at IS NULL AND l.block IN ('R','S')
     AND NOT EXISTS(SELECT 1 FROM exporural_old o WHERE o.lot_id=l.id))
 OR EXISTS(SELECT 1 FROM exporural_old o JOIN public.commercial_lots l ON l.id=o.lot_id WHERE l.block NOT IN ('R','S'))
 OR EXISTS(SELECT 1 FROM exporural_target t WHERE t.action='preserve' AND NOT EXISTS
    (SELECT 1 FROM exporural_old o WHERE o.entity_id=t.source_entity_id AND NOT o.retire AND o.lot_id IS NOT DISTINCT FROM t.source_lot_id))
 OR EXISTS(SELECT 1 FROM exporural_old o WHERE NOT o.retire AND NOT EXISTS(SELECT 1 FROM exporural_target t WHERE t.source_entity_id=o.entity_id))
 THEN RAISE EXCEPTION 'LINEAGE_COVERAGE_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM exporural_old o WHERE
  (EXISTS(SELECT 1 FROM public.lot_reservations x WHERE x.lot_id=o.lot_id AND x.status='ACTIVE') OR
   EXISTS(SELECT 1 FROM public.lot_negotiations x WHERE x.lot_id=o.lot_id AND x.status='ACTIVE') OR
   EXISTS(SELECT 1 FROM public.lot_sales x WHERE x.lot_id=o.lot_id AND x.status='CONFIRMED') OR
   EXISTS(SELECT 1 FROM public.lot_contracts x WHERE x.lot_id=o.lot_id AND x.is_active))
  AND (o.retire OR o.has_linked_history_resolved IS DISTINCT FROM true))
 THEN RAISE EXCEPTION 'ACTIVE_COMMERCIAL_LINK_REQUIRES_EXPLICIT_RESOLUTION_NO_AUTOMATIC_TRANSFER'; END IF;
 IF EXISTS(SELECT 1 FROM exporural_old o WHERE o.retire AND
    (EXISTS(SELECT 1 FROM public.lot_sales s WHERE s.lot_id=o.lot_id) OR
     EXISTS(SELECT 1 FROM public.lot_contracts c WHERE c.lot_id=o.lot_id)))
 THEN RAISE EXCEPTION 'PARENT_WITH_LEGAL_HISTORY_REQUIRES_SEPARATE_APPROVED_PROCEDURE'; END IF;
 IF EXISTS(SELECT 1 FROM exporural_target t JOIN public.map_entities e ON e.project_id=p AND upper(e.public_identifier)=upper(t.code)
  WHERE NOT EXISTS(SELECT 1 FROM exporural_old o WHERE o.entity_id=e.id))
 OR EXISTS(SELECT 1 FROM exporural_target t JOIN public.commercial_lots l ON l.project_id=p AND upper(l.public_identifier)=upper(t.code)
  WHERE NOT EXISTS(SELECT 1 FROM exporural_old o WHERE o.lot_id=l.id))
 THEN RAISE EXCEPTION 'RENUMBERING_COLLISION_INCLUDING_ARCHIVED_RECORDS'; END IF;
 SELECT count(*) INTO current_entities FROM public.map_entities WHERE project_id=p AND segment_id=seg AND NOT is_archived;
 SELECT count(*) INTO current_lots FROM public.commercial_lots l JOIN public.map_entities e ON e.id=l.entity_id
 WHERE e.project_id=p AND e.segment_id=seg AND NOT e.is_archived AND l.archived_at IS NULL;
 IF current_entities IS DISTINCT FROM (d->>'expected_entity_count')::integer OR current_lots<>95
 THEN RAISE EXCEPTION 'LIVE_INVENTORY_DIFFERS_FROM_APPROVED_PREFLIGHT'; END IF;

 -- Native local coordinates (SRID 0), independent topology checks.
 ALTER TABLE exporural_target ADD COLUMN native extensions.geometry;
 UPDATE exporural_target SET native=extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(geometry::text),0);
 IF EXISTS(SELECT 1 FROM exporural_target WHERE NOT extensions.ST_IsValid(native) OR extensions.ST_IsEmpty(native)
   OR extensions.ST_GeometryType(native)<>'ST_Polygon' OR extensions.ST_Area(native)<=0
   OR NOT extensions.ST_Contains(native,extensions.ST_SetSRID(extensions.ST_MakePoint((label_anchor->>0)::float8,(label_anchor->>1)::float8),0)))
 THEN RAISE EXCEPTION 'INVALID_GEOMETRY_OR_LABEL'; END IF;
 IF EXISTS(SELECT 1 FROM exporural_target a JOIN exporural_target b ON a.code<b.code
   WHERE (a.kind='lot' OR b.kind='lot') AND extensions.ST_Area(extensions.ST_Intersection(a.native,b.native))>1e-8)
 THEN RAISE EXCEPTION 'LOT_LOT_OR_LOT_ROAD_OVERLAP'; END IF;
 IF EXISTS(SELECT 1 FROM exporural_target t JOIN public.map_entities e ON e.project_id=p AND NOT e.is_archived
   JOIN public.map_entity_geometries g ON g.entity_id=e.id AND g.is_current
   WHERE t.kind='lot' AND NOT EXISTS(SELECT 1 FROM exporural_old o WHERE o.entity_id=e.id)
   AND (e.is_sellable OR e.classification='ROAD' OR e.public_identifier IN ('B7','B8','D3','B37','B38','C4'))
   AND extensions.ST_Area(extensions.ST_Intersection(t.native,g.native_geometry))>1e-8)
 THEN RAISE EXCEPTION 'OUTSIDE_SCOPE_OR_PROTECTED_STRUCTURE_OVERLAP'; END IF;
 -- Do not bypass the 0.15% validation rule. These raster footprints remain
 -- UNVALIDATED/NEEDS_REVIEW even after explicit cartographic acceptance.

 SELECT array_agg(id) INTO all_ids FROM (SELECT entity_id id FROM exporural_old UNION SELECT resolved_entity_id FROM exporural_target) q;
 before_state:=pg_temp.exporural_review_state(p,all_ids);
 SELECT md5(coalesce(jsonb_agg(jsonb_build_array(e,g.geometry,l) ORDER BY e.id)::text,'')) INTO outside_before
 FROM public.map_entities e LEFT JOIN public.map_entity_geometries g ON g.entity_id=e.id AND g.is_current
 LEFT JOIN public.commercial_lots l ON l.entity_id=e.id WHERE e.project_id=p AND NOT(e.id=ANY(all_ids));
 INSERT INTO public.map_reference_migration_snapshots(org_id,project_id,area_code,source_revision,payload_hash,status,snapshot,created_by)
 VALUES(org,p,'EXPORURAL',rev,payload_hash,'PENDING',before_state,actor) RETURNING id INTO snapshot_id;

 -- Stage ALL previous identifiers by resolved UUID, resolving cycles before the
 -- final codes. Archived parents keep distinct audit codes and all linked rows.
 UPDATE public.map_entities e SET public_identifier='EXPORURAL-STAGING-'||e.id,
  metadata=e.metadata||jsonb_build_object('exporuralPreviousIdentifier',e.public_identifier,
     'exporuralPreviousRevision',e.metadata->>'geometryRevision','migrationSnapshotId',snapshot_id),updated_by=actor
 FROM exporural_old o WHERE e.id=o.entity_id;
 UPDATE public.commercial_lots l SET public_identifier='EXPORURAL-STAGING-'||l.id,updated_by=actor
 FROM exporural_old o WHERE l.id=o.lot_id;
 UPDATE public.map_entities e SET is_archived=true,is_sellable=false,verification_status='ARCHIVED',
  public_identifier='ARCHIVED-'||rev||'-'||o.previous_code||'-'||e.id
 FROM exporural_old o WHERE e.id=o.entity_id AND o.retire;
 UPDATE public.commercial_lots l SET archived_at=transaction_timestamp(),
  public_identifier='ARCHIVED-'||rev||'-'||o.previous_code||'-'||l.id
 FROM exporural_old o WHERE l.id=o.lot_id AND o.retire;

 FOR r IN SELECT * FROM exporural_target ORDER BY code LOOP
   v_entity_id:=r.resolved_entity_id; v_lot_id:=r.resolved_lot_id;
   SELECT id INTO STRICT v_layer_id FROM public.map_layers WHERE project_id=p AND layer_key=CASE WHEN r.kind='lot' THEN 'commercial' ELSE 'circulation' END;
   SELECT id INTO STRICT v_parent_id FROM public.map_entities WHERE project_id=p
     AND public_identifier=CASE WHEN r.kind='lot' THEN 'QUADRA-'||r.block ELSE 'EXPORURAL' END AND NOT is_archived;
   IF r.action='create' THEN
     INSERT INTO public.map_entities(id,project_id,layer_id,parent_entity_id,public_identifier,name,classification,
      verification_status,is_sellable,segment_id,created_by,updated_by)
     VALUES(v_entity_id,p,v_layer_id,v_parent_id,r.code,r.name,CASE WHEN r.kind='lot' THEN 'SELLABLE_LOT' ELSE 'ROAD' END,
      'NEEDS_REVIEW',false,seg,actor,actor);
   ELSE
     UPDATE public.map_entities SET public_identifier=r.code,name=r.name,parent_entity_id=v_parent_id,
       verification_status='NEEDS_REVIEW',updated_by=actor WHERE id=v_entity_id;
   END IF;
   UPDATE public.map_entities SET metadata=metadata||jsonb_build_object('areaCode','EXPORURAL',
     'geometryRevision',rev,'revisionGeometryVersion',6,'geometryHash',r.geometry_sha256,
     'labelAnchor',r.label_anchor,'sourcePdfPolygon',r.source_pdf_polygon,
     'officialAreaSqm',r.official_area_sqm,'block',r.block,'lotNumber',r.lot_number,
     'documentedWidthMeters',r.documented_width_m,'nameConfirmed',r.name_confirmed,
     'cartographicConfidence','registered_raster_pending_area_validation','migrationSnapshotId',snapshot_id)
   WHERE id=v_entity_id;
   SELECT * INTO geom FROM public.map_entity_geometries WHERE map_entity_geometries.entity_id=v_entity_id AND is_current FOR UPDATE;
   IF FOUND THEN
     INSERT INTO public.map_geometry_versions(geometry_id,project_id,entity_id,geometry,elevation,extrusion_height,
      rotation,calibration_version,version,change_reason,created_by,created_at)
     VALUES(geom.id,p,v_entity_id,geom.geometry,geom.elevation,geom.extrusion_height,geom.rotation,
      geom.calibration_version,geom.version,rev||' before snapshot '||snapshot_id,actor,geom.created_at);
     UPDATE public.map_entity_geometries SET geometry=r.geometry,version=geom.version+1,
      change_reason=rev||' physical lineage approval '||r.approval_reference,created_by=actor
     WHERE id=geom.id;
   ELSE
     INSERT INTO public.map_entity_geometries(project_id,entity_id,geometry,elevation,extrusion_height,
      rotation,calibration_version,version,change_reason,created_by)
     VALUES(p,v_entity_id,r.geometry,0,CASE WHEN r.kind='road' THEN 0.032 ELSE 0.03 END,
      0,NULL,1,rev||' new physical parcel or road',actor);
   END IF;
   IF r.kind='lot' THEN
     IF r.action='create' THEN
       INSERT INTO public.commercial_lots(id,project_id,entity_id,public_identifier,block,lot_number,display_name,
        status,official_area_sqm,calculated_area_sqm,area_validation_status,created_by,updated_by)
       VALUES(v_lot_id,p,v_entity_id,r.code,r.block,r.lot_number,r.name,'BLOCKED',r.official_area_sqm,
        extensions.ST_Area(r.native)/0.0225,'UNVALIDATED',actor,actor);
       -- No price row and no zero-price checkout. Pricing requires a separate approval.
     ELSE
       UPDATE public.commercial_lots SET public_identifier=r.code,block=r.block,lot_number=r.lot_number,
        display_name=r.name,official_area_sqm=r.official_area_sqm,calculated_area_sqm=extensions.ST_Area(r.native)/0.0225,
        area_validation_status='UNVALIDATED',updated_by=actor WHERE id=v_lot_id;
       -- Preserve status, prices, buyer, reservations, contracts and sale snapshots.
     END IF;
   END IF;
 END LOOP;
 FOR r IN SELECT * FROM jsonb_to_recordset(d->'lineage') AS x(source_lot_id uuid,target_code text,
     relationship text,approved boolean,approval_reference text) LOOP
   IF r.source_lot_id IS NULL OR r.target_code IS NULL OR r.approved IS DISTINCT FROM true
    OR r.relationship IS NULL OR r.relationship NOT IN ('SPLIT_FROM','MERGED_FROM','SUPERSEDES')
    OR nullif(r.approval_reference,'') IS NULL
    OR NOT EXISTS(SELECT 1 FROM exporural_old WHERE exporural_old.lot_id=r.source_lot_id AND retire)
   THEN RAISE EXCEPTION 'UNRESOLVED_PARENT_CHILD_ALLOCATION'; END IF;
   SELECT resolved_lot_id INTO STRICT v_lot_id FROM exporural_target WHERE code=r.target_code AND kind='lot' AND action='create';
   INSERT INTO public.map_lot_lineage(source_lot_id,target_lot_id,relationship,created_by)
   VALUES(r.source_lot_id,v_lot_id,r.relationship,actor);
 END LOOP;
 IF EXISTS(SELECT 1 FROM exporural_target t WHERE t.kind='lot' AND t.action='create' AND NOT EXISTS
   (SELECT 1 FROM public.map_lot_lineage l WHERE l.target_lot_id=t.resolved_lot_id))
 OR EXISTS(SELECT 1 FROM exporural_old o WHERE o.lot_id IS NOT NULL AND o.retire AND NOT EXISTS
   (SELECT 1 FROM public.map_lot_lineage l JOIN exporural_target t ON t.resolved_lot_id=l.target_lot_id WHERE l.source_lot_id=o.lot_id))
 THEN RAISE EXCEPTION 'PARENT_CHILD_COVERAGE_INCOMPLETE'; END IF;

 SELECT count(*) INTO current_entities FROM public.map_entities WHERE project_id=p AND segment_id=seg AND NOT is_archived;
 SELECT count(*) INTO current_lots FROM public.commercial_lots l JOIN public.map_entities e ON e.id=l.entity_id
 WHERE e.segment_id=seg AND NOT e.is_archived AND l.archived_at IS NULL;
 IF current_lots<>100 THEN RAISE EXCEPTION 'FINAL_INVENTORY_NOT_100'; END IF;
 -- Reset BOTH baselines independently after all authorized lineage entries.
 -- Future split/merge deltas remain governed by the existing server RPC.
 UPDATE public.map_segments SET source_reference=rev,boundary_data=boundary_data||jsonb_build_object(
  'expectedEntityCount',current_entities,'expectedLotCount',current_lots,
  'lineageBaselineAt',transaction_timestamp(),'exporuralRevision',rev) WHERE id=seg;
 UPDATE public.map_projects SET active_version=active_version+1,is_published=false,updated_by=actor WHERE id=p;
 SELECT md5(coalesce(jsonb_agg(jsonb_build_array(e,g.geometry,l) ORDER BY e.id)::text,'')) INTO outside_after
 FROM public.map_entities e LEFT JOIN public.map_entity_geometries g ON g.entity_id=e.id AND g.is_current
 LEFT JOIN public.commercial_lots l ON l.entity_id=e.id WHERE e.project_id=p AND NOT(e.id=ANY(all_ids));
 IF outside_before IS DISTINCT FROM outside_after THEN RAISE EXCEPTION 'OUTSIDE_SCOPE_CHANGED'; END IF;
 after_state:=pg_temp.exporural_review_state(p,all_ids);
 UPDATE public.map_reference_migration_snapshots SET status='APPLIED',applied_at=transaction_timestamp(),
 apply_result=jsonb_build_object('affectedEntityIds',to_jsonb(all_ids),'afterStateMd5',md5(after_state::text),
   'afterState',after_state,'entityCount',current_entities,'lotCount',current_lots,
   'approvedPayload',d,'outsideScopeMd5',outside_after,'publicationPending',true)
 WHERE id=snapshot_id;
 INSERT INTO public.map_activity_logs(org_id,project_id,action,reason,before_state,after_state,actor_user_id)
 VALUES(org,p,'EXPORURAL_REFERENCE_2028_APPLIED',d->>'approval_reference',
  jsonb_build_object('snapshotId',snapshot_id),jsonb_build_object('revision',rev,'entities',current_entities,'lots',100),actor);
 RAISE NOTICE 'APPLIED IN CURRENT TRANSACTION snapshot %, entities %, lots %. VERIFY BEFORE COMMIT.',snapshot_id,current_entities,current_lots;
END;
$review$;
