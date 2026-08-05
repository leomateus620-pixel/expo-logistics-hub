CREATE OR REPLACE FUNCTION public.reconcile_commission_map_lineage(_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  changed_count integer;
BEGIN
  LOOP
    WITH inherited AS (
      SELECT
        target_lot.entity_id,
        min(source_entity.segment_id::text)::uuid AS segment_id,
        min(segment.slug) AS segment_slug
      FROM public.map_lot_lineage lineage
      JOIN public.commercial_lots source_lot ON source_lot.id = lineage.source_lot_id
      JOIN public.map_entities source_entity ON source_entity.id = source_lot.entity_id
      JOIN public.commercial_lots target_lot ON target_lot.id = lineage.target_lot_id
      JOIN public.map_segments segment ON segment.id = source_entity.segment_id
      WHERE target_lot.project_id = _project_id
        AND source_lot.project_id = target_lot.project_id
      GROUP BY target_lot.entity_id
      HAVING count(*) = count(source_entity.segment_id)
        AND count(DISTINCT source_entity.segment_id) = 1
    )
    UPDATE public.map_entities target_entity
    SET segment_id = inherited.segment_id
    FROM inherited
    WHERE target_entity.id = inherited.entity_id
      AND (
        target_entity.segment_id IS DISTINCT FROM inherited.segment_id
        OR target_entity.metadata->>'segmentId' IS DISTINCT FROM inherited.segment_slug
      );

    GET DIAGNOSTICS changed_count = ROW_COUNT;
    EXIT WHEN changed_count = 0;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        target_lot.entity_id,
        count(*) AS lineage_count,
        count(source_entity.segment_id) AS classified_count,
        count(DISTINCT source_entity.segment_id) AS segment_count,
        count(*) FILTER (
          WHERE source_lot.project_id = target_lot.project_id
            AND source_entity.project_id = target_lot.project_id
        ) AS same_project_count
      FROM public.map_lot_lineage lineage
      JOIN public.commercial_lots source_lot ON source_lot.id = lineage.source_lot_id
      JOIN public.map_entities source_entity ON source_entity.id = source_lot.entity_id
      JOIN public.commercial_lots target_lot ON target_lot.id = lineage.target_lot_id
      WHERE target_lot.project_id = _project_id
      GROUP BY target_lot.entity_id
    ) lineage_state
    WHERE lineage_state.same_project_count <> lineage_state.lineage_count
      OR (
        lineage_state.classified_count > 0
        AND (
          lineage_state.classified_count <> lineage_state.lineage_count
          OR lineage_state.segment_count <> 1
        )
      )
  ) THEN
    RAISE EXCEPTION 'MAP_SEGMENT_HISTORICAL_LINEAGE_CONFLICT';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_commission_map_lineage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_commission_map_lineage(uuid) FROM authenticated;

SELECT public.reconcile_commission_map_lineage(project.id)
FROM public.map_projects project;

CREATE OR REPLACE FUNCTION public.keep_map_segment_project_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'MAP_SEGMENT_PROJECT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.keep_map_segment_project_immutable() FROM PUBLIC;

DROP TRIGGER IF EXISTS map_segment_project_immutable ON public.map_segments;
CREATE TRIGGER map_segment_project_immutable
  BEFORE UPDATE OF project_id ON public.map_segments
  FOR EACH ROW EXECUTE FUNCTION public.keep_map_segment_project_immutable();

CREATE OR REPLACE FUNCTION public.map_segment_baseline_count(
  _boundary_data jsonb,
  _key text
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN _boundary_data->>_key ~ '^[1-9][0-9]{0,8}$'
      THEN (_boundary_data->>_key)::integer
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.map_segment_baseline_count(jsonb, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.map_segment_lineage_baseline(_boundary_data jsonb)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
STRICT
SET search_path = public, pg_temp
AS $$
DECLARE
  parsed_baseline timestamptz;
BEGIN
  IF jsonb_typeof(_boundary_data->'lineageBaselineAt') <> 'string' THEN
    RETURN NULL;
  END IF;

  BEGIN
    parsed_baseline := (_boundary_data->>'lineageBaselineAt')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  RETURN parsed_baseline;
END;
$$;

REVOKE ALL ON FUNCTION public.map_segment_lineage_baseline(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.map_segment_lineage_inventory_delta(_segment_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH segment_scope AS (
    SELECT
      segment.id,
      segment.project_id,
      public.map_segment_lineage_baseline(segment.boundary_data) AS baseline_at
    FROM public.map_segments segment
    WHERE segment.id = _segment_id
      AND public.map_segment_lineage_baseline(segment.boundary_data) IS NOT NULL
  ),
  operations AS (
    SELECT
      lineage.relationship,
      CASE
        WHEN lineage.relationship = 'SPLIT_FROM' THEN lineage.source_lot_id
        ELSE lineage.target_lot_id
      END AS operation_id,
      count(*)::integer AS link_count,
      count(*) FILTER (
        WHERE source_lot.project_id = scope.project_id
          AND target_lot.project_id = scope.project_id
          AND source_entity.project_id = scope.project_id
          AND target_entity.project_id = scope.project_id
          AND source_entity.segment_id = scope.id
          AND target_entity.segment_id = scope.id
      )::integer AS scoped_link_count
    FROM segment_scope scope
    JOIN public.map_lot_lineage lineage
      ON lineage.relationship IN ('SPLIT_FROM', 'MERGED_FROM')
    JOIN public.commercial_lots source_lot ON source_lot.id = lineage.source_lot_id
    JOIN public.map_entities source_entity ON source_entity.id = source_lot.entity_id
    JOIN public.commercial_lots target_lot ON target_lot.id = lineage.target_lot_id
    JOIN public.map_entities target_entity ON target_entity.id = target_lot.entity_id
    WHERE lineage.created_at > scope.baseline_at
      AND NOT (
        source_entity.metadata->>'migrationSnapshotId' IS NOT NULL
        AND source_entity.metadata->>'archivedByReferenceRevision' IS NOT NULL
        AND jsonb_typeof(source_entity.metadata->'replacementLotIdentifiers') = 'array'
        AND source_entity.metadata->'replacementLotIdentifiers' ? upper(target_lot.public_identifier)
      )
      AND (
        source_entity.segment_id = scope.id
        OR target_entity.segment_id = scope.id
      )
    GROUP BY lineage.relationship, operation_id
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM segment_scope) THEN NULL
    WHEN COALESCE(bool_and(link_count = 2 AND scoped_link_count = 2), true)
      THEN COALESCE(sum(CASE relationship WHEN 'SPLIT_FROM' THEN 1 ELSE -1 END), 0)::integer
    ELSE NULL
  END
  FROM operations;
$$;

REVOKE ALL ON FUNCTION public.map_segment_lineage_inventory_delta(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.map_segment_is_complete(_segment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    baseline.entity_count IS NOT NULL
      AND baseline.lot_count IS NOT NULL
      AND baseline.entity_count >= baseline.lot_count
      AND lineage.delta IS NOT NULL
      AND inventory.entity_count = baseline.entity_count + lineage.delta
      AND inventory.lot_count = baseline.lot_count + lineage.delta
      AND inventory.lot_count > 0
      AND inventory.current_geometry_count = inventory.entity_count,
    false
  )
  FROM public.map_segments segment
  CROSS JOIN LATERAL (
    SELECT
      public.map_segment_baseline_count(segment.boundary_data, 'expectedEntityCount') AS entity_count,
      public.map_segment_baseline_count(segment.boundary_data, 'expectedLotCount') AS lot_count
  ) baseline
  CROSS JOIN LATERAL (
    SELECT public.map_segment_lineage_inventory_delta(segment.id) AS delta
  ) lineage
  CROSS JOIN LATERAL (
    SELECT
      (
        SELECT count(*)
        FROM public.map_entities entity
        WHERE entity.segment_id = segment.id
          AND entity.project_id = segment.project_id
          AND entity.is_archived = false
      ) AS entity_count,
      (
        SELECT count(*)
        FROM public.commercial_lots lot
        JOIN public.map_entities entity ON entity.id = lot.entity_id
        WHERE entity.segment_id = segment.id
          AND entity.project_id = segment.project_id
          AND lot.project_id = segment.project_id
          AND entity.is_archived = false
          AND lot.archived_at IS NULL
      ) AS lot_count,
      (
        SELECT count(*)
        FROM public.map_entity_geometries geometry
        JOIN public.map_entities entity ON entity.id = geometry.entity_id
        WHERE entity.segment_id = segment.id
          AND entity.project_id = segment.project_id
          AND geometry.project_id = segment.project_id
          AND entity.is_archived = false
          AND geometry.is_current = true
      ) AS current_geometry_count
  ) inventory
  WHERE segment.id = _segment_id
    AND segment.is_active = true;
$$;

REVOKE ALL ON FUNCTION public.map_segment_is_complete(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.map_can_access_segment(_segment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.map_segments segment
    JOIN public.map_projects project ON project.id = segment.project_id
    WHERE segment.id = _segment_id
      AND segment.is_active = true
      AND public.map_segment_is_complete(segment.id)
      AND project.is_archived = false
      AND public.is_org_member(auth.uid(), project.org_id)
      AND (
        public.get_user_org_role(auth.uid(), project.org_id) IN ('admin', 'gestor')
        OR EXISTS (
          SELECT 1
          FROM public.user_capabilities capability
          WHERE capability.user_id = auth.uid()
            AND capability.org_id = project.org_id
            AND capability.capability IN (
              segment.required_capability,
              'full_access',
              'admin_access'
            )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.map_can_view_any_segment(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.map_segments segment
    WHERE segment.project_id = _project_id
      AND public.map_can_access_segment(segment.id)
  );
$$;

REVOKE ALL ON FUNCTION public.map_can_access_segment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.map_can_view_any_segment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.map_can_access_segment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.map_can_view_any_segment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_commission_map_segment_inventory(
  p_segment_id uuid
)
RETURNS TABLE (
  expected_entity_count integer,
  expected_lot_count integer,
  lineage_delta integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.map_can_access_segment(p_segment_id) THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;

  RETURN QUERY
  SELECT
    (baseline.entity_count + adjustment.delta)::integer,
    (baseline.lot_count + adjustment.delta)::integer,
    adjustment.delta
  FROM public.map_segments segment
  CROSS JOIN LATERAL (
    SELECT
      public.map_segment_baseline_count(segment.boundary_data, 'expectedEntityCount') AS entity_count,
      public.map_segment_baseline_count(segment.boundary_data, 'expectedLotCount') AS lot_count
  ) baseline
  CROSS JOIN LATERAL (
    SELECT public.map_segment_lineage_inventory_delta(segment.id) AS delta
  ) adjustment
  WHERE segment.id = p_segment_id
    AND segment.is_active = true
    AND adjustment.delta IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_commission_map_segment_inventory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_commission_map_segment_inventory(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_commission_segment_reservations(
  p_segment_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  segment_project_id uuid;
  segment_org_id uuid;
  expired record;
  expired_count integer := 0;
BEGIN
  IF NOT public.map_can_access_segment(p_segment_id) THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;

  SELECT segment.project_id, project.org_id
  INTO STRICT segment_project_id, segment_org_id
  FROM public.map_segments segment
  JOIN public.map_projects project ON project.id = segment.project_id
  WHERE segment.id = p_segment_id
    AND segment.is_active = true
    AND project.is_archived = false;

  FOR expired IN
    SELECT
      reservation.id AS reservation_id,
      lot.id AS lot_id,
      lot.entity_id,
      lot.status
    FROM public.lot_reservations reservation
    JOIN public.commercial_lots lot ON lot.id = reservation.lot_id
    JOIN public.map_entities entity ON entity.id = lot.entity_id
    WHERE entity.segment_id = p_segment_id
      AND entity.project_id = segment_project_id
      AND lot.project_id = segment_project_id
      AND entity.is_archived = false
      AND lot.archived_at IS NULL
      AND reservation.status = 'ACTIVE'
      AND reservation.expires_at <= now()
    FOR UPDATE OF reservation, lot SKIP LOCKED
  LOOP
    UPDATE public.lot_reservations
    SET status = 'EXPIRED', updated_at = now()
    WHERE id = expired.reservation_id
      AND status = 'ACTIVE';

    IF FOUND THEN
      IF expired.status = 'RESERVED' THEN
        UPDATE public.commercial_lots
        SET status = 'AVAILABLE', updated_at = now()
        WHERE id = expired.lot_id;
        INSERT INTO public.lot_status_history (
          lot_id,
          previous_status,
          new_status,
          reason,
          changed_by
        ) VALUES (
          expired.lot_id,
          'RESERVED',
          'AVAILABLE',
          'Expiração automática da reserva no portal da comissão',
          auth.uid()
        );
      END IF;

      INSERT INTO public.map_activity_logs (
        org_id,
        project_id,
        entity_id,
        lot_id,
        action,
        before_state,
        after_state,
        reason,
        actor_user_id
      ) VALUES (
        segment_org_id,
        segment_project_id,
        expired.entity_id,
        expired.lot_id,
        'RESERVATION_EXPIRED',
        jsonb_build_object('reservationId', expired.reservation_id, 'status', 'ACTIVE'),
        jsonb_build_object('reservationId', expired.reservation_id, 'status', 'EXPIRED'),
        'Prazo de reserva encerrado automaticamente no segmento',
        auth.uid()
      );
      expired_count := expired_count + 1;
    END IF;
  END LOOP;

  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_commission_segment_reservations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_commission_segment_reservations(uuid) TO authenticated;
