BEGIN;

CREATE TABLE soja_store_private.product_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  product_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  supplier_sku text CHECK (length(supplier_sku) BETWEEN 1 AND 100),
  reference text NOT NULL CHECK (length(reference) BETWEEN 4 AND 600),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  recorded_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, commission_id, product_id, supplier_id),
  FOREIGN KEY (org_id, commission_id, product_id) REFERENCES soja_store_private.products(org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, supplier_id) REFERENCES soja_store_private.suppliers(org_id, commission_id, id)
);

CREATE TABLE soja_store_private.purchase_needs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  description text NOT NULL CHECK (length(description) BETWEEN 2 AND 160),
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL CHECK (length(unit) BETWEEN 1 AND 24),
  notes text CHECK (length(notes) BETWEEN 1 AND 600),
  selected_quote_id uuid,
  decision_reference text CHECK (length(decision_reference) BETWEEN 4 AND 600),
  purchase_id uuid,
  order_reference text CHECK (length(order_reference) BETWEEN 4 AND 600),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, commission_id, id),
  UNIQUE (org_id, commission_id, purchase_id),
  FOREIGN KEY (org_id, commission_id) REFERENCES soja_store_private.scopes(org_id, commission_id),
  FOREIGN KEY (org_id, commission_id, purchase_id) REFERENCES soja_store_private.purchases(org_id, commission_id, id),
  CHECK ((selected_quote_id IS NULL) = (decision_reference IS NULL)),
  CHECK ((purchase_id IS NULL) = (order_reference IS NULL)),
  CHECK (purchase_id IS NULL OR selected_quote_id IS NOT NULL)
);
CREATE INDEX soja_store_purchase_needs_date ON soja_store_private.purchase_needs (org_id, commission_id, created_at DESC, id);

CREATE TABLE soja_store_private.purchase_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  need_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  supplier_name text NOT NULL,
  quoted_on date NOT NULL,
  valid_until date CHECK (valid_until >= quoted_on),
  items_cents bigint NOT NULL CHECK (items_cents >= 0),
  freight_cents bigint NOT NULL CHECK (freight_cents >= 0),
  total_cents bigint NOT NULL CHECK (total_cents BETWEEN 0 AND 999999999999999 AND total_cents = items_cents + freight_cents),
  lead_days integer NOT NULL CHECK (lead_days BETWEEN 0 AND 3650),
  minimum_quantity numeric(18,6) CHECK (minimum_quantity > 0),
  terms text NOT NULL CHECK (length(terms) BETWEEN 2 AND 600),
  reference text NOT NULL CHECK (length(reference) BETWEEN 4 AND 600),
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, commission_id, need_id, id),
  UNIQUE (need_id, supplier_id, reference),
  FOREIGN KEY (org_id, commission_id, need_id) REFERENCES soja_store_private.purchase_needs(org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, supplier_id) REFERENCES soja_store_private.suppliers(org_id, commission_id, id)
);
ALTER TABLE soja_store_private.purchase_needs ADD CONSTRAINT soja_store_purchase_need_quote_fk
  FOREIGN KEY (org_id, commission_id, id, selected_quote_id)
  REFERENCES soja_store_private.purchase_quotes(org_id, commission_id, need_id, id);
ALTER TABLE soja_store_private.product_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.purchase_needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.purchase_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soja_store_private.product_suppliers, soja_store_private.purchase_needs, soja_store_private.purchase_quotes
FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER soja_store_purchase_quote_history_immutable BEFORE UPDATE OR DELETE ON soja_store_private.purchase_quotes
FOR EACH ROW EXECUTE FUNCTION soja_store_private.reject_stock_history_change();

CREATE FUNCTION public.soja_store_product_suppliers(_org_id uuid, _commission_id uuid, _product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'catalog.view');
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'suppliers.view');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', l.id, 'supplier_id', l.supplier_id, 'supplier_name', s.name, 'supplier_status', s.status,
      'supplier_sku', l.supplier_sku, 'reference', l.reference, 'active', l.active, 'version', l.version
    ) ORDER BY l.active DESC, lower(s.name), l.id)
    FROM soja_store_private.product_suppliers l
    JOIN soja_store_private.suppliers s ON s.org_id = l.org_id AND s.commission_id = l.commission_id AND s.id = l.supplier_id
    WHERE l.org_id = _org_id AND l.commission_id = _commission_id AND l.product_id = _product_id
  ), '[]'::jsonb);
END;
$$;

CREATE FUNCTION public.soja_store_save_product_supplier(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hash bytea;
  v_result jsonb;
  v_link soja_store_private.product_suppliers;
  v_previous jsonb;
  v_product uuid;
  v_supplier uuid;
  v_active boolean;
  v_sku text;
  v_reference text;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'catalog.manage');
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'suppliers.view');
  PERFORM soja_store_private.assert_purchase_payload(_payload, ARRAY['product_id','supplier_id','supplier_sku','reference','active']);
  v_hash := soja_store_private.request_hash('save_product_supplier', _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  v_product := (_payload->>'product_id')::uuid;
  v_supplier := (_payload->>'supplier_id')::uuid;
  v_active := (_payload->>'active')::boolean;
  v_sku := nullif(btrim(_payload->>'supplier_sku'), '');
  v_reference := btrim(_payload->>'reference');

  IF NOT EXISTS (
    SELECT 1 FROM soja_store_private.products p WHERE p.org_id = _org_id AND p.commission_id = _commission_id AND p.id = v_product
  ) OR NOT EXISTS (
    SELECT 1 FROM soja_store_private.suppliers s
    WHERE s.org_id = _org_id AND s.commission_id = _commission_id AND s.id = v_supplier AND (s.status = 'active' OR NOT v_active)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_SOURCING_UNAVAILABLE';
  END IF;

  SELECT * INTO v_link FROM soja_store_private.product_suppliers
  WHERE org_id = _org_id AND commission_id = _commission_id AND product_id = v_product AND supplier_id = v_supplier FOR UPDATE;
  IF NOT FOUND THEN
    IF _expected_version IS NOT NULL OR NOT v_active THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
    END IF;
    INSERT INTO soja_store_private.product_suppliers (org_id, commission_id, product_id, supplier_id, supplier_sku, reference, active, recorded_by)
    VALUES (_org_id, _commission_id, v_product, v_supplier, v_sku, v_reference, true, auth.uid()) RETURNING * INTO v_link;
  ELSE
    IF _expected_version IS DISTINCT FROM v_link.version THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
    END IF;
    v_previous := to_jsonb(v_link);
    UPDATE soja_store_private.product_suppliers SET supplier_sku = v_sku, reference = v_reference, active = v_active,
      version = version + 1, updated_at = now(), recorded_by = auth.uid()
    WHERE id = v_link.id RETURNING * INTO v_link;
  END IF;
  v_result := jsonb_build_object('id', v_link.id, 'version', v_link.version, 'status', CASE WHEN v_link.active THEN 'active' ELSE 'archived' END);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, 'save_product_supplier', 'catalog.manage',
    v_hash, v_link.id, v_previous, to_jsonb(v_link), v_result);
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
  WHEN check_violation OR not_null_violation OR invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_SOURCING_INVALID_LINK';
END;
$$;

CREATE FUNCTION public.soja_store_purchase_needs(
  _org_id uuid, _commission_id uuid, _limit integer DEFAULT 15, _offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'purchases.view');
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'purchases.costs');
  PERFORM soja_store_private.assert_purchase_page(_limit, _offset);
  RETURN (
    WITH page AS (
      SELECT n.* FROM soja_store_private.purchase_needs n
      WHERE n.org_id = _org_id AND n.commission_id = _commission_id
      ORDER BY n.created_at DESC, n.id LIMIT _limit OFFSET _offset
    )
    SELECT jsonb_build_object('total', (
      SELECT count(*) FROM soja_store_private.purchase_needs WHERE org_id = _org_id AND commission_id = _commission_id
    ), 'items', coalesce((
      SELECT jsonb_agg((to_jsonb(n) - ARRAY['org_id','commission_id','recorded_by','quantity']) || jsonb_build_object(
        'quantity', n.quantity::text, 'quotes', coalesce((
          SELECT jsonb_agg((to_jsonb(q) - ARRAY['org_id','commission_id','need_id','recorded_by','minimum_quantity']) ||
            jsonb_build_object('minimum_quantity', q.minimum_quantity::text) ORDER BY q.total_cents, q.lead_days, q.created_at, q.id)
          FROM soja_store_private.purchase_quotes q
          WHERE q.org_id = n.org_id AND q.commission_id = n.commission_id AND q.need_id = n.id
        ), '[]'::jsonb)
      ) ORDER BY n.created_at DESC, n.id) FROM page n
    ), '[]'::jsonb))
  );
END;
$$;

CREATE FUNCTION public.soja_store_purchase_need_orders(
  _org_id uuid, _commission_id uuid, _need_id uuid, _search text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_search text := lower(nullif(btrim(_search), ''));
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'purchases.manage');
  IF length(v_search) > 120 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_FILTER'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.ordered_on DESC, x.id) FROM (
      SELECT p.id, p.supplier_name, p.ordered_on, p.reference, p.total_cents
      FROM soja_store_private.purchase_needs n
      JOIN soja_store_private.purchase_quotes q ON q.org_id = n.org_id AND q.commission_id = n.commission_id AND q.id = n.selected_quote_id
      JOIN soja_store_private.purchases p ON p.org_id = n.org_id AND p.commission_id = n.commission_id AND p.supplier_id = q.supplier_id
      WHERE n.org_id = _org_id AND n.commission_id = _commission_id AND n.id = _need_id AND n.purchase_id IS NULL
        AND p.ordered_on >= q.quoted_on AND (q.valid_until IS NULL OR p.ordered_on <= q.valid_until)
        AND (v_search IS NULL OR strpos(lower(p.reference), v_search) > 0 OR strpos(p.id::text, v_search) > 0)
        AND NOT EXISTS (SELECT 1 FROM soja_store_private.purchase_needs linked WHERE linked.org_id = p.org_id
          AND linked.commission_id = p.commission_id AND linked.purchase_id = p.id)
      ORDER BY p.ordered_on DESC, p.id LIMIT 25
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE FUNCTION public.soja_store_write_purchase_need(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_command constant text := 'write_purchase_need';
  v_capability constant text := 'purchases.manage';
  v_hash bytea;
  v_result jsonb;
  v_previous jsonb;
  v_need soja_store_private.purchase_needs;
  v_quote soja_store_private.purchase_quotes;
  v_supplier soja_store_private.suppliers;
  v_action text := _payload->>'action';
  v_items bigint;
  v_freight bigint;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_date date;
  v_valid_until date;
  v_order uuid;
  v_evidence text := btrim(_payload->>'reference');
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, v_capability);
  IF v_action IS NULL OR v_action NOT IN ('create','quote','select','link_order') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_SOURCING_INVALID_NEED';
  END IF;
  PERFORM soja_store_private.assert_purchase_payload(_payload,
    CASE v_action
      WHEN 'create' THEN ARRAY['action','description','quantity','unit','notes']
      WHEN 'quote' THEN ARRAY['action','need_id','supplier_id','quoted_on','valid_until','items_cents','freight_cents','lead_days','minimum_quantity','terms','reference']
      WHEN 'select' THEN ARRAY['action','need_id','quote_id','reference']
      ELSE ARRAY['action','need_id','purchase_id','reference'] END
  );
  v_hash := soja_store_private.request_hash(v_command, _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  IF v_action = 'create' THEN
    IF _expected_version IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION'; END IF;
    INSERT INTO soja_store_private.purchase_needs (org_id, commission_id, description, quantity, unit, notes, recorded_by)
    VALUES (_org_id, _commission_id, btrim(_payload->>'description'),
      soja_store_private.purchase_decimal(_payload->>'quantity', false), btrim(_payload->>'unit'),
      nullif(btrim(_payload->>'notes'), ''), auth.uid()) RETURNING * INTO v_need;
  ELSE
    SELECT * INTO v_need FROM soja_store_private.purchase_needs
    WHERE org_id = _org_id AND commission_id = _commission_id AND id = (_payload->>'need_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_SOURCING_UNAVAILABLE'; END IF;
    IF _expected_version IS DISTINCT FROM v_need.version THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
    END IF;
    IF v_need.purchase_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_SOURCING_ORDER_LINKED';
    END IF;
    v_previous := to_jsonb(v_need);

    CASE v_action
    WHEN 'quote' THEN
      IF (SELECT count(*) FROM soja_store_private.purchase_quotes q WHERE q.need_id = v_need.id) >= 30 THEN
        RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_SOURCING_QUOTE_LIMIT';
      END IF;
      SELECT * INTO v_supplier FROM soja_store_private.suppliers
      WHERE org_id = _org_id AND commission_id = _commission_id AND id = (_payload->>'supplier_id')::uuid AND status = 'active' FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_SOURCING_UNAVAILABLE'; END IF;
      IF _payload->>'items_cents' IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_SOURCING_INVALID_QUOTE'; END IF;
      v_items := soja_store_private.purchase_cents(_payload->>'items_cents');
      v_freight := soja_store_private.purchase_cents(_payload->>'freight_cents');
      v_date := soja_store_private.purchase_date(_payload->>'quoted_on');
      IF v_date > v_today THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_SOURCING_INVALID_QUOTE'; END IF;
      IF nullif(_payload->>'valid_until', '') IS NOT NULL THEN
        v_valid_until := soja_store_private.purchase_date(_payload->>'valid_until');
      END IF;
      INSERT INTO soja_store_private.purchase_quotes (
        org_id, commission_id, need_id, supplier_id, supplier_name, quoted_on, valid_until,
        items_cents, freight_cents, total_cents, lead_days, minimum_quantity, terms, reference, recorded_by
      ) VALUES (_org_id, _commission_id, v_need.id, v_supplier.id, v_supplier.name, v_date, v_valid_until,
        v_items, v_freight, v_items + v_freight, (_payload->>'lead_days')::integer,
        CASE WHEN nullif(_payload->>'minimum_quantity', '') IS NOT NULL
          THEN soja_store_private.purchase_decimal(_payload->>'minimum_quantity', false) END,
        btrim(_payload->>'terms'), v_evidence, auth.uid()) RETURNING * INTO v_quote;
    WHEN 'select' THEN
      SELECT * INTO v_quote FROM soja_store_private.purchase_quotes
      WHERE org_id = _org_id AND commission_id = _commission_id AND need_id = v_need.id AND id = (_payload->>'quote_id')::uuid;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_SOURCING_UNAVAILABLE'; END IF;
      IF v_quote.valid_until < v_today OR v_quote.minimum_quantity > v_need.quantity OR NOT EXISTS (
        SELECT 1 FROM soja_store_private.suppliers s WHERE s.org_id = _org_id
          AND s.commission_id = _commission_id AND s.id = v_quote.supplier_id AND s.status = 'active'
      ) THEN
        RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_SOURCING_QUOTE_INELIGIBLE';
      END IF;
      v_need.selected_quote_id := v_quote.id;
      v_need.decision_reference := v_evidence;
    ELSE
      SELECT * INTO v_quote FROM soja_store_private.purchase_quotes
      WHERE org_id = _org_id AND commission_id = _commission_id AND need_id = v_need.id AND id = v_need.selected_quote_id;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_SOURCING_SELECT_FIRST'; END IF;
      SELECT p.id INTO v_order FROM soja_store_private.purchases p WHERE p.org_id = _org_id AND p.commission_id = _commission_id
        AND p.id = (_payload->>'purchase_id')::uuid AND p.supplier_id = v_quote.supplier_id AND p.ordered_on >= v_quote.quoted_on
        AND (v_quote.valid_until IS NULL OR p.ordered_on <= v_quote.valid_until);
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_SOURCING_UNAVAILABLE'; END IF;
      v_need.purchase_id := v_order;
      v_need.order_reference := v_evidence;
    END CASE;

    UPDATE soja_store_private.purchase_needs SET selected_quote_id = v_need.selected_quote_id, decision_reference = v_need.decision_reference,
      purchase_id = v_need.purchase_id, order_reference = v_need.order_reference, version = version + 1
    WHERE id = v_need.id RETURNING * INTO v_need;
  END IF;

  v_result := jsonb_build_object('id', v_need.id, 'version', v_need.version,
    'status', CASE WHEN v_need.purchase_id IS NOT NULL THEN 'ordered' WHEN v_need.selected_quote_id IS NOT NULL THEN 'selected' ELSE 'quoting' END);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, v_command, v_capability, v_hash,
    v_need.id, v_previous, to_jsonb(v_need) || jsonb_build_object('quote_id', v_quote.id, 'action', v_action), v_result);
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_SOURCING_DUPLICATE';
  WHEN check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_SOURCING_INVALID_NEED';
END;
$$;

REVOKE ALL ON FUNCTION public.soja_store_product_suppliers(uuid, uuid, uuid),
  public.soja_store_save_product_supplier(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_purchase_needs(uuid, uuid, integer, integer),
  public.soja_store_purchase_need_orders(uuid, uuid, uuid, text),
  public.soja_store_write_purchase_need(uuid, uuid, uuid, integer, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soja_store_product_suppliers(uuid, uuid, uuid),
  public.soja_store_save_product_supplier(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_purchase_needs(uuid, uuid, integer, integer),
  public.soja_store_purchase_need_orders(uuid, uuid, uuid, text),
  public.soja_store_write_purchase_need(uuid, uuid, uuid, integer, jsonb)
TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
