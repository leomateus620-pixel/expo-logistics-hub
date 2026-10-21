-- Two legacy rectangular lanes duplicate the persisted curved Ubiretama.
-- Retire only their identities; keep every geometry/version for history.
DO $duplicate$
DECLARE p uuid:='0538d132-34dd-4347-a33c-526edac7339c';
 rev text:='2028-exporural-2026-10-21.legacy-roads.1'; sid uuid; ids uuid[]; before_state jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('commercial-map:exporural:'||p,0));
 IF EXISTS(SELECT 1 FROM public.map_reference_migration_snapshots WHERE project_id=p AND source_revision=rev AND status='APPLIED') THEN RETURN; END IF;
 LOCK TABLE public.map_entities,public.map_entity_geometries,public.commercial_lots IN SHARE ROW EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM public.map_segments WHERE project_id=p AND slug='exporural' AND source_reference='2028-exporural-2026-10-20.1') THEN RAISE EXCEPTION 'OFFICIAL_REVISION_REQUIRED'; END IF;
 SELECT array_agg(id) INTO ids FROM public.map_entities WHERE project_id=p AND classification='ROAD' AND segment_id IS NULL AND NOT is_archived AND id IN ('25e57aa1-b026-4f83-ac6d-1b70ec13c0b2','d7876f2e-bf8b-4a6c-b773-e3320f78eea1') AND public_identifier IN ('RUA-LESTE-EXPORURAL','RUA-UBIRETAMA-LATERAL-R55');
 IF cardinality(ids)<>2 OR ids IS NULL OR EXISTS(SELECT 1 FROM public.commercial_lots WHERE entity_id=ANY(ids)) THEN RAISE EXCEPTION 'LEGACY_ROAD_IDENTITY_CONFLICT'; END IF;
 before_state:=pg_temp.exporural_state(p,ids);
 INSERT INTO public.map_reference_migration_snapshots(org_id,project_id,area_code,source_revision,payload_hash,status,snapshot,created_by)
 VALUES('985888b8-155f-4bbe-b6b9-6bef2893d99b',p,'EXPORURAL_LEGACY_ROADS',rev,md5(rev),'PENDING',before_state,auth.uid()) RETURNING id INTO sid;
 UPDATE public.map_entities SET is_archived=true,is_sellable=false,metadata=metadata||jsonb_build_object('archivedByRevision',rev,'replacedByRoadIdentifier','RUA-UBIRETAMA','archiveReason','Retângulo legado duplicava a via curva oficial; recompor terreno fora da via vigente.') WHERE id=ANY(ids);
 UPDATE public.map_reference_migration_snapshots SET status='APPLIED',applied_at=now(),apply_result=jsonb_build_object('entityIds',ids,'afterStateMd5',md5(pg_temp.exporural_state(p,ids)::text),'commercialLotsChanged',0) WHERE id=sid;
 INSERT INTO public.map_activity_logs(org_id,project_id,action,reason,before_state,after_state,actor_user_id) VALUES('985888b8-155f-4bbe-b6b9-6bef2893d99b',p,'EXPORURAL_DUPLICATE_ROADS_ARCHIVED',rev,jsonb_build_object('snapshotId',sid),jsonb_build_object('archivedEntityIds',ids),auth.uid());
END;
$duplicate$;
