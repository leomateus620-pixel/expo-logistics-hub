BEGIN;
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

CREATE OR REPLACE FUNCTION pg_temp.rollback_exporural_official(sid uuid, reason text)
RETURNS jsonb LANGUAGE plpgsql AS $rollback$
DECLARE
 s public.map_reference_migration_snapshots%ROWTYPE; ids uuid[]; current_state jsonb;
 r jsonb; before_row public.map_entities%ROWTYPE; lot_row public.commercial_lots%ROWTYPE;
 old_geom public.map_entity_geometries%ROWTYPE; rule public.commercial_price_rules%ROWTYPE;
 segment public.map_segments%ROWTYPE;
BEGIN
 SELECT * INTO STRICT s FROM public.map_reference_migration_snapshots WHERE id=sid FOR UPDATE;
 IF s.source_revision<>'2028-exporural-2026-10-20.1' OR length(trim(reason))<10 THEN RAISE EXCEPTION 'INVALID_ROLLBACK_REQUEST'; END IF;
 IF session_user NOT IN ('postgres','supabase_admin') AND
  (auth.uid() IS NULL OR NOT public.map_has_explicit_capability(s.org_id,'map.admin'))
 THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
 IF s.status='ROLLED_BACK' THEN RETURN jsonb_build_object('changed',false,'snapshotId',sid); END IF;
 IF s.status<>'APPLIED' THEN RAISE EXCEPTION 'SNAPSHOT_NOT_APPLIED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('commercial-map:exporural:'||s.project_id,0));
 LOCK TABLE public.map_entities,public.map_entity_geometries,public.commercial_lots,
 public.lot_prices,public.commercial_price_rules,public.commercial_lot_price_overrides,
 public.lot_reservations,public.lot_negotiations,public.lot_sales,public.lot_sale_orders,
 public.lot_sale_order_items,public.lot_sale_installments,public.lot_contracts,
 public.lot_contract_lots,public.lot_contract_versions,public.map_lot_lineage IN SHARE ROW EXCLUSIVE MODE;
 SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(s.apply_result->'affectedEntityIds');
 current_state:=pg_temp.exporural_state(s.project_id,ids);
 IF md5(current_state::text)<>s.apply_result->>'afterStateMd5' AND NOT coalesce((s.apply_result->>'rollbackValidatedTransactionId'=txid_current()::text AND s.apply_result->>'rollbackValidatedCheckpoint'=md5(current_state::text)),false)
 THEN RAISE EXCEPTION 'SUBSEQUENT_CHANGE_BLOCKS_ROLLBACK'; END IF;
 -- Stage all active/replaced codes before restoring any prior identifier.
 UPDATE public.commercial_lots SET public_identifier='ROLLBACK:'||sid||':'||id WHERE entity_id=ANY(ids);
 UPDATE public.map_entities SET public_identifier='ROLLBACK:'||sid||':'||id WHERE id=ANY(ids);
 FOR r IN SELECT value FROM jsonb_array_elements(s.snapshot->'entities') LOOP
  before_row:=jsonb_populate_record(NULL::public.map_entities,r);
  UPDATE public.map_entities SET public_identifier=before_row.public_identifier,name=before_row.name,
   description=before_row.description,metadata=before_row.metadata,classification=before_row.classification,
   verification_status=before_row.verification_status,is_sellable=before_row.is_sellable,
   is_archived=before_row.is_archived,parent_entity_id=before_row.parent_entity_id,segment_id=before_row.segment_id
  WHERE id=before_row.id;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(s.snapshot->'lots') LOOP
  lot_row:=jsonb_populate_record(NULL::public.commercial_lots,r);
  UPDATE public.commercial_lots SET public_identifier=lot_row.public_identifier,block=lot_row.block,
   lot_number=lot_row.lot_number,display_name=lot_row.display_name,official_area_sqm=lot_row.official_area_sqm,
   calculated_area_sqm=lot_row.calculated_area_sqm,area_validation_status=lot_row.area_validation_status,
   archived_at=lot_row.archived_at,status=lot_row.status WHERE id=lot_row.id;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(s.snapshot->'geometries') WHERE (value->>'is_current')::boolean LOOP
  old_geom:=jsonb_populate_record(NULL::public.map_entity_geometries,r);
  -- Advancing versions preserves the applied geometry in the existing history trigger.
  UPDATE public.map_entity_geometries SET geometry=old_geom.geometry,version=version+1,
   change_reason='Rollback '||sid||': '||reason,updated_at=now()
  WHERE id=old_geom.id AND geometry IS DISTINCT FROM old_geom.geometry;
 END LOOP;
 -- New identities/lineage remain archived audit records; never DELETE.
 UPDATE public.commercial_lots SET archived_at=now(),status='BLOCKED'
 WHERE entity_id=ANY(ids) AND id NOT IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(s.snapshot->'lots'));
 UPDATE public.map_entities SET is_archived=true,is_sellable=false,metadata=metadata||jsonb_build_object('rolledBackBySnapshotId',sid)
 WHERE id=ANY(ids) AND id NOT IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(s.snapshot->'entities'));
 FOR r IN SELECT value FROM jsonb_array_elements(s.snapshot->'rules') WHERE value->>'id' IN ('552e1038-6b92-429a-a95c-503b737c97b8','81d78933-ff2e-400b-9c04-2d0d9a161b5a') LOOP
  rule:=jsonb_populate_record(NULL::public.commercial_price_rules,r);
  UPDATE public.commercial_price_rules SET range_end=rule.range_end,label=rule.label,notes=rule.notes,updated_at=now() WHERE id=rule.id;
 END LOOP;
 segment:=jsonb_populate_record(NULL::public.map_segments,s.snapshot->'segment');
 UPDATE public.map_segments SET source_reference=segment.source_reference,boundary_data=segment.boundary_data WHERE id=segment.id;
 UPDATE public.map_reference_migration_snapshots SET status='ROLLED_BACK',rolled_back_at=now(),rolled_back_by=auth.uid(),rollback_reason=reason WHERE id=sid;
 INSERT INTO public.map_activity_logs(org_id,project_id,action,reason,before_state,after_state,actor_user_id)
 VALUES(s.org_id,s.project_id,'EXPORURAL_OFFICIAL_ROLLBACK',reason,s.apply_result,jsonb_build_object('snapshotId',sid),auth.uid());
 RETURN jsonb_build_object('changed',true,'snapshotId',sid,'businessPreserved',pg_temp.exporural_business(current_state)=pg_temp.exporural_business(pg_temp.exporural_state(s.project_id,ids)));
END;
$rollback$;

-- Only the migration owner runs these session-local helpers. All guards execute
-- under the same transaction/table locks as the main rollback. No public RPC.
CREATE OR REPLACE FUNCTION pg_temp.rollback_exporural_chain(sid uuid, reason text)
RETURNS jsonb LANGUAGE plpgsql AS $chain$
DECLARE base public.map_reference_migration_snapshots%ROWTYPE;
 surface public.map_reference_migration_snapshots%ROWTYPE;
 label public.map_reference_migration_snapshots%ROWTYPE;
 duplicates public.map_reference_migration_snapshots%ROWTYPE; duplicate_ids uuid[];
 ids uuid[]; surface_ids uuid[]; state jsonb; recovered jsonb; k text; r jsonb;
 e public.map_entities%ROWTYPE; l public.commercial_lots%ROWTYPE; g public.map_entity_geometries%ROWTYPE;
 current_label public.map_entities%ROWTYPE; expected_label jsonb;
BEGIN
 IF session_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'MIGRATION_OWNER_REQUIRED'; END IF;
 SELECT * INTO STRICT base FROM public.map_reference_migration_snapshots WHERE id=sid FOR UPDATE;
 IF base.status='ROLLED_BACK' THEN RETURN jsonb_build_object('changed',false); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('commercial-map:exporural:'||base.project_id,0));
 LOCK TABLE public.map_entities,public.map_entity_geometries,public.commercial_lots,
 public.lot_prices,public.commercial_price_rules,public.commercial_lot_price_overrides,
 public.lot_reservations,public.lot_negotiations,public.lot_sales,public.lot_sale_orders,
 public.lot_sale_order_items,public.lot_sale_installments,public.lot_contracts,
 public.lot_contract_lots,public.lot_contract_versions,public.map_lot_lineage IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO surface FROM public.map_reference_migration_snapshots WHERE project_id=base.project_id AND source_revision='2028-exporural-2026-10-21.surfaces.1' AND status='APPLIED' FOR UPDATE;
 IF NOT FOUND THEN RETURN pg_temp.rollback_exporural_official(sid,reason); END IF;
 SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(base.apply_result->'affectedEntityIds');
 SELECT array_agg(value::uuid) INTO surface_ids FROM jsonb_array_elements_text(surface.apply_result->'entityIds');
 IF md5(pg_temp.exporural_state(base.project_id,surface_ids)::text)<>surface.apply_result->>'afterStateMd5' THEN RAISE EXCEPTION 'SUBSEQUENT_CHANGE_BLOCKS_SURFACE_ROLLBACK'; END IF;
 state:=pg_temp.exporural_state(base.project_id,ids); recovered:=state;
 -- Reconstruct the exact state immediately after the first commit, in memory.
 -- Substituting only audited follow-up records also restores the historical
 -- version arrays for comparison; the actual history is never removed.
 FOREACH k IN ARRAY ARRAY['entities','lots','geometries','geometry_versions'] LOOP
  recovered:=jsonb_set(recovered,ARRAY[k],(SELECT coalesce(jsonb_agg(v ORDER BY v->>'id'),'[]') FROM (
   SELECT value v FROM jsonb_array_elements(state->k) WHERE NOT ((CASE WHEN k='entities' THEN value->>'id' ELSE value->>'entity_id' END)::uuid=ANY(surface_ids))
   UNION ALL SELECT value FROM jsonb_array_elements(surface.snapshot->k)
  ) rows));
 END LOOP;
 IF md5(recovered::text)<>base.apply_result->>'afterStateMd5' THEN RAISE EXCEPTION 'SUBSEQUENT_CHANGE_BLOCKS_OFFICIAL_ROLLBACK'; END IF;
 SELECT * INTO duplicates FROM public.map_reference_migration_snapshots WHERE project_id=base.project_id AND source_revision='2028-exporural-2026-10-21.legacy-roads.1' AND status='APPLIED' FOR UPDATE;
 IF FOUND THEN
  SELECT array_agg(value::uuid) INTO duplicate_ids FROM jsonb_array_elements_text(duplicates.apply_result->'entityIds');
  IF md5(pg_temp.exporural_state(base.project_id,duplicate_ids)::text)<>duplicates.apply_result->>'afterStateMd5' THEN RAISE EXCEPTION 'LEGACY_ROAD_CHANGED_BLOCKS_ROLLBACK'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(duplicates.snapshot->'entities') LOOP
   e:=jsonb_populate_record(NULL::public.map_entities,r);
   UPDATE public.map_entities SET is_archived=e.is_archived,is_sellable=e.is_sellable,metadata=e.metadata WHERE id=e.id;
  END LOOP;
  UPDATE public.map_reference_migration_snapshots SET status='ROLLED_BACK',rolled_back_at=now(),rollback_reason=reason WHERE id=duplicates.id;
 END IF;
 SELECT * INTO label FROM public.map_reference_migration_snapshots WHERE project_id=base.project_id AND source_revision='2028-exporural-2026-10-21.labels.1' AND status='APPLIED' FOR UPDATE;
 IF FOUND THEN
  SELECT * INTO STRICT current_label FROM public.map_entities WHERE id=(label.snapshot->'entity'->>'id')::uuid FOR UPDATE;
  expected_label:=(label.snapshot->'entity')||jsonb_build_object('metadata',(label.snapshot->'entity'->'metadata')||jsonb_build_object('suppressTerritorialLabel',true,'labelSuppressionReason','Solicitação do usuário: anotação deslocada sobre a vegetação; 21/10/2026'));
  IF (to_jsonb(current_label)-'updated_at')<>(expected_label-'updated_at') THEN RAISE EXCEPTION 'LABEL_CHANGED_BLOCKS_ROLLBACK'; END IF;
  UPDATE public.map_entities SET metadata=label.snapshot->'entity'->'metadata' WHERE id=current_label.id;
  UPDATE public.map_reference_migration_snapshots SET status='ROLLED_BACK',rolled_back_at=now(),rollback_reason=reason WHERE id=label.id;
 END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(surface.snapshot->'entities') LOOP
  e:=jsonb_populate_record(NULL::public.map_entities,r);
  UPDATE public.map_entities SET metadata=e.metadata WHERE id=e.id;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(surface.snapshot->'lots') LOOP
  l:=jsonb_populate_record(NULL::public.commercial_lots,r);
  UPDATE public.commercial_lots SET is_corner=l.is_corner WHERE id=l.id;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(surface.snapshot->'geometries') WHERE (value->>'is_current')::boolean LOOP
  g:=jsonb_populate_record(NULL::public.map_entity_geometries,r);
  UPDATE public.map_entity_geometries SET geometry=g.geometry,elevation=g.elevation,extrusion_height=g.extrusion_height,version=version+1,change_reason='Rollback follow-up: '||reason,updated_at=now() WHERE id=g.id AND (geometry,elevation,extrusion_height) IS DISTINCT FROM (g.geometry,g.elevation,g.extrusion_height);
 END LOOP;
 UPDATE public.map_reference_migration_snapshots SET status='ROLLED_BACK',rolled_back_at=now(),rollback_reason=reason WHERE id=surface.id;
 -- Preserve the original afterStateMd5. This extra checkpoint is valid only
 -- in this already-locked transaction after both exact hash comparisons above.
 UPDATE public.map_reference_migration_snapshots SET apply_result=apply_result||jsonb_build_object('rollbackValidatedTransactionId',txid_current()::text,'rollbackValidatedCheckpoint',md5(pg_temp.exporural_state(base.project_id,ids)::text)) WHERE id=sid;
 RETURN pg_temp.rollback_exporural_official(sid,reason);
END;
$chain$;

SELECT pg_temp.rollback_exporural_chain('dbeaf99c-ab1c-4f56-ae11-2dac59d9b535','Ensaio de reversão oficial; verificar antes de efetivar');
ROLLBACK; -- Ensaio seguro; somente trocar por COMMIT após avaliar o resultado.