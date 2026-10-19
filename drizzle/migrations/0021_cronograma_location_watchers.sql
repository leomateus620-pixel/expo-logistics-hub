CREATE TABLE IF NOT EXISTS public.cronograma_location_watchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  location_code text NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, location_code, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma_location_watchers TO authenticated;
GRANT ALL ON public.cronograma_location_watchers TO service_role;
ALTER TABLE public.cronograma_location_watchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros leem acompanhantes do local" ON public.cronograma_location_watchers
  FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins gerenciam acompanhantes do local" ON public.cronograma_location_watchers
  FOR ALL TO authenticated USING (public.get_user_org_role(auth.uid(), org_id) = 'admin'::org_role)
  WITH CHECK (public.get_user_org_role(auth.uid(), org_id) = 'admin'::org_role);

CREATE OR REPLACE FUNCTION public.cronograma_location_watcher(_user_id uuid, _event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cronograma_eventos e
    JOIN public.cronograma_location_watchers w
      ON w.org_id = e.org_id AND w.location_code = e.location_code AND w.user_id = _user_id
    JOIN public.org_members m ON m.user_id = w.user_id AND m.org_id = w.org_id AND m.is_active = true
    WHERE e.id = _event_id AND e.location_code IS NOT NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.cronograma_scoped_event_visible(_event_id uuid, _user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.cronograma_evento_responsaveis er
    WHERE er.event_id = _event_id AND er.org_member_user_id = _user_id AND er.responsible_type = 'member'
  )
  OR EXISTS (
    SELECT 1 FROM public.cronograma_evento_comissoes ec
    JOIN public.commission_responsibles cr ON cr.commission_id = ec.commission_id AND cr.user_id = _user_id AND cr.active = true
    WHERE ec.event_id = _event_id
  )
  OR public.cronograma_location_watcher(_user_id, _event_id)
$function$;

CREATE OR REPLACE FUNCTION public.cronograma_event_related(_user_id uuid, _org_id uuid, _event_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.cronograma_eventos event
     WHERE event.id = _event_id AND event.org_id = _org_id AND event.created_by_user_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.cronograma_evento_responsaveis responsible
     WHERE responsible.event_id = _event_id AND responsible.org_id = _org_id
       AND responsible.org_member_user_id = _user_id AND responsible.responsible_type = 'member'
  )
  OR EXISTS (
    SELECT 1 FROM public.org_members commission_member
      JOIN public.cronograma_evento_comissoes link
        ON link.org_id = commission_member.org_id AND link.commission_id = commission_member.commission_id
     WHERE commission_member.user_id = _user_id AND commission_member.org_id = _org_id
       AND commission_member.is_active = true AND commission_member.commission_id IS NOT NULL
       AND link.event_id = _event_id
  )
  OR EXISTS (
    SELECT 1 FROM public.commission_responsibles commission_responsible
      JOIN public.org_members active_member
        ON active_member.user_id = commission_responsible.user_id
       AND active_member.org_id = commission_responsible.org_id AND active_member.is_active = true
      JOIN public.cronograma_evento_comissoes link
        ON link.org_id = commission_responsible.org_id AND link.commission_id = commission_responsible.commission_id
     WHERE commission_responsible.user_id = _user_id AND commission_responsible.org_id = _org_id
       AND commission_responsible.active = true AND commission_responsible.user_id IS NOT NULL
       AND link.event_id = _event_id
  )
  OR public.cronograma_location_watcher(_user_id, _event_id);
$function$;

CREATE OR REPLACE FUNCTION public.google_user_eligible_for_event(_user_id uuid, _org_id uuid, _event_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members active_member
     WHERE active_member.user_id = _user_id AND active_member.org_id = _org_id AND active_member.is_active = true
       AND EXISTS (SELECT 1 FROM public.cronograma_eventos event WHERE event.id = _event_id AND event.org_id = _org_id)
       AND (
         NOT COALESCE((SELECT event.planning_restricted FROM public.cronograma_eventos event
            WHERE event.id = _event_id AND event.org_id = _org_id), false)
         OR public.cronograma_can_view_planning(_user_id, _org_id)
         OR EXISTS (
           SELECT 1 FROM public.cronograma_evento_comissoes link
            WHERE link.event_id = _event_id AND link.org_id = _org_id
              AND (
                EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = _user_id AND om.org_id = _org_id
                     AND om.is_active = true AND om.commission_id = link.commission_id)
                OR EXISTS (SELECT 1 FROM public.commission_responsibles cr WHERE cr.user_id = _user_id AND cr.org_id = _org_id
                     AND cr.active = true AND cr.commission_id = link.commission_id)
              )
         )
       )
       AND (
         CASE
           WHEN (SELECT connection.sync_scope FROM public.google_calendar_connections connection
                  WHERE connection.user_id = _user_id LIMIT 1) = 'mine' THEN
             EXISTS (SELECT 1 FROM public.cronograma_eventos own_event
                WHERE own_event.id = _event_id AND own_event.org_id = _org_id AND own_event.created_by_user_id = _user_id)
             OR EXISTS (SELECT 1 FROM public.cronograma_evento_responsaveis responsible
                WHERE responsible.event_id = _event_id AND responsible.org_id = _org_id
                  AND responsible.org_member_user_id = _user_id AND responsible.responsible_type = 'member')
             OR EXISTS (
               SELECT 1 FROM public.cronograma_evento_comissoes link
                WHERE link.event_id = _event_id AND link.org_id = _org_id
                  AND (
                    EXISTS (SELECT 1 FROM public.org_members om WHERE om.user_id = _user_id AND om.org_id = _org_id
                         AND om.is_active = true AND om.commission_id = link.commission_id)
                    OR EXISTS (SELECT 1 FROM public.commission_responsibles cr WHERE cr.user_id = _user_id AND cr.org_id = _org_id
                         AND cr.active = true AND cr.commission_id = link.commission_id)
                  )
             )
             OR public.cronograma_location_watcher(_user_id, _event_id)
           ELSE
             public.cronograma_event_related(_user_id, _org_id, _event_id)
         END
       )
  );
$function$;

ALTER TABLE public.event_assignment_notifications DROP CONSTRAINT IF EXISTS event_assignment_notifications_source_check;
ALTER TABLE public.event_assignment_notifications ADD CONSTRAINT event_assignment_notifications_source_check
  CHECK (source = ANY (ARRAY['responsible'::text, 'commission'::text, 'location'::text]));

CREATE OR REPLACE FUNCTION public.trg_event_location_watchers_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _ids uuid[];
BEGIN
  IF NEW.location_code IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.location_code IS NOT DISTINCT FROM NEW.location_code THEN RETURN NEW; END IF;
  SELECT array_agg(w.user_id) INTO _ids FROM public.cronograma_location_watchers w
   WHERE w.org_id = NEW.org_id AND w.location_code = NEW.location_code;
  PERFORM public.enqueue_event_assignment_notifications(NEW.id, NEW.org_id, _ids, 'location');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_event_location_watchers_push ON public.cronograma_eventos;
CREATE TRIGGER trg_event_location_watchers_push
  AFTER INSERT OR UPDATE OF location_code ON public.cronograma_eventos
  FOR EACH ROW EXECUTE FUNCTION public.trg_event_location_watchers_push();