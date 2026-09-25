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
    SELECT l.id, l.updated_at, l.official_area_sqm, l.status,
           s.buyer_name, s.updated_at AS sale_updated_at
      FROM public.commercial_lots l
      LEFT JOIN public.lot_sales s ON s.lot_id = l.id AND s.status = 'CONFIRMED'
     WHERE l.entity_id IN (SELECT entity_id FROM scoped)
       AND l.archived_at IS NULL
  )
  SELECT count(*)::integer,
         coalesce(md5(count(*)::text
                      || coalesce(max(updated_at), 'epoch'::timestamptz)::text
                      || coalesce(max(sale_updated_at), 'epoch'::timestamptz)::text
                      || coalesce(sum(official_area_sqm), 0)::text
                      || coalesce(string_agg(concat_ws(':', id, status, buyer_name), '|' ORDER BY id), '')), 'none')
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

  RETURN jsonb_build_object(
    'slug', v_link.slug,
    'revision', md5(concat_ws('|', v_entity_rev, v_geometry_rev, v_lot_rev, v_pricing_rev, v_project_rev)),
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

CREATE OR REPLACE FUNCTION public.public_map_inventory(_slug text, _token text)
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

  WITH scoped AS (
    SELECT entity_id FROM public.public_map_scope_entity_ids(v_link.id)
  ), ent AS (
    SELECT e.*, g.geometry, g.elevation, g.extrusion_height, g.rotation, g.version, g.calibration_version, g.id AS geometry_id
      FROM public.map_entities e
      LEFT JOIN public.map_entity_geometries g ON g.entity_id = e.id AND g.is_current = true
     WHERE e.id IN (SELECT entity_id FROM scoped)
  ), lot AS (
    SELECT l.*, p.renovacao_price_per_sqm, p.renovacao_total, p.renovacao_rule_label,
           p.segunda_price_per_sqm, p.segunda_total, p.segunda_rule_label, p.resolution_status,
           CASE WHEN l.status = 'SOLD' THEN s.buyer_name ELSE NULL END AS buyer_name
      FROM public.commercial_lots l
      LEFT JOIN public.commercial_lot_pricing_2028 p ON p.lot_id = l.id
      LEFT JOIN public.lot_sales s ON s.lot_id = l.id AND s.status = 'CONFIRMED'
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
        'buyerName', nullif(trim(l.buyer_name), ''),
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
    'revision', (public.public_map_scope_revision(_slug, _token)->>'revision')
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.public_map_lot(_slug text, _token text, _lot_id uuid)
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

  SELECT jsonb_build_object(
    'id', l.id, 'entityId', l.entity_id, 'publicIdentifier', l.public_identifier,
    'block', l.block, 'lotNumber', l.lot_number, 'levelLabel', l.level_label,
    'displayName', l.display_name,
    'availability', public.public_map_lot_availability(l.status::text),
    'buyerName', CASE WHEN l.status = 'SOLD' THEN nullif(trim(s.buyer_name), '') ELSE NULL END,
    'officialAreaSqm', l.official_area_sqm,
    'isCorner', l.is_corner, 'isCovered', l.is_covered,
    'infrastructure', coalesce(to_jsonb(l.infrastructure), '[]'::jsonb),
    'hasElectricity', l.has_electricity, 'hasWater', l.has_water, 'hasInternet', l.has_internet,
    'pavilion', p.pavilion,
    'pricing', jsonb_build_object(
      'resolutionStatus', coalesce(p.resolution_status, 'SEM_REGRA'),
      'renovacaoPricePerSqm', p.renovacao_price_per_sqm,
      'renovacaoTotal', p.renovacao_total,
      'renovacaoRuleLabel', p.renovacao_rule_label,
      'segundaPricePerSqm', p.segunda_price_per_sqm,
      'segundaTotal', p.segunda_total,
      'segundaRuleLabel', p.segunda_rule_label
    )
  ) INTO v_result
    FROM public.commercial_lots l
    LEFT JOIN public.commercial_lot_pricing_2028 p ON p.lot_id = l.id
    LEFT JOIN public.lot_sales s ON s.lot_id = l.id AND s.status = 'CONFIRMED'
   WHERE l.id = _lot_id
     AND l.archived_at IS NULL
     AND l.entity_id IN (SELECT entity_id FROM public.public_map_scope_entity_ids(v_link.id));

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'PUBLIC_MAP_LOT_OUT_OF_SCOPE' USING ERRCODE = '42501';
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.public_map_scope_revision(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_map_inventory(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_map_lot(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_map_scope_revision(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_map_inventory(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_map_lot(text, text, uuid) TO anon, authenticated, service_role;