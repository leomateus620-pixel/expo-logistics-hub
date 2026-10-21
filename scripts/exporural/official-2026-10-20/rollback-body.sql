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
