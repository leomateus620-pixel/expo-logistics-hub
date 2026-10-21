-- Explicit user request: suppress the misplaced legacy lateral annotation.
-- Geometry, road identity, official name, segment and commerce stay unchanged.
DO $label$
DECLARE p uuid := '0538d132-34dd-4347-a33c-526edac7339c'; r public.map_entities%ROWTYPE; sid uuid;
 rev text := '2028-exporural-2026-10-21.labels.1';
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('commercial-map:exporural:'||p,0));
 IF EXISTS(SELECT 1 FROM public.map_reference_migration_snapshots WHERE project_id=p AND source_revision=rev AND status='APPLIED') THEN RETURN; END IF;
 SELECT * INTO STRICT r FROM public.map_entities WHERE project_id=p AND public_identifier='RUA-UBIRETAMA-LATERAL-R55' AND NOT is_archived FOR UPDATE;
 INSERT INTO public.map_reference_migration_snapshots(org_id,project_id,area_code,source_revision,payload_hash,status,snapshot,created_by)
 VALUES('985888b8-155f-4bbe-b6b9-6bef2893d99b',p,'EXPORURAL_LABELS',rev,md5(rev),'PENDING',jsonb_build_object('entity',to_jsonb(r)),auth.uid()) RETURNING id INTO sid;
 UPDATE public.map_entities SET metadata=metadata||jsonb_build_object('suppressTerritorialLabel',true,'labelSuppressionReason','Solicitação do usuário: anotação deslocada sobre a vegetação; 21/10/2026') WHERE id=r.id;
 UPDATE public.map_reference_migration_snapshots SET status='APPLIED',applied_at=now(),apply_result=jsonb_build_object('entityId',r.id,'geometryPreserved',true,'labelSuppressed',true) WHERE id=sid;
 INSERT INTO public.map_activity_logs(org_id,project_id,entity_id,action,reason,before_state,after_state,actor_user_id)
 VALUES('985888b8-155f-4bbe-b6b9-6bef2893d99b',p,r.id,'MAP_LABEL_SUPPRESSED',rev,to_jsonb(r),jsonb_build_object('suppressTerritorialLabel',true),auth.uid());
END;
$label$;
