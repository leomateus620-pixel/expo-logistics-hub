CREATE OR REPLACE FUNCTION public.commercial_map_lot_buyers(_project_id uuid)
RETURNS TABLE(lot_id uuid, sale_status text, buyer_display_name text, is_conflict boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT p.org_id INTO v_org FROM public.map_projects p WHERE p.id = _project_id;
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.can_view_commercial_map(v_org) THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;
  RETURN QUERY
  SELECT s.lot_id,
         CASE WHEN count(*) > 1 THEN 'CONFLICT' ELSE max(s.status) END,
         CASE WHEN count(*) > 1 THEN NULL
              ELSE max(COALESCE(NULLIF(btrim(s.buyer_trade_name),''), NULLIF(btrim(s.buyer_name),''))) END,
         count(*) > 1
  FROM public.lot_sales s
  JOIN public.commercial_lots l ON l.id = s.lot_id
  WHERE l.project_id = _project_id AND l.archived_at IS NULL AND s.status IN ('OPEN','CONFIRMED')
  GROUP BY s.lot_id;
END $$;
REVOKE ALL ON FUNCTION public.commercial_map_lot_buyers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commercial_map_lot_buyers(uuid) TO authenticated;