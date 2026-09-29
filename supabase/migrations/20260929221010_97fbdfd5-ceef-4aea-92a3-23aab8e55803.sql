DROP FUNCTION public.commission_map_own_layers(uuid);
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
      FROM public.map_layers la WHERE la.id IN (SELECT DISTINCT layer_id FROM ent)
        OR EXISTS (SELECT 1 FROM public.map_entities own WHERE own.layer_id = la.id AND own.project_id = v_project
          AND own.segment_id = p_segment_id AND NOT own.is_archived)), '[]'::jsonb),
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