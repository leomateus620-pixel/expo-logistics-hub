BEGIN;

CREATE TABLE soja_store_private.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  location_id uuid NOT NULL,
  supplier_name text NOT NULL,
  location_name text NOT NULL,
  ordered_on date NOT NULL,
  expected_on date CHECK (expected_on >= ordered_on),
  reference text CHECK (length(reference) BETWEEN 1 AND 600),
  status text NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered', 'partially_received', 'received')),
  freight_cents bigint NOT NULL CHECK (freight_cents BETWEEN 0 AND 999999999999999),
  charges_cents bigint NOT NULL CHECK (charges_cents BETWEEN 0 AND 999999999999999),
  total_cents bigint NOT NULL CHECK (total_cents BETWEEN 0 AND 999999999999999),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, commission_id, id),
  UNIQUE (org_id, commission_id, id, location_id),
  FOREIGN KEY (org_id, commission_id, supplier_id)
    REFERENCES soja_store_private.suppliers(org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, location_id)
    REFERENCES soja_store_private.locations(org_id, commission_id, id)
);

CREATE INDEX soja_store_purchases_date ON soja_store_private.purchases (org_id, commission_id, ordered_on DESC, id);
CREATE INDEX soja_store_purchases_open_location ON soja_store_private.purchases (org_id, commission_id, location_id)
  WHERE status <> 'received';

CREATE TABLE soja_store_private.purchase_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  purchase_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  product_name text NOT NULL,
  variant_label text,
  sku text NOT NULL,
  unit text NOT NULL,
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(18,6) NOT NULL CHECK (unit_cost >= 0),
  line_total_cents bigint NOT NULL CHECK (line_total_cents BETWEEN 0 AND 999999999999999),
  UNIQUE (purchase_id, variant_id),
  UNIQUE (org_id, commission_id, purchase_id, id),
  UNIQUE (org_id, commission_id, purchase_id, id, variant_id),
  FOREIGN KEY (org_id, commission_id, purchase_id)
    REFERENCES soja_store_private.purchases(org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, variant_id)
    REFERENCES soja_store_private.variants(org_id, commission_id, id),
  CHECK (line_total_cents = round(quantity * unit_cost * 100))
);

CREATE TABLE soja_store_private.purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  purchase_id uuid NOT NULL,
  location_id uuid NOT NULL,
  received_on date NOT NULL,
  reference text CHECK (length(reference) BETWEEN 1 AND 600),
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, commission_id, purchase_id, id),
  FOREIGN KEY (org_id, commission_id, purchase_id, location_id)
    REFERENCES soja_store_private.purchases(org_id, commission_id, id, location_id)
);

CREATE TABLE soja_store_private.purchase_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  purchase_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  purchase_line_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  UNIQUE (receipt_id, purchase_line_id),
  UNIQUE (org_id, commission_id, purchase_id, receipt_id, id, variant_id, quantity),
  FOREIGN KEY (org_id, commission_id, purchase_id, receipt_id)
    REFERENCES soja_store_private.purchase_receipts(org_id, commission_id, purchase_id, id),
  FOREIGN KEY (org_id, commission_id, purchase_id, purchase_line_id, variant_id)
    REFERENCES soja_store_private.purchase_lines(org_id, commission_id, purchase_id, id, variant_id)
);

CREATE INDEX soja_store_receipt_lines_purchase
  ON soja_store_private.purchase_receipt_lines (org_id, commission_id, purchase_id, purchase_line_id);

CREATE TABLE soja_store_private.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  ownership text NOT NULL CHECK (ownership IN ('own', 'third_party')),
  owner_supplier_id uuid,
  destination text NOT NULL CHECK (destination = 'store'),
  movement_type text NOT NULL CHECK (movement_type = 'purchase_receipt'),
  purchase_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  receipt_line_id uuid NOT NULL UNIQUE,
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(18,6) NOT NULL CHECK (unit_cost >= 0),
  occurred_on date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  FOREIGN KEY (org_id, commission_id, variant_id)
    REFERENCES soja_store_private.variants(org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, purchase_id, location_id)
    REFERENCES soja_store_private.purchases(org_id, commission_id, id, location_id),
  FOREIGN KEY (org_id, commission_id, purchase_id, receipt_id, receipt_line_id, variant_id, quantity)
    REFERENCES soja_store_private.purchase_receipt_lines(org_id, commission_id, purchase_id, receipt_id, id, variant_id, quantity),
  FOREIGN KEY (org_id, commission_id, owner_supplier_id)
    REFERENCES soja_store_private.suppliers(org_id, commission_id, id),
  CHECK ((ownership = 'own' AND owner_supplier_id IS NULL) OR (ownership = 'third_party' AND owner_supplier_id IS NOT NULL)),
  CHECK (movement_type <> 'purchase_receipt' OR ownership = 'own')
);

CREATE INDEX soja_store_stock_movements_scope_date
  ON soja_store_private.stock_movements (org_id, commission_id, recorded_at DESC, id);
CREATE INDEX soja_store_stock_movements_scope_variant
  ON soja_store_private.stock_movements (org_id, commission_id, variant_id, location_id);
CREATE INDEX soja_store_stock_movements_scope_location
  ON soja_store_private.stock_movements (org_id, commission_id, location_id, variant_id);

ALTER TABLE soja_store_private.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.purchase_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.purchase_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.stock_movements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON soja_store_private.purchases, soja_store_private.purchase_lines,
  soja_store_private.purchase_receipts, soja_store_private.purchase_receipt_lines, soja_store_private.stock_movements
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION soja_store_private.reject_stock_history_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SOJA_STORE_STOCK_HISTORY_IMMUTABLE';
END;
$$;

CREATE TRIGGER soja_store_purchase_lines_immutable
  BEFORE UPDATE OR DELETE ON soja_store_private.purchase_lines
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.reject_stock_history_change();
CREATE TRIGGER soja_store_purchase_receipts_immutable
  BEFORE UPDATE OR DELETE ON soja_store_private.purchase_receipts
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.reject_stock_history_change();
CREATE TRIGGER soja_store_purchase_receipt_lines_immutable
  BEFORE UPDATE OR DELETE ON soja_store_private.purchase_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.reject_stock_history_change();
CREATE TRIGGER soja_store_stock_movements_immutable
  BEFORE UPDATE OR DELETE ON soja_store_private.stock_movements
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.reject_stock_history_change();

CREATE FUNCTION soja_store_private.protect_purchased_product_unit()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.unit IS DISTINCT FROM OLD.unit AND EXISTS (
    SELECT 1 FROM soja_store_private.purchase_lines line
    JOIN soja_store_private.variants v ON v.id = line.variant_id
    WHERE v.org_id = OLD.org_id AND v.commission_id = OLD.commission_id AND v.product_id = OLD.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_PRODUCT_UNIT_IN_USE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER soja_store_purchased_product_unit
  BEFORE UPDATE OF unit ON soja_store_private.products
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.protect_purchased_product_unit();

CREATE FUNCTION soja_store_private.protect_pending_purchase_location()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'archived' AND OLD.status <> 'archived' AND EXISTS (
    SELECT 1 FROM soja_store_private.purchases p
    WHERE p.org_id = OLD.org_id AND p.commission_id = OLD.commission_id
      AND p.location_id = OLD.id AND p.status <> 'received'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_LOCATION_HAS_PENDING_PURCHASES';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER soja_store_pending_purchase_location
  BEFORE UPDATE OF status ON soja_store_private.locations
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.protect_pending_purchase_location();

CREATE FUNCTION soja_store_private.assert_purchase_payload(_value jsonb, _keys text[])
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF jsonb_typeof(_value) IS DISTINCT FROM 'object' OR octet_length(_value::text) > 100000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_PURCHASE';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(_value) AS field(key) WHERE NOT (field.key = ANY(_keys))) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_PURCHASE';
  END IF;
END;
$$;

CREATE FUNCTION soja_store_private.purchase_date(_value text)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF _value IS NULL OR _value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_PURCHASE_DATE';
  END IF;
  RETURN _value::date;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_PURCHASE_DATE';
END;
$$;

CREATE FUNCTION soja_store_private.purchase_decimal(_value text, _allow_zero boolean)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF _value IS NULL OR _value !~ '^[0-9]{1,12}([.][0-9]{1,6})?$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_PURCHASE_AMOUNT';
  END IF;
  IF NOT _allow_zero AND _value::numeric = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_PURCHASE_AMOUNT';
  END IF;
  RETURN _value::numeric;
END;
$$;

CREATE FUNCTION soja_store_private.purchase_cents(_value text)
RETURNS bigint LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF _value IS NULL THEN RETURN 0; END IF;
  IF _value !~ '^[0-9]{1,15}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_PURCHASE_AMOUNT';
  END IF;
  RETURN _value::bigint;
END;
$$;

CREATE FUNCTION soja_store_private.purchase_summary(_purchase soja_store_private.purchases, _show_costs boolean)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', _purchase.id, 'supplier_id', _purchase.supplier_id, 'supplier_name', _purchase.supplier_name,
    'location_id', _purchase.location_id, 'location_name', _purchase.location_name,
    'ordered_on', _purchase.ordered_on, 'expected_on', _purchase.expected_on, 'reference', _purchase.reference,
    'status', _purchase.status,
    'freight_cents', CASE WHEN _show_costs THEN _purchase.freight_cents END,
    'charges_cents', CASE WHEN _show_costs THEN _purchase.charges_cents END,
    'total_cents', CASE WHEN _show_costs THEN _purchase.total_cents END, 'version', _purchase.version,
    'created_at', _purchase.created_at, 'updated_at', _purchase.updated_at
  );
$$;

CREATE FUNCTION soja_store_private.purchase_lines_received(_org_id uuid, _commission_id uuid, _purchase_id uuid)
RETURNS TABLE (purchase_line_id uuid, received_quantity numeric)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT line.purchase_line_id, sum(line.quantity)
  FROM soja_store_private.purchase_receipt_lines line
  WHERE line.org_id = _org_id AND line.commission_id = _commission_id AND line.purchase_id = _purchase_id
  GROUP BY line.purchase_line_id;
$$;

CREATE FUNCTION public.soja_store_create_purchase(
  _org_id uuid, _commission_id uuid, _request_id uuid, _payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_capability constant text := 'purchases.manage';
  v_command constant text := 'create_purchase';
  v_hash bytea;
  v_result jsonb;
  v_order soja_store_private.purchases;
  v_supplier soja_store_private.suppliers;
  v_location soja_store_private.locations;
  v_line jsonb;
  v_variant record;
  v_product soja_store_private.products;
  v_product_id uuid;
  v_variant_id uuid;
  v_quantity numeric;
  v_unit_cost numeric;
  v_line_total numeric;
  v_total numeric;
  v_ordered_on date;
  v_expected_on date;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, v_capability);
  PERFORM soja_store_private.assert_purchase_payload(
    _payload, ARRAY['supplier_id', 'location_id', 'ordered_on', 'expected_on', 'reference', 'freight_cents', 'charges_cents', 'lines']
  );
  v_hash := soja_store_private.request_hash(v_command, NULL, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  IF jsonb_typeof(_payload->'lines') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_PURCHASE_LINES_REQUIRED';
  END IF;
  IF jsonb_array_length(_payload->'lines') NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_PURCHASE_LINES_REQUIRED';
  END IF;

  v_ordered_on := soja_store_private.purchase_date(_payload->>'ordered_on');
  IF _payload->>'expected_on' IS NOT NULL THEN
    v_expected_on := soja_store_private.purchase_date(_payload->>'expected_on');
  END IF;
  IF v_ordered_on > (now() AT TIME ZONE 'America/Sao_Paulo')::date OR v_expected_on < v_ordered_on THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_PURCHASE_DATE';
  END IF;

  SELECT * INTO v_supplier FROM soja_store_private.suppliers
  WHERE org_id = _org_id AND commission_id = _commission_id AND id = (_payload->>'supplier_id')::uuid AND status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_PURCHASE_SUPPLIER_UNAVAILABLE'; END IF;

  SELECT * INTO v_location FROM soja_store_private.locations
  WHERE org_id = _org_id AND commission_id = _commission_id AND id = (_payload->>'location_id')::uuid AND status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_PURCHASE_LOCATION_UNAVAILABLE'; END IF;

  INSERT INTO soja_store_private.purchases (
    org_id, commission_id, supplier_id, location_id, supplier_name, location_name,
    ordered_on, expected_on, reference, freight_cents, charges_cents, total_cents, created_by, updated_by
  ) VALUES (
    _org_id, _commission_id, v_supplier.id, v_location.id, v_supplier.name, v_location.name,
    v_ordered_on, v_expected_on, nullif(btrim(_payload->>'reference'), ''),
    soja_store_private.purchase_cents(_payload->>'freight_cents'),
    soja_store_private.purchase_cents(_payload->>'charges_cents'), 0, auth.uid(), auth.uid()
  ) RETURNING * INTO v_order;

  v_total := v_order.freight_cents + v_order.charges_cents;
  FOR v_line IN SELECT value FROM jsonb_array_elements(_payload->'lines') LOOP
    PERFORM soja_store_private.assert_purchase_payload(v_line, ARRAY['variant_id', 'quantity', 'unit_cost']);
    v_variant_id := (v_line->>'variant_id')::uuid;
    v_quantity := soja_store_private.purchase_decimal(v_line->>'quantity', false);
    v_unit_cost := soja_store_private.purchase_decimal(v_line->>'unit_cost', true);
    v_line_total := round(v_quantity * v_unit_cost * 100);
    v_total := v_total + v_line_total;
    IF v_total > 999999999999999 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_PURCHASE_AMOUNT';
    END IF;

    SELECT product_id INTO v_product_id FROM soja_store_private.variants
    WHERE org_id = _org_id AND commission_id = _commission_id AND id = v_variant_id;
    -- Catalog commands lock the product first when changing the SKU or its unit.
    SELECT * INTO v_product FROM soja_store_private.products
    WHERE org_id = _org_id AND commission_id = _commission_id AND id = v_product_id AND status = 'active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_PURCHASE_VARIANT_UNAVAILABLE'; END IF;
    SELECT id, label, sku INTO v_variant FROM soja_store_private.variants
    WHERE org_id = _org_id AND commission_id = _commission_id AND id = v_variant_id AND active;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_PURCHASE_VARIANT_UNAVAILABLE'; END IF;

    INSERT INTO soja_store_private.purchase_lines (
      org_id, commission_id, purchase_id, variant_id, product_name, variant_label, sku, unit, quantity, unit_cost, line_total_cents
    ) VALUES (
      _org_id, _commission_id, v_order.id, v_variant.id, v_product.name, v_variant.label, v_variant.sku, v_product.unit,
      v_quantity, v_unit_cost, v_line_total::bigint
    ) ON CONFLICT (purchase_id, variant_id) DO NOTHING;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_PURCHASE_DUPLICATE_LINE'; END IF;
  END LOOP;

  UPDATE soja_store_private.purchases SET total_cents = v_total::bigint WHERE id = v_order.id
  RETURNING * INTO v_order;
  v_result := jsonb_build_object('id', v_order.id, 'version', v_order.version, 'status', v_order.status, 'total_cents', v_order.total_cents);
  RETURN soja_store_private.finish_request(
    _org_id, _commission_id, _request_id, v_command, v_capability, v_hash, v_order.id, NULL,
    soja_store_private.purchase_summary(v_order, true), v_result
  );
EXCEPTION WHEN invalid_text_representation OR check_violation OR string_data_right_truncation THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_PURCHASE';
END;
$$;

CREATE FUNCTION public.soja_store_receive_purchase(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_command constant text := 'receive_purchase';
  v_capabilities text[] := soja_store_private.capabilities(_org_id, _commission_id);
  v_capability text;
  v_hash bytea;
  v_result jsonb;
  v_order soja_store_private.purchases;
  v_previous jsonb;
  v_receipt soja_store_private.purchase_receipts;
  v_receipt_line_id uuid;
  v_received_on date;
  v_line jsonb;
  v_purchase_line soja_store_private.purchase_lines;
  v_quantity numeric;
  v_previously_received numeric;
  v_has_pending boolean;
BEGIN
  IF NOT ('purchases.view' = ANY(v_capabilities))
    OR NOT (v_capabilities && ARRAY['purchases.manage', 'purchases.receive']) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SOJA_STORE_FORBIDDEN';
  END IF;
  v_capability := CASE WHEN 'purchases.receive' = ANY(v_capabilities) THEN 'purchases.receive' ELSE 'purchases.manage' END;
  PERFORM soja_store_private.assert_purchase_payload(_payload, ARRAY['purchase_id', 'received_on', 'reference', 'lines']);
  v_hash := soja_store_private.request_hash(v_command, _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  IF jsonb_typeof(_payload->'lines') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_PURCHASE_LINES_REQUIRED';
  END IF;
  IF jsonb_array_length(_payload->'lines') NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_PURCHASE_LINES_REQUIRED';
  END IF;

  -- The order is the lock for all of its receipt lines. No stock effect happens before this lock.
  SELECT * INTO v_order FROM soja_store_private.purchases
  WHERE org_id = _org_id AND commission_id = _commission_id AND id = (_payload->>'purchase_id')::uuid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_PURCHASE_NOT_FOUND'; END IF;
  IF _expected_version IS DISTINCT FROM v_order.version THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
  END IF;
  IF v_order.status = 'received' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_PURCHASE_ALREADY_RECEIVED';
  END IF;
  PERFORM 1 FROM soja_store_private.locations
  WHERE org_id = _org_id AND commission_id = _commission_id AND id = v_order.location_id AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_PURCHASE_LOCATION_UNAVAILABLE'; END IF;
  v_previous := soja_store_private.purchase_summary(v_order, true);

  v_received_on := soja_store_private.purchase_date(_payload->>'received_on');
  IF v_received_on < v_order.ordered_on OR v_received_on > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_PURCHASE_DATE';
  END IF;

  INSERT INTO soja_store_private.purchase_receipts (
    org_id, commission_id, purchase_id, location_id, received_on, reference, recorded_by
  ) VALUES (
    _org_id, _commission_id, v_order.id, v_order.location_id, v_received_on, nullif(btrim(_payload->>'reference'), ''), auth.uid()
  ) RETURNING * INTO v_receipt;

  FOR v_line IN SELECT value FROM jsonb_array_elements(_payload->'lines') LOOP
    PERFORM soja_store_private.assert_purchase_payload(v_line, ARRAY['purchase_line_id', 'quantity']);
    v_quantity := soja_store_private.purchase_decimal(v_line->>'quantity', false);
    SELECT * INTO v_purchase_line FROM soja_store_private.purchase_lines
    WHERE org_id = _org_id AND commission_id = _commission_id AND purchase_id = v_order.id
      AND id = (v_line->>'purchase_line_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_PURCHASE_LINE_MISMATCH'; END IF;

    IF EXISTS (SELECT 1 FROM soja_store_private.purchase_receipt_lines WHERE receipt_id = v_receipt.id AND purchase_line_id = v_purchase_line.id) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_PURCHASE_DUPLICATE_LINE';
    END IF;
    SELECT coalesce(sum(quantity), 0) INTO v_previously_received FROM soja_store_private.purchase_receipt_lines
    WHERE org_id = _org_id AND commission_id = _commission_id AND purchase_id = v_order.id AND purchase_line_id = v_purchase_line.id;
    IF v_previously_received + v_quantity > v_purchase_line.quantity THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_PURCHASE_RECEIPT_EXCEEDS_PENDING';
    END IF;

    INSERT INTO soja_store_private.purchase_receipt_lines (
      org_id, commission_id, purchase_id, receipt_id, purchase_line_id, variant_id, quantity
    ) VALUES (
      _org_id, _commission_id, v_order.id, v_receipt.id, v_purchase_line.id, v_purchase_line.variant_id, v_quantity
    ) RETURNING id INTO v_receipt_line_id;

    INSERT INTO soja_store_private.stock_movements (
      org_id, commission_id, variant_id, location_id, ownership, destination, movement_type,
      purchase_id, receipt_id, receipt_line_id, quantity, unit_cost, occurred_on, recorded_by
    ) VALUES (
      _org_id, _commission_id, v_purchase_line.variant_id, v_order.location_id, 'own', 'store', 'purchase_receipt',
      v_order.id, v_receipt.id, v_receipt_line_id, v_quantity, v_purchase_line.unit_cost, v_received_on, auth.uid()
    );
  END LOOP;

  SELECT EXISTS (
    SELECT 1 FROM soja_store_private.purchase_lines p
    LEFT JOIN soja_store_private.purchase_lines_received(_org_id, _commission_id, v_order.id) r ON r.purchase_line_id = p.id
    WHERE p.purchase_id = v_order.id AND p.quantity > coalesce(r.received_quantity, 0)
  ) INTO v_has_pending;

  UPDATE soja_store_private.purchases
  SET status = CASE WHEN v_has_pending THEN 'partially_received' ELSE 'received' END, version = version + 1,
    updated_at = now(), updated_by = auth.uid()
  WHERE id = v_order.id RETURNING * INTO v_order;

  v_result := jsonb_build_object(
    'id', v_order.id, 'receipt_id', v_receipt.id, 'version', v_order.version, 'status', v_order.status, 'total_cents', NULL
  );
  RETURN soja_store_private.finish_request(
    _org_id, _commission_id, _request_id, v_command, v_capability, v_hash, v_order.id, v_previous,
    soja_store_private.purchase_summary(v_order, true) || jsonb_build_object('receipt_id', v_receipt.id), v_result
  );
EXCEPTION WHEN invalid_text_representation OR check_violation OR string_data_right_truncation THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_PURCHASE';
END;
$$;

CREATE FUNCTION soja_store_private.assert_purchase_page(_limit integer, _offset integer)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 OR _offset IS NULL OR _offset < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_FILTER';
  END IF;
END;
$$;

CREATE FUNCTION public.soja_store_purchases(
  _org_id uuid, _commission_id uuid, _status text DEFAULT NULL, _limit integer DEFAULT 30, _offset integer DEFAULT 0,
  _supplier_id uuid DEFAULT NULL, _location_id uuid DEFAULT NULL, _variant_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_capabilities text[] := soja_store_private.capabilities(_org_id, _commission_id);
  v_show_costs boolean := v_capabilities && ARRAY['purchases.manage', 'purchases.costs'];
BEGIN
  IF NOT ('purchases.view' = ANY(v_capabilities)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SOJA_STORE_FORBIDDEN';
  END IF;
  PERFORM soja_store_private.assert_purchase_page(_limit, _offset);
  IF _status IS NOT NULL AND _status NOT IN ('ordered', 'partially_received', 'received') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_FILTER';
  END IF;
  RETURN (
    WITH matched AS MATERIALIZED (
      SELECT p.* FROM soja_store_private.purchases p
      WHERE p.org_id = _org_id AND p.commission_id = _commission_id
        AND (_status IS NULL OR p.status = _status)
        AND (_supplier_id IS NULL OR p.supplier_id = _supplier_id)
        AND (_location_id IS NULL OR p.location_id = _location_id)
        AND (_variant_id IS NULL OR EXISTS (
          SELECT 1 FROM soja_store_private.purchase_lines l WHERE l.purchase_id = p.id AND l.variant_id = _variant_id
        ))
    ), page AS (
      SELECT * FROM matched ORDER BY ordered_on DESC, created_at DESC, id LIMIT _limit OFFSET _offset
    )
    SELECT jsonb_build_object('total', (SELECT count(*) FROM matched), 'items', coalesce((
      SELECT jsonb_agg(soja_store_private.purchase_summary(p, v_show_costs) ORDER BY p.ordered_on DESC, p.created_at DESC, p.id)
      FROM page pg JOIN soja_store_private.purchases p ON p.id = pg.id
    ), '[]'::jsonb))
  );
END;
$$;

CREATE FUNCTION public.soja_store_purchase(_org_id uuid, _commission_id uuid, _purchase_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_purchase soja_store_private.purchases;
  v_capabilities text[] := soja_store_private.capabilities(_org_id, _commission_id);
  v_show_costs boolean := v_capabilities && ARRAY['purchases.manage', 'purchases.costs'];
BEGIN
  IF NOT ('purchases.view' = ANY(v_capabilities)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SOJA_STORE_FORBIDDEN';
  END IF;
  SELECT * INTO v_purchase FROM soja_store_private.purchases
  WHERE org_id = _org_id AND commission_id = _commission_id AND id = _purchase_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_PURCHASE_NOT_FOUND'; END IF;
  RETURN soja_store_private.purchase_summary(v_purchase, v_show_costs) || jsonb_build_object(
    'lines', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'variant_id', p.variant_id, 'product_name', p.product_name, 'variant_label', p.variant_label,
        'sku', p.sku, 'unit', p.unit, 'quantity', p.quantity::text,
        'unit_cost', CASE WHEN v_show_costs THEN p.unit_cost::text END,
        'line_total_cents', CASE WHEN v_show_costs THEN p.line_total_cents END,
        'received_quantity', coalesce(r.received_quantity, 0)::text,
        'pending_quantity', (p.quantity - coalesce(r.received_quantity, 0))::text
      ) ORDER BY p.product_name, p.sku, p.id)
      FROM soja_store_private.purchase_lines p
      LEFT JOIN soja_store_private.purchase_lines_received(_org_id, _commission_id, _purchase_id) r ON r.purchase_line_id = p.id
      WHERE p.purchase_id = _purchase_id
    ),
    'receipts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'received_on', r.received_on, 'reference', r.reference, 'recorded_at', r.recorded_at,
        'lines', (
          SELECT jsonb_agg(jsonb_build_object('purchase_line_id', l.purchase_line_id, 'quantity', l.quantity::text) ORDER BY l.purchase_line_id)
          FROM soja_store_private.purchase_receipt_lines l
          WHERE l.org_id = r.org_id AND l.commission_id = r.commission_id AND l.purchase_id = r.purchase_id AND l.receipt_id = r.id
        )
      ) ORDER BY r.received_on DESC, r.recorded_at DESC, r.id)
      FROM soja_store_private.purchase_receipts r WHERE r.purchase_id = _purchase_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE FUNCTION public.soja_store_purchase_options(
  _org_id uuid, _commission_id uuid, _search text DEFAULT NULL, _limit integer DEFAULT 30,
  _supplier_id uuid DEFAULT NULL, _location_id uuid DEFAULT NULL, _variant_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_search text := lower(nullif(btrim(_search), ''));
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'purchases.manage');
  PERFORM soja_store_private.assert_purchase_page(_limit, 0);
  IF length(v_search) > 160 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_FILTER'; END IF;
  RETURN jsonb_build_object(
    'suppliers', coalesce((
      SELECT jsonb_agg(to_jsonb(s) ORDER BY lower(s.name), s.id)
      FROM (
        SELECT s.id, s.name FROM soja_store_private.suppliers s
        WHERE s.org_id = _org_id AND s.commission_id = _commission_id AND s.status = 'active'
          AND (s.id = _supplier_id OR v_search IS NULL OR strpos(lower(s.name), v_search) > 0)
        ORDER BY (s.id = _supplier_id) DESC NULLS LAST, lower(s.name), s.id LIMIT _limit
      ) s
    ), '[]'::jsonb),
    'locations', coalesce((
      SELECT jsonb_agg(to_jsonb(l) ORDER BY lower(l.name), l.id)
      FROM (
        SELECT l.id, l.name, l.kind FROM soja_store_private.locations l
        WHERE l.org_id = _org_id AND l.commission_id = _commission_id AND l.status = 'active'
          AND (l.id = _location_id OR v_search IS NULL OR strpos(lower(l.name), v_search) > 0)
        ORDER BY (l.id = _location_id) DESC NULLS LAST, lower(l.name), l.id LIMIT _limit
      ) l
    ), '[]'::jsonb),
    'variants', coalesce((
      SELECT jsonb_agg(to_jsonb(v) ORDER BY lower(v.product_name), v.sku, v.id)
      FROM (
        SELECT v.id, p.id AS product_id, p.name AS product_name, v.sku, v.label, p.unit
        FROM soja_store_private.variants v
        JOIN soja_store_private.products p ON p.org_id = v.org_id AND p.commission_id = v.commission_id AND p.id = v.product_id
        WHERE v.org_id = _org_id AND v.commission_id = _commission_id AND v.active AND p.status = 'active'
          AND (v.id = _variant_id OR v_search IS NULL OR strpos(lower(p.name), v_search) > 0
            OR strpos(lower(v.sku), v_search) > 0 OR strpos(lower(v.label), v_search) > 0)
        ORDER BY (v.id = _variant_id) DESC NULLS LAST, lower(p.name), v.sku, v.id LIMIT _limit
      ) v
    ), '[]'::jsonb)
  );
END;
$$;

CREATE FUNCTION public.soja_store_stock(
  _org_id uuid, _commission_id uuid, _location_id uuid DEFAULT NULL, _variant_id uuid DEFAULT NULL,
  _limit integer DEFAULT 30, _offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'stock.view');
  PERFORM soja_store_private.assert_purchase_page(_limit, _offset);
  RETURN (
    WITH balances AS MATERIALIZED (
      SELECT m.variant_id, m.location_id, m.ownership, m.owner_supplier_id, m.destination,
        sum(m.quantity)::text AS quantity, max(m.recorded_at) AS last_movement_at
      FROM soja_store_private.stock_movements m
      WHERE m.org_id = _org_id AND m.commission_id = _commission_id
        AND (_location_id IS NULL OR m.location_id = _location_id)
        AND (_variant_id IS NULL OR m.variant_id = _variant_id)
      GROUP BY m.variant_id, m.location_id, m.ownership, m.owner_supplier_id, m.destination
    ), page AS (
      SELECT b.*, p.id AS product_id, p.name AS product_name, v.sku, v.label AS variant_label, p.unit,
        l.name AS location_name, s.name AS owner_supplier_name
      FROM balances b
      JOIN soja_store_private.variants v ON v.id = b.variant_id
      JOIN soja_store_private.products p ON p.id = v.product_id
      JOIN soja_store_private.locations l ON l.id = b.location_id
      LEFT JOIN soja_store_private.suppliers s ON s.id = b.owner_supplier_id
      ORDER BY lower(p.name), v.sku, lower(l.name), b.variant_id, b.location_id, b.ownership, b.owner_supplier_id, b.destination
      LIMIT _limit OFFSET _offset
    )
    SELECT jsonb_build_object('total', (SELECT count(*) FROM balances), 'items', coalesce((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY lower(p.product_name), p.sku, lower(p.location_name),
        p.variant_id, p.location_id, p.ownership, p.owner_supplier_id, p.destination)
      FROM page p
    ), '[]'::jsonb))
  );
END;
$$;

CREATE FUNCTION public.soja_store_stock_movements(
  _org_id uuid, _commission_id uuid, _location_id uuid DEFAULT NULL, _variant_id uuid DEFAULT NULL,
  _limit integer DEFAULT 30, _offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'stock.view');
  PERFORM soja_store_private.assert_purchase_page(_limit, _offset);
  RETURN (
    WITH matched AS MATERIALIZED (
      SELECT m.id, m.variant_id, m.location_id, m.ownership, m.owner_supplier_id, m.destination,
        m.movement_type, m.purchase_id, m.receipt_id, m.receipt_line_id, m.quantity::text, m.occurred_on, m.recorded_at
      FROM soja_store_private.stock_movements m
      WHERE m.org_id = _org_id AND m.commission_id = _commission_id
        AND (_location_id IS NULL OR m.location_id = _location_id)
        AND (_variant_id IS NULL OR m.variant_id = _variant_id)
    ), page AS (
      SELECT m.id, m.variant_id, m.location_id, m.ownership, m.owner_supplier_id, m.destination,
        m.movement_type, m.purchase_id, m.receipt_id, m.quantity, m.occurred_on, m.recorded_at,
        v.product_id, p.product_name, p.sku, p.variant_label, p.unit,
        o.location_name, s.name AS owner_supplier_name
      FROM (SELECT * FROM matched ORDER BY occurred_on DESC, recorded_at DESC, id LIMIT _limit OFFSET _offset) m
      JOIN soja_store_private.purchases o ON o.id = m.purchase_id
      JOIN soja_store_private.purchase_receipt_lines r ON r.id = m.receipt_line_id
      JOIN soja_store_private.purchase_lines p ON p.id = r.purchase_line_id
      JOIN soja_store_private.variants v ON v.id = m.variant_id
      LEFT JOIN soja_store_private.suppliers s ON s.id = m.owner_supplier_id
    )
    SELECT jsonb_build_object('total', (SELECT count(*) FROM matched), 'items', coalesce((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.occurred_on DESC, p.recorded_at DESC, p.id) FROM page p
    ), '[]'::jsonb))
  );
END;
$$;

CREATE FUNCTION public.soja_store_stock_options(
  _org_id uuid, _commission_id uuid, _search text DEFAULT NULL, _limit integer DEFAULT 30,
  _location_id uuid DEFAULT NULL, _variant_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_search text := lower(nullif(btrim(_search), ''));
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'stock.view');
  PERFORM soja_store_private.assert_purchase_page(_limit, 0);
  IF length(v_search) > 160 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_FILTER'; END IF;
  RETURN jsonb_build_object(
    'locations', coalesce((
      SELECT jsonb_agg(to_jsonb(l) ORDER BY lower(l.name), l.id)
      FROM (
        SELECT l.id, l.name FROM soja_store_private.locations l
        WHERE l.org_id = _org_id AND l.commission_id = _commission_id
          AND EXISTS (
            SELECT 1 FROM soja_store_private.stock_movements m WHERE m.org_id = l.org_id AND m.commission_id = l.commission_id AND m.location_id = l.id
          )
          AND (l.id = _location_id OR v_search IS NULL OR strpos(lower(l.name), v_search) > 0)
        ORDER BY (l.id = _location_id) DESC NULLS LAST, lower(l.name), l.id LIMIT _limit
      ) l
    ), '[]'::jsonb),
    'variants', coalesce((
      SELECT jsonb_agg(to_jsonb(v) ORDER BY lower(v.product_name), v.sku, v.id)
      FROM (
        SELECT v.id, p.id AS product_id, p.name AS product_name, v.sku, v.label, p.unit
        FROM soja_store_private.variants v
        JOIN soja_store_private.products p ON p.org_id = v.org_id AND p.commission_id = v.commission_id AND p.id = v.product_id
        WHERE v.org_id = _org_id AND v.commission_id = _commission_id
          AND EXISTS (
            SELECT 1 FROM soja_store_private.stock_movements m WHERE m.org_id = v.org_id AND m.commission_id = v.commission_id AND m.variant_id = v.id
          )
          AND (v.id = _variant_id OR v_search IS NULL OR strpos(lower(p.name), v_search) > 0
            OR strpos(lower(v.sku), v_search) > 0 OR strpos(lower(v.label), v_search) > 0)
        ORDER BY (v.id = _variant_id) DESC NULLS LAST, lower(p.name), v.sku, v.id LIMIT _limit
      ) v
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA soja_store_private FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.soja_store_create_purchase(uuid, uuid, uuid, jsonb),
  public.soja_store_receive_purchase(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_purchases(uuid, uuid, text, integer, integer, uuid, uuid, uuid),
  public.soja_store_purchase(uuid, uuid, uuid), public.soja_store_purchase_options(uuid, uuid, text, integer, uuid, uuid, uuid),
  public.soja_store_stock(uuid, uuid, uuid, uuid, integer, integer),
  public.soja_store_stock_movements(uuid, uuid, uuid, uuid, integer, integer),
  public.soja_store_stock_options(uuid, uuid, text, integer, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soja_store_create_purchase(uuid, uuid, uuid, jsonb),
  public.soja_store_receive_purchase(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_purchases(uuid, uuid, text, integer, integer, uuid, uuid, uuid),
  public.soja_store_purchase(uuid, uuid, uuid), public.soja_store_purchase_options(uuid, uuid, text, integer, uuid, uuid, uuid),
  public.soja_store_stock(uuid, uuid, uuid, uuid, integer, integer),
  public.soja_store_stock_movements(uuid, uuid, uuid, uuid, integer, integer),
  public.soja_store_stock_options(uuid, uuid, text, integer, uuid, uuid)
  TO authenticated;

COMMIT;
