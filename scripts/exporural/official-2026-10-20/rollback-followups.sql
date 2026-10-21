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
