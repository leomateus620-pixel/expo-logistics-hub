CREATE OR REPLACE FUNCTION public.cronograma_cascade_event_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'concluido' AND (TG_OP = 'INSERT' OR COALESCE(OLD.status,'') IS DISTINCT FROM 'concluido') THEN
    UPDATE public.cronograma_subeventos s
       SET status = 'concluido',
           lock_version = s.lock_version + 1,
           updated_at = now()
     WHERE s.parent_event_id = NEW.id
       AND COALESCE(s.status,'') NOT IN ('concluido','cancelado');

    UPDATE public.cronograma_subevento_acoes a
       SET is_done = true,
           updated_at = now()
      FROM public.cronograma_subeventos s
     WHERE a.subevent_id = s.id
       AND s.parent_event_id = NEW.id
       AND COALESCE(s.status,'') <> 'cancelado'
       AND a.is_done IS DISTINCT FROM true;

    UPDATE public.cronograma_subevento_providencias p
       SET is_done = true,
           updated_at = now()
      FROM public.cronograma_subeventos s
     WHERE p.subevent_id = s.id
       AND s.parent_event_id = NEW.id
       AND COALESCE(s.status,'') <> 'cancelado'
       AND p.is_done IS DISTINCT FROM true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cronograma_cascade_event_completion_trg ON public.cronograma_eventos;
CREATE TRIGGER cronograma_cascade_event_completion_trg
AFTER INSERT OR UPDATE OF status ON public.cronograma_eventos
FOR EACH ROW EXECUTE FUNCTION public.cronograma_cascade_event_completion();