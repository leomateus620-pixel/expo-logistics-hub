REVOKE ALL ON FUNCTION public.cronograma_unit_can_manage(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cronograma_set_event_origin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cronograma_unit_agenda(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cronograma_unit_metrics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cronograma_unit_can_manage(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cronograma_set_event_origin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cronograma_unit_agenda(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cronograma_unit_metrics(uuid) TO authenticated;