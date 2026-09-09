ALTER TABLE public.cronograma_eventos
  ADD COLUMN IF NOT EXISTS notify_all_commission_members boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.commission_leadership_user_ids(_commission_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT cr.user_id
  FROM public.commission_responsibles cr
  WHERE cr.commission_id = _commission_id
    AND cr.active IS TRUE
    AND cr.user_id IS NOT NULL
    AND cr.relationship_role IN ('principal', 'copresidente', 'corresponsavel')
$$;

CREATE OR REPLACE FUNCTION public.trg_event_commission_assignment_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _users UUID[];
  _notify_all BOOLEAN;
BEGIN
  IF NEW.commission_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(e.notify_all_commission_members, false)
    INTO _notify_all
  FROM public.cronograma_eventos e
  WHERE e.id = NEW.event_id;

  IF COALESCE(_notify_all, false) THEN
    SELECT array_agg(DISTINCT m.user_id)
      INTO _users
    FROM public.org_members m
    WHERE m.commission_id = NEW.commission_id
      AND m.is_active IS TRUE
      AND m.user_id IS NOT NULL;
  ELSE
    SELECT array_agg(DISTINCT m.user_id)
      INTO _users
    FROM public.org_members m
    WHERE m.is_active IS TRUE
      AND m.org_id = NEW.org_id
      AND m.user_id IN (
        SELECT l.user_id FROM public.commission_leadership_user_ids(NEW.commission_id) l
      );
  END IF;

  PERFORM public.enqueue_event_assignment_notifications(
    NEW.event_id, NEW.org_id, _users, 'commission'
  );
  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.commission_leadership_user_ids(uuid) TO authenticated, service_role;