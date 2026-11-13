BEGIN;

INSERT INTO soja_store_private.operational_capability_registry (capability)
VALUES ('stock.institutional') ON CONFLICT DO NOTHING;

CREATE TABLE soja_store_private.stock_institutional_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  destination_commission_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  delta numeric(18,6) GENERATED ALWAYS AS (-quantity) STORED,
  product_name text NOT NULL,
  variant_label text,
  sku text NOT NULL,
  unit text NOT NULL,
  location_name text NOT NULL,
  destination_commission_name text NOT NULL,
  recipient text NOT NULL CHECK (length(recipient) BETWEEN 2 AND 160),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 600),
  reference text CHECK (length(reference) BETWEEN 1 AND 600),
  occurred_on date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL,
  UNIQUE (org_id, commission_id, id, variant_id, location_id, delta),
  FOREIGN KEY (org_id, commission_id, variant_id) REFERENCES soja_store_private.variants(org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, location_id) REFERENCES soja_store_private.locations(org_id, commission_id, id),
  FOREIGN KEY (destination_commission_id, org_id) REFERENCES public.commissions(id, org_id)
);

ALTER TABLE soja_store_private.stock_institutional_issues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soja_store_private.stock_institutional_issues FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER soja_store_institutional_issues_immutable
  BEFORE UPDATE OR DELETE ON soja_store_private.stock_institutional_issues
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.reject_stock_history_change();

ALTER TABLE soja_store_private.stock_movements
  DROP CONSTRAINT soja_store_movement_type,
  ADD COLUMN institutional_issue_id uuid UNIQUE,
  ADD CONSTRAINT soja_store_movement_type CHECK (movement_type IN (
    'purchase_receipt','opening_count','inventory_adjustment','transfer_dispatch','transfer_receipt',
    'sale_fulfillment','sale_return','institutional_issue'
  )),
  ADD CONSTRAINT soja_store_movement_institutional_link CHECK (
    (movement_type = 'institutional_issue' AND institutional_issue_id IS NOT NULL AND ownership = 'own'
      AND owner_supplier_id IS NULL AND destination = 'store' AND unit_cost IS NULL)
    OR (movement_type <> 'institutional_issue' AND institutional_issue_id IS NULL)
  ),
  ADD CONSTRAINT soja_store_movement_institutional_origin
    FOREIGN KEY (org_id, commission_id, institutional_issue_id, variant_id, location_id, quantity)
    REFERENCES soja_store_private.stock_institutional_issues (org_id, commission_id, id, variant_id, location_id, delta);

CREATE FUNCTION public.soja_store_issue_destinations(
  _org_id uuid, _commission_id uuid, _search text DEFAULT NULL, _limit integer DEFAULT 30
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_search text := lower(nullif(btrim(_search), ''));
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'stock.manage');
  PERFORM soja_store_private.assert_purchase_page(_limit, 0);
  IF length(v_search) > 160 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_FILTER'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(c) ORDER BY lower(c.name), c.id)
    FROM (
      SELECT c.id, c.nome AS name
      FROM public.commissions c
      WHERE c.org_id = _org_id AND c.is_active AND c.unit_type = 'comissao'
        AND (v_search IS NULL OR strpos(lower(c.nome), v_search) > 0 OR strpos(lower(c.slug), v_search) > 0)
      ORDER BY lower(c.nome), c.id LIMIT _limit
    ) c
  ), '[]'::jsonb);
END;
$$;

CREATE FUNCTION public.soja_store_register_institutional_issue(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_capability constant text := 'stock.manage';
  v_command constant text := 'register_institutional_issue';
  v_hash bytea;
  v_result jsonb;
  v_position soja_store_private.stock_positions;
  v_issue soja_store_private.stock_institutional_issues;
  v_location_id uuid;
  v_variant_id uuid;
  v_destination_id uuid;
  v_destination_name text;
  v_location_name text;
  v_variant record;
  v_quantity numeric(18,6);
  v_recipient text;
  v_reason text;
  v_reference text;
  v_movement_id uuid;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, v_capability);
  PERFORM soja_store_private.assert_purchase_payload(_payload,
    ARRAY['variant_id', 'location_id', 'destination_commission_id', 'quantity', 'recipient', 'reason', 'reference']);
  v_hash := soja_store_private.request_hash(v_command, _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  v_variant_id := (_payload->>'variant_id')::uuid;
  v_location_id := (_payload->>'location_id')::uuid;
  v_destination_id := (_payload->>'destination_commission_id')::uuid;
  v_quantity := soja_store_private.purchase_decimal(_payload->>'quantity', false);
  v_recipient := nullif(btrim(_payload->>'recipient'), '');
  v_reason := nullif(btrim(_payload->>'reason'), '');
  v_reference := nullif(btrim(_payload->>'reference'), '');
  IF v_variant_id IS NULL OR v_location_id IS NULL OR v_destination_id IS NULL
    OR v_recipient IS NULL OR length(v_recipient) NOT BETWEEN 2 AND 160
    OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 3 AND 600
    OR jsonb_typeof(_payload->'recipient') IS DISTINCT FROM 'string'
    OR jsonb_typeof(_payload->'reason') IS DISTINCT FROM 'string'
    OR (_payload ? 'reference' AND jsonb_typeof(_payload->'reference') NOT IN ('string', 'null'))
    OR length(v_reference) > 600
    OR _expected_version IS NULL OR _expected_version < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_INSTITUTIONAL_ISSUE';
  END IF;

  SELECT c.nome INTO v_destination_name FROM public.commissions c
  WHERE c.org_id = _org_id AND c.id = v_destination_id AND c.is_active AND c.unit_type = 'comissao' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_ISSUE_DESTINATION_UNAVAILABLE'; END IF;

  SELECT l.name INTO v_location_name FROM soja_store_private.locations l
  WHERE l.org_id = _org_id AND l.commission_id = _commission_id AND l.id = v_location_id AND l.status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_STOCK_POSITION_UNAVAILABLE'; END IF;

  SELECT p.name, p.unit, v.label, v.sku INTO v_variant FROM soja_store_private.variants v
  JOIN soja_store_private.products p ON p.id = v.product_id AND p.org_id = v.org_id AND p.commission_id = v.commission_id
  WHERE v.org_id = _org_id AND v.commission_id = _commission_id AND v.id = v_variant_id AND v.active AND p.status = 'active'
  FOR SHARE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_STOCK_POSITION_UNAVAILABLE'; END IF;

  PERFORM soja_store_private.lock_stock_location(_org_id, _commission_id, v_location_id);
  SELECT * INTO v_position FROM soja_store_private.stock_positions s
  WHERE s.org_id = _org_id AND s.commission_id = _commission_id AND s.variant_id = v_variant_id
    AND s.location_id = v_location_id AND s.ownership = 'own' AND s.owner_supplier_id IS NULL AND s.destination = 'store'
  FOR UPDATE;

  IF _expected_version IS DISTINCT FROM coalesce(v_position.version, 0) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
  END IF;
  IF v_quantity > coalesce(v_position.quantity - v_position.reserved_quantity, 0) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STOCK_INSUFFICIENT';
  END IF;

  INSERT INTO soja_store_private.stock_institutional_issues
    (org_id, commission_id, destination_commission_id, variant_id, location_id, quantity,
      product_name, variant_label, sku, unit, location_name, destination_commission_name,
      recipient, reason, reference, occurred_on, recorded_by)
  VALUES (_org_id, _commission_id, v_destination_id, v_variant_id, v_location_id, v_quantity,
    v_variant.name, v_variant.label, v_variant.sku, v_variant.unit, v_location_name, v_destination_name,
    v_recipient, v_reason, v_reference, (now() AT TIME ZONE 'America/Sao_Paulo')::date, auth.uid())
  RETURNING * INTO v_issue;

  INSERT INTO soja_store_private.stock_movements
    (org_id, commission_id, variant_id, location_id, ownership, destination, movement_type, institutional_issue_id,
      quantity, occurred_on, recorded_at, recorded_by)
  VALUES (_org_id, _commission_id, v_variant_id, v_location_id, 'own', 'store', 'institutional_issue', v_issue.id,
    v_issue.delta, v_issue.occurred_on, v_issue.recorded_at, auth.uid())
  RETURNING id INTO v_movement_id;

  v_result := jsonb_build_object('id', v_issue.id, 'version', _expected_version + 1, 'status', 'recorded',
    'quantity', v_quantity::text, 'movement_id', v_movement_id);
  RETURN soja_store_private.finish_request(
    _org_id, _commission_id, _request_id, v_command, v_capability, v_hash, v_issue.id,
    jsonb_build_object('quantity', v_position.quantity::text, 'version', _expected_version),
    to_jsonb(v_issue) - ARRAY['org_id', 'commission_id'] || jsonb_build_object('movement_id', v_movement_id), v_result
  );
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_INSTITUTIONAL_ISSUE';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.soja_store_issue_destinations(uuid, uuid, text, integer),
  public.soja_store_register_institutional_issue(uuid, uuid, uuid, integer, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soja_store_issue_destinations(uuid, uuid, text, integer),
  public.soja_store_register_institutional_issue(uuid, uuid, uuid, integer, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.soja_store_stock_movements(
  _org_id uuid, _commission_id uuid, _location_id uuid DEFAULT NULL, _variant_id uuid DEFAULT NULL,
  _limit integer DEFAULT 30, _offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'stock.view');
  PERFORM soja_store_private.assert_purchase_page(_limit, _offset);
  RETURN (
    WITH matched AS MATERIALIZED (
      SELECT m.* FROM soja_store_private.stock_movements m
      WHERE m.org_id=_org_id AND m.commission_id=_commission_id
        AND (_location_id IS NULL OR m.location_id=_location_id)
        AND (_variant_id IS NULL OR m.variant_id=_variant_id)
    ), page AS (
      SELECT m.id,m.variant_id,m.location_id,m.ownership,m.owner_supplier_id,m.destination,m.movement_type,
        m.purchase_id,m.receipt_id,m.inventory_count_id,t.id AS transfer_id,se.sale_id,m.institutional_issue_id,m.quantity::text,m.occurred_on,m.recorded_at,
        v.product_id,coalesce(c.product_name,p.product_name,t.product_name,sl.product_name,i.product_name) AS product_name,
        coalesce(c.sku,p.sku,t.sku,sl.sku,i.sku) AS sku,
        CASE WHEN c.id IS NOT NULL THEN c.variant_label WHEN t.id IS NOT NULL THEN t.variant_label
          WHEN i.id IS NOT NULL THEN i.variant_label ELSE p.variant_label END AS variant_label,
        coalesce(c.unit,p.unit,t.unit,sl.unit,i.unit) AS unit,coalesce(c.location_name,o.location_name,
          CASE WHEN e.movement_type='transfer_dispatch' THEN t.origin_name ELSE t.destination_name END,cs.location_name,i.location_name) AS location_name,
        s.name AS owner_supplier_name,coalesce(c.reason,t.reason,i.reason) AS reason,coalesce(c.reference,e.reference,i.reference) AS reference,
        i.destination_commission_name, i.recipient,
        c.previous_quantity::text,c.counted_quantity::text
      FROM (SELECT * FROM matched ORDER BY occurred_on DESC,recorded_at DESC,id LIMIT _limit OFFSET _offset) m
      JOIN soja_store_private.variants v ON v.id=m.variant_id
      LEFT JOIN soja_store_private.purchases o ON o.id=m.purchase_id
      LEFT JOIN soja_store_private.purchase_receipt_lines r ON r.id=m.receipt_line_id
      LEFT JOIN soja_store_private.purchase_lines p ON p.id=r.purchase_line_id
      LEFT JOIN soja_store_private.inventory_counts c ON c.id=m.inventory_count_id
      LEFT JOIN soja_store_private.stock_transfer_events e ON e.id=m.transfer_event_id
      LEFT JOIN soja_store_private.stock_transfers t ON t.id=e.transfer_id
      LEFT JOIN soja_store_private.sale_stock_events se ON se.id=m.sale_event_id
      LEFT JOIN soja_store_private.sale_lines sl ON sl.id=se.line_id
      LEFT JOIN soja_store_private.sales sa ON sa.id=se.sale_id
      LEFT JOIN soja_store_private.cash_sessions cs ON cs.id=sa.session_id
      LEFT JOIN soja_store_private.stock_institutional_issues i ON i.id=m.institutional_issue_id
      LEFT JOIN soja_store_private.suppliers s ON s.id=m.owner_supplier_id
    )
    SELECT jsonb_build_object('total',(SELECT count(*) FROM matched),'items',coalesce((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.occurred_on DESC,p.recorded_at DESC,p.id) FROM page p
    ),'[]'::jsonb))
  );
END;
$$;

COMMIT;
