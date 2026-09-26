CREATE OR REPLACE FUNCTION app_private.commercial_sale_logos(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
 SELECT org_id INTO v_org FROM public.map_projects WHERE id = p_project_id;
 IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.map_has_explicit_capability(v_org, 'map.view') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
 RETURN coalesce((SELECT jsonb_object_agg(l.id::text, o.logo_path) FROM public.commercial_lots l JOIN public.lot_sale_order_items i ON i.lot_id = l.id JOIN public.lot_sales s ON s.id = i.sale_id AND s.status = 'CONFIRMED' JOIN public.lot_sale_orders o ON o.id = i.order_id AND o.status = 'CONFIRMED' AND o.logo_path IS NOT NULL WHERE l.project_id = p_project_id AND l.status = 'SOLD' AND l.archived_at IS NULL), '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION app_private.commercial_sale_logos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.commercial_sale_logos(uuid) TO authenticated;
CREATE FUNCTION public.commercial_sale_logos(p_project_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$ SELECT app_private.commercial_sale_logos(p_project_id) $$;
REVOKE ALL ON FUNCTION public.commercial_sale_logos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commercial_sale_logos(uuid) TO authenticated;
DROP POLICY commercial_sale_logo_read ON storage.objects;
CREATE POLICY commercial_sale_logo_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'commercial-sale-logos' AND public.map_has_explicit_capability(((storage.foldername(name))[1])::uuid, 'map.view'));