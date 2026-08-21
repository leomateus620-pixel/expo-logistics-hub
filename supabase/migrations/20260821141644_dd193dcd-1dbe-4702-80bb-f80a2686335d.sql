-- 1. Restricted planning flag
ALTER TABLE public.cronograma_eventos
  ADD COLUMN IF NOT EXISTS planning_restricted boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.cronograma_is_planning_sheet(_sheet text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _sheet IN (
    'CRONOGRAMA DE ATIVIDADES e EVENTOS FENASOJA 2026 - ano 2026.xls',
    'CRONOGRAMA DE ATIVIDADES e EVENTOS FENASOJA 2027 - ano 2027.xls',
    'CRONOGRAMA DE ATIVIDADES e EVENTOS FENASOJA 2028 - ano 2028.xls'
  );
$$;

UPDATE public.cronograma_eventos
   SET planning_restricted = true
 WHERE public.cronograma_is_planning_sheet(source_sheet)
   AND planning_restricted = false;

CREATE OR REPLACE FUNCTION public.cronograma_mark_planning_restricted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.cronograma_is_planning_sheet(NEW.source_sheet) THEN
    NEW.planning_restricted := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cronograma_mark_planning_restricted_trg ON public.cronograma_eventos;
CREATE TRIGGER cronograma_mark_planning_restricted_trg
BEFORE INSERT OR UPDATE OF source_sheet ON public.cronograma_eventos
FOR EACH ROW EXECUTE FUNCTION public.cronograma_mark_planning_restricted();

-- 2. Planning viewers allowlist
CREATE TABLE IF NOT EXISTS public.cronograma_planning_viewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

GRANT SELECT ON public.cronograma_planning_viewers TO authenticated;
GRANT ALL ON public.cronograma_planning_viewers TO service_role;
ALTER TABLE public.cronograma_planning_viewers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cronograma_planning_viewers_select ON public.cronograma_planning_viewers;
CREATE POLICY cronograma_planning_viewers_select
ON public.cronograma_planning_viewers
FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), org_id));

CREATE OR REPLACE FUNCTION public.cronograma_can_view_planning(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cronograma_planning_viewers v
     WHERE v.user_id = _user_id AND v.org_id = _org_id
  );
$$;

INSERT INTO public.cronograma_planning_viewers (org_id, user_id)
VALUES
  ('985888b8-155f-4bbe-b6b9-6bef2893d99b', 'a3e893e1-a069-40f2-9f9e-5bbf80b21274'),
  ('985888b8-155f-4bbe-b6b9-6bef2893d99b', '74a71a9f-c2a6-4ae1-baed-1e2d7b8bc07f')
ON CONFLICT (org_id, user_id) DO NOTHING;

INSERT INTO public.user_capabilities (user_id, org_id, capability)
VALUES
  ('a3e893e1-a069-40f2-9f9e-5bbf80b21274', '985888b8-155f-4bbe-b6b9-6bef2893d99b', 'cronograma_planning_access'),
  ('74a71a9f-c2a6-4ae1-baed-1e2d7b8bc07f', '985888b8-155f-4bbe-b6b9-6bef2893d99b', 'cronograma_planning_access')
ON CONFLICT DO NOTHING;

-- 3. RLS on events
DROP POLICY IF EXISTS cronograma_eventos_select ON public.cronograma_eventos;
CREATE POLICY cronograma_eventos_select
ON public.cronograma_eventos
FOR SELECT
USING (
  is_org_member(auth.uid(), org_id)
  AND (
    NOT planning_restricted
    OR public.cronograma_can_view_planning(auth.uid(), org_id)
  )
  AND (
    (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]))
    OR (NOT has_scoped_cronograma_access(auth.uid(), org_id))
    OR cronograma_scoped_event_visible(id, auth.uid())
    OR (created_by_user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS cronograma_eventos_update ON public.cronograma_eventos;
CREATE POLICY cronograma_eventos_update
ON public.cronograma_eventos
FOR UPDATE
USING (
  is_org_member(auth.uid(), org_id)
  AND (NOT planning_restricted OR public.cronograma_can_view_planning(auth.uid(), org_id))
  AND (
    (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]))
    OR has_capability(auth.uid(), org_id, 'cronograma_eventos_write')
  )
  AND (
    (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]))
    OR (NOT has_scoped_cronograma_access(auth.uid(), org_id))
    OR cronograma_scoped_event_visible(id, auth.uid())
    OR (created_by_user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS cronograma_eventos_delete ON public.cronograma_eventos;
CREATE POLICY cronograma_eventos_delete
ON public.cronograma_eventos
FOR DELETE
USING (
  is_org_member(auth.uid(), org_id)
  AND (NOT planning_restricted OR public.cronograma_can_view_planning(auth.uid(), org_id))
  AND (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]))
);

-- 4. Child tables inherit the restriction
CREATE OR REPLACE FUNCTION public.cronograma_event_planning_allowed(_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT NOT e.planning_restricted
             OR public.cronograma_can_view_planning(auth.uid(), e.org_id)
        FROM public.cronograma_eventos e
       WHERE e.id = _event_id
    ),
    true
  );
$$;

DROP POLICY IF EXISTS cronograma_evento_comissoes_select ON public.cronograma_evento_comissoes;
CREATE POLICY cronograma_evento_comissoes_select
ON public.cronograma_evento_comissoes
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM cronograma_eventos e WHERE e.id = event_id AND is_org_member(auth.uid(), e.org_id))
  AND public.cronograma_event_planning_allowed(event_id)
);

DROP POLICY IF EXISTS cronograma_evento_responsaveis_select ON public.cronograma_evento_responsaveis;
CREATE POLICY cronograma_evento_responsaveis_select
ON public.cronograma_evento_responsaveis
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM cronograma_eventos e WHERE e.id = event_id AND is_org_member(auth.uid(), e.org_id))
  AND public.cronograma_event_planning_allowed(event_id)
);

DROP POLICY IF EXISTS cronograma_subeventos_select ON public.cronograma_subeventos;
CREATE POLICY cronograma_subeventos_select
ON public.cronograma_subeventos
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM cronograma_eventos e WHERE e.id = parent_event_id AND is_org_member(auth.uid(), e.org_id))
  AND public.cronograma_event_planning_allowed(parent_event_id)
);

DROP POLICY IF EXISTS anexos_select_org_members ON public.cronograma_evento_anexos;
CREATE POLICY anexos_select_org_members
ON public.cronograma_evento_anexos
FOR SELECT
USING (
  is_org_member(auth.uid(), org_id)
  AND public.cronograma_event_planning_allowed(event_id)
  AND ((NOT has_scoped_cronograma_access(auth.uid(), org_id)) OR cronograma_scoped_event_visible(event_id, auth.uid()))
);

-- 5. Google Calendar eligibility respects the restriction
CREATE OR REPLACE FUNCTION public.google_user_eligible_for_event(_user_id uuid, _org_id uuid, _event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
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
             public.has_capability(_user_id, _org_id, 'full_access')
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
         END
       )
  );
$function$;