-- Preserve link resolution, tokens and scope authorization. Add independently
-- observable cartographic revision and project only exterior presentation metadata.

CREATE OR REPLACE FUNCTION public.public_map_scope_revision(_slug text, _token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_link public.public_map_links;
  v_entity_rev text;
  v_geometry_rev text;
  v_lot_rev text;
  v_pricing_rev text;
  v_project_rev text;
  v_lot_count integer;
  v_context_rev text;
BEGIN
  v_link := public.public_map_resolve_link(_slug, _token);

  WITH scoped AS (
    SELECT entity_id FROM public.public_map_scope_entity_ids(v_link.id)
  )
  SELECT
    coalesce(md5(count(*)::text || coalesce(max(e.updated_at), 'epoch'::timestamptz)::text), 'none'),
    coalesce(md5(count(g.id)::text || coalesce(max(g.updated_at), 'epoch'::timestamptz)::text
                 || coalesce(sum(g.version), 0)::text), 'none')
    INTO v_entity_rev, v_geometry_rev
  FROM public.map_entities e
  LEFT JOIN public.map_entity_geometries g ON g.entity_id = e.id AND g.is_current = true
  WHERE e.id IN (SELECT entity_id FROM scoped);

  WITH scoped AS (
    SELECT entity_id FROM public.public_map_scope_entity_ids(v_link.id)
  ), lot AS (
    SELECT l.id, l.updated_at, l.official_area_sqm
      FROM public.commercial_lots l
     WHERE l.entity_id IN (SELECT entity_id FROM scoped)
       AND l.archived_at IS NULL
  )
  SELECT count(*)::integer,
         coalesce(md5(count(*)::text || coalesce(max(updated_at), 'epoch'::timestamptz)::text
                      || coalesce(sum(official_area_sqm), 0)::text), 'none')
    INTO v_lot_count, v_lot_rev
  FROM lot;

  WITH scoped AS (
    SELECT entity_id FROM public.public_map_scope_entity_ids(v_link.id)
  )
  SELECT coalesce(md5(count(*)::text
                      || coalesce(sum(coalesce(p.renovacao_total, 0) + coalesce(p.segunda_total, 0)), 0)::text
                      || coalesce(string_agg(coalesce(p.resolution_status, '-'), ',' ORDER BY p.lot_id), '')), 'none')
    INTO v_pricing_rev
  FROM public.commercial_lot_pricing_2028 p
  JOIN public.commercial_lots l ON l.id = p.lot_id AND l.archived_at IS NULL
  WHERE l.entity_id IN (SELECT entity_id FROM scoped);

  SELECT coalesce(md5(pr.active_version::text || coalesce(pr.reference_revision, '-')
                      || coalesce(pr.updated_at, 'epoch'::timestamptz)::text), 'none')
    INTO v_project_rev
  FROM public.map_projects pr
  WHERE pr.id = v_link.project_id;

  -- Geometry publication is independent of commercial scope revision. No prices,
  -- customer records or other-segment availability participate in this hash.
  SELECT md5(coalesce(string_agg(concat_ws(':', e.id, e.updated_at, e.is_archived,
      g.id, g.updated_at, g.version), '|' ORDER BY e.id), '') || coalesce((
        SELECT string_agg(md5(to_jsonb(la)::text), '|' ORDER BY la.id)
        FROM public.map_layers la WHERE la.project_id = v_link.project_id
      ), '')) INTO v_context_rev
    FROM public.map_entities e
    LEFT JOIN public.map_entity_geometries g ON g.entity_id = e.id AND g.is_current = true
   WHERE e.project_id = v_link.project_id
     AND e.metadata->>'pavilionPublicIdentifier' IS NULL;

  RETURN jsonb_build_object(
    'slug', v_link.slug,
    'revision', md5(concat_ws('|', v_entity_rev, v_geometry_rev, v_lot_rev, v_pricing_rev, v_project_rev)),
    'contextRevision', v_context_rev,
    'entityRevision', v_entity_rev,
    'geometryRevision', v_geometry_rev,
    'lotRevision', v_lot_rev,
    'pricingRevision', v_pricing_rev,
    'projectRevision', v_project_rev,
    'lotCount', v_lot_count,
    'serverTime', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.public_map_scope_revision(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_map_scope_revision(text, text) TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.public_map_inventory(_slug text, _token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link public.public_map_links;
  v_result jsonb;
  v_revisions jsonb;
BEGIN
  v_link := public.public_map_resolve_link(_slug, _token);
  v_revisions := public.public_map_scope_revision(_slug, _token);

  WITH scoped AS (
    SELECT entity_id FROM public.public_map_scope_entity_ids(v_link.id)
  ), ent AS (
    SELECT e.id, e.project_id, e.layer_id, e.parent_entity_id, e.segment_id,
           e.public_identifier, e.name, e.description, e.classification,
           e.verification_status, e.is_sellable, e.is_archived, e.metadata,
           g.geometry, g.elevation, g.extrusion_height, g.rotation, g.version,
           g.calibration_version, g.id AS geometry_id
      FROM public.map_entities e
      LEFT JOIN public.map_entity_geometries g
        ON g.entity_id = e.id AND g.is_current = true
     WHERE e.id IN (SELECT entity_id FROM scoped)
  ), lot AS (
    SELECT l.id, l.entity_id, l.public_identifier, l.block, l.lot_number,
           l.level_label, l.display_name, l.status, l.official_area_sqm,
           l.is_corner, l.is_covered, l.infrastructure, l.has_electricity,
           l.has_water, l.has_internet,
           p.renovacao_price_per_sqm, p.renovacao_total, p.renovacao_rule_label,
           p.segunda_price_per_sqm, p.segunda_total, p.segunda_rule_label, p.resolution_status
      FROM public.commercial_lots l
      LEFT JOIN public.commercial_lot_pricing_2028 p ON p.lot_id = l.id
     WHERE l.entity_id IN (SELECT entity_id FROM scoped)
       AND l.archived_at IS NULL
  )
  SELECT jsonb_build_object(
    'scope', jsonb_build_object(
      'slug', v_link.slug,
      'name', v_link.display_name,
      'kind', v_link.scope_kind,
      'lotCount', (SELECT count(*) FROM lot),
      'officialAreaSqm', (SELECT coalesce(sum(official_area_sqm), 0) FROM lot),
      'pavilionIdentifier', CASE WHEN v_link.scope_kind = 'PAVILION' THEN v_link.scope_key ELSE NULL END,
      'segmentSlug', CASE WHEN v_link.scope_kind LIKE 'SEGMENT%' THEN v_link.scope_key ELSE NULL END
    ),
    'project', (
      SELECT jsonb_build_object(
        'id', pr.id, 'name', pr.name, 'coordinateSystem', pr.coordinate_system,
        'referenceWidth', pr.reference_width, 'referenceHeight', pr.reference_height,
        'activeVersion', pr.active_version, 'referenceRevision', pr.reference_revision
      ) FROM public.map_projects pr WHERE pr.id = v_link.project_id
    ),
    'layers', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', la.id, 'projectId', la.project_id, 'key', la.layer_key, 'name', la.name,
        'description', la.description, 'color', la.color, 'opacity', la.opacity,
        'isVisible', la.is_visible, 'isLocked', la.is_locked, 'sortOrder', la.sort_order
      ) ORDER BY la.sort_order)
      FROM public.map_layers la
      WHERE la.id IN (SELECT DISTINCT layer_id FROM ent)
    ), '[]'::jsonb),
    'entities', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'projectId', e.project_id, 'layerId', e.layer_id,
        'parentEntityId', e.parent_entity_id, 'segmentId', e.segment_id,
        'publicIdentifier', e.public_identifier, 'name', e.name, 'description', e.description,
        'classification', e.classification, 'verificationStatus', e.verification_status,
        'isSellable', e.is_sellable, 'isArchived', e.is_archived,
        'metadata', coalesce(e.metadata, '{}'::jsonb),
        'geometry', jsonb_build_object(
          'id', e.geometry_id,
          'type', 'Polygon',
          'coordinates', coalesce(e.geometry->'coordinates', '[]'::jsonb),
          'elevation', coalesce(e.elevation, 0),
          'extrusionHeight', coalesce(e.extrusion_height, 0),
          'rotation', coalesce(e.rotation, 0),
          'geometryVersion', coalesce(e.version, 1),
          'calibrationVersion', e.calibration_version
        )
      )) FROM ent e
    ), '[]'::jsonb),
    'lots', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'entityId', l.entity_id, 'publicIdentifier', l.public_identifier,
        'block', l.block, 'lotNumber', l.lot_number, 'levelLabel', l.level_label,
        'displayName', l.display_name,
        'availability', public.public_map_lot_availability(l.status::text),
        'officialAreaSqm', l.official_area_sqm,
        'isCorner', l.is_corner, 'isCovered', l.is_covered,
        'infrastructure', coalesce(to_jsonb(l.infrastructure), '[]'::jsonb),
        'hasElectricity', l.has_electricity, 'hasWater', l.has_water, 'hasInternet', l.has_internet,
        'pricing', jsonb_build_object(
          'resolutionStatus', coalesce(l.resolution_status, 'SEM_REGRA'),
          'renovacaoPricePerSqm', l.renovacao_price_per_sqm,
          'renovacaoTotal', l.renovacao_total,
          'renovacaoRuleLabel', l.renovacao_rule_label,
          'segundaPricePerSqm', l.segunda_price_per_sqm,
          'segundaTotal', l.segunda_total,
          'segundaRuleLabel', l.segunda_rule_label
        )
      )) FROM lot l
    ), '[]'::jsonb),
    'revision', v_revisions->>'revision',
    'contextRevision', v_revisions->>'contextRevision'
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.public_map_context(_slug text, _token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_link public.public_map_links;
  v_result jsonb;
BEGIN
  v_link := public.public_map_resolve_link(_slug, _token);

  WITH ent AS (
    SELECT e.id, e.project_id, e.layer_id, e.parent_entity_id, e.segment_id,
           e.public_identifier, e.name, e.classification, e.verification_status,
           e.metadata,
           g.geometry, g.elevation, g.extrusion_height, g.rotation, g.version,
           g.calibration_version, g.id AS geometry_id
      FROM public.map_entities e
      LEFT JOIN public.map_entity_geometries g
        ON g.entity_id = e.id AND g.is_current = true
     WHERE e.project_id = v_link.project_id
       AND e.is_archived = false
       AND e.metadata->>'pavilionPublicIdentifier' IS NULL
  )
  SELECT jsonb_build_object(
    'projectId', v_link.project_id,
    'layers', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', la.id, 'projectId', la.project_id, 'key', la.layer_key, 'name', la.name,
        'description', la.description, 'color', la.color, 'opacity', la.opacity,
        'isVisible', la.is_visible, 'isLocked', la.is_locked, 'sortOrder', la.sort_order
      ) ORDER BY la.sort_order)
      FROM public.map_layers la
      WHERE la.id IN (SELECT DISTINCT layer_id FROM ent)
    ), '[]'::jsonb),
    'entities', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'projectId', e.project_id, 'layerId', e.layer_id,
        'parentEntityId', e.parent_entity_id, 'segmentId', e.segment_id,
        'publicIdentifier', e.public_identifier, 'name', e.name, 'description', NULL,
        'classification', e.classification, 'verificationStatus', e.verification_status,
        'isSellable', false, 'isArchived', false,
        'metadata', jsonb_strip_nulls(jsonb_build_object(
          'block', e.metadata->'block',
          'renderMode', e.metadata->'renderMode',
          'labelPriority', e.metadata->'labelPriority',
          'parentPublicIdentifier', e.metadata->'parentPublicIdentifier',
          'segmentId', e.metadata->'segmentId',
          'segmentCode', e.metadata->'segmentCode',
          'segmentName', e.metadata->'segmentName',
          'areaCode', e.metadata->'areaCode',
          'entityType', e.metadata->'entityType',
          'geometryRevision', e.metadata->'geometryRevision',
          'mapUnitsPerMeter', e.metadata->'mapUnitsPerMeter',
          'isSeparator', e.metadata->'isSeparator',
          'legendCode', e.metadata->'legendCode',
          'instance', e.metadata->'instance',
          'infrastructure', e.metadata->'infrastructure',
          'relatedStreets', e.metadata->'relatedStreets',
          'tankCount', e.metadata->'tankCount',
          'hydroIdentifiers', e.metadata->'hydroIdentifiers',
          'relatedGateIdentifier', e.metadata->'relatedGateIdentifier',
          'hostLot', e.metadata->'hostLot',
          'overlaysLotsWithoutRemovingThem', e.metadata->'overlaysLotsWithoutRemovingThem',
          'lotNumber', e.metadata->'lotNumber',
          'labelAnchor', e.metadata->'labelAnchor',
          'geometryKind', e.metadata->'geometryKind',
          'internalPlanRuns', e.metadata->'internalPlanRuns',
          'internalCorridors', e.metadata->'internalCorridors',
          'internalOfficialPlan', e.metadata->'internalOfficialPlan',
          'internalSupportSpaces', e.metadata->'internalSupportSpaces',
          'internalWallAccesses', e.metadata->'internalWallAccesses',
          'aliases', e.metadata->'aliases',
          'explicitNotWater', e.metadata->'explicitNotWater',
          'explicitNotRoad', e.metadata->'explicitNotRoad',
          'usage', e.metadata->'usage',
          'infrastructureOverlay', e.metadata->'infrastructureOverlay'
        )),
        'geometry', jsonb_build_object(
          'id', e.geometry_id,
          'type', 'Polygon',
          'coordinates', coalesce(e.geometry->'coordinates', '[]'::jsonb),
          'elevation', coalesce(e.elevation, 0),
          'extrusionHeight', coalesce(e.extrusion_height, 0),
          'rotation', coalesce(e.rotation, 0),
          'geometryVersion', coalesce(e.version, 1),
          'calibrationVersion', e.calibration_version
        )
      )) FROM ent e
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.public_map_context(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_map_context(text, text) TO anon, authenticated, service_role;
