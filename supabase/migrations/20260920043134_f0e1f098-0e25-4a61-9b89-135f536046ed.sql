REVOKE ALL ON FUNCTION public.cronograma_event_related(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cronograma_event_related(uuid, uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cronograma_event_related(uuid, uuid, uuid) TO service_role;