CREATE TABLE public.lot_contracts (id uuid, lot_id uuid, contract_number text, active_version integer, is_active boolean, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, order_id uuid, scope text);
CREATE TABLE public.lot_contract_versions (id uuid, contract_id uuid, version integer, storage_path text, original_name text, mime_type text, file_size bigint, uploaded_by uuid, uploaded_at timestamp with time zone, superseded_at timestamp with time zone);
CREATE TABLE public.lot_contract_lots (contract_id uuid, lot_id uuid, created_at timestamp with time zone, created_by uuid);
CREATE OR REPLACE FUNCTION public.commercial_buyer_display_name(p_trade text, p_legal text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ SELECT coalesce(nullif(btrim(p_trade), ''), nullif(btrim(p_legal), '')) $function$;

CREATE OR REPLACE FUNCTION public.get_commercial_sale_order_detail(p_order_id uuid DEFAULT NULL::uuid, p_sale_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
END $function$;
CREATE OR REPLACE FUNCTION public.list_commercial_sale_orders(p_project_id uuid, p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_has_document boolean DEFAULT NULL::boolean, p_payment_method text DEFAULT NULL::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
END $function$;
