-- Additive, organization-bound readers for workers. Existing public-link RPCs
-- remain unchanged. Never return tokens, contact metadata or visitor IDs.
CREATE FUNCTION public.workers_interest_summary(
  _org_id uuid, _from timestamptz DEFAULT now() - interval '30 days', _to timestamptz DEFAULT now()
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR _org_id NOT IN (SELECT public.ai_workers_member_org_ids())
    OR NOT public.has_capability(auth.uid(), _org_id, 'map.analytics.view')
    OR NOT public.map_has_explicit_capability(_org_id, 'map.manage_sales') THEN
    RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from OR _to - _from > interval '366 days' THEN
    RAISE EXCEPTION 'WORKERS_INVALID_INTERVAL' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('from',_from,'to',_to,'areas',coalesce((
    SELECT jsonb_agg(to_jsonb(r) ORDER BY r.visits DESC, r.id) FROM (
      SELECT k.id, k.slug, k.display_name AS "displayName", k.scope_kind AS "scopeKind",
        count(ev.id) FILTER (WHERE ev.event_type='area_visit') AS visits,
        count(DISTINCT ev.session_id) AS sessions,
        count(ev.id) FILTER (WHERE ev.event_type='lot_selected') AS "lotSelections",
        count(ev.id) FILTER (WHERE ev.event_type='lot_details_viewed') AS "detailViews"
      FROM public.public_map_links k
      JOIN public.map_projects p ON p.id=k.project_id AND p.org_id=_org_id
      LEFT JOIN public.public_map_events ev ON ev.link_id=k.id AND ev.occurred_at>=_from AND ev.occurred_at<=_to
      WHERE k.org_id=_org_id
      GROUP BY k.id,k.slug,k.display_name,k.scope_kind
      ORDER BY visits DESC,k.id LIMIT 50
    ) r
  ),'[]'::jsonb));
END $$;

CREATE FUNCTION public.workers_public_links_overview(_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR _org_id NOT IN (SELECT public.ai_workers_member_org_ids())
    OR NOT public.has_capability(auth.uid(), _org_id, 'map.analytics.view')
    OR NOT public.map_has_explicit_capability(_org_id, 'map.manage_sales') THEN
    RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r."sortOrder",r.id) FROM (
    SELECT k.id,k.slug,k.display_name AS "displayName",k.scope_kind AS "scopeKind",
      k.is_active AS "isActive",k.sort_order AS "sortOrder"
    FROM public.public_map_links k JOIN public.map_projects p ON p.id=k.project_id AND p.org_id=_org_id
    WHERE k.org_id=_org_id ORDER BY k.sort_order,k.id LIMIT 100
  ) r),'[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.workers_interest_summary(uuid,timestamptz,timestamptz),
  public.workers_public_links_overview(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workers_interest_summary(uuid,timestamptz,timestamptz),
  public.workers_public_links_overview(uuid) TO authenticated;
