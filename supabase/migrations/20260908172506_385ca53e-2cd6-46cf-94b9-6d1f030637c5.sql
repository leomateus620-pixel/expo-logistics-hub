CREATE TABLE public.event_assignment_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.cronograma_eventos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  org_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('responsible','commission')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','skipped','failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.event_assignment_notifications TO authenticated;
GRANT ALL ON public.event_assignment_notifications TO service_role;

ALTER TABLE public.event_assignment_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignment_notifications_owner_select"
ON public.event_assignment_notifications
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE UNIQUE INDEX event_assignment_notifications_pending_uniq
  ON public.event_assignment_notifications(event_id, user_id)
  WHERE status = 'pending';

CREATE INDEX event_assignment_notifications_pending_idx
  ON public.event_assignment_notifications(created_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.set_event_assignment_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER event_assignment_notifications_set_updated_at
  BEFORE UPDATE ON public.event_assignment_notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_event_assignment_updated_at();

-- Fila de avisos por vínculo. Nunca avisa o autor da alteração nem eventos encerrados/passados.
CREATE OR REPLACE FUNCTION public.enqueue_event_assignment_notifications(
  _event_id UUID,
  _org_id UUID,
  _user_ids UUID[],
  _source TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event RECORD;
BEGIN
  IF _event_id IS NULL OR _user_ids IS NULL OR array_length(_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT id, org_id, status, start_date, has_exact_date, event_type
    INTO _event
  FROM public.cronograma_eventos
  WHERE id = _event_id;

  IF NOT FOUND THEN RETURN; END IF;
  IF COALESCE(_event.status, '') IN ('completed', 'cancelled') THEN RETURN; END IF;
  IF COALESCE(_event.event_type, '') = 'feriado' THEN RETURN; END IF;
  IF _event.has_exact_date IS TRUE AND _event.start_date IS NOT NULL
     AND _event.start_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RETURN;
  END IF;

  INSERT INTO public.event_assignment_notifications (event_id, user_id, org_id, source)
  SELECT _event_id, m.user_id, COALESCE(_org_id, _event.org_id), _source
  FROM public.org_members m
  WHERE m.user_id = ANY(_user_ids)
    AND m.org_id = COALESCE(_org_id, _event.org_id)
    AND m.is_active IS TRUE
    AND (auth.uid() IS NULL OR m.user_id <> auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM public.event_assignment_notifications n
      WHERE n.event_id = _event_id
        AND n.user_id = m.user_id
        AND n.status IN ('pending', 'sent')
    )
  GROUP BY m.user_id
  ON CONFLICT (event_id, user_id) WHERE status = 'pending' DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_event_responsible_assignment_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_member_user_id IS NOT NULL AND COALESCE(NEW.responsible_type, 'member') = 'member' THEN
    PERFORM public.enqueue_event_assignment_notifications(
      NEW.event_id, NEW.org_id, ARRAY[NEW.org_member_user_id], 'responsible'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER event_responsible_assignment_push
AFTER INSERT ON public.cronograma_evento_responsaveis
FOR EACH ROW EXECUTE FUNCTION public.trg_event_responsible_assignment_push();

CREATE OR REPLACE FUNCTION public.trg_event_commission_assignment_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _users UUID[];
BEGIN
  IF NEW.commission_id IS NULL THEN RETURN NEW; END IF;

  SELECT array_agg(DISTINCT m.user_id)
    INTO _users
  FROM public.org_members m
  WHERE m.commission_id = NEW.commission_id
    AND m.is_active IS TRUE
    AND m.user_id IS NOT NULL;

  PERFORM public.enqueue_event_assignment_notifications(
    NEW.event_id, NEW.org_id, _users, 'commission'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER event_commission_assignment_push
AFTER INSERT ON public.cronograma_evento_comissoes
FOR EACH ROW EXECUTE FUNCTION public.trg_event_commission_assignment_push();