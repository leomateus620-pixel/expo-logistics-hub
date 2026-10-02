
ALTER TABLE public.lot_contracts
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.lot_sale_orders(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'LOT';
ALTER TABLE public.lot_contracts ALTER COLUMN lot_id DROP NOT NULL;
DO $$ BEGIN
  ALTER TABLE public.lot_contracts ADD CONSTRAINT lot_contracts_scope_check CHECK (scope IN ('LOT','ORDER_ITEMS'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.lot_contracts ADD CONSTRAINT lot_contracts_target_check CHECK (
    (scope = 'LOT' AND lot_id IS NOT NULL) OR (scope = 'ORDER_ITEMS' AND order_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS lot_contracts_order_idx ON public.lot_contracts(order_id) WHERE order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.lot_contract_lots (
  contract_id uuid NOT NULL REFERENCES public.lot_contracts(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES public.commercial_lots(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  PRIMARY KEY (contract_id, lot_id)
);
GRANT SELECT ON public.lot_contract_lots TO authenticated;
GRANT ALL ON public.lot_contract_lots TO service_role;
ALTER TABLE public.lot_contract_lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lot_contract_lots_read ON public.lot_contract_lots;
CREATE POLICY lot_contract_lots_read ON public.lot_contract_lots FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_projects p ON p.id = l.project_id
    WHERE l.id = lot_contract_lots.lot_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_contracts')));
CREATE INDEX IF NOT EXISTS lot_contract_lots_lot_idx ON public.lot_contract_lots(lot_id);

-- Listagem paginada: um registro por pedido; vendas sem pedido como legado.
CREATE OR REPLACE FUNCTION public.list_commercial_sale_orders(
  p_project_id uuid, p_search text DEFAULT NULL, p_status text DEFAULT NULL,
  p_has_document boolean DEFAULT NULL, p_payment_method text DEFAULT NULL,
  p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_org uuid; v_docs boolean; v_q text; v_total integer; v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = p_project_id;
  IF v_org IS NULL OR NOT public.map_has_explicit_capability(v_org, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  v_docs := public.map_has_explicit_capability(v_org, 'map.manage_contracts');
  v_q := nullif(lower(trim(coalesce(p_search, ''))), '');
  WITH orders AS (
    SELECT o.id AS record_id, 'ORDER'::text AS kind, o.id AS order_id, NULL::uuid AS sale_id,
      'PV-' || upper(left(o.id::text, 8)) AS reference, o.created_at, o.status,
      o.buyer_name, o.buyer_trade_name, public.commercial_buyer_display_name(o.buyer_trade_name, o.buyer_name) AS display_name,
      o.negotiated_total, o.spaces_subtotal, o.fees_total, o.payment_method, o.installment_count,
      count(i.id)::int AS item_count,
      count(i.id) FILTER (WHERE i.contract_state <> 'CANCELLED')::int AS active_count,
      count(i.id) FILTER (WHERE i.contract_state = 'SIGNED')::int AS signed_count,
      count(i.id) FILTER (WHERE i.contract_state = 'PENDING_SIGNATURE')::int AS pending_count,
      count(i.id) FILTER (WHERE i.contract_state = 'CANCELLED')::int AS cancelled_count,
      count(i.id) FILTER (WHERE i.contract_state = 'LEGACY_UNVERIFIED')::int AS legacy_count,
      coalesce(sum(i.item_total) FILTER (WHERE i.contract_state <> 'CANCELLED'), 0) AS active_items_total,
      array_agg(i.lot_id ORDER BY i.public_identifier) FILTER (WHERE i.contract_state <> 'CANCELLED') AS lot_ids,
      string_agg(coalesce(i.public_identifier,'') || ' ' || coalesce(l.lot_number,'') || ' ' || coalesce(l.display_name,''), ' ') AS space_text
    FROM public.lot_sale_orders o
    JOIN public.lot_sale_order_items i ON i.order_id = o.id
    LEFT JOIN public.commercial_lots l ON l.id = i.lot_id
    WHERE o.project_id = p_project_id AND o.reverted_at IS NULL
    GROUP BY o.id
  ), legacy AS (
    SELECT s.id AS record_id, 'LEGACY'::text AS kind, NULL::uuid AS order_id, s.id AS sale_id,
      'LG-' || upper(left(s.id::text, 8)) AS reference, s.created_at, s.status,
      s.buyer_name, s.buyer_trade_name, public.commercial_buyer_display_name(s.buyer_trade_name, s.buyer_name) AS display_name,
      s.negotiated_value AS negotiated_total, NULL::numeric AS spaces_subtotal, NULL::numeric AS fees_total, NULL::text AS payment_method, NULL::int AS installment_count,
      1 AS item_count, 1 AS active_count, 0 AS signed_count, 0 AS pending_count, 0 AS cancelled_count, 1 AS legacy_count,
      s.negotiated_value AS active_items_total, ARRAY[s.lot_id] AS lot_ids,
      coalesce(l.public_identifier,'') || ' ' || coalesce(l.lot_number,'') || ' ' || coalesce(l.display_name,'') || ' ' || coalesce(s.contract_number,'') AS space_text
    FROM public.lot_sales s JOIN public.commercial_lots l ON l.id = s.lot_id
    WHERE l.project_id = p_project_id AND s.reverted_at IS NULL AND s.status <> 'REVERTED'
      AND NOT EXISTS (SELECT 1 FROM public.lot_sale_order_items oi WHERE oi.sale_id = s.id)
  ), base AS (SELECT * FROM orders UNION ALL SELECT * FROM legacy),
  enriched AS (
    SELECT b.*,
      (SELECT count(DISTINCT c.id)::int FROM public.lot_contracts c
        WHERE c.is_active AND EXISTS (SELECT 1 FROM public.lot_contract_versions v WHERE v.contract_id = c.id AND v.superseded_at IS NULL)
          AND ((c.scope = 'LOT' AND c.lot_id = ANY(b.lot_ids)) OR (c.scope = 'ORDER_ITEMS' AND c.order_id = b.order_id))) AS document_count,
      (SELECT string_agg(DISTINCT c.contract_number, ' ') FROM public.lot_contracts c
        WHERE c.is_active AND ((c.scope = 'LOT' AND c.lot_id = ANY(b.lot_ids)) OR (c.scope = 'ORDER_ITEMS' AND c.order_id = b.order_id))) AS contract_numbers,
      (SELECT count(*)::int FROM public.lot_sale_installments n WHERE n.order_id = b.order_id AND (n.paid_at IS NOT NULL OR n.payment_status = 'PAID')) AS paid_installments
    FROM base b
  ), filtered AS (
    SELECT * FROM enriched e
    WHERE (v_q IS NULL OR lower(concat_ws(' ', e.reference, e.buyer_name, e.buyer_trade_name, e.space_text, e.contract_numbers)) LIKE '%' || v_q || '%')
      AND (p_status IS NULL
        OR (p_status = 'PENDING' AND e.pending_count > 0)
        OR (p_status = 'SIGNED' AND e.signed_count > 0 AND e.pending_count = 0)
        OR (p_status = 'PARTIAL' AND e.signed_count > 0 AND e.pending_count > 0)
        OR (p_status = 'CANCELLED_PARTIAL' AND e.cancelled_count > 0)
        OR (p_status = 'LEGACY' AND (e.kind = 'LEGACY' OR e.legacy_count > 0)))
      AND (p_has_document IS NULL OR (p_has_document = (e.document_count > 0)))
      AND (p_payment_method IS NULL OR e.payment_method = p_payment_method)
      AND (p_from IS NULL OR e.created_at >= p_from::timestamptz)
      AND (p_to IS NULL OR e.created_at < (p_to + 1)::timestamptz)
  )
  SELECT (SELECT count(*) FROM filtered)::int,
    coalesce((SELECT jsonb_agg(to_jsonb(x) - 'space_text' - 'buyer_name_search' ORDER BY x.created_at DESC) FROM (
      SELECT f.*, CASE WHEN v_docs THEN f.document_count END AS documents_visible FROM filtered f
      ORDER BY f.created_at DESC, f.record_id LIMIT greatest(1, least(coalesce(p_limit,25), 100)) OFFSET greatest(coalesce(p_offset,0),0)) x), '[]'::jsonb)
  INTO v_total, v_rows;
  RETURN jsonb_build_object('total', v_total, 'rows', v_rows, 'documentsAccessible', v_docs);
END $$;

CREATE OR REPLACE FUNCTION public.get_commercial_sale_order_detail(p_order_id uuid DEFAULT NULL, p_sale_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_project uuid; v_org uuid; v_docs boolean; v_header jsonb; v_items jsonb; v_inst jsonb := '[]'::jsonb; v_lots uuid[]; v_contracts jsonb := NULL;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_order_id IS NOT NULL THEN
    SELECT project_id INTO v_project FROM public.lot_sale_orders WHERE id = p_order_id;
  ELSE
    SELECT l.project_id INTO v_project FROM public.lot_sales s JOIN public.commercial_lots l ON l.id = s.lot_id WHERE s.id = p_sale_id;
  END IF;
  IF v_project IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = v_project;
  IF NOT public.map_has_explicit_capability(v_org, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  v_docs := public.map_has_explicit_capability(v_org, 'map.manage_contracts');

  IF p_order_id IS NOT NULL THEN
    SELECT jsonb_build_object('kind','ORDER','orderId',o.id,'projectId',o.project_id,'reference','PV-'||upper(left(o.id::text,8)),
      'createdAt',o.created_at,'status',o.status,'buyerName',o.buyer_name,'buyerTradeName',o.buyer_trade_name,
      'documentNumber',o.document_number,'phone',o.phone,'email',o.email,'stage',o.stage,
      'negotiatedTotal',o.negotiated_total,'spacesSubtotal',o.spaces_subtotal,'feeAdmin',o.fee_admin,'feePpci',o.fee_ppci,
      'feeCleaning',o.fee_cleaning_license,'feesTotal',o.fees_total,'paymentMethod',o.payment_method,
      'installmentCount',o.installment_count,'firstDueDate',o.first_due_date,'officialAreaTotal',o.official_area_total)
    INTO v_header FROM public.lot_sale_orders o WHERE o.id = p_order_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('itemId',i.id,'lotId',i.lot_id,'entityId',l.entity_id,'publicIdentifier',i.public_identifier,
      'lotNumber',l.lot_number,'displayName',l.display_name,'areaSnapshot',i.official_area_snapshot,'itemTotal',i.item_total,
      'pricingStage',i.pricing_stage,'contractState',i.contract_state,'signedAt',i.signed_at,'cancelledAt',i.cancelled_at,'lotStatus',l.status)
      ORDER BY i.public_identifier), '[]'::jsonb), array_agg(i.lot_id)
    INTO v_items, v_lots FROM public.lot_sale_order_items i JOIN public.commercial_lots l ON l.id = i.lot_id WHERE i.order_id = p_order_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('number',n.installment_number,'dueDate',n.due_date,'amount',n.amount,
      'paymentStatus',n.payment_status,'paidAt',n.paid_at) ORDER BY n.installment_number), '[]'::jsonb)
    INTO v_inst FROM public.lot_sale_installments n WHERE n.order_id = p_order_id;
  ELSE
    SELECT jsonb_build_object('kind','LEGACY','saleId',s.id,'projectId',l.project_id,'reference','LG-'||upper(left(s.id::text,8)),
      'createdAt',s.created_at,'status',s.status,'buyerName',s.buyer_name,'buyerTradeName',s.buyer_trade_name,
      'documentNumber',s.document_number,'negotiatedTotal',s.negotiated_value,'paymentStatus',s.payment_status,
      'saleDate',s.sale_date,'contractNumber',s.contract_number),
      jsonb_build_array(jsonb_build_object('itemId',NULL,'lotId',l.id,'entityId',l.entity_id,'publicIdentifier',l.public_identifier,
      'lotNumber',l.lot_number,'displayName',l.display_name,'areaSnapshot',l.official_area_sqm,'itemTotal',s.negotiated_value,
      'contractState','LEGACY_UNVERIFIED','lotStatus',l.status)), ARRAY[l.id]
    INTO v_header, v_items, v_lots FROM public.lot_sales s JOIN public.commercial_lots l ON l.id = s.lot_id WHERE s.id = p_sale_id;
  END IF;

  IF v_docs THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',c.id,'scope',c.scope,'contractNumber',c.contract_number,
      'activeVersion',c.active_version,'createdAt',c.created_at,
      'lotIds', CASE WHEN c.scope='LOT' THEN jsonb_build_array(c.lot_id) ELSE (SELECT coalesce(jsonb_agg(cl.lot_id),'[]'::jsonb) FROM public.lot_contract_lots cl WHERE cl.contract_id=c.id) END,
      'versions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'storagePath',v.storage_path,'originalName',v.original_name,
        'mimeType',v.mime_type,'fileSize',v.file_size,'uploadedAt',v.uploaded_at,'supersededAt',v.superseded_at) ORDER BY v.version DESC),'[]'::jsonb)
        FROM public.lot_contract_versions v WHERE v.contract_id=c.id)) ORDER BY c.created_at), '[]'::jsonb)
    INTO v_contracts FROM public.lot_contracts c
    WHERE c.is_active AND ((c.scope='LOT' AND c.lot_id = ANY(v_lots)) OR (p_order_id IS NOT NULL AND c.scope='ORDER_ITEMS' AND c.order_id=p_order_id));
  END IF;
  RETURN jsonb_build_object('header',v_header,'items',v_items,'installments',v_inst,'contracts',v_contracts,'documentsAccessible',v_docs);
END $$;

CREATE OR REPLACE FUNCTION public.attach_order_contract(
  p_order_id uuid, p_lot_ids uuid[], p_storage_path text, p_original_name text, p_mime_type text, p_file_size bigint,
  p_contract_number text DEFAULT NULL, p_contract_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_order public.lot_sale_orders%ROWTYPE; v_org uuid; v_contract uuid; v_version int; v_version_id uuid; v_lot uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_lot_ids IS NULL OR array_length(p_lot_ids,1) IS NULL THEN RAISE EXCEPTION 'NO_ITEMS_SELECTED'; END IF;
  SELECT * INTO v_order FROM public.lot_sale_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = v_order.project_id;
  IF NOT public.map_has_explicit_capability(v_org, 'map.manage_contracts') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_lot_ids) x(lot_id) WHERE NOT EXISTS (
      SELECT 1 FROM public.lot_sale_order_items i WHERE i.order_id = p_order_id AND i.lot_id = x.lot_id AND i.contract_state <> 'CANCELLED')) THEN
    RAISE EXCEPTION 'ITEM_NOT_IN_ORDER'; END IF;
  IF p_storage_path NOT LIKE v_org::text || '/orders/' || p_order_id::text || '/%' THEN RAISE EXCEPTION 'INVALID_CONTRACT_STORAGE_PATH'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'map-contracts' AND name = p_storage_path) THEN RAISE EXCEPTION 'CONTRACT_OBJECT_NOT_FOUND'; END IF;
  IF p_mime_type NOT IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document') OR p_file_size <= 0 OR p_file_size > 15728640 THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_FILE'; END IF;

  IF p_contract_id IS NOT NULL THEN
    SELECT id, active_version INTO v_contract, v_version FROM public.lot_contracts
     WHERE id = p_contract_id AND scope = 'ORDER_ITEMS' AND order_id = p_order_id AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND'; END IF;
    v_version := v_version + 1;
    UPDATE public.lot_contract_versions SET superseded_at = now() WHERE contract_id = v_contract AND superseded_at IS NULL;
    UPDATE public.lot_contracts SET active_version = v_version, contract_number = coalesce(nullif(trim(p_contract_number),''), contract_number), updated_at = now() WHERE id = v_contract;
    DELETE FROM public.lot_contract_lots WHERE contract_id = v_contract AND lot_id <> ALL(p_lot_ids);
  ELSE
    INSERT INTO public.lot_contracts (lot_id, order_id, scope, contract_number, active_version, created_by)
    VALUES (NULL, p_order_id, 'ORDER_ITEMS', nullif(trim(p_contract_number),''), 1, auth.uid()) RETURNING id, active_version INTO v_contract, v_version;
  END IF;
  FOREACH v_lot IN ARRAY p_lot_ids LOOP
    INSERT INTO public.lot_contract_lots (contract_id, lot_id, created_by) VALUES (v_contract, v_lot, auth.uid()) ON CONFLICT DO NOTHING;
  END LOOP;
  INSERT INTO public.lot_contract_versions (contract_id, version, storage_path, original_name, mime_type, file_size, uploaded_by)
  VALUES (v_contract, v_version, p_storage_path, p_original_name, p_mime_type, p_file_size, auth.uid()) RETURNING id INTO v_version_id;
  INSERT INTO public.map_activity_logs (org_id, project_id, action, after_state, actor_user_id)
  VALUES (v_org, v_order.project_id, CASE WHEN v_version = 1 THEN 'ORDER_CONTRACT_UPLOADED' ELSE 'ORDER_CONTRACT_REPLACED' END,
    jsonb_build_object('order_id', p_order_id, 'contract_id', v_contract, 'version', v_version, 'lot_ids', to_jsonb(p_lot_ids)), auth.uid());
  RETURN jsonb_build_object('contractId', v_contract, 'version', v_version, 'versionId', v_version_id);
END $$;

REVOKE ALL ON FUNCTION public.list_commercial_sale_orders(uuid,text,text,boolean,text,date,date,integer,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_commercial_sale_order_detail(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.attach_order_contract(uuid,uuid[],text,text,text,bigint,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_commercial_sale_orders(uuid,text,text,boolean,text,date,date,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_commercial_sale_order_detail(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attach_order_contract(uuid,uuid[],text,text,text,bigint,text,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
