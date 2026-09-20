CREATE OR REPLACE FUNCTION public.cronograma_event_related(_user_id uuid, _org_id uuid, _event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.cronograma_eventos event
     WHERE event.id = _event_id
       AND event.org_id = _org_id
       AND event.created_by_user_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.cronograma_evento_responsaveis responsible
     WHERE responsible.event_id = _event_id
       AND responsible.org_id = _org_id
       AND responsible.org_member_user_id = _user_id
       AND responsible.responsible_type = 'member'
  )
  OR EXISTS (
    SELECT 1
      FROM public.org_members commission_member
      JOIN public.cronograma_evento_comissoes link
        ON link.org_id = commission_member.org_id
       AND link.commission_id = commission_member.commission_id
     WHERE commission_member.user_id = _user_id
       AND commission_member.org_id = _org_id
       AND commission_member.is_active = true
       AND commission_member.commission_id IS NOT NULL
       AND link.event_id = _event_id
  )
  OR EXISTS (
    SELECT 1
      FROM public.commission_responsibles leadership
      JOIN public.cronograma_evento_comissoes link
        ON link.commission_id = leadership.commission_id
      JOIN public.org_members active_member
        ON active_member.user_id = leadership.user_id
       AND active_member.org_id = _org_id
       AND active_member.is_active = true
     WHERE leadership.user_id = _user_id
       AND leadership.active = true
       AND link.event_id = _event_id
       AND link.org_id = _org_id
  );
$function$;