CREATE TABLE IF NOT EXISTS public.public_map_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.map_projects(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  scope_kind text NOT NULL CHECK (scope_kind IN ('PAVILION', 'SEGMENT', 'SEGMENT_EXTERNAL', 'ENTITY_SET')),
  scope_key text,
  scope_entity_ids uuid[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  token_hash text,
  token_version integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.public_map_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  link_id uuid NOT NULL REFERENCES public.public_map_links(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  page_view_id text NOT NULL,
  event_type text NOT NULL,
  lot_id uuid,
  duration_seconds integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_map_events_link_time_idx ON public.public_map_events (link_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS public_map_events_lot_idx ON public.public_map_events (lot_id) WHERE lot_id IS NOT NULL;

ALTER TABLE public.public_map_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_map_events ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.public_map_links TO service_role;
GRANT ALL ON public.public_map_events TO service_role;

CREATE OR REPLACE FUNCTION public.public_map_links_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS public_map_links_touch ON public.public_map_links;
CREATE TRIGGER public_map_links_touch
BEFORE UPDATE ON public.public_map_links
FOR EACH ROW EXECUTE FUNCTION public.public_map_links_touch();

CREATE OR REPLACE FUNCTION public.public_map_lot_availability(_status text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $function$
  SELECT CASE _status
    WHEN 'AVAILABLE' THEN 'AVAILABLE'
    WHEN 'RESERVED' THEN 'RESERVED'
    WHEN 'IN_NEGOTIATION' THEN 'RESERVED'
    WHEN 'SOLD' THEN 'SOLD'
    ELSE 'UNAVAILABLE'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.public_map_resolve_link(_slug text, _token text)
RETURNS public.public_map_links LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_link public.public_map_links;
BEGIN
  IF _slug IS NULL OR _token IS NULL OR length(_token) < 24 THEN
    RAISE EXCEPTION 'PUBLIC_MAP_LINK_INVALID' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_link
    FROM public.public_map_links
   WHERE slug = _slug
     AND is_active = true
     AND revoked_at IS NULL
     AND token_hash IS NOT NULL
     AND token_hash = encode(extensions.digest(_token, 'sha256'), 'hex');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PUBLIC_MAP_LINK_INVALID' USING ERRCODE = '42501';
  END IF;

  RETURN v_link;
END;
$function$;

CREATE OR REPLACE FUNCTION public.public_map_scope_entity_ids(_link_id uuid)
RETURNS TABLE(entity_id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_link public.public_map_links;
  v_parent uuid;
  v_segment uuid;
BEGIN
  SELECT * INTO v_link FROM public.public_map_links WHERE id = _link_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_link.scope_kind = 'PAVILION' THEN
    SELECT e.id INTO v_parent
      FROM public.map_entities e
     WHERE e.project_id = v_link.project_id
       AND e.public_identifier = v_link.scope_key
       AND e.is_archived = false
     LIMIT 1;
    IF v_parent IS NULL THEN RETURN; END IF;
    RETURN QUERY
      SELECT v_parent
      UNION
      SELECT e.id FROM public.map_entities e
       WHERE e.parent_entity_id = v_parent AND e.is_archived = false;

  ELSIF v_link.scope_kind IN ('SEGMENT', 'SEGMENT_EXTERNAL') THEN
    SELECT s.id INTO v_segment
      FROM public.map_segments s
     WHERE s.project_id = v_link.project_id AND s.slug = v_link.scope_key AND s.is_active = true
     LIMIT 1;
    IF v_segment IS NULL THEN RETURN; END IF;
    RETURN QUERY
      SELECT e.id FROM public.map_entities e
       WHERE e.segment_id = v_segment
         AND e.is_archived = false
         AND (
           v_link.scope_kind = 'SEGMENT'
           OR e.metadata->>'pavilionPublicIdentifier' IS NULL
         );

  ELSE
    RETURN QUERY
      SELECT u FROM unnest(v_link.scope_entity_ids) AS u
       WHERE EXISTS (SELECT 1 FROM public.map_entities e WHERE e.id = u AND e.is_archived = false);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.public_map_inventory(_slug text, _token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
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
      LEFT JOIN public.map_entity_geometries g
        ON g.entity_id = e.id AND g.is_current = true
     WHERE e.id IN (SELECT entity_id FROM scoped)
  ), lot AS (
    SELECT l.*, p.renovacao_price_per_sqm, p.renovacao_total, p.renovacao_rule_label,
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
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.public_map_lot(_slug text, _token text, _lot_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
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
   WHERE l.id = _lot_id
     AND l.archived_at IS NULL
     AND l.entity_id IN (SELECT entity_id FROM public.public_map_scope_entity_ids(v_link.id));

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'PUBLIC_MAP_LOT_OUT_OF_SCOPE' USING ERRCODE = '42501';
  END IF;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.public_map_track(
  _slug text, _token text, _event_id text, _session_id text, _page_view_id text, _event_type text,
  _lot_id uuid DEFAULT NULL, _duration_seconds integer DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_link public.public_map_links;
  v_lot uuid;
BEGIN
  v_link := public.public_map_resolve_link(_slug, _token);

  IF _event_id IS NULL OR _session_id IS NULL OR _page_view_id IS NULL THEN
    RAISE EXCEPTION 'PUBLIC_MAP_TELEMETRY_INVALID' USING ERRCODE = '22023';
  END IF;

  IF _lot_id IS NOT NULL THEN
    SELECT l.id INTO v_lot
      FROM public.commercial_lots l
     WHERE l.id = _lot_id
       AND l.archived_at IS NULL
       AND l.entity_id IN (SELECT entity_id FROM public.public_map_scope_entity_ids(v_link.id));
    IF v_lot IS NULL THEN
      RAISE EXCEPTION 'PUBLIC_MAP_LOT_OUT_OF_SCOPE' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.public_map_events (
    event_id, link_id, session_id, page_view_id, event_type, lot_id, duration_seconds, metadata
  ) VALUES (
    left(_event_id, 120), v_link.id, left(_session_id, 120), left(_page_view_id, 120),
    _event_type, v_lot, _duration_seconds, coalesce(_metadata, '{}'::jsonb)
  )
  ON CONFLICT (event_id) DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.public_map_require_manager(_org_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_capability(auth.uid(), _org_id, 'map.analytics.view') THEN
    RAISE EXCEPTION 'PUBLIC_MAP_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.public_map_links_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_org uuid;
BEGIN
  SELECT org_id INTO v_org FROM public.public_map_links ORDER BY sort_order LIMIT 1;
  IF v_org IS NULL THEN RETURN '[]'::jsonb; END IF;
  PERFORM public.public_map_require_manager(v_org);

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', k.id, 'slug', k.slug, 'displayName', k.display_name,
      'scopeKind', k.scope_kind, 'scopeKey', k.scope_key,
      'isActive', k.is_active, 'hasToken', k.token_hash IS NOT NULL,
      'tokenVersion', k.token_version, 'revokedAt', k.revoked_at,
      'updatedAt', k.updated_at, 'sortOrder', k.sort_order
    ) ORDER BY k.sort_order)
    FROM public.public_map_links k
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.public_map_link_set_active(_slug text, _active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_link public.public_map_links;
BEGIN
  SELECT * INTO v_link FROM public.public_map_links WHERE slug = _slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'PUBLIC_MAP_LINK_NOT_FOUND'; END IF;
  PERFORM public.public_map_require_manager(v_link.org_id);

  UPDATE public.public_map_links
     SET is_active = _active,
         revoked_at = CASE WHEN _active THEN NULL ELSE now() END
   WHERE id = v_link.id;

  RETURN jsonb_build_object('slug', _slug, 'isActive', _active);
END;
$function$;

CREATE OR REPLACE FUNCTION public.public_map_link_rotate(_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_link public.public_map_links;
  v_token text;
BEGIN
  SELECT * INTO v_link FROM public.public_map_links WHERE slug = _slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'PUBLIC_MAP_LINK_NOT_FOUND'; END IF;
  PERFORM public.public_map_require_manager(v_link.org_id);

  v_token := replace(encode(extensions.gen_random_bytes(24), 'base64'), '/', '_');
  v_token := replace(replace(v_token, '+', '-'), '=', '');

  UPDATE public.public_map_links
     SET token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
         token_version = token_version + 1,
         is_active = true,
         revoked_at = NULL,
         created_by = coalesce(created_by, auth.uid())
   WHERE id = v_link.id;

  RETURN jsonb_build_object('slug', _slug, 'token', v_token, 'tokenVersion', v_link.token_version + 1);
END;
$function$;

CREATE OR REPLACE FUNCTION public.public_map_interest_summary(
  _from timestamptz DEFAULT (now() - interval '30 days'),
  _to timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_org uuid;
BEGIN
  SELECT org_id INTO v_org FROM public.public_map_links ORDER BY sort_order LIMIT 1;
  IF v_org IS NULL THEN RETURN jsonb_build_object('areas', '[]'::jsonb, 'lots', '[]'::jsonb, 'daily', '[]'::jsonb); END IF;
  PERFORM public.public_map_require_manager(v_org);

  RETURN jsonb_build_object(
    'from', _from,
    'to', _to,
    'areas', coalesce((
      SELECT jsonb_agg(a ORDER BY (a->>'visits')::int DESC) FROM (
        SELECT jsonb_build_object(
          'slug', k.slug,
          'displayName', k.display_name,
          'visits', count(*) FILTER (WHERE ev.event_type = 'area_visit'),
          'sessions', count(DISTINCT ev.session_id),
          'sessionsWithSelection', count(DISTINCT ev.session_id) FILTER (WHERE ev.event_type = 'lot_selected'),
          'lotSelections', count(*) FILTER (WHERE ev.event_type = 'lot_selected'),
          'detailViews', count(*) FILTER (WHERE ev.event_type = 'lot_details_viewed'),
          'engagementSeconds', coalesce(sum(ev.duration_seconds) FILTER (WHERE ev.event_type = 'engagement_interval'), 0)
        ) AS a
        FROM public.public_map_links k
        LEFT JOIN public.public_map_events ev
          ON ev.link_id = k.id AND ev.occurred_at >= _from AND ev.occurred_at <= _to
        GROUP BY k.id, k.slug, k.display_name
      ) s
    ), '[]'::jsonb),
    'lots', coalesce((
      SELECT jsonb_agg(l ORDER BY (l->>'selections')::int DESC) FROM (
        SELECT jsonb_build_object(
          'lotId', ev.lot_id,
          'publicIdentifier', cl.public_identifier,
          'areaSlug', k.slug,
          'selections', count(*) FILTER (WHERE ev.event_type = 'lot_selected'),
          'detailViews', count(*) FILTER (WHERE ev.event_type = 'lot_details_viewed'),
          'sessions', count(DISTINCT ev.session_id)
        ) AS l
        FROM public.public_map_events ev
        JOIN public.public_map_links k ON k.id = ev.link_id
        LEFT JOIN public.commercial_lots cl ON cl.id = ev.lot_id
        WHERE ev.lot_id IS NOT NULL AND ev.occurred_at >= _from AND ev.occurred_at <= _to
        GROUP BY ev.lot_id, cl.public_identifier, k.slug
        LIMIT 50
      ) s
    ), '[]'::jsonb),
    'daily', coalesce((
      SELECT jsonb_agg(d ORDER BY d->>'day') FROM (
        SELECT jsonb_build_object(
          'day', to_char(date_trunc('day', ev.occurred_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD'),
          'visits', count(*) FILTER (WHERE ev.event_type = 'area_visit'),
          'sessions', count(DISTINCT ev.session_id),
          'selections', count(*) FILTER (WHERE ev.event_type = 'lot_selected')
        ) AS d
        FROM public.public_map_events ev
        WHERE ev.occurred_at >= _from AND ev.occurred_at <= _to
        GROUP BY 1
      ) s
    ), '[]'::jsonb)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.public_map_inventory(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_map_lot(text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_map_track(text, text, text, text, text, text, uuid, integer, jsonb) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.public_map_links_overview() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.public_map_link_set_active(text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.public_map_link_rotate(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.public_map_interest_summary(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.public_map_links_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_map_link_set_active(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_map_link_rotate(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_map_interest_summary(timestamptz, timestamptz) TO authenticated;

INSERT INTO public.public_map_links (org_id, project_id, slug, display_name, scope_kind, scope_key, sort_order)
SELECT pr.org_id, pr.id, v.slug, v.display_name, v.scope_kind, v.scope_key, v.sort_order
  FROM (SELECT id, org_id FROM public.map_projects ORDER BY created_at LIMIT 1) pr
 CROSS JOIN (VALUES
   ('pavilhao-1', 'Pavilhão 1', 'PAVILION', 'B1', 10),
   ('pavilhao-3', 'Pavilhão 3', 'PAVILION', 'B6', 20),
   ('pavilhao-5', 'Pavilhão 5', 'PAVILION', 'B8', 30),
   ('pavilhao-8', 'Pavilhão 8', 'PAVILION', 'B4', 40),
   ('pavilhao-12', 'Pavilhão 12', 'PAVILION', 'B3', 50),
   ('pavilhao-13', 'Pavilhão 13', 'PAVILION', 'B5', 60),
   ('pavilhao-14', 'Pavilhão 14', 'PAVILION', 'B2', 70),
   ('exporural', 'Exporural', 'SEGMENT', 'exporural', 80),
   ('industria-comercio-servicos-externo', 'Indústria, Comércio e Serviços — área externa', 'SEGMENT_EXTERNAL', 'industria-comercio-servicos', 90)
 ) AS v(slug, display_name, scope_kind, scope_key, sort_order)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.public_map_links (org_id, project_id, slug, display_name, scope_kind, scope_entity_ids, sort_order)
SELECT pr.org_id, pr.id, 'espaco-automovel', 'Espaço do Automóvel', 'ENTITY_SET',
       coalesce(array_agg(e.id) FILTER (WHERE e.id IS NOT NULL), '{}'::uuid[]), 100
  FROM (SELECT id, org_id FROM public.map_projects ORDER BY created_at LIMIT 1) pr
  LEFT JOIN public.map_entities e
    ON e.project_id = pr.id
   AND e.is_archived = false
   AND e.segment_id IS NULL
   AND e.metadata->>'pavilionPublicIdentifier' IS NULL
   AND split_part(e.public_identifier, '-', 2) IN ('O', 'P', 'Q', 'T', 'U', 'V')
 GROUP BY pr.id, pr.org_id
ON CONFLICT (slug) DO NOTHING;