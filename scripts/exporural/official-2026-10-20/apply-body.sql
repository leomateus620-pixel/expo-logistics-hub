DO $apply$
DECLARE
 d jsonb := $payload$__PAYLOAD__$payload$::jsonb;
 p uuid := (d->>'project_id')::uuid; seg uuid := (d->>'segment_id')::uuid;
 rev text := d->>'revision'; sid uuid; r jsonb; old jsonb; doc jsonb;
 template public.map_entities%ROWTYPE; lot_template public.commercial_lots%ROWTYPE;
 ids uuid[]; outside_ids uuid[];
 before_state jsonb; outside_before jsonb; after_state jsonb; existing public.map_reference_migration_snapshots%ROWTYPE;
 actor uuid := auth.uid(); steward uuid := 'b664fc22-69d3-40f1-8370-16b8a07ec402';
 payload_hash text := md5(d::text); result jsonb; expected_count integer;
BEGIN
 -- Owner execution is maintenance authority, never an authenticated RLS test.
 IF session_user NOT IN ('postgres','supabase_admin') AND
   (actor IS NULL OR NOT public.map_has_explicit_capability((d->>'org_id')::uuid,'map.admin'))
 THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('commercial-map:exporural:'||p,0));
 -- Brief table locks close the FK/child-insertion window as well as row updates.
 LOCK TABLE public.map_entities,public.map_entity_geometries,public.commercial_lots,
 public.lot_prices,public.commercial_price_rules,public.commercial_lot_price_overrides,
 public.lot_reservations,public.lot_negotiations,public.lot_sales,public.lot_sale_orders,
 public.lot_sale_order_items,public.lot_sale_installments,public.lot_contracts,
 public.lot_contract_lots,public.lot_contract_versions,public.map_lot_lineage IN SHARE ROW EXCLUSIVE MODE;
 PERFORM id FROM public.map_projects WHERE id=p AND org_id=(d->>'org_id')::uuid
   AND NOT is_archived AND reference_revision='2026.4' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WRONG_PROJECT_OR_GLOBAL_REVISION'; END IF;
 SELECT * INTO existing FROM public.map_reference_migration_snapshots WHERE project_id=p
 AND area_code='EXPORURAL' AND source_revision=rev AND status='APPLIED' FOR UPDATE;
 IF FOUND THEN
   IF existing.payload_hash<>payload_hash THEN RAISE EXCEPTION 'REVISION_PAYLOAD_CONFLICT'; END IF;
   -- Later legitimate sales must not make migration replay rewrite anything.
   RAISE NOTICE 'ALREADY_APPLIED_NO_CHANGES %',existing.id; RETURN;
 END IF;
 PERFORM id FROM public.map_segments WHERE id=seg AND project_id=p AND slug='exporural'
 AND is_active AND source_reference=d->>'expected_source_revision' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SOURCE_REVISION_CONFLICT'; END IF;
 IF md5(pg_temp.exporural_state(p,NULL)::text)<>d->>'expected_fingerprint'
 THEN RAISE EXCEPTION 'CONCURRENT_MAP_OR_COMMERCIAL_CHANGE_REQUIRES_PREFLIGHT'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(d->'expected') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.map_entities e JOIN public.map_entity_geometries x ON x.entity_id=e.id AND x.is_current
      LEFT JOIN public.commercial_lots l ON l.entity_id=e.id
      WHERE e.id=(r->>'entity_id')::uuid AND e.project_id=p AND e.segment_id=seg AND NOT e.is_archived
      AND e.updated_at=(r->>'entity_updated_at')::timestamptz AND x.id=(r->>'geometry_id')::uuid
      AND x.version=(r->>'geometry_version')::integer AND x.geometry=r->'geometry'
      AND (r->>'lot_id' IS NULL OR (l.id=(r->>'lot_id')::uuid AND l.updated_at=(r->>'lot_updated_at')::timestamptz)))
   THEN RAISE EXCEPTION 'UUID_GEOMETRY_OR_STATE_CONFLICT %',r->>'entity_id'; END IF;
 END LOOP;
 SELECT array_agg(DISTINCT x) INTO ids FROM (
 SELECT (value->>'entity_id')::uuid x FROM jsonb_array_elements(d->'expected')
 UNION SELECT (value->>'entity_id')::uuid FROM jsonb_array_elements(d->'targets')) q;
 SELECT array_agg(id) INTO outside_ids FROM public.map_entities WHERE project_id=p AND NOT(id=ANY(ids));
 before_state:=pg_temp.exporural_state(p,ids);
 outside_before:=pg_temp.exporural_state(p,outside_ids)-'project'-'segment'-'rules';
 INSERT INTO public.map_reference_migration_snapshots(org_id,project_id,area_code,source_revision,payload_hash,status,snapshot,created_by)
 VALUES((d->>'org_id')::uuid,p,'EXPORURAL',rev,payload_hash,'PENDING',before_state,actor) RETURNING id INTO sid;
 SELECT * INTO STRICT template FROM public.map_entities WHERE id='0c76ac6a-7ae2-4c7d-ad17-12a890729384';
 SELECT * INTO STRICT lot_template FROM public.commercial_lots WHERE id='d778159b-ce47-4091-b363-d21f8a2b99dd';
 -- Stage every affected identity before assigning reused codes; no DELETE.
 FOR r IN SELECT value FROM jsonb_array_elements(d->'expected') WHERE value->>'lot_id' IS NOT NULL LOOP
  UPDATE public.map_entities SET public_identifier='HIST:'||rev||':'||public_identifier,
    metadata=metadata||jsonb_build_object('technicalIdentifier',coalesce(metadata->>'technicalIdentifier',public_identifier),'previousCommercialIdentifier',public_identifier)
    WHERE id=(r->>'entity_id')::uuid;
  UPDATE public.commercial_lots SET public_identifier='HIST:'||rev||':'||public_identifier WHERE id=(r->>'lot_id')::uuid;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(d->'targets') LOOP
  IF r->>'action'='create' THEN
   doc:=to_jsonb(template)||jsonb_build_object('id',r->>'entity_id','public_identifier',r->>'code',
    'name',coalesce(r->>'name','Quadra '||(r->>'block')||' · Lote '||(r->>'lot_number')),
    'description','Revisão oficial de 20/10/2026; PDF página 1',
    'layer_id',CASE WHEN r->>'kind'='road' THEN '5fa880d5-5def-4dce-8261-53edf4d4e7b8' ELSE template.layer_id::text END,
    'parent_entity_id',CASE WHEN r->>'kind'='road' THEN 'c8ae8372-2c84-4325-af6b-77c642bb2709' ELSE template.parent_entity_id::text END,'classification',CASE WHEN r->>'kind'='lot' THEN 'SELLABLE_LOT' ELSE 'ROAD' END,
    'is_sellable',r->>'kind'='lot','is_archived',false,'metadata',jsonb_build_object('areaCode','EXPORURAL'),'created_by',actor,'updated_by',actor,'created_at',now(),'updated_at',now());
   INSERT INTO public.map_entities SELECT (jsonb_populate_record(NULL::public.map_entities,doc)).*;
   INSERT INTO public.map_entity_geometries(project_id,entity_id,geometry,elevation,extrusion_height,rotation,calibration_version,version,is_current,change_reason,created_by)
   VALUES(p,(r->>'entity_id')::uuid,r->'geometry',0,CASE WHEN r->>'kind'='lot' THEN .025 ELSE .006 END,0,2,1,true,rev,actor);
   IF r->>'kind'='lot' THEN
    doc:=to_jsonb(lot_template)||jsonb_build_object('id',r->>'lot_id','entity_id',r->>'entity_id',
     'public_identifier',r->>'code','block',r->>'block','lot_number',r->>'lot_number','display_name','Quadra '||(r->>'block')||' · Lote '||(r->>'lot_number'),
     'status','BLOCKED','official_area_sqm',(r->>'official_area_sqm')::numeric,'calculated_area_sqm',(r->>'calculated_area_sqm')::numeric,
     'area_validation_status','VALIDATED','archived_at',NULL,'superseded_by_lot_id',NULL,
     'frontage_meters',NULL,'depth_meters',NULL,'commercial_notes','Criado bloqueado; tarifa herdada da faixa física aprovada em 26/09/2026.',
     'internal_notes',NULL,'created_by',actor,'updated_by',actor,'created_at',now(),'updated_at',now());
    INSERT INTO public.commercial_lots SELECT (jsonb_populate_record(NULL::public.commercial_lots,doc)).*;
   END IF;
  ELSE
   IF NOT coalesce((r->>'preserve_geometry')::boolean,false) THEN
    UPDATE public.map_entity_geometries SET geometry=r->'geometry',version=version+1,change_reason=rev,updated_at=now()
    WHERE entity_id=(r->>'entity_id')::uuid AND is_current AND geometry IS DISTINCT FROM r->'geometry';
   END IF;
   IF r->>'kind'='lot' THEN
    UPDATE public.commercial_lots SET public_identifier=r->>'code',block=r->>'block',lot_number=r->>'lot_number',
     display_name='Quadra '||(r->>'block')||' · Lote '||(r->>'lot_number'),official_area_sqm=(r->>'official_area_sqm')::numeric,
     calculated_area_sqm=(r->>'calculated_area_sqm')::numeric,area_validation_status='VALIDATED',updated_by=actor
    WHERE id=(r->>'lot_id')::uuid;
   END IF;
  END IF;
  UPDATE public.map_entities SET public_identifier=r->>'code',name=coalesce(r->>'name','Quadra '||(r->>'block')||' · Lote '||(r->>'lot_number')),
   verification_status='VERIFIED',metadata=(metadata-'labelSourcePoint')||jsonb_build_object('areaCode','EXPORURAL','entityType',CASE WHEN r->>'kind'='lot' THEN 'EXPORURAL_COMMERCIAL_LOT' ELSE 'EXPORURAL_ROAD' END,
    'geometryRevision',rev,'sourceRevision',rev,'source','A1 - Fenasoja Exporural Planta Geral - sem imagem.pdf','sourcePage',1,'sourceSha256',d->>'source_sha256',
    'sourcePdfPolygon',r->'source_pdf_polygon','sourceCoordinateFrame','official PDF page 1 points, top-left origin','labelAnchor',r->'label_anchor','block',r->'block','lotNumber',r->'lot_number',
    'officialAreaSqm',r->'official_area_sqm','mapUnitsPerMeter',(d->>'map_units_per_meter')::numeric,
    'documentedWidthMeters',r->'documented_width_m','nameConfirmed',r->'name_confirmed','migrationSnapshotId',sid,'officialMeasurements',true,
    'cartographicConfidence','official-pdf-vectors-local-registration','previewOnly',false,
    'calculatedAreaSqm',r->'calculated_area_sqm','calculatedAreaSource','INDEPENDENT_PDF_VECTOR_LOCAL_CALIBRATION',
    'parentPublicIdentifier',CASE WHEN r->>'kind'='road' THEN 'EXPORURAL' ELSE 'QUADRA-'||(r->>'block') END,
    'isSeparator',r->>'kind'='road','geometryHash',(SELECT encode(extensions.digest(x.geometry::text,'sha256'),'hex') FROM public.map_entity_geometries x WHERE x.entity_id=(r->>'entity_id')::uuid AND x.is_current),
    'revisionGeometryVersion',(SELECT x.version FROM public.map_entity_geometries x WHERE x.entity_id=(r->>'entity_id')::uuid AND x.is_current))
  WHERE id=(r->>'entity_id')::uuid;
  IF r->>'action'='create' AND r->>'kind'='lot' THEN
   FOR old IN SELECT value FROM jsonb_array_elements(r->'origins') LOOP
    INSERT INTO public.map_lot_lineage(source_lot_id,target_lot_id,relationship,created_by)
    VALUES((old->>'lot_id')::uuid,(r->>'lot_id')::uuid,'SUPERSEDES',coalesce(actor,steward)) ON CONFLICT DO NOTHING;
   END LOOP;
  END IF;
 END LOOP;
 -- Archive replaced parcels only after creating every spatial successor.
 FOR r IN SELECT value FROM jsonb_array_elements(d->'expected') WHERE (value->>'retire')::boolean LOOP
  UPDATE public.commercial_lots SET archived_at=now() WHERE id=(r->>'lot_id')::uuid;
  UPDATE public.map_entities SET is_archived=true,is_sellable=false,metadata=metadata||jsonb_build_object('archivedByReferenceRevision',rev)
   WHERE id=(r->>'entity_id')::uuid;
 END LOOP;
 -- Extend exactly the two approved physical-band rules, retaining their tariffs.
 UPDATE public.commercial_price_rules SET range_end=72,label='Exporural - Quadra R - Lotes 40 a 72',
  notes=coalesce(notes,'')||E'\n'||rev||': extensão por correspondência física; tarifa preservada.',updated_at=now()
 WHERE project_id=p AND id IN ('552e1038-6b92-429a-a95c-503b737c97b8','81d78933-ff2e-400b-9c04-2d0d9a161b5a')
 AND range_start=40 AND range_end=65 AND is_active;
 GET DIAGNOSTICS expected_count=ROW_COUNT;
 IF expected_count<>2 THEN RAISE EXCEPTION 'APPROVED_RULE_DRIFT'; END IF;
 -- All the replaced origins are currently unencumbered. Future payload replay
 -- cannot inherit an ambiguous sale: fingerprint guards fail before any write.
 FOR r IN SELECT value FROM jsonb_array_elements(d->'targets') WHERE value->>'action'='create' AND value->>'kind'='lot' LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'origins') o JOIN public.commercial_lots l ON l.id=(o->>'lot_id')::uuid
    WHERE l.status<>'AVAILABLE' OR EXISTS(SELECT 1 FROM public.lot_sales s WHERE s.lot_id=l.id)
     OR EXISTS(SELECT 1 FROM public.lot_reservations s WHERE s.lot_id=l.id)
     OR EXISTS(SELECT 1 FROM public.lot_negotiations s WHERE s.lot_id=l.id)
     OR EXISTS(SELECT 1 FROM public.lot_contracts s WHERE s.lot_id=l.id)
     OR EXISTS(SELECT 1 FROM public.lot_contract_lots s WHERE s.lot_id=l.id)
     OR EXISTS(SELECT 1 FROM public.commercial_lot_price_overrides s WHERE s.lot_id=l.id))
  THEN RAISE EXCEPTION 'REPLOTTED_ORIGIN_REQUIRES_COMMERCIAL_RECONCILIATION %',r->>'code'; END IF;
  IF EXISTS(SELECT 1 FROM public.commercial_lot_pricing_2028 pr WHERE pr.lot_id=(r->>'lot_id')::uuid
      AND pr.renovacao_price_per_sqm=16.50 AND pr.segunda_price_per_sqm=18.15
      AND pr.renovacao_total=round((r->>'official_area_sqm')::numeric*16.50,2)
      AND pr.segunda_total=round((r->>'official_area_sqm')::numeric*18.15,2)) THEN
   UPDATE public.commercial_lots SET status='AVAILABLE' WHERE id=(r->>'lot_id')::uuid;
  END IF;
 END LOOP;
 UPDATE public.map_segments SET source_reference=rev,boundary_data=(boundary_data-'expectedEntityCount'-'expectedLotCount')||jsonb_build_object(
  'exporuralRevision',rev,'expectedEntityCount',(SELECT count(*) FROM public.map_entities WHERE segment_id=seg AND NOT is_archived),
  'expectedLotCount',(SELECT count(*) FROM public.commercial_lots l JOIN public.map_entities e ON e.id=l.entity_id WHERE e.segment_id=seg AND NOT e.is_archived AND l.archived_at IS NULL)) WHERE id=seg;
 -- Validate all 107 official entries, by project/segment/block and active UUID.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'manifest') m LEFT JOIN public.commercial_lots l ON l.project_id=p AND l.public_identifier=m->>'code' AND l.archived_at IS NULL
  LEFT JOIN public.map_entities e ON e.id=l.entity_id AND NOT e.is_archived AND e.segment_id=seg
  WHERE l.id IS NULL OR e.id IS NULL OR l.block<>m->>'block' OR l.lot_number::integer<>(m->>'lot_number')::integer OR l.official_area_sqm<>(m->>'official_area_sqm')::numeric)
 THEN RAISE EXCEPTION 'OFFICIAL_MANIFEST_MISMATCH'; END IF;
 -- Positive intersection area is a collision; shared edges are allowed.
 IF EXISTS(SELECT 1 FROM public.commercial_lots a JOIN public.map_entities ea ON ea.id=a.entity_id AND NOT ea.is_archived
  JOIN public.map_entity_geometries ga ON ga.entity_id=ea.id AND ga.is_current
  JOIN public.commercial_lots b ON b.project_id=a.project_id AND b.id>a.id AND b.archived_at IS NULL
  JOIN public.map_entities eb ON eb.id=b.entity_id AND NOT eb.is_archived
  JOIN public.map_entity_geometries gb ON gb.entity_id=eb.id AND gb.is_current
  WHERE a.project_id=p AND a.archived_at IS NULL AND (ea.id=ANY(ids) OR eb.id=ANY(ids))
   AND extensions.ST_Area(extensions.ST_Intersection(ga.native_geometry,gb.native_geometry))>0.0000001)
 THEN RAISE EXCEPTION 'ACTIVE_LOT_INTERSECTION'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'targets') t
  JOIN public.map_entity_geometries ga ON ga.entity_id=(t->>'entity_id')::uuid AND ga.is_current
  JOIN jsonb_array_elements(d->'targets') road ON road->>'kind'='road'
  JOIN public.map_entity_geometries gb ON gb.entity_id=(road->>'entity_id')::uuid AND gb.is_current
  WHERE t->>'kind'='lot' AND extensions.ST_Area(extensions.ST_Intersection(ga.native_geometry,gb.native_geometry))>0.0000001)
 THEN RAISE EXCEPTION 'ACTIVE_LOT_OVER_ROAD'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'targets') t
  JOIN public.map_entity_geometries g ON g.entity_id=(t->>'entity_id')::uuid AND g.is_current
  WHERE NOT extensions.ST_Contains(g.native_geometry,extensions.ST_SetSRID(extensions.ST_MakePoint((t->'label_anchor'->>0)::float8,(t->'label_anchor'->>1)::float8),0)))
 THEN RAISE EXCEPTION 'LABEL_ANCHOR_OUTSIDE'; END IF;
 IF pg_temp.exporural_business(before_state) IS DISTINCT FROM pg_temp.exporural_business(pg_temp.exporural_state(p,ids))
 THEN RAISE EXCEPTION 'BUSINESS_LINK_OR_AMOUNT_CHANGED'; END IF;
 IF outside_before IS DISTINCT FROM pg_temp.exporural_state(p,outside_ids)-'project'-'segment'-'rules'
 THEN RAISE EXCEPTION 'OUTSIDE_SCOPE_CHANGED'; END IF;
 after_state:=pg_temp.exporural_state(p,ids);
 result:=jsonb_build_object('revision',rev,'affectedEntityIds',to_jsonb(ids),'afterStateMd5',md5(after_state::text),
 'numberedLots',107,'unnumberedPreserved',true,'businessPreserved',true,'executor',session_user,
 'actorMode',CASE WHEN actor IS NULL THEN 'migration-owner; lineage custodian attribution only' ELSE 'authenticated-admin' END,
 'lineageCustodian',coalesce(actor,steward),'outsideStateMd5',md5(outside_before::text));
 UPDATE public.map_reference_migration_snapshots SET status='APPLIED',applied_at=now(),apply_result=result WHERE id=sid;
 INSERT INTO public.map_activity_logs(org_id,project_id,action,reason,before_state,after_state,actor_user_id)
 VALUES((d->>'org_id')::uuid,p,'EXPORURAL_OFFICIAL_REVISION',rev||'; PDF 20/10/2026, p.1; maintenance executor '||session_user,
  jsonb_build_object('snapshotId',sid),result,actor);
END;
$apply$;
