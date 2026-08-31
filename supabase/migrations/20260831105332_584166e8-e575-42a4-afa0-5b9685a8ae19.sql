-- 1. Rename existing advisory (preserve id/history)
UPDATE public.commissions
   SET nome = 'ASSESSORIA DE MARKETING/COMUNICAÇÃO'
 WHERE id = 'ed23de8f-6293-4321-a8c2-852a1f83f5ec';

-- 2. Move Jonas to the advisory (same user, same history)
UPDATE public.org_members
   SET commission_id = 'ed23de8f-6293-4321-a8c2-852a1f83f5ec',
       cargo = 'FOTÓGRAFO'
 WHERE user_id = '3e7f410c-c14d-4841-8597-8a84f1b8c639'
   AND org_id = '985888b8-155f-4bbe-b6b9-6bef2893d99b';

UPDATE public.commission_responsibles
   SET commission_id = 'ed23de8f-6293-4321-a8c2-852a1f83f5ec',
       display_name = 'Jonas (Fotógrafo)',
       is_primary = false,
       relationship_role = 'equipe_apoio'
 WHERE id = '93f9e463-0a9e-4b74-8c12-b2a444eb2a98';

-- 3. Retire the now-empty Fotografia unit without deleting records
UPDATE public.commissions
   SET is_active = false
 WHERE id = '0734ec46-4b1c-4240-ba5a-553615f6048e';

-- 4. Jonas gains full read of the agenda (write stays blocked by role)
DELETE FROM public.user_capabilities
 WHERE user_id = '3e7f410c-c14d-4841-8597-8a84f1b8c639'
   AND org_id = '985888b8-155f-4bbe-b6b9-6bef2893d99b'
   AND capability = 'cronograma_scoped_access';

-- 5. Single source of truth for "related event"
CREATE OR REPLACE FUNCTION public.cronograma_event_related(_user_id uuid, _org_id uuid, _event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
  );
$$;

GRANT EXECUTE ON FUNCTION public.cronograma_event_related(uuid, uuid, uuid) TO authenticated, service_role;

-- 6. Google Calendar eligibility uses the same definition
CREATE OR REPLACE FUNCTION public.google_user_eligible_for_event(_user_id uuid, _org_id uuid, _event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.org_members active_member
     WHERE active_member.user_id = _user_id
       AND active_member.org_id = _org_id
       AND active_member.is_active = true
       AND EXISTS (
         SELECT 1 FROM public.cronograma_eventos event
          WHERE event.id = _event_id AND event.org_id = _org_id
       )
       AND (
         NOT COALESCE((
           SELECT event.planning_restricted FROM public.cronograma_eventos event
            WHERE event.id = _event_id AND event.org_id = _org_id
         ), false)
         OR public.cronograma_can_view_planning(_user_id, _org_id)
       )
       AND (
         CASE
           WHEN (
             SELECT connection.sync_scope
               FROM public.google_calendar_connections connection
              WHERE connection.user_id = _user_id
              LIMIT 1
           ) = 'mine' THEN
             EXISTS (
               SELECT 1 FROM public.cronograma_eventos own_event
                WHERE own_event.id = _event_id
                  AND own_event.org_id = _org_id
                  AND own_event.created_by_user_id = _user_id
             )
             OR EXISTS (
               SELECT 1 FROM public.cronograma_evento_responsaveis responsible
                WHERE responsible.event_id = _event_id
                  AND responsible.org_id = _org_id
                  AND responsible.org_member_user_id = _user_id
                  AND responsible.responsible_type = 'member'
             )
           ELSE
             public.cronograma_event_related(_user_id, _org_id, _event_id)
         END
       )
  );
$$;