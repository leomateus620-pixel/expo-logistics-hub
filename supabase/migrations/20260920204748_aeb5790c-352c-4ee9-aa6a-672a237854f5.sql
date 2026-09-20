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
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.public_map_context(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_map_context(text, text) TO anon, authenticated, service_role;