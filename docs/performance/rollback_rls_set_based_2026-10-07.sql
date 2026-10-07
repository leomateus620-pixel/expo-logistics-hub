ALTER POLICY "Commission segment reads price overrides" ON public.commercial_lot_price_overrides USING ((EXISTS ( SELECT 1
   FROM (commercial_lots l
     JOIN map_entities e ON ((e.id = l.entity_id)))
  WHERE ((l.id = commercial_lot_price_overrides.lot_id) AND (l.archived_at IS NULL) AND (NOT e.is_archived) AND (e.segment_id IS NOT NULL) AND (e.segment_id IN ( SELECT map_accessible_segment_ids() AS map_accessible_segment_ids))))));
ALTER POLICY "Map viewers read price overrides" ON public.commercial_lot_price_overrides USING ((EXISTS ( SELECT 1
   FROM (commercial_lots l
     JOIN map_projects p ON ((p.id = l.project_id)))
  WHERE ((l.id = commercial_lot_price_overrides.lot_id) AND (p.org_id IN ( SELECT map_viewable_org_ids() AS map_viewable_org_ids))))));
ALTER POLICY commercial_lots_commission_segment_select ON public.commercial_lots USING ((EXISTS ( SELECT 1
   FROM map_entities entity
  WHERE ((entity.id = commercial_lots.entity_id) AND (entity.project_id = commercial_lots.project_id) AND (entity.is_archived = false) AND (commercial_lots.archived_at IS NULL) AND (entity.segment_id IS NOT NULL) AND (entity.segment_id IN ( SELECT map_accessible_segment_ids() AS map_accessible_segment_ids))))));
ALTER POLICY commercial_lots_manage ON public.commercial_lots USING ((EXISTS ( SELECT 1
   FROM map_projects p
  WHERE ((p.id = commercial_lots.project_id) AND (p.org_id IN ( SELECT map_capable_org_ids('map.manage_lots'::text) AS map_capable_org_ids))))));
ALTER POLICY commercial_lots_select ON public.commercial_lots USING ((EXISTS ( SELECT 1
   FROM map_projects p
  WHERE ((p.id = commercial_lots.project_id) AND (p.org_id IN ( SELECT map_viewable_org_ids() AS map_viewable_org_ids))))));
ALTER POLICY cronograma_evento_comissoes_select ON public.cronograma_evento_comissoes USING (((EXISTS ( SELECT 1
   FROM cronograma_eventos e
  WHERE ((e.id = cronograma_evento_comissoes.event_id) AND is_org_member(auth.uid(), e.org_id)))) AND cronograma_event_planning_allowed(event_id)));
ALTER POLICY cronograma_evento_responsaveis_select ON public.cronograma_evento_responsaveis USING (((EXISTS ( SELECT 1
   FROM cronograma_eventos e
  WHERE ((e.id = cronograma_evento_responsaveis.event_id) AND is_org_member(auth.uid(), e.org_id)))) AND cronograma_event_planning_allowed(event_id)));
ALTER POLICY cronograma_eventos_select ON public.cronograma_eventos USING ((is_org_member(auth.uid(), org_id) AND ((NOT planning_restricted) OR cronograma_can_view_planning(auth.uid(), org_id)) AND (((get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role])) AND (NOT has_capability(auth.uid(), org_id, 'restricted_scope'::text))) OR (NOT has_scoped_cronograma_access(auth.uid(), org_id)) OR cronograma_scoped_event_visible(id, auth.uid()) OR (created_by_user_id = auth.uid()))));
ALTER POLICY cronograma_subeventos_select ON public.cronograma_subeventos USING (((EXISTS ( SELECT 1
   FROM cronograma_eventos e
  WHERE ((e.id = cronograma_subeventos.parent_event_id) AND is_org_member(auth.uid(), e.org_id)))) AND cronograma_event_planning_allowed(parent_event_id)));
ALTER POLICY lot_contracts_restricted ON public.lot_contracts USING ((EXISTS ( SELECT 1
   FROM (commercial_lots l
     JOIN map_projects p ON ((p.id = l.project_id)))
  WHERE ((l.id = lot_contracts.lot_id) AND (p.org_id IN ( SELECT map_capable_org_ids('map.manage_contracts'::text) AS map_capable_org_ids))))));
ALTER POLICY lot_negotiations_restricted ON public.lot_negotiations USING ((EXISTS ( SELECT 1
   FROM (commercial_lots l
     JOIN map_projects p ON ((p.id = l.project_id)))
  WHERE ((l.id = lot_negotiations.lot_id) AND (p.org_id IN ( SELECT map_capable_org_ids('map.manage_sales'::text) AS map_capable_org_ids))))));
ALTER POLICY lot_prices_commission_segment_select ON public.lot_prices USING ((EXISTS ( SELECT 1
   FROM (commercial_lots lot
     JOIN map_entities entity ON ((entity.id = lot.entity_id)))
  WHERE ((lot.id = lot_prices.lot_id) AND (lot.project_id = entity.project_id) AND (lot.archived_at IS NULL) AND (entity.is_archived = false) AND (lot_prices.is_active = true) AND (entity.segment_id IS NOT NULL) AND (entity.segment_id IN ( SELECT map_accessible_segment_ids() AS map_accessible_segment_ids))))));
ALTER POLICY lot_prices_manage ON public.lot_prices USING ((EXISTS ( SELECT 1
   FROM (commercial_lots l
     JOIN map_projects p ON ((p.id = l.project_id)))
  WHERE ((l.id = lot_prices.lot_id) AND (p.org_id IN ( SELECT map_capable_org_ids('map.manage_lots'::text) AS map_capable_org_ids))))));
ALTER POLICY lot_prices_select ON public.lot_prices USING ((EXISTS ( SELECT 1
   FROM (commercial_lots l
     JOIN map_projects p ON ((p.id = l.project_id)))
  WHERE ((l.id = lot_prices.lot_id) AND (p.org_id IN ( SELECT map_viewable_org_ids() AS map_viewable_org_ids))))));
ALTER POLICY lot_reservations_commission_segment_select ON public.lot_reservations USING (((status = 'ACTIVE'::text) AND (EXISTS ( SELECT 1
   FROM (commercial_lots lot
     JOIN map_entities entity ON ((entity.id = lot.entity_id)))
  WHERE ((lot.id = lot_reservations.lot_id) AND (lot.project_id = entity.project_id) AND (lot.archived_at IS NULL) AND (entity.is_archived = false) AND (entity.segment_id IS NOT NULL) AND (entity.segment_id IN ( SELECT map_accessible_segment_ids() AS map_accessible_segment_ids)))))));
ALTER POLICY lot_reservations_restricted ON public.lot_reservations USING ((EXISTS ( SELECT 1
   FROM (commercial_lots l
     JOIN map_projects p ON ((p.id = l.project_id)))
  WHERE ((l.id = lot_reservations.lot_id) AND (p.org_id IN ( SELECT map_capable_org_ids('map.manage_sales'::text) AS map_capable_org_ids))))));
ALTER POLICY lot_sales_commission_segment_select ON public.lot_sales USING (((status = 'CONFIRMED'::text) AND (EXISTS ( SELECT 1
   FROM (commercial_lots lot
     JOIN map_entities entity ON ((entity.id = lot.entity_id)))
  WHERE ((lot.id = lot_sales.lot_id) AND (lot.project_id = entity.project_id) AND (lot.archived_at IS NULL) AND (entity.is_archived = false) AND (entity.segment_id IS NOT NULL) AND (entity.segment_id IN ( SELECT map_accessible_segment_ids() AS map_accessible_segment_ids)))))));
ALTER POLICY lot_sales_restricted ON public.lot_sales USING ((EXISTS ( SELECT 1
   FROM (commercial_lots l
     JOIN map_projects p ON ((p.id = l.project_id)))
  WHERE ((l.id = lot_sales.lot_id) AND (p.org_id IN ( SELECT map_capable_org_ids('map.manage_sales'::text) AS map_capable_org_ids))))));
ALTER POLICY map_entities_commission_segment_select ON public.map_entities USING (((is_archived = false) AND (segment_id IS NOT NULL) AND map_can_access_segment(segment_id)));
ALTER POLICY map_entities_manage ON public.map_entities USING ((EXISTS ( SELECT 1
   FROM map_projects p
  WHERE ((p.id = map_entities.project_id) AND (p.org_id IN ( SELECT map_capable_org_ids('map.edit'::text) AS map_capable_org_ids))))));
ALTER POLICY map_entities_select ON public.map_entities USING ((EXISTS ( SELECT 1
   FROM map_projects p
  WHERE ((p.id = map_entities.project_id) AND (p.org_id IN ( SELECT map_viewable_org_ids() AS map_viewable_org_ids))))));
ALTER POLICY map_geometries_commission_segment_select ON public.map_entity_geometries USING ((EXISTS ( SELECT 1
   FROM map_entities entity
  WHERE ((entity.id = map_entity_geometries.entity_id) AND (entity.project_id = map_entity_geometries.project_id) AND (entity.is_archived = false) AND (map_entity_geometries.is_current = true) AND (entity.segment_id IS NOT NULL) AND (entity.segment_id IN ( SELECT map_accessible_segment_ids() AS map_accessible_segment_ids))))));
ALTER POLICY map_geometries_manage ON public.map_entity_geometries USING ((EXISTS ( SELECT 1
   FROM map_projects p
  WHERE ((p.id = map_entity_geometries.project_id) AND (p.org_id IN ( SELECT map_capable_org_ids('map.edit_geometry'::text) AS map_capable_org_ids))))));
ALTER POLICY map_geometries_select ON public.map_entity_geometries USING ((EXISTS ( SELECT 1
   FROM map_projects p
  WHERE ((p.id = map_entity_geometries.project_id) AND (p.org_id IN ( SELECT map_viewable_org_ids() AS map_viewable_org_ids))))));
