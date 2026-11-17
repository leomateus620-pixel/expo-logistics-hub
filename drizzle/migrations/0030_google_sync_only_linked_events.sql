CREATE OR REPLACE FUNCTION public.google_user_eligible_for_event(_user_id uuid, _org_id uuid, _event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members active_member
     JOIN public.cronograma_eventos event ON event.id = _event_id AND event.org_id = _org_id
     WHERE active_member.user_id = _user_id AND active_member.org_id = _org_id AND active_member.is_active = true
       -- Only events created inside Fenasoja (imported/legacy rows have no creator)
       AND event.created_by_user_id IS NOT NULL
       AND (
         NOT COALESCE(event.planning_restricted, false)
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
       -- Direct link required regardless of the connection's sync scope
       AND (
         event.created_by_user_id = _user_id
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
       )
  );
$function$;