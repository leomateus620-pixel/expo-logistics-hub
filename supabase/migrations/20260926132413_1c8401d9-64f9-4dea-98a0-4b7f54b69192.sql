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
           s.buyer_name, s.created_at AS sale_updated_at
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
REVOKE ALL ON FUNCTION public.public_map_scope_revision(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_map_scope_revision(text, text) TO anon, authenticated, service_role;