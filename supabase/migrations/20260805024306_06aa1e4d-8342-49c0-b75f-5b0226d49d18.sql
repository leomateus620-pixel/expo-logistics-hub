ALTER TABLE public.map_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS map_segments_select ON public.map_segments;
CREATE POLICY map_segments_select ON public.map_segments
  FOR SELECT TO authenticated
  USING (
    public.can_view_commercial_map((SELECT project.org_id FROM public.map_projects project WHERE project.id = project_id))
    OR public.map_can_access_segment(id)
  );

DROP POLICY IF EXISTS map_segments_manage ON public.map_segments;
CREATE POLICY map_segments_manage ON public.map_segments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.map_projects project
      WHERE project.id = project_id
        AND public.map_has_explicit_capability(project.org_id, 'map.admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.map_projects project
      WHERE project.id = project_id
        AND public.map_has_explicit_capability(project.org_id, 'map.admin')
    )
  );

DROP POLICY IF EXISTS map_projects_commission_segment_select ON public.map_projects;
CREATE POLICY map_projects_commission_segment_select ON public.map_projects
  FOR SELECT TO authenticated
  USING (public.map_can_view_any_segment(id));

DROP POLICY IF EXISTS map_calibrations_commission_segment_select ON public.map_calibrations;

DROP POLICY IF EXISTS map_layers_commission_segment_select ON public.map_layers;
CREATE POLICY map_layers_commission_segment_select ON public.map_layers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.map_entities entity
      WHERE entity.layer_id = map_layers.id
        AND entity.project_id = map_layers.project_id
        AND entity.is_archived = false
        AND entity.segment_id IS NOT NULL
        AND public.map_can_access_segment(entity.segment_id)
    )
  );

DROP POLICY IF EXISTS map_entities_commission_segment_select ON public.map_entities;
CREATE POLICY map_entities_commission_segment_select ON public.map_entities
  FOR SELECT TO authenticated
  USING (
    is_archived = false
    AND segment_id IS NOT NULL
    AND public.map_can_access_segment(segment_id)
  );

DROP POLICY IF EXISTS map_geometries_commission_segment_select ON public.map_entity_geometries;
CREATE POLICY map_geometries_commission_segment_select ON public.map_entity_geometries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.map_entities entity
      WHERE entity.id = map_entity_geometries.entity_id
        AND entity.project_id = map_entity_geometries.project_id
        AND entity.is_archived = false
        AND map_entity_geometries.is_current = true
        AND entity.segment_id IS NOT NULL
        AND public.map_can_access_segment(entity.segment_id)
    )
  );

DROP POLICY IF EXISTS commercial_lots_commission_segment_select ON public.commercial_lots;
CREATE POLICY commercial_lots_commission_segment_select ON public.commercial_lots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.map_entities entity
      WHERE entity.id = commercial_lots.entity_id
        AND entity.project_id = commercial_lots.project_id
        AND entity.is_archived = false
        AND commercial_lots.archived_at IS NULL
        AND entity.segment_id IS NOT NULL
        AND public.map_can_access_segment(entity.segment_id)
    )
  );

DROP POLICY IF EXISTS lot_prices_commission_segment_select ON public.lot_prices;
CREATE POLICY lot_prices_commission_segment_select ON public.lot_prices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.commercial_lots lot
      JOIN public.map_entities entity ON entity.id = lot.entity_id
      WHERE lot.id = lot_prices.lot_id
        AND lot.project_id = entity.project_id
        AND lot.archived_at IS NULL
        AND entity.is_archived = false
        AND lot_prices.is_active = true
        AND entity.segment_id IS NOT NULL
        AND public.map_can_access_segment(entity.segment_id)
    )
  );

DROP POLICY IF EXISTS lot_reservations_commission_segment_select ON public.lot_reservations;
CREATE POLICY lot_reservations_commission_segment_select ON public.lot_reservations
  FOR SELECT TO authenticated
  USING (
    status = 'ACTIVE'
    AND EXISTS (
      SELECT 1
      FROM public.commercial_lots lot
      JOIN public.map_entities entity ON entity.id = lot.entity_id
      WHERE lot.id = lot_reservations.lot_id
        AND lot.project_id = entity.project_id
        AND lot.archived_at IS NULL
        AND entity.is_archived = false
        AND entity.segment_id IS NOT NULL
        AND public.map_can_access_segment(entity.segment_id)
    )
  );

DROP POLICY IF EXISTS lot_sales_commission_segment_select ON public.lot_sales;
CREATE POLICY lot_sales_commission_segment_select ON public.lot_sales
  FOR SELECT TO authenticated
  USING (
    status = 'CONFIRMED'
    AND EXISTS (
      SELECT 1
      FROM public.commercial_lots lot
      JOIN public.map_entities entity ON entity.id = lot.entity_id
      WHERE lot.id = lot_sales.lot_id
        AND lot.project_id = entity.project_id
        AND lot.archived_at IS NULL
        AND entity.is_archived = false
        AND entity.segment_id IS NOT NULL
        AND public.map_can_access_segment(entity.segment_id)
    )
  );

DROP POLICY IF EXISTS map_activity_commission_segment_select ON public.map_activity_logs;
CREATE POLICY map_activity_commission_segment_select ON public.map_activity_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.map_entities entity
      WHERE entity.id = map_activity_logs.entity_id
        AND entity.project_id = map_activity_logs.project_id
        AND entity.is_archived = false
        AND entity.segment_id IS NOT NULL
        AND public.map_can_access_segment(entity.segment_id)
    )
  );

GRANT SELECT ON public.map_segments TO authenticated;
GRANT ALL ON public.map_segments TO service_role;

CREATE OR REPLACE FUNCTION public.validate_commercial_map_segments(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  project_org_id uuid;
  report jsonb;
BEGIN
  SELECT org_id INTO project_org_id
  FROM public.map_projects
  WHERE id = _project_id;

  IF project_org_id IS NULL
    OR NOT public.map_has_explicit_capability(project_org_id, 'map.admin')
  THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;

  SELECT jsonb_build_object(
    'projectId', _project_id,
    'segments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'slug', segment.slug,
        'expectedEntityCount', public.map_segment_baseline_count(segment.boundary_data, 'expectedEntityCount'),
        'expectedLotCount', public.map_segment_baseline_count(segment.boundary_data, 'expectedLotCount'),
        'lineageDelta', public.map_segment_lineage_inventory_delta(segment.id),
        'effectiveExpectedEntityCount',
          public.map_segment_baseline_count(segment.boundary_data, 'expectedEntityCount')
            + public.map_segment_lineage_inventory_delta(segment.id),
        'effectiveExpectedLotCount',
          public.map_segment_baseline_count(segment.boundary_data, 'expectedLotCount')
            + public.map_segment_lineage_inventory_delta(segment.id),
        'entityCount', (
          SELECT count(*) FROM public.map_entities entity
          WHERE entity.segment_id = segment.id AND entity.is_archived = false
        ),
        'lotCount', (
          SELECT count(*)
          FROM public.commercial_lots lot
          JOIN public.map_entities entity ON entity.id = lot.entity_id
          WHERE entity.segment_id = segment.id AND lot.archived_at IS NULL
        ),
        'currentGeometryCount', (
          SELECT count(*)
          FROM public.map_entity_geometries geometry
          JOIN public.map_entities entity ON entity.id = geometry.entity_id
          WHERE entity.segment_id = segment.id
            AND entity.is_archived = false
            AND geometry.is_current = true
        ),
        'complete', public.map_segment_is_complete(segment.id)
      ) ORDER BY segment.slug)
      FROM public.map_segments segment
      WHERE segment.project_id = _project_id AND segment.is_active = true
    ), '[]'::jsonb),
    'unclassifiedEntities', (
      SELECT count(*) FROM public.map_entities entity
      WHERE entity.project_id = _project_id
        AND entity.is_archived = false
        AND entity.segment_id IS NULL
    ),
    'unclassifiedLots', (
      SELECT count(*)
      FROM public.commercial_lots lot
      JOIN public.map_entities entity ON entity.id = lot.entity_id
      WHERE lot.project_id = _project_id
        AND lot.archived_at IS NULL
        AND entity.segment_id IS NULL
    ),
    'exclusiveAssignmentConflicts', 0,
    'invalidSegmentReferences', (
      SELECT count(*)
      FROM public.map_entities entity
      JOIN public.map_segments segment ON segment.id = entity.segment_id
      WHERE entity.project_id = _project_id
        AND segment.project_id <> entity.project_id
    )
  ) INTO report;

  RETURN report;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_commercial_map_segments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_commercial_map_segments(uuid) TO authenticated;

COMMENT ON TABLE public.map_segments IS
  'Exclusive, permission-aware Commercial Map scopes. Unknown entities remain outside commission portals.';
COMMENT ON COLUMN public.map_entities.segment_id IS
  'Canonical exclusive segment membership; NULL means unclassified and fail-closed in commission views.';
COMMENT ON FUNCTION public.validate_commercial_map_segments(uuid) IS
  'Development/admin validation report; not exposed by the production UI.';
