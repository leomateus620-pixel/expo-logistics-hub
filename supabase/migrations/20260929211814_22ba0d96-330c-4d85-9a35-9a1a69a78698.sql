-- 1) Completude estrutural (sem baseline fixo)
CREATE OR REPLACE FUNCTION public.map_segment_is_complete(_segment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT COALESCE(inv.lot_count > 0 AND inv.entity_count >= inv.lot_count AND inv.geo_count = inv.entity_count, false)
  FROM public.map_segments segment
  CROSS JOIN LATERAL (
    SELECT
      (SELECT count(*) FROM public.map_entities e WHERE e.segment_id = segment.id AND e.project_id = segment.project_id AND NOT e.is_archived) AS entity_count,
      (SELECT count(*) FROM public.commercial_lots l JOIN public.map_entities e ON e.id = l.entity_id
        WHERE e.segment_id = segment.id AND e.project_id = segment.project_id AND l.project_id = segment.project_id AND NOT e.is_archived AND l.archived_at IS NULL) AS lot_count,
      (SELECT count(DISTINCT g.entity_id) FROM public.map_entity_geometries g JOIN public.map_entities e ON e.id = g.entity_id
        WHERE e.segment_id = segment.id AND e.project_id = segment.project_id AND g.project_id = segment.project_id AND NOT e.is_archived AND g.is_current) AS geo_count
  ) inv
  WHERE segment.id = _segment_id AND segment.is_active;
$$;

CREATE OR REPLACE FUNCTION public.get_commission_map_segment_inventory(p_segment_id uuid)
RETURNS TABLE(expected_entity_count integer, expected_lot_count integer, lineage_delta integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF NOT public.map_can_access_segment(p_segment_id) THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;
  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.map_entities e WHERE e.segment_id = s.id AND e.project_id = s.project_id AND NOT e.is_archived)::integer,
    (SELECT count(*) FROM public.commercial_lots l JOIN public.map_entities e ON e.id = l.entity_id
      WHERE e.segment_id = s.id AND e.project_id = s.project_id AND l.project_id = s.project_id AND NOT e.is_archived AND l.archived_at IS NULL)::integer,
    0
  FROM public.map_segments s WHERE s.id = p_segment_id AND s.is_active;
END;
$$;

-- 2) Segmento Espaço do Automóvel
INSERT INTO public.map_segments (project_id, slug, name, display_name, source_reference, boundary_data, camera_config, visual_config, required_capability)
SELECT s.project_id, 'espaco-automovel', 'Espaço do Automóvel', 'Espaço do Automóvel',
  'Anexo 1 — contorno do Espaço do Automóvel (Quadras U, P, T e O)',
  jsonb_build_object('resolution','explicit-entity-union','expectedEntityCount',1,'expectedLotCount',1,
    'blockIdentifiers', jsonb_build_array('QUADRA-U','QUADRA-P','QUADRA-T','QUADRA-O'),
    'perimeter', jsonb_build_array('Rua Bolívia','Alameda Mercosul','Rua Brasil','Rua Buenos Aires'),
    'excludedIdentifiers', jsonb_build_array('QUADRA-V','QUADRA-Q','QUADRA-M','QUADRA-L','QUADRA-X','QUADRA-N','B39','G','J','TEST-DRIVE','C2','C3'),
    'lineageBaselineAt', transaction_timestamp()),
  '{"direction":[-0.56,0.74,0.62],"padding":1.14,"minDistanceRatio":0.1,"maxDistanceRatio":1.9}'::jsonb,
  '{"surface":"#9C563B","edge":"#6C3524","accent":"#D79A77","foreground":"#321B12"}'::jsonb,
  'espaco_automovel_access'
FROM public.map_segments s WHERE s.slug = 'exporural'
ON CONFLICT (project_id, slug) DO UPDATE SET required_capability = EXCLUDED.required_capability, is_active = true;

CREATE OR REPLACE FUNCTION public.resolve_commission_map_segment_slug_v2(_public_identifier text, _metadata jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_temp' AS $$
  SELECT COALESCE(
    public.resolve_commission_map_segment_slug(_public_identifier, _metadata),
    CASE WHEN upper(COALESCE(_public_identifier,'')) ~ '^QUADRA-(U|P|T|O)$'
           OR upper(COALESCE(_public_identifier,'')) ~ '^Q-(U|P|T|O)-[0-9]{2}$'
         THEN 'espaco-automovel' END
  );
$$;

-- Trigger: usa resolver estendido e código correto do segmento
DO $do$
DECLARE src text;
BEGIN
  src := pg_get_functiondef('public.set_map_entity_canonical_segment'::regproc);
  src := replace(src, 'public.resolve_commission_map_segment_slug(', 'public.resolve_commission_map_segment_slug_v2(');
  src := replace(src, 'WHEN ''exporural'' THEN ''EXPORURAL''', 'WHEN ''exporural'' THEN ''EXPORURAL'' WHEN ''espaco-automovel'' THEN ''ESPACO_AUTOMOVEL''');
  EXECUTE src;
END $do$;

-- 3) Preços 2028 visíveis para o segmento autorizado
DROP POLICY IF EXISTS "Commission segment reads price overrides" ON public.commercial_lot_price_overrides;
CREATE POLICY "Commission segment reads price overrides" ON public.commercial_lot_price_overrides
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.commercial_lots l JOIN public.map_entities e ON e.id = l.entity_id
  WHERE l.id = commercial_lot_price_overrides.lot_id AND l.archived_at IS NULL AND NOT e.is_archived
    AND e.segment_id IS NOT NULL AND public.map_can_access_segment(e.segment_id)));

DROP POLICY IF EXISTS "Commission segment reads price rules" ON public.commercial_price_rules;
CREATE POLICY "Commission segment reads price rules" ON public.commercial_price_rules
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.map_segments s WHERE (commercial_price_rules.project_id IS NULL OR s.project_id = commercial_price_rules.project_id)
    AND public.map_can_access_segment(s.id)));

DROP POLICY IF EXISTS "Commission segment reads corner audit" ON public.commercial_lot_corner_audit;
CREATE POLICY "Commission segment reads corner audit" ON public.commercial_lot_corner_audit
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.commercial_lots l JOIN public.map_entities e ON e.id = l.entity_id
  WHERE l.id = commercial_lot_corner_audit.lot_id AND e.segment_id IS NOT NULL AND public.map_can_access_segment(e.segment_id)));

-- 4) Contexto do parque para o modo visita (sem dados comerciais)
CREATE OR REPLACE FUNCTION public.commission_map_park_context(p_segment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_project uuid; v_result jsonb;
BEGIN
  IF NOT public.map_can_access_segment(p_segment_id) THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  SELECT project_id INTO v_project FROM public.map_segments WHERE id = p_segment_id;
  WITH ent AS (
    SELECT e.id, e.project_id, e.layer_id, e.parent_entity_id, e.segment_id, e.public_identifier, e.name,
           e.classification, e.verification_status, e.metadata,
           g.geometry, g.elevation, g.extrusion_height, g.rotation, g.version, g.calibration_version, g.id AS geometry_id
    FROM public.map_entities e
    JOIN public.map_entity_geometries g ON g.entity_id = e.id AND g.is_current
    WHERE e.project_id = v_project AND NOT e.is_archived
      AND e.segment_id IS DISTINCT FROM p_segment_id
      AND e.metadata->>'pavilionPublicIdentifier' IS NULL
  )
  SELECT jsonb_build_object(
    'layers', coalesce((SELECT jsonb_agg(jsonb_build_object('id',la.id,'project_id',la.project_id,'layer_key',la.layer_key,'name',la.name,
        'description',la.description,'color',la.color,'opacity',la.opacity,'is_visible',la.is_visible,'is_locked',la.is_locked,'sort_order',la.sort_order))
      FROM public.map_layers la WHERE la.id IN (SELECT DISTINCT layer_id FROM ent)), '[]'::jsonb),
    'entities', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',e.id,'projectId',e.project_id,'layerId',e.layer_id,'parentEntityId',e.parent_entity_id,'segmentId',e.segment_id,
        'publicIdentifier',e.public_identifier,'name',e.name,'description',NULL,'classification',e.classification,
        'verificationStatus',e.verification_status,'isSellable',false,'isArchived',false,
        'metadata', e.metadata - 'internalNotes' - 'commercialNotes' - 'buyer' - 'contact',
        'geometry', jsonb_build_object('id',e.geometry_id,'type','Polygon','coordinates',coalesce(e.geometry->'coordinates','[]'::jsonb),
          'elevation',coalesce(e.elevation,0),'extrusionHeight',coalesce(e.extrusion_height,0),'rotation',coalesce(e.rotation,0),
          'geometryVersion',coalesce(e.version,1),'calibrationVersion',e.calibration_version))) FROM ent e), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.commission_map_park_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_map_park_context(uuid) TO authenticated, service_role;