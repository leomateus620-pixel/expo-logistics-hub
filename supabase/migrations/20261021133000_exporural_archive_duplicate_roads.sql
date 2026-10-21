-- Session-local helpers. Run as the existing migration owner; never expose RPCs.
CREATE OR REPLACE FUNCTION pg_temp.exporural_state(p uuid, ids uuid[])
RETURNS jsonb LANGUAGE sql AS $state$
SELECT jsonb_build_object(
 'project',(SELECT to_jsonb(x) FROM public.map_projects x WHERE id=p),
 'segment',(SELECT to_jsonb(x) FROM public.map_segments x WHERE project_id=p AND slug='exporural'),
 'entities',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.map_entities x WHERE project_id=p AND (ids IS NULL OR id=ANY(ids))),'[]'),
 'geometries',coalesce((SELECT jsonb_agg(to_jsonb(x)-'native_geometry' ORDER BY x.id) FROM public.map_entity_geometries x WHERE project_id=p AND (ids IS NULL OR entity_id=ANY(ids))),'[]'),
 'geometry_versions',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.map_geometry_versions x WHERE project_id=p AND (ids IS NULL OR entity_id=ANY(ids))),'[]'),
 'lots',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.commercial_lots x WHERE project_id=p AND (ids IS NULL OR entity_id=ANY(ids))),'[]'),
 'rules',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.commercial_price_rules x WHERE project_id=p OR project_id IS NULL),'[]'),
 'prices',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_prices x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'overrides',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.commercial_lot_price_overrides x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'reservations',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_reservations x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'negotiations',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_negotiations x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'sales',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_sales x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'orders',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_sale_orders x WHERE x.project_id=p AND (ids IS NULL OR x.id IN (SELECT i.order_id FROM public.lot_sale_order_items i JOIN public.commercial_lots l ON l.id=i.lot_id WHERE l.entity_id=ANY(ids)))),'[]'),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_sale_order_items x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'installments',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_sale_installments x JOIN public.lot_sale_orders o ON o.id=x.order_id WHERE o.project_id=p AND (ids IS NULL OR o.id IN (SELECT i.order_id FROM public.lot_sale_order_items i JOIN public.commercial_lots l ON l.id=i.lot_id WHERE l.entity_id=ANY(ids)))),'[]'),
 'contracts',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_contracts x WHERE x.id IN (SELECT c.id FROM public.lot_contracts c JOIN public.commercial_lots l ON l.id=c.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids)) UNION SELECT cl.contract_id FROM public.lot_contract_lots cl JOIN public.commercial_lots l ON l.id=cl.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids)))),'[]'),
 'contract_lots',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.contract_id,x.lot_id) FROM public.lot_contract_lots x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'contract_versions',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_contract_versions x WHERE x.contract_id IN (SELECT c.id FROM public.lot_contracts c JOIN public.commercial_lots l ON l.id=c.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids)) UNION SELECT cl.contract_id FROM public.lot_contract_lots cl JOIN public.commercial_lots l ON l.id=cl.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids)))),'[]'),
 'lineage',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.map_lot_lineage x WHERE x.source_lot_id IN (SELECT id FROM public.commercial_lots WHERE project_id=p AND (ids IS NULL OR entity_id=ANY(ids))) OR x.target_lot_id IN (SELECT id FROM public.commercial_lots WHERE project_id=p AND (ids IS NULL OR entity_id=ANY(ids)))),'[]')
);
$state$;

CREATE OR REPLACE FUNCTION pg_temp.exporural_business(s jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT s-'project'-'segment'-'entities'-'geometries'-'geometry_versions'-'lots'-'rules'-'prices'-'lineage';
$$;

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
