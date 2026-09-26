ALTER TABLE public.lot_sale_orders ADD COLUMN IF NOT EXISTS logo_path text;
CREATE OR REPLACE FUNCTION public.attach_commercial_sale_logo(p_order_id uuid, p_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_order public.lot_sale_orders%ROWTYPE; v_org uuid;
BEGIN
  SELECT * INTO v_order FROM public.lot_sale_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR v_order.salesperson_user_id <> auth.uid() OR v_order.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'SALE_LOGO_NOT_ALLOWED'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = v_order.project_id;
  IF NOT public.map_has_explicit_capability(v_org, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF p_path IS NULL OR p_path <> v_org::text || '/' || v_order.idempotency_key || '.webp' OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'commercial-sale-logos' AND name = p_path AND (metadata->>'mimetype') = 'image/webp' AND coalesce((metadata->>'size')::bigint, 0) <= 1048576) THEN RAISE EXCEPTION 'SALE_LOGO_INVALID'; END IF;
  IF v_order.logo_path IS NOT NULL AND v_order.logo_path <> p_path THEN RAISE EXCEPTION 'SALE_LOGO_ALREADY_SET'; END IF;
  UPDATE public.lot_sale_orders SET logo_path = p_path, updated_at = now() WHERE id = p_order_id;
  UPDATE public.commercial_lots l SET updated_at = now() WHERE l.id IN (SELECT lot_id FROM public.lot_sale_order_items WHERE order_id = p_order_id AND sale_id IN (SELECT id FROM public.lot_sales WHERE status = 'CONFIRMED')) AND l.status = 'SOLD';
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.attach_commercial_sale_logo(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_commercial_sale_logo(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.public_map_sale_logos(_slug text, _token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_link public.public_map_links;
BEGIN
  v_link := public.public_map_resolve_link(_slug, _token);
  RETURN coalesce((SELECT jsonb_object_agg(l.id::text, o.logo_path)
    FROM public.commercial_lots l
    JOIN public.lot_sale_order_items i ON i.lot_id = l.id
    JOIN public.lot_sales s ON s.id = i.sale_id AND s.status = 'CONFIRMED'
    JOIN public.lot_sale_orders o ON o.id = i.order_id AND o.status = 'CONFIRMED' AND o.logo_path IS NOT NULL
    WHERE l.entity_id IN (SELECT entity_id FROM public.public_map_scope_entity_ids(v_link.id)) AND l.status = 'SOLD' AND l.archived_at IS NULL), '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.public_map_sale_logos(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_map_sale_logos(text,text) TO anon, authenticated, service_role;
CREATE POLICY commercial_sale_logo_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'commercial-sale-logos' AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
  AND public.map_has_explicit_capability(((storage.foldername(name))[1])::uuid, 'map.manage_sales')
  AND (owner_id = auth.uid()::text)
);
CREATE POLICY commercial_sale_logo_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'commercial-sale-logos' AND public.map_has_explicit_capability(((storage.foldername(name))[1])::uuid, 'map.view')
);
CREATE POLICY commercial_sale_logo_remove ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'commercial-sale-logos' AND owner_id = auth.uid()::text
  AND public.map_has_explicit_capability(((storage.foldername(name))[1])::uuid, 'map.manage_sales')
  AND NOT EXISTS (SELECT 1 FROM public.lot_sale_orders WHERE logo_path = name AND status = 'CONFIRMED')
);