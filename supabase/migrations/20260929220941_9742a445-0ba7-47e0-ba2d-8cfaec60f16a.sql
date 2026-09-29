CREATE OR REPLACE FUNCTION public.commission_map_own_layers(p_segment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_layers jsonb;
BEGIN
  IF NOT public.map_can_access_segment(p_segment_id) THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'project_id', l.project_id, 'layer_key', l.layer_key,
    'name', l.name, 'description', l.description, 'color', l.color,
    'opacity', l.opacity, 'is_visible', l.is_visible, 'is_locked', l.is_locked,
    'sort_order', l.sort_order
  ) ORDER BY l.sort_order), '[]'::jsonb)
  INTO v_layers
  FROM public.map_layers l
  WHERE EXISTS (
    SELECT 1 FROM public.map_entities e
    WHERE e.layer_id = l.id
      AND e.project_id = l.project_id
      AND e.segment_id = p_segment_id
      AND NOT e.is_archived
  );
  RETURN v_layers;
END;
$$;
REVOKE ALL ON FUNCTION public.commission_map_own_layers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_map_own_layers(uuid) TO authenticated, service_role;