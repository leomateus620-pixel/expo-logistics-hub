DROP POLICY IF EXISTS cronograma_eventos_select ON public.cronograma_eventos;
CREATE POLICY cronograma_eventos_select ON public.cronograma_eventos
  FOR SELECT
  USING (
    (created_by_user_id IS NOT NULL AND created_by_user_id = auth.uid())
    OR id IN (SELECT public.cronograma_visible_event_ids())
  );