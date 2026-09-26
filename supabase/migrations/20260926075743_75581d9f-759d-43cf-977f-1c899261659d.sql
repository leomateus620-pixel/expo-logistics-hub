CREATE OR REPLACE FUNCTION app_private.public_map_sale_logos(_slug text, _token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_link public.public_map_links;
BEGIN
 v_link := public.public_map_resolve_link(_slug, _token);
 RETURN coalesce((SELECT jsonb_object_agg(l.id::text, o.logo_path) FROM public.commercial_lots l JOIN public.lot_sale_order_items i ON i.lot_id = l.id JOIN public.lot_sales s ON s.id = i.sale_id AND s.status = 'CONFIRMED' JOIN public.lot_sale_orders o ON o.id = i.order_id AND o.status = 'CONFIRMED' AND o.logo_path IS NOT NULL WHERE l.entity_id IN (SELECT entity_id FROM public.public_map_scope_entity_ids(v_link.id)) AND l.project_id = v_link.project_id AND l.status = 'SOLD' AND l.archived_at IS NULL), '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION app_private.public_map_sale_logos(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.public_map_sale_logos(text,text) TO anon, authenticated;