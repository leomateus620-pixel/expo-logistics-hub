-- Políticas RLS baseadas em conjuntos calculados uma vez por consulta.
-- Mesmo resultado de acesso; elimina funções por linha e EXISTS encadeados em tabelas com RLS.
-- Rollback: docs/performance/rollback_rls_set_based_2026-10-07.sql

CREATE OR REPLACE FUNCTION public.map_viewable_project_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id FROM public.map_projects p WHERE p.org_id IN (SELECT public.map_viewable_org_ids());
$$;

CREATE OR REPLACE FUNCTION public.map_capable_project_ids(_capability text)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id FROM public.map_projects p
  WHERE p.org_id IN (SELECT public.map_capable_org_ids(_capability))
    AND (public.can_view_commercial_map(p.org_id) OR public.map_can_view_any_segment(p.id));
$$;

CREATE OR REPLACE FUNCTION public.map_viewable_lot_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id FROM public.commercial_lots l WHERE l.project_id IN (SELECT public.map_viewable_project_ids());
$$;

CREATE OR REPLACE FUNCTION public.map_segment_lot_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lot.id
  FROM public.commercial_lots lot
  JOIN public.map_entities entity ON entity.id = lot.entity_id AND entity.project_id = lot.project_id
  WHERE lot.archived_at IS NULL
    AND entity.is_archived = false
    AND entity.segment_id IN (SELECT public.map_accessible_segment_ids());
$$;

CREATE OR REPLACE FUNCTION public.map_segment_entities()
RETURNS TABLE (id uuid, project_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.project_id FROM public.map_entities e
  WHERE e.is_archived = false AND e.segment_id IN (SELECT public.map_accessible_segment_ids());
$$;

-- Lotes visíveis por qualquer política de leitura de commercial_lots.
CREATE OR REPLACE FUNCTION public.map_any_visible_lot_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.map_viewable_lot_ids()
  UNION
  SELECT public.map_segment_lot_ids()
  UNION
  SELECT l.id FROM public.commercial_lots l WHERE l.project_id IN (SELECT public.map_capable_project_ids('map.manage_lots'));
$$;

CREATE OR REPLACE FUNCTION public.map_capable_lot_ids(_capability text)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id FROM public.commercial_lots l
  WHERE l.project_id IN (SELECT public.map_capable_project_ids(_capability))
    AND l.id IN (SELECT public.map_any_visible_lot_ids());
$$;

-- Agenda: eventos visíveis pela política cronograma_eventos_select (mesma regra, flags por organização uma vez).
CREATE OR REPLACE FUNCTION public.cronograma_visible_event_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  orgs AS (
    SELECT DISTINCT m.org_id FROM public.org_members m, me
    WHERE m.user_id = me.uid AND m.is_active = true
  ),
  flags AS (
    SELECT o.org_id,
      public.cronograma_can_view_planning(me.uid, o.org_id) AS can_plan,
      ((public.get_user_org_role(me.uid, o.org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]))
        AND NOT public.has_capability(me.uid, o.org_id, 'restricted_scope')) AS broad,
      NOT public.has_scoped_cronograma_access(me.uid, o.org_id) AS unscoped
    FROM orgs o, me
  )
  SELECT e.id
  FROM public.cronograma_eventos e
  JOIN flags f ON f.org_id = e.org_id
  CROSS JOIN me
  WHERE (NOT e.planning_restricted OR f.can_plan)
    AND (f.broad OR f.unscoped OR e.created_by_user_id = me.uid
         OR public.cronograma_scoped_event_visible(e.id, me.uid));
$$;

GRANT EXECUTE ON FUNCTION public.map_viewable_project_ids(), public.map_capable_project_ids(text),
  public.map_viewable_lot_ids(), public.map_segment_lot_ids(), public.map_segment_entities(),
  public.map_any_visible_lot_ids(), public.map_capable_lot_ids(text), public.cronograma_visible_event_ids()
  TO authenticated, service_role;

-- commercial_lots
ALTER POLICY commercial_lots_select ON public.commercial_lots USING (project_id IN (SELECT public.map_viewable_project_ids()));
ALTER POLICY commercial_lots_commission_segment_select ON public.commercial_lots USING (id IN (SELECT public.map_segment_lot_ids()));
ALTER POLICY commercial_lots_manage ON public.commercial_lots USING (project_id IN (SELECT public.map_capable_project_ids('map.manage_lots')));

-- map_entities
ALTER POLICY map_entities_select ON public.map_entities USING (project_id IN (SELECT public.map_viewable_project_ids()));
ALTER POLICY map_entities_manage ON public.map_entities USING (project_id IN (SELECT public.map_capable_project_ids('map.edit')));
ALTER POLICY map_entities_commission_segment_select ON public.map_entities
  USING (is_archived = false AND segment_id IS NOT NULL AND segment_id IN (SELECT public.map_accessible_segment_ids()));

-- map_entity_geometries
ALTER POLICY map_geometries_select ON public.map_entity_geometries USING (project_id IN (SELECT public.map_viewable_project_ids()));
ALTER POLICY map_geometries_manage ON public.map_entity_geometries USING (project_id IN (SELECT public.map_capable_project_ids('map.edit_geometry')));
ALTER POLICY map_geometries_commission_segment_select ON public.map_entity_geometries
  USING (is_current = true AND (entity_id, project_id) IN (SELECT s.id, s.project_id FROM public.map_segment_entities() s));

-- lot_prices
ALTER POLICY lot_prices_select ON public.lot_prices USING (lot_id IN (SELECT public.map_viewable_lot_ids()));
ALTER POLICY lot_prices_commission_segment_select ON public.lot_prices USING (is_active = true AND lot_id IN (SELECT public.map_segment_lot_ids()));
ALTER POLICY lot_prices_manage ON public.lot_prices USING (lot_id IN (SELECT public.map_capable_lot_ids('map.manage_lots')));

-- lot_reservations / lot_sales / lot_negotiations / lot_contracts
ALTER POLICY lot_reservations_commission_segment_select ON public.lot_reservations USING (status = 'ACTIVE' AND lot_id IN (SELECT public.map_segment_lot_ids()));
ALTER POLICY lot_reservations_restricted ON public.lot_reservations USING (lot_id IN (SELECT public.map_capable_lot_ids('map.manage_sales')));
ALTER POLICY lot_sales_commission_segment_select ON public.lot_sales USING (status = 'CONFIRMED' AND lot_id IN (SELECT public.map_segment_lot_ids()));
ALTER POLICY lot_sales_restricted ON public.lot_sales USING (lot_id IN (SELECT public.map_capable_lot_ids('map.manage_sales')));
ALTER POLICY lot_negotiations_restricted ON public.lot_negotiations USING (lot_id IN (SELECT public.map_capable_lot_ids('map.manage_sales')));
ALTER POLICY lot_contracts_restricted ON public.lot_contracts USING (lot_id IN (SELECT public.map_capable_lot_ids('map.manage_contracts')));

-- commercial_lot_price_overrides
ALTER POLICY "Map viewers read price overrides" ON public.commercial_lot_price_overrides USING (lot_id IN (SELECT public.map_viewable_lot_ids()));
ALTER POLICY "Commission segment reads price overrides" ON public.commercial_lot_price_overrides USING (lot_id IN (SELECT public.map_segment_lot_ids()));

-- Agenda
ALTER POLICY cronograma_eventos_select ON public.cronograma_eventos USING (id IN (SELECT public.cronograma_visible_event_ids()));
ALTER POLICY cronograma_evento_comissoes_select ON public.cronograma_evento_comissoes USING (event_id IN (SELECT public.cronograma_visible_event_ids()));
ALTER POLICY cronograma_evento_responsaveis_select ON public.cronograma_evento_responsaveis USING (event_id IN (SELECT public.cronograma_visible_event_ids()));
ALTER POLICY cronograma_subeventos_select ON public.cronograma_subeventos USING (parent_event_id IN (SELECT public.cronograma_visible_event_ids()));
