-- Links without an expiry retain their existing lifetime.
ALTER TABLE public.public_map_links ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.public_map_resolve_link(_slug text, _token text)
RETURNS public.public_map_links
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_link public.public_map_links;
BEGIN
  IF _slug IS NULL OR _token IS NULL OR length(_token) < 24 THEN
    RAISE EXCEPTION 'PUBLIC_MAP_LINK_INVALID' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_link
  FROM public.public_map_links
  WHERE slug = _slug AND is_active
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
    AND token_hash = encode(extensions.digest(_token, 'sha256'), 'hex');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PUBLIC_MAP_LINK_INVALID' USING ERRCODE = '42501';
  END IF;

  RETURN v_link;
END;
$function$;

REVOKE ALL ON FUNCTION public.public_map_resolve_link(text, text) FROM PUBLIC, anon, authenticated;

-- This helper receives an already authorized link and its exact entity set.
-- A SQL NULL disables the projection. An empty object is an enabled scope
-- without an eligible buyer. The keys of the object are existing public lot IDs.
CREATE OR REPLACE FUNCTION app_private.public_map_sold_company_projection(
  _link public.public_map_links, _entity_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF (
    (_link.slug = 'exporural' AND _link.scope_kind = 'SEGMENT' AND _link.scope_key = 'exporural')
    OR (_link.slug = 'industria-comercio-servicos-externo' AND _link.scope_kind = 'SEGMENT_EXTERNAL'
        AND _link.scope_key = 'industria-comercio-servicos')
    OR (_link.slug = 'espaco-automovel' AND _link.scope_kind = 'ENTITY_SET')
  ) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  RETURN (
    WITH confirmed AS MATERIALIZED (
      SELECT l.id AS lot_id, s.id AS sale_id, s.created_at,
             nullif(regexp_replace(s.buyer_trade_name, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '') AS trade_name
      FROM public.commercial_lots l
      JOIN public.lot_sales s ON s.lot_id = l.id AND s.status = 'CONFIRMED' AND s.reverted_at IS NULL
      WHERE l.project_id = _link.project_id AND l.entity_id = ANY(_entity_ids)
        AND l.status = 'SOLD' AND l.archived_at IS NULL
    ), links AS (
      SELECT c.sale_id, count(i.id) AS item_count, count(o.id) AS active_count,
             (array_agg(o.id) FILTER (WHERE o.id IS NOT NULL))[1] AS order_id
      FROM confirmed c
      LEFT JOIN public.lot_sale_order_items i ON i.sale_id = c.sale_id AND i.lot_id = c.lot_id
      LEFT JOIN public.lot_sale_orders o ON o.id = i.order_id AND o.project_id = _link.project_id
        AND o.status = 'CONFIRMED' AND o.reverted_at IS NULL
        AND i.contract_state IN ('SIGNED', 'LEGACY_UNVERIFIED') AND i.cancelled_at IS NULL
      GROUP BY c.sale_id
    ), members AS (
      SELECT c.lot_id, c.sale_id, c.trade_name, coalesce(o.updated_at, c.created_at) AS name_order,
             CASE WHEN ex.id IS NOT NULL THEN 'exhibitor:' || ex.id::text
                  WHEN o.id IS NOT NULL THEN 'order:' || o.id::text
                  ELSE 'sale:' || c.sale_id::text END AS identity
      FROM confirmed c
      JOIN links b ON b.sale_id = c.sale_id
      LEFT JOIN public.lot_sale_orders o ON o.id = b.order_id AND b.active_count = 1
      LEFT JOIN public.commercial_exhibitors ex ON ex.id = o.exhibitor_id AND ex.org_id = _link.org_id
      WHERE b.item_count = 0 OR b.active_count > 0
    ), companies AS (
      -- The exhibitor UUID verifies identity. The name comes from a confirmed
      -- sale in this scope because the exhibitor record can receive draft edits.
      -- Use a cleared name from the newest eligible snapshot as well.
      SELECT DISTINCT ON (m.identity) m.identity, m.trade_name,
             encode(sha256(convert_to('public-map-company/v1:' || _link.id || ':' || m.identity, 'UTF8')), 'hex') AS group_key
      FROM members m
      ORDER BY m.identity, m.name_order DESC NULLS LAST, m.sale_id
    )
    SELECT coalesce(jsonb_object_agg(m.lot_id::text, jsonb_build_object(
      'buyerIdentityEligible', true,
      'buyerGroupKey', c.group_key,
      'buyerTradeName', c.trade_name
    )), '{}'::jsonb)
    FROM members m JOIN companies c USING (identity)
  );
END;
$function$;

REVOKE ALL ON FUNCTION app_private.public_map_sold_company_projection(public.public_map_links, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;

-- Keep revision stamps identical for scopes outside this presentation.
CREATE OR REPLACE FUNCTION app_private.public_map_inventory_revision(
  v_link public.public_map_links, v_entity_ids uuid[], v_companies jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_entity_rev text;
  v_geometry_rev text;
  v_lot_rev text;
  v_pricing_rev text;
  v_project_rev text;
  v_lot_count integer;
BEGIN
  SELECT
    coalesce(md5(count(*)::text || coalesce(max(e.updated_at), 'epoch'::timestamptz)::text), 'none'),
    coalesce(md5(count(g.id)::text || coalesce(max(g.updated_at), 'epoch'::timestamptz)::text
                 || coalesce(sum(g.version), 0)::text), 'none')
    INTO v_entity_rev, v_geometry_rev
  FROM public.map_entities e
  LEFT JOIN public.map_entity_geometries g ON g.entity_id = e.id AND g.is_current = true
  WHERE e.id = ANY(v_entity_ids);

  WITH lot AS (
    SELECT l.id, l.updated_at, l.official_area_sqm, l.status,
           s.buyer_name, s.buyer_trade_name, s.created_at AS sale_updated_at
      FROM public.commercial_lots l
      LEFT JOIN public.lot_sales s ON s.lot_id = l.id AND s.status = 'CONFIRMED'
     WHERE l.entity_id = ANY(v_entity_ids)
       AND l.archived_at IS NULL
  )
  SELECT count(*)::integer,
         coalesce(md5(count(*)::text
                      || coalesce(max(updated_at), 'epoch'::timestamptz)::text
                      || coalesce(max(sale_updated_at), 'epoch'::timestamptz)::text
                      || coalesce(sum(official_area_sqm), 0)::text
                      || coalesce(string_agg(concat_ws(':', id, status, buyer_name, buyer_trade_name), '|' ORDER BY id), '')), 'none')
    INTO v_lot_count, v_lot_rev
  FROM lot;

  IF v_companies IS NOT NULL THEN
    v_lot_rev := md5(v_lot_rev || ':' || v_companies::text);
  END IF;

  SELECT coalesce(md5(count(*)::text
                      || coalesce(sum(coalesce(p.renovacao_total, 0) + coalesce(p.segunda_total, 0)), 0)::text
                      || coalesce(string_agg(coalesce(p.resolution_status, '-'), ',' ORDER BY p.lot_id), '')), 'none')
    INTO v_pricing_rev
  FROM public.commercial_lot_pricing_2028 p
  JOIN public.commercial_lots l ON l.id = p.lot_id AND l.archived_at IS NULL
  WHERE l.entity_id = ANY(v_entity_ids);

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

REVOKE ALL ON FUNCTION app_private.public_map_inventory_revision(public.public_map_links, uuid[], jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.public_map_scope_revision(_slug text, _token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_link public.public_map_links;
  v_entity_ids uuid[];
BEGIN
  v_link := public.public_map_resolve_link(_slug, _token);
  v_entity_ids := ARRAY(SELECT entity_id FROM public.public_map_scope_entity_ids(v_link.id));
  RETURN app_private.public_map_inventory_revision(
    v_link, v_entity_ids, app_private.public_map_sold_company_projection(v_link, v_entity_ids)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.public_map_inventory(_slug text, _token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_link public.public_map_links;
  v_result jsonb;
  v_entity_ids uuid[];
  v_companies jsonb;
  v_no_company constant jsonb := '{"buyerIdentityEligible":false,"buyerGroupKey":null,"buyerTradeName":null}'::jsonb;
BEGIN
  v_link := public.public_map_resolve_link(_slug, _token);
  v_entity_ids := ARRAY(SELECT entity_id FROM public.public_map_scope_entity_ids(v_link.id));
  v_companies := app_private.public_map_sold_company_projection(v_link, v_entity_ids);

  WITH ent AS (
    SELECT e.*, g.geometry, g.elevation, g.extrusion_height, g.rotation, g.version, g.calibration_version, g.id AS geometry_id
      FROM public.map_entities e
      LEFT JOIN public.map_entity_geometries g ON g.entity_id = e.id AND g.is_current = true
     WHERE e.id = ANY(v_entity_ids)
  ), lot AS (
    SELECT l.*, p.renovacao_price_per_sqm, p.renovacao_total, p.renovacao_rule_label,
           p.segunda_price_per_sqm, p.segunda_total, p.segunda_rule_label, p.resolution_status,
           CASE WHEN l.status = 'SOLD'
             THEN public.commercial_buyer_display_name(s.buyer_trade_name, s.buyer_name)
           END AS buyer_name
      FROM public.commercial_lots l
      LEFT JOIN public.commercial_lot_pricing_2028 p ON p.lot_id = l.id
      LEFT JOIN public.lot_sales s ON s.lot_id = l.id AND s.status = 'CONFIRMED'
     WHERE l.entity_id = ANY(v_entity_ids)
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
        -- Compatibility field for older clients in the external scopes.
        'buyerName', CASE WHEN v_companies IS NULL THEN l.buyer_name
                          ELSE v_companies -> l.id::text ->> 'buyerTradeName' END,
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
      ) || CASE WHEN v_companies IS NULL THEN '{}'::jsonb
                ELSE coalesce(v_companies -> l.id::text, v_no_company) END ORDER BY l.id) FROM lot l
    ), '[]'::jsonb),
    'revision', (app_private.public_map_inventory_revision(v_link, v_entity_ids, v_companies)->>'revision')
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.public_map_lot(_slug text, _token text, _lot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_link public.public_map_links;
  v_result jsonb;
  v_entity_ids uuid[];
  v_companies jsonb;
  v_no_company constant jsonb := '{"buyerIdentityEligible":false,"buyerGroupKey":null,"buyerTradeName":null}'::jsonb;
BEGIN
  v_link := public.public_map_resolve_link(_slug, _token);
  v_entity_ids := ARRAY(SELECT entity_id FROM public.public_map_scope_entity_ids(v_link.id));
  v_companies := app_private.public_map_sold_company_projection(v_link, v_entity_ids);

  SELECT jsonb_build_object(
    'id', l.id, 'entityId', l.entity_id, 'publicIdentifier', l.public_identifier,
    'block', l.block, 'lotNumber', l.lot_number, 'levelLabel', l.level_label,
    'displayName', l.display_name,
    'availability', public.public_map_lot_availability(l.status::text),
    'buyerName', CASE WHEN v_companies IS NOT NULL THEN v_companies -> l.id::text ->> 'buyerTradeName'
                      WHEN l.status = 'SOLD' THEN public.commercial_buyer_display_name(s.buyer_trade_name, s.buyer_name) END,
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
  ) || CASE WHEN v_companies IS NULL THEN '{}'::jsonb
            ELSE coalesce(v_companies -> l.id::text, v_no_company) END INTO v_result
    FROM public.commercial_lots l
    LEFT JOIN public.commercial_lot_pricing_2028 p ON p.lot_id = l.id
    LEFT JOIN public.lot_sales s ON s.lot_id = l.id AND s.status = 'CONFIRMED'
   WHERE l.id = _lot_id
     AND l.archived_at IS NULL
     AND l.entity_id = ANY(v_entity_ids);

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'PUBLIC_MAP_LOT_OUT_OF_SCOPE' USING ERRCODE = '42501';
  END IF;

  RETURN v_result;
END;
$function$;

NOTIFY pgrst, 'reload schema';
