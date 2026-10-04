CREATE SCHEMA IF NOT EXISTS agenda_private;
REVOKE ALL ON SCHEMA agenda_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA agenda_private TO authenticated;
CREATE OR REPLACE FUNCTION agenda_private.restaurant_alert(_org_id uuid, _start_date date, _end_date date)
RETURNS TABLE(event_date date, event_end_date date, title text, start_time text, end_time text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR _org_id IS NULL OR public.get_user_org_role(auth.uid(), _org_id) NOT IN ('admin','gestor','operador') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _start_date IS NULL OR _end_date IS NULL OR _end_date < _start_date OR _end_date > _start_date + 366 THEN RAISE EXCEPTION 'Invalid date interval'; END IF;
  RETURN QUERY
  WITH RECURSIVE restaurant_spaces AS (
    SELECT s.id FROM public.venue_spaces s WHERE s.org_id = _org_id AND s.slug = 'restaurante-fenasoja' AND s.type = 'restaurante' AND s.active
    UNION ALL
    SELECT child.id FROM public.venue_spaces child JOIN restaurant_spaces parent ON child.parent_space_id = parent.id WHERE child.org_id = _org_id AND child.active AND child.type = 'restaurante'
  )
  SELECT (e.start_at AT TIME ZONE 'America/Sao_Paulo')::date,
         (e.end_at AT TIME ZONE 'America/Sao_Paulo')::date,
         CASE WHEN public.venue_can_view_event(_org_id, e.id) THEN e.title ELSE 'Ocupação reservada' END,
         CASE WHEN public.venue_can_view_event(_org_id, e.id) THEN to_char(e.start_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') ELSE NULL END,
         CASE WHEN public.venue_can_view_event(_org_id, e.id) THEN to_char(e.end_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') ELSE NULL END
  FROM public.venue_events e
  WHERE e.org_id = _org_id AND e.status NOT IN ('cancelado','recusado') AND e.start_at IS NOT NULL AND e.end_at IS NOT NULL
    AND (e.start_at AT TIME ZONE 'America/Sao_Paulo')::date <= _end_date + 1
    AND (e.end_at AT TIME ZONE 'America/Sao_Paulo')::date >= _start_date - 1
    AND EXISTS (SELECT 1 FROM public.venue_event_spaces es JOIN restaurant_spaces rs ON rs.id = es.space_id WHERE es.org_id = _org_id AND es.event_id = e.id)
  ORDER BY e.start_at, e.id LIMIT 100;
END $function$;
REVOKE ALL ON FUNCTION agenda_private.restaurant_alert(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION agenda_private.restaurant_alert(uuid,date,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.cronograma_restaurant_alert(_org_id uuid, _start_date date, _end_date date)
RETURNS TABLE(event_date date, event_end_date date, title text, start_time text, end_time text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $function$ SELECT * FROM agenda_private.restaurant_alert(_org_id, _start_date, _end_date) $function$;
REVOKE ALL ON FUNCTION public.cronograma_restaurant_alert(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cronograma_restaurant_alert(uuid,date,date) TO authenticated;