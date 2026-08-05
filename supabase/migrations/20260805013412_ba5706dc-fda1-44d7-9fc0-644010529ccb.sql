CREATE OR REPLACE FUNCTION public.rollback_exporural_reference_2026(
  p_org_id uuid,
  p_snapshot_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_snapshot public.map_reference_migration_snapshots%ROWTYPE;
  v_project public.map_projects%ROWTYPE;
  v_before_project public.map_projects%ROWTYPE;
  v_before_entity public.map_entities%ROWTYPE;
  v_before_geometry public.map_entity_geometries%ROWTYPE;
  v_current_geometry public.map_entity_geometries%ROWTYPE;
  v_before_lot public.commercial_lots%ROWTYPE;
  v_current_lot public.commercial_lots%ROWTYPE;
  v_item jsonb;
  v_applied_at timestamptz;
  v_inserted_id uuid;
  v_geometry_changed boolean;
  v_calibration_changed boolean;
  v_entities_restored integer := 0;
  v_geometries_restored integer := 0;
  v_lots_restored integer := 0;
  v_created_entities_archived integer := 0;
  v_created_lots_archived integer := 0;
  v_calibration_invalidated boolean := false;
  v_result jsonb;
BEGIN
  IF p_org_id IS NULL
    OR NOT public.map_has_explicit_capability(p_org_id, 'map.admin')
  THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'EXPORURAL_ROLLBACK_REASON_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('commercial-map:exporural:' || p_org_id::text, 0)
  );

  SELECT *
  INTO v_snapshot
  FROM public.map_reference_migration_snapshots
  WHERE id = p_snapshot_id
    AND org_id = p_org_id
    AND area_code = 'EXPORURAL'
    AND source_revision = '2026.3'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXPORURAL_ROLLBACK_SNAPSHOT_NOT_FOUND';
  END IF;
  IF v_snapshot.status = 'ROLLED_BACK' THEN
    RETURN jsonb_build_object(
      'projectId', v_snapshot.project_id,
      'snapshotId', v_snapshot.id,
      'referenceRevision', v_snapshot.source_revision,
      'changed', false,
      'rolledBackAt', v_snapshot.rolled_back_at
    );
  END IF;
  IF v_snapshot.status <> 'APPLIED' OR v_snapshot.applied_at IS NULL THEN
    RAISE EXCEPTION 'EXPORURAL_ROLLBACK_SNAPSHOT_NOT_APPLIED';
  END IF;

  SELECT *
  INTO v_project
  FROM public.map_projects
  WHERE id = v_snapshot.project_id
    AND org_id = p_org_id
    AND is_archived = false
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MAP_PROJECT_NOT_FOUND';
  END IF;

  SELECT *
  INTO v_before_project
  FROM jsonb_populate_record(
    NULL::public.map_projects,
    v_snapshot.snapshot->'project'
  );
  v_applied_at := v_snapshot.applied_at;

  IF v_project.reference_revision IS DISTINCT FROM v_snapshot.source_revision
    OR v_project.active_version IS DISTINCT FROM
      nullif(v_snapshot.apply_result->>'projectVersionAfter', '')::integer
    OR v_project.updated_at > v_applied_at
  THEN
    RAISE EXCEPTION 'EXPORURAL_ROLLBACK_PROJECT_DRIFT';
  END IF;

  IF EXISTS (
    WITH affected_entity_ids AS (
      SELECT (item->>'id')::uuid AS id
      FROM jsonb_array_elements(v_snapshot.snapshot->'entities') item
      UNION
      SELECT value::uuid
      FROM jsonb_array_elements_text(
        coalesce(v_snapshot.apply_result->'insertedEntityIds', '[]'::jsonb)
      ) value
    )
    SELECT 1
    FROM public.map_entities entity
    WHERE entity.id IN (SELECT id FROM affected_entity_ids)
      AND entity.updated_at > v_applied_at
  ) OR EXISTS (
    WITH affected_entity_ids AS (
      SELECT (item->>'id')::uuid AS id
      FROM jsonb_array_elements(v_snapshot.snapshot->'entities') item
      UNION
      SELECT value::uuid
      FROM jsonb_array_elements_text(
        coalesce(v_snapshot.apply_result->'insertedEntityIds', '[]'::jsonb)
      ) value
    )
    SELECT 1
    FROM public.map_entity_geometries geometry
    WHERE geometry.entity_id IN (SELECT id FROM affected_entity_ids)
      AND geometry.is_current = true
      AND geometry.updated_at > v_applied_at
  ) OR EXISTS (
    WITH affected_lot_ids AS (
      SELECT (item->>'id')::uuid AS id
      FROM jsonb_array_elements(v_snapshot.snapshot->'lots') item
      UNION
      SELECT value::uuid
      FROM jsonb_array_elements_text(
        coalesce(v_snapshot.apply_result->'insertedLotIds', '[]'::jsonb)
      ) value
    )
    SELECT 1
    FROM public.commercial_lots lot
    WHERE lot.id IN (SELECT id FROM affected_lot_ids)
      AND lot.updated_at > v_applied_at
  ) THEN
    RAISE EXCEPTION 'EXPORURAL_ROLLBACK_MAP_STATE_DRIFT';
  END IF;

  IF EXISTS (
    WITH affected_lot_ids AS (
      SELECT (item->>'id')::uuid AS id
      FROM jsonb_array_elements(v_snapshot.snapshot->'lots') item
      UNION
      SELECT value::uuid
      FROM jsonb_array_elements_text(
        coalesce(v_snapshot.apply_result->'insertedLotIds', '[]'::jsonb)
      ) value
    )
    SELECT 1
    FROM public.lot_prices price
    WHERE price.lot_id IN (SELECT id FROM affected_lot_ids)
      AND price.created_at > v_applied_at
    UNION ALL
    SELECT 1
    FROM public.lot_reservations reservation
    WHERE reservation.lot_id IN (SELECT id FROM affected_lot_ids)
      AND greatest(reservation.created_at, reservation.updated_at) > v_applied_at
    UNION ALL
    SELECT 1
    FROM public.lot_negotiations negotiation
    WHERE negotiation.lot_id IN (SELECT id FROM affected_lot_ids)
      AND greatest(negotiation.created_at, negotiation.updated_at) > v_applied_at
    UNION ALL
    SELECT 1
    FROM public.lot_sales sale
    WHERE sale.lot_id IN (SELECT id FROM affected_lot_ids)
      AND greatest(sale.created_at, coalesce(sale.reverted_at, sale.created_at)) > v_applied_at
    UNION ALL
    SELECT 1
    FROM public.lot_contracts contract
    WHERE contract.lot_id IN (SELECT id FROM affected_lot_ids)
      AND greatest(contract.created_at, contract.updated_at) > v_applied_at
    UNION ALL
    SELECT 1
    FROM public.lot_contract_versions contract_version
    JOIN public.lot_contracts contract ON contract.id = contract_version.contract_id
    WHERE contract.lot_id IN (SELECT id FROM affected_lot_ids)
      AND contract_version.uploaded_at > v_applied_at
    UNION ALL
    SELECT 1
    FROM public.lot_status_history history
    WHERE history.lot_id IN (SELECT id FROM affected_lot_ids)
      AND history.changed_at > v_applied_at
    UNION ALL
    SELECT 1
    FROM public.map_lot_lineage lineage
    WHERE (
        lineage.source_lot_id IN (SELECT id FROM affected_lot_ids)
        OR lineage.target_lot_id IN (SELECT id FROM affected_lot_ids)
      )
      AND lineage.created_at > v_applied_at
  ) THEN
    RAISE EXCEPTION 'EXPORURAL_ROLLBACK_COMMERCIAL_STATE_DRIFT';
  END IF;

  DELETE FROM public.map_lot_lineage
  WHERE id IN (
    SELECT value::uuid
    FROM jsonb_array_elements_text(
      coalesce(v_snapshot.apply_result->'insertedLineageIds', '[]'::jsonb)
    ) value
  );

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(v_snapshot.snapshot->'entities')
  LOOP
    SELECT *
    INTO v_before_entity
    FROM jsonb_populate_record(NULL::public.map_entities, v_item);

    UPDATE public.map_entities
    SET layer_id = v_before_entity.layer_id,
        parent_entity_id = v_before_entity.parent_entity_id,
        public_identifier = v_before_entity.public_identifier,
        name = v_before_entity.name,
        description = v_before_entity.description,
        classification = v_before_entity.classification,
        verification_status = v_before_entity.verification_status,
        is_sellable = v_before_entity.is_sellable,
        is_archived = v_before_entity.is_archived,
        metadata = v_before_entity.metadata,
        updated_by = auth.uid(),
        updated_at = now()
    WHERE id = v_before_entity.id
      AND project_id = v_project.id;
    IF FOUND THEN
      v_entities_restored := v_entities_restored + 1;
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(v_snapshot.snapshot->'geometries')
  LOOP
    SELECT *
    INTO v_before_geometry
    FROM jsonb_populate_record(NULL::public.map_entity_geometries, v_item);

    SELECT *
    INTO v_current_geometry
    FROM public.map_entity_geometries
    WHERE entity_id = v_before_geometry.entity_id
      AND is_current = true
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'EXPORURAL_ROLLBACK_CURRENT_GEOMETRY_MISSING:%',
        v_before_geometry.entity_id;
    END IF;

    v_geometry_changed :=
      v_current_geometry.geometry IS DISTINCT FROM v_before_geometry.geometry
      OR v_current_geometry.elevation IS DISTINCT FROM v_before_geometry.elevation
      OR v_current_geometry.extrusion_height IS DISTINCT FROM v_before_geometry.extrusion_height
      OR v_current_geometry.rotation IS DISTINCT FROM v_before_geometry.rotation;
    v_calibration_changed :=
      v_current_geometry.calibration_version IS DISTINCT FROM
        v_before_geometry.calibration_version;

    IF v_calibration_changed AND NOT v_geometry_changed THEN
      INSERT INTO public.map_geometry_versions (
        geometry_id, project_id, entity_id, geometry, elevation, extrusion_height,
        rotation, calibration_version, version, change_reason, created_by, created_at
      ) VALUES (
        v_current_geometry.id,
        v_current_geometry.project_id,
        v_current_geometry.entity_id,
        v_current_geometry.geometry,
        v_current_geometry.elevation,
        v_current_geometry.extrusion_height,
        v_current_geometry.rotation,
        v_current_geometry.calibration_version,
        v_current_geometry.version,
        v_current_geometry.change_reason,
        v_current_geometry.created_by,
        v_current_geometry.created_at
      );
    END IF;

    IF v_geometry_changed OR v_calibration_changed THEN
      UPDATE public.map_entity_geometries
      SET geometry = v_before_geometry.geometry,
          elevation = v_before_geometry.elevation,
          extrusion_height = v_before_geometry.extrusion_height,
          rotation = v_before_geometry.rotation,
          calibration_version = v_before_geometry.calibration_version,
          version = v_current_geometry.version + 1,
          change_reason = 'Rollback auditado da Exporural 2026.3; snapshot ' || v_snapshot.id,
          created_by = auth.uid(),
          created_at = now(),
          updated_at = now()
      WHERE id = v_current_geometry.id;
      v_geometries_restored := v_geometries_restored + 1;
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(v_snapshot.snapshot->'lots')
  LOOP
    SELECT *
    INTO v_before_lot
    FROM jsonb_populate_record(NULL::public.commercial_lots, v_item);

    SELECT *
    INTO v_current_lot
    FROM public.commercial_lots
    WHERE id = v_before_lot.id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'EXPORURAL_ROLLBACK_LOT_MISSING:%', v_before_lot.id;
    END IF;

    IF v_current_lot.status IS DISTINCT FROM v_before_lot.status THEN
      INSERT INTO public.lot_status_history (
        lot_id, previous_status, new_status, reason, changed_by
      ) VALUES (
        v_before_lot.id,
        v_current_lot.status,
        v_before_lot.status,
        'Rollback auditado da Exporural 2026.3; snapshot ' || v_snapshot.id,
        auth.uid()
      );
    END IF;

    UPDATE public.commercial_lots
    SET entity_id = v_before_lot.entity_id,
        public_identifier = v_before_lot.public_identifier,
        block = v_before_lot.block,
        lot_number = v_before_lot.lot_number,
        level_label = v_before_lot.level_label,
        display_name = v_before_lot.display_name,
        description = v_before_lot.description,
        status = v_before_lot.status,
        official_area_sqm = v_before_lot.official_area_sqm,
        calculated_area_sqm = v_before_lot.calculated_area_sqm,
        area_validation_status = v_before_lot.area_validation_status,
        frontage_meters = v_before_lot.frontage_meters,
        depth_meters = v_before_lot.depth_meters,
        infrastructure = v_before_lot.infrastructure,
        has_electricity = v_before_lot.has_electricity,
        has_water = v_before_lot.has_water,
        has_internet = v_before_lot.has_internet,
        is_corner = v_before_lot.is_corner,
        is_covered = v_before_lot.is_covered,
        accessibility_notes = v_before_lot.accessibility_notes,
        commercial_notes = v_before_lot.commercial_notes,
        internal_notes = v_before_lot.internal_notes,
        archived_at = v_before_lot.archived_at,
        superseded_by_lot_id = v_before_lot.superseded_by_lot_id,
        updated_by = auth.uid(),
        updated_at = now()
    WHERE id = v_before_lot.id;
    v_lots_restored := v_lots_restored + 1;
  END LOOP;

  FOR v_inserted_id IN
    SELECT value::uuid
    FROM jsonb_array_elements_text(
      coalesce(v_snapshot.apply_result->'insertedLotIds', '[]'::jsonb)
    ) value
  LOOP
    SELECT *
    INTO v_current_lot
    FROM public.commercial_lots
    WHERE id = v_inserted_id
    FOR UPDATE;

    IF FOUND AND (
      v_current_lot.status IS DISTINCT FROM 'UNAVAILABLE'
      OR v_current_lot.archived_at IS NULL
    ) THEN
      IF v_current_lot.status IS DISTINCT FROM 'UNAVAILABLE' THEN
        INSERT INTO public.lot_status_history (
          lot_id, previous_status, new_status, reason, changed_by
        ) VALUES (
          v_current_lot.id,
          v_current_lot.status,
          'UNAVAILABLE',
          'Lote criado pela revisão Exporural arquivado no rollback; snapshot ' || v_snapshot.id,
          auth.uid()
        );
      END IF;

      UPDATE public.commercial_lots
      SET status = 'UNAVAILABLE',
          archived_at = now(),
          internal_notes = concat_ws(
            E'\n',
            internal_notes,
            'Arquivado pelo rollback da revisão Exporural; snapshot ' || v_snapshot.id
          ),
          updated_by = auth.uid(),
          updated_at = now()
      WHERE id = v_current_lot.id;
      v_created_lots_archived := v_created_lots_archived + 1;
    END IF;
  END LOOP;

  FOR v_inserted_id IN
    SELECT value::uuid
    FROM jsonb_array_elements_text(
      coalesce(v_snapshot.apply_result->'insertedEntityIds', '[]'::jsonb)
    ) value
  LOOP
    UPDATE public.map_entities
    SET is_archived = true,
        verification_status = 'ARCHIVED',
        metadata = metadata || jsonb_build_object(
          'rolledBackBySnapshotId', v_snapshot.id,
          'rolledBackAt', clock_timestamp()
        ),
        updated_by = auth.uid(),
        updated_at = now()
    WHERE id = v_inserted_id
      AND project_id = v_project.id
      AND is_archived = false;
    IF FOUND THEN
      v_created_entities_archived := v_created_entities_archived + 1;
    END IF;
  END LOOP;

  IF coalesce((v_snapshot.apply_result->>'calibrationCreated')::boolean, false) THEN
    UPDATE public.map_calibrations
    SET status = 'INVALIDATED',
        invalidated_reason =
          'Calibração técnica Exporural 2026.3 invalidada pelo rollback do snapshot '
          || v_snapshot.id
    WHERE id = nullif(v_snapshot.apply_result->>'calibrationId', '')::uuid
      AND project_id = v_project.id
      AND status = 'VALIDATED';
    v_calibration_invalidated := FOUND;
  END IF;

  UPDATE public.map_projects
  SET reference_revision = v_before_project.reference_revision,
      active_version = v_project.active_version + 1,
      is_published = false,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = v_project.id
  RETURNING * INTO v_project;

  v_result := jsonb_build_object(
    'projectId', v_project.id,
    'snapshotId', v_snapshot.id,
    'referenceRevision', v_before_project.reference_revision,
    'changed', true,
    'entitiesRestored', v_entities_restored,
    'geometriesRestored', v_geometries_restored,
    'lotsRestored', v_lots_restored,
    'createdEntitiesArchived', v_created_entities_archived,
    'createdLotsArchived', v_created_lots_archived,
    'calibrationInvalidated', v_calibration_invalidated,
    'projectVersionAfterRollback', v_project.active_version,
    'isPublished', false,
    'rolledBackAt', clock_timestamp()
  );

  UPDATE public.map_reference_migration_snapshots
  SET status = 'ROLLED_BACK',
      rolled_back_at = clock_timestamp(),
      rolled_back_by = auth.uid(),
      rollback_reason = trim(p_reason)
  WHERE id = v_snapshot.id;

  INSERT INTO public.map_activity_logs (
    org_id, project_id, action, reason, before_state, after_state, actor_user_id
  ) VALUES (
    p_org_id,
    v_project.id,
    'EXPORURAL_REFERENCE_2026_ROLLED_BACK',
    trim(p_reason),
    v_snapshot.apply_result,
    v_result,
    auth.uid()
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_exporural_reference_2026(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollback_exporural_reference_2026(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.apply_exporural_reference_2026(uuid, text, jsonb, jsonb) IS
  'Explicit map.admin-only Exporural 2026.3 rollout. Validates inventory, official/calculated area tolerance, topology, roads and protected structures; versions geometry and preserves all commercial state.';

COMMENT ON FUNCTION public.rollback_exporural_reference_2026(uuid, uuid, text) IS
  'Authorized, drift-guarded rollback for an applied Exporural 2026.3 snapshot. Restores prior rows as new audited revisions and never republishes automatically.';

COMMENT ON TABLE public.map_reference_migration_snapshots IS
  'Complete pre-write snapshots and operation state for directed map-reference migrations, including authorized rollback evidence.';