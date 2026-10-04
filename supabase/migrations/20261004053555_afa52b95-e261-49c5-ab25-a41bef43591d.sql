ALTER TABLE public.cronograma_eventos ADD COLUMN IF NOT EXISTS location_code text;
ALTER TABLE public.cronograma_eventos DROP CONSTRAINT IF EXISTS cronograma_eventos_location_code_check;
ALTER TABLE public.cronograma_eventos ADD CONSTRAINT cronograma_eventos_location_code_check CHECK (location_code IS NULL OR location_code IN ('sala_voluntarios','casa_fenasoja','centro_eventos_fenasoja','auditorio_centro_administrativo'));
CREATE OR REPLACE FUNCTION public.cronograma_location_code_sync() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.location_code IS NOT NULL AND NEW.location_code NOT IN ('sala_voluntarios','casa_fenasoja','centro_eventos_fenasoja','auditorio_centro_administrativo') THEN RAISE EXCEPTION 'Invalid location_code'; END IF;
  IF NEW.location_code IS NOT NULL AND NEW.location IS DISTINCT FROM (CASE NEW.location_code WHEN 'sala_voluntarios' THEN 'SALA DOS VOLUNTÁRIOS' WHEN 'casa_fenasoja' THEN 'CASA FENASOJA' WHEN 'centro_eventos_fenasoja' THEN 'CENTRO DE EVENTOS FENASOJA' WHEN 'auditorio_centro_administrativo' THEN 'AUDITÓRIO-CENTRO ADMINISTRATIVO' END) THEN
    NEW.location_code := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cronograma_location_code_sync_trigger ON public.cronograma_eventos;
CREATE TRIGGER cronograma_location_code_sync_trigger BEFORE INSERT OR UPDATE ON public.cronograma_eventos FOR EACH ROW EXECUTE FUNCTION public.cronograma_location_code_sync();
CREATE OR REPLACE FUNCTION public.cronograma_restaurant_alert(_org_id uuid, _start_date date, _end_date date) RETURNS TABLE(event_date date, event_end_date date, title text, start_time text, end_time text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR _org_id IS NULL OR public.get_user_org_role(auth.uid(), _org_id) NOT IN ('admin','gestor','operador') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _start_date IS NULL OR _end_date IS NULL OR _end_date < _start_date OR _end_date > _start_date + 366 THEN RAISE EXCEPTION 'Invalid date interval'; END IF;
  RETURN QUERY
  WITH RECURSIVE restaurant_spaces AS (
    SELECT s.id FROM public.venue_spaces s WHERE s.org_id = _org_id AND s.slug = 'restaurante-fenasoja' AND s.type = 'restaurante' AND s.active
    UNION ALL
    SELECT child.id FROM public.venue_spaces child JOIN restaurant_spaces parent ON child.parent_space_id = parent.id WHERE child.org_id = _org_id AND child.active
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
END $$;
REVOKE ALL ON FUNCTION public.cronograma_restaurant_alert(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cronograma_restaurant_alert(uuid,date,date) TO authenticated;