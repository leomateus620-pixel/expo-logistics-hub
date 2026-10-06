-- Synthetic structural scaffolding for the existing unit RPC and relationship writer.
-- Functions appended below are taken unchanged from repository migrations.
CREATE TABLE public.commissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,
  nome text,slug text,is_active boolean NOT NULL DEFAULT true,UNIQUE(org_id,id));
CREATE TABLE public.commission_responsibles(commission_id uuid,user_id uuid,active boolean NOT NULL DEFAULT true);
ALTER TABLE public.cronograma_eventos ADD CONSTRAINT qa_source_org_identity UNIQUE(org_id,id);
ALTER TABLE public.cronograma_evento_comissoes ADD COLUMN org_id uuid,
  ADD COLUMN commission_id uuid,ADD COLUMN commission_name_snapshot text,ADD COLUMN relation_role text,
  ADD COLUMN updated_at timestamptz DEFAULT now(),ADD CONSTRAINT qa_commission_event_identity UNIQUE(event_id,commission_id),
  ADD CONSTRAINT qa_link_event_org FOREIGN KEY(org_id,event_id) REFERENCES public.cronograma_eventos(org_id,id) ON DELETE CASCADE,
  ADD CONSTRAINT qa_link_commission_org FOREIGN KEY(org_id,commission_id) REFERENCES public.commissions(org_id,id);
ALTER TABLE public.cronograma_evento_responsaveis ADD COLUMN org_id uuid,
  ADD COLUMN org_member_user_id uuid,ADD COLUMN name_snapshot text,
  ADD COLUMN is_primary boolean,ADD COLUMN responsible_type text;
CREATE TABLE public.cronograma_evento_anexos(id uuid PRIMARY KEY,event_id uuid);
GRANT SELECT ON public.commissions,public.commission_responsibles TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.cronograma_evento_comissoes,public.cronograma_evento_responsaveis TO authenticated;
GRANT SELECT ON public.cronograma_evento_anexos TO authenticated;
ALTER TABLE public.cronograma_evento_comissoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY qa_commission_link_select ON public.cronograma_evento_comissoes FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.cronograma_eventos e WHERE e.id=event_id AND e.org_id=org_id));
CREATE POLICY qa_commission_link_write ON public.cronograma_evento_comissoes FOR ALL TO authenticated
  USING(public.is_org_member(auth.uid(),org_id) AND public.has_capability(auth.uid(),org_id,'cronograma_eventos_write'))
  WITH CHECK(public.is_org_member(auth.uid(),org_id) AND public.has_capability(auth.uid(),org_id,'cronograma_eventos_write'));
DROP FUNCTION public._cronograma_apply_event_commissions(uuid,uuid,jsonb);

CREATE OR REPLACE FUNCTION public._cronograma_apply_event_commissions(
  _event_id uuid, _org_id uuid, _items jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE item jsonb; resolved_ids uuid[] := '{}';
BEGIN
  IF _items IS NULL THEN RETURN; END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF (item->>'commission_id') IS NULL AND (item->>'commission_slug') IS NOT NULL THEN
      item := item || jsonb_build_object('commission_id',
        (SELECT id FROM public.commissions WHERE org_id = _org_id AND slug = item->>'commission_slug' LIMIT 1)
      );
    END IF;

    IF (item->>'commission_id') IS NULL THEN
      RAISE EXCEPTION 'CRONOGRAMA_RELATIONSHIP_INVALID: comissão % não encontrada', item->>'commission_slug'
        USING ERRCODE='P0001';
    END IF;

    INSERT INTO public.cronograma_evento_comissoes
      (event_id, org_id, commission_id, commission_slug, commission_name_snapshot, relation_role)
    VALUES (
      _event_id, _org_id,
      (item->>'commission_id')::uuid,
      item->>'commission_slug',
      item->>'commission_name',
      COALESCE(item->>'relation_role', 'participante')
    )
    ON CONFLICT (event_id, commission_id) DO UPDATE
      SET commission_slug = EXCLUDED.commission_slug,
          commission_name_snapshot = EXCLUDED.commission_name_snapshot,
          relation_role = EXCLUDED.relation_role,
          updated_at = now();

    resolved_ids := array_append(resolved_ids, (item->>'commission_id')::uuid);
  END LOOP;

  DELETE FROM public.cronograma_evento_comissoes
   WHERE event_id = _event_id
     AND (resolved_ids = '{}' OR NOT (commission_id = ANY (resolved_ids)));
END $$;

CREATE OR REPLACE FUNCTION public.cronograma_unit_can_manage(_user_id uuid, _commission_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.commissions c
    WHERE c.id = _commission_id
      AND (
        public.get_user_org_role(_user_id, c.org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role])
        OR public.has_capability(_user_id, c.org_id, 'cronograma_eventos_write')
        OR EXISTS (
          SELECT 1 FROM public.commission_responsibles r
          WHERE r.commission_id = c.id
            AND r.user_id = _user_id
            AND r.active IS NOT FALSE
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.cronograma_unit_can_manage(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cronograma_unit_agenda(_commission_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  start_date date,
  end_date date,
  start_time text,
  end_time text,
  event_time text,
  status text,
  location text,
  description text,
  responsible_name text,
  commission_slug text,
  origin_source text,
  origin_commission_id uuid,
  units jsonb,
  people jsonb,
  document_count integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    e.id,
    e.title,
    e.start_date,
    e.end_date,
    e.start_time::text,
    e.end_time::text,
    e.event_time::text,
    e.status,
    e.location,
    e.description,
    e.responsible_name,
    e.commission_slug,
    e.origin_source,
    e.origin_commission_id,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'commission_id', l2.commission_id,
        'slug', l2.commission_slug,
        'name', l2.commission_name_snapshot,
        'role', l2.relation_role
      ) ORDER BY l2.relation_role, l2.commission_slug)
      FROM public.cronograma_evento_comissoes l2 WHERE l2.event_id = e.id
    ), '[]'::jsonb) AS units,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'user_id', r.org_member_user_id,
        'name', r.name_snapshot,
        'role', r.role,
        'is_primary', r.is_primary
      ) ORDER BY r.is_primary DESC, r.name_snapshot)
      FROM public.cronograma_evento_responsaveis r WHERE r.event_id = e.id
    ), '[]'::jsonb) AS people,
    (SELECT count(*)::int FROM public.cronograma_evento_anexos a WHERE a.event_id = e.id) AS document_count
  FROM public.cronograma_eventos e
  WHERE EXISTS (
    SELECT 1 FROM public.cronograma_evento_comissoes l
    WHERE l.event_id = e.id AND l.commission_id = _commission_id
  )
  ORDER BY e.start_date NULLS LAST, e.start_time NULLS LAST, e.title;
$$;

GRANT EXECUTE ON FUNCTION public.cronograma_unit_agenda(uuid) TO authenticated;
