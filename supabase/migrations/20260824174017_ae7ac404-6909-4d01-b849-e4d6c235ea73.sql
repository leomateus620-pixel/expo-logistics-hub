REVOKE ALL ON FUNCTION public.ensure_commission_map_segments(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_commission_map_segments(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_commission_map_segments(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_commission_map_segments(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.set_map_entity_verification(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_map_entity_verification(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_map_entity_verification(uuid, text, text) TO authenticated;