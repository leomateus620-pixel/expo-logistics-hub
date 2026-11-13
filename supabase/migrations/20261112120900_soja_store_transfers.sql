BEGIN;

INSERT INTO soja_store_private.operational_capability_registry (capability)
VALUES ('stock.transfers') ON CONFLICT DO NOTHING;

CREATE TABLE soja_store_private.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  origin_id uuid NOT NULL,
  destination_id uuid NOT NULL,
  origin_name text NOT NULL,
  destination_name text NOT NULL,
  variant_id uuid NOT NULL,
  product_name text NOT NULL,
  variant_label text,
  sku text NOT NULL,
  unit text NOT NULL,
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  received_quantity numeric(18,6) NOT NULL DEFAULT 0 CHECK (received_quantity BETWEEN 0 AND quantity),
  status text NOT NULL DEFAULT 'requested',
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 600),
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  CHECK (origin_id <> destination_id),
  CHECK ((status IN ('requested', 'cancelled', 'in_transit') AND received_quantity = 0)
    OR (status = 'partially_received' AND received_quantity > 0 AND received_quantity < quantity)
    OR (status = 'received' AND received_quantity = quantity)),
  UNIQUE (org_id, commission_id, id, variant_id),
  FOREIGN KEY (org_id, commission_id, origin_id) REFERENCES soja_store_private.locations(org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, destination_id) REFERENCES soja_store_private.locations(org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, variant_id) REFERENCES soja_store_private.variants(org_id, commission_id, id)
);

CREATE INDEX soja_store_transfers_recent ON soja_store_private.stock_transfers (org_id, commission_id, updated_at DESC, id);
CREATE INDEX soja_store_transfers_origin ON soja_store_private.stock_transfers (org_id, commission_id, origin_id)
  WHERE status IN ('requested', 'in_transit', 'partially_received');
CREATE INDEX soja_store_transfers_destination ON soja_store_private.stock_transfers (org_id, commission_id, destination_id)
  WHERE status IN ('requested', 'in_transit', 'partially_received');

CREATE TABLE soja_store_private.stock_transfer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  transfer_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  movement_type text NOT NULL,
  quantity numeric(18,6) NOT NULL,
  reference text CHECK (length(reference) BETWEEN 1 AND 600),
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((movement_type = 'transfer_dispatch' AND quantity < 0) OR (movement_type = 'transfer_receipt' AND quantity > 0)),
  UNIQUE (org_id, commission_id, id, variant_id, location_id, movement_type, quantity),
  FOREIGN KEY (org_id, commission_id, transfer_id, variant_id)
    REFERENCES soja_store_private.stock_transfers(org_id, commission_id, id, variant_id),
  FOREIGN KEY (org_id, commission_id, location_id) REFERENCES soja_store_private.locations(org_id, commission_id, id)
);

CREATE INDEX soja_store_transfer_events_transfer ON soja_store_private.stock_transfer_events
  (org_id, commission_id, transfer_id, recorded_at DESC, id);
CREATE UNIQUE INDEX soja_store_transfer_dispatch_once ON soja_store_private.stock_transfer_events (transfer_id)
  WHERE movement_type = 'transfer_dispatch';

ALTER TABLE soja_store_private.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.stock_transfer_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soja_store_private.stock_transfers, soja_store_private.stock_transfer_events
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER soja_store_transfer_events_immutable
  BEFORE UPDATE OR DELETE ON soja_store_private.stock_transfer_events
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.reject_stock_history_change();

ALTER TABLE soja_store_private.stock_movements
  DROP CONSTRAINT soja_store_movement_origin,
  ADD COLUMN transfer_event_id uuid UNIQUE,
  ADD CONSTRAINT soja_store_movement_type CHECK (
    movement_type IN ('purchase_receipt', 'opening_count', 'inventory_adjustment', 'transfer_dispatch', 'transfer_receipt')
  ),
  ADD CONSTRAINT soja_store_movement_purchase_link CHECK (
    (movement_type = 'purchase_receipt' AND purchase_id IS NOT NULL AND receipt_id IS NOT NULL
      AND receipt_line_id IS NOT NULL AND quantity > 0 AND unit_cost IS NOT NULL)
    OR (movement_type <> 'purchase_receipt' AND purchase_id IS NULL AND receipt_id IS NULL AND receipt_line_id IS NULL)
  ),
  ADD CONSTRAINT soja_store_movement_inventory_link CHECK (
    (movement_type IN ('opening_count', 'inventory_adjustment') AND inventory_count_id IS NOT NULL
      AND ownership = 'own' AND owner_supplier_id IS NULL AND destination = 'store' AND unit_cost IS NULL)
    OR (movement_type NOT IN ('opening_count', 'inventory_adjustment') AND inventory_count_id IS NULL)
  ),
  ADD CONSTRAINT soja_store_movement_transfer_link CHECK (
    (movement_type IN ('transfer_dispatch', 'transfer_receipt') AND transfer_event_id IS NOT NULL
      AND ownership = 'own' AND owner_supplier_id IS NULL AND destination = 'store' AND unit_cost IS NULL)
    OR (movement_type NOT IN ('transfer_dispatch', 'transfer_receipt') AND transfer_event_id IS NULL)
  ),
  ADD CONSTRAINT soja_store_movement_transfer_origin
    FOREIGN KEY (org_id, commission_id, transfer_event_id, variant_id, location_id, movement_type, quantity)
    REFERENCES soja_store_private.stock_transfer_events (org_id, commission_id, id, variant_id, location_id, movement_type, quantity);

CREATE FUNCTION soja_store_private.protect_transfer_location()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'archived' AND OLD.status <> 'archived' AND EXISTS (
    SELECT 1 FROM soja_store_private.stock_transfers t
    WHERE t.org_id = OLD.org_id AND t.commission_id = OLD.commission_id
      AND (t.origin_id = OLD.id OR t.destination_id = OLD.id)
      AND t.status IN ('requested', 'in_transit', 'partially_received')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_LOCATION_HAS_PENDING_TRANSFERS';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER soja_store_location_pending_transfers
  BEFORE UPDATE OF status ON soja_store_private.locations
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.protect_transfer_location();

CREATE FUNCTION soja_store_private.stock_transfer_json(_transfer soja_store_private.stock_transfers)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT to_jsonb(_transfer) - ARRAY['org_id', 'commission_id', 'requested_by', 'updated_by']
    || jsonb_build_object(
      'quantity', _transfer.quantity::text,
      'received_quantity', _transfer.received_quantity::text,
      'in_transit_quantity', CASE WHEN _transfer.status IN ('in_transit', 'partially_received')
        THEN (_transfer.quantity - _transfer.received_quantity)::text ELSE '0' END
    );
$$;

CREATE FUNCTION public.soja_store_create_transfer(_org_id uuid, _commission_id uuid, _request_id uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_capability constant text := 'stock.manage';
  v_command constant text := 'create_transfer';
  v_hash bytea;
  v_result jsonb;
  v_origin_id uuid;
  v_destination_id uuid;
  v_variant_id uuid;
  v_variant record;
  v_origin_name text;
  v_destination_name text;
  v_quantity numeric(18,6);
  v_reason text;
  v_transfer soja_store_private.stock_transfers;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, v_capability);
  PERFORM soja_store_private.assert_purchase_payload(_payload, ARRAY['origin_id', 'destination_id', 'variant_id', 'quantity', 'reason']);
  v_hash := soja_store_private.request_hash(v_command, NULL, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  v_origin_id := (_payload->>'origin_id')::uuid;
  v_destination_id := (_payload->>'destination_id')::uuid;
  v_variant_id := (_payload->>'variant_id')::uuid;
  v_quantity := soja_store_private.purchase_decimal(_payload->>'quantity', false);
  v_reason := nullif(btrim(_payload->>'reason'), '');
  IF v_origin_id IS NULL OR v_destination_id IS NULL OR v_origin_id = v_destination_id
    OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 3 AND 600 OR jsonb_typeof(_payload->'reason') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_TRANSFER';
  END IF;

  -- Shared locks prevent either location from being archived during request creation.
  PERFORM l.id FROM soja_store_private.locations l
  WHERE l.org_id = _org_id AND l.commission_id = _commission_id AND l.id IN (v_origin_id, v_destination_id)
  ORDER BY l.id FOR SHARE;
  SELECT l.name INTO v_origin_name FROM soja_store_private.locations l
  WHERE l.org_id = _org_id AND l.commission_id = _commission_id AND l.id = v_origin_id AND l.status = 'active';
  SELECT l.name INTO v_destination_name FROM soja_store_private.locations l
  WHERE l.org_id = _org_id AND l.commission_id = _commission_id AND l.id = v_destination_id AND l.status = 'active';
  IF v_origin_name IS NULL OR v_destination_name IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_TRANSFER_LOCATION_UNAVAILABLE';
  END IF;

  SELECT p.name, p.unit, v.sku, v.label INTO v_variant
  FROM soja_store_private.variants v
  JOIN soja_store_private.products p ON p.id = v.product_id AND p.org_id = v.org_id AND p.commission_id = v.commission_id
  WHERE v.org_id = _org_id AND v.commission_id = _commission_id AND v.id = v_variant_id AND v.active AND p.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_STOCK_POSITION_UNAVAILABLE'; END IF;

  INSERT INTO soja_store_private.stock_transfers
    (org_id, commission_id, origin_id, destination_id, origin_name, destination_name, variant_id,
      product_name, variant_label, sku, unit, quantity, reason, requested_by, updated_by)
  VALUES (_org_id, _commission_id, v_origin_id, v_destination_id, v_origin_name, v_destination_name, v_variant_id,
    v_variant.name, v_variant.label, v_variant.sku, v_variant.unit, v_quantity, v_reason, auth.uid(), auth.uid())
  RETURNING * INTO v_transfer;

  v_result := jsonb_build_object('id', v_transfer.id, 'version', v_transfer.version, 'status', v_transfer.status);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, v_command, v_capability, v_hash,
    v_transfer.id, NULL, soja_store_private.stock_transfer_json(v_transfer), v_result);
EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_TRANSFER';
END;
$$;

CREATE FUNCTION soja_store_private.transition_transfer(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb, _transition text
)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_capability constant text := 'stock.manage';
  v_hash bytea;
  v_result jsonb;
  v_transfer soja_store_private.stock_transfers;
  v_previous jsonb;
  v_event soja_store_private.stock_transfer_events;
  v_available numeric;
  v_reference text;
  v_quantity numeric(18,6);
  v_unit text;
  v_status text;
  v_movement_type text;
  v_location_id uuid;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, v_capability);
  PERFORM soja_store_private.assert_purchase_payload(_payload,
    CASE _transition
      WHEN 'receive_transfer' THEN ARRAY['transfer_id', 'quantity', 'reference']
      WHEN 'dispatch_transfer' THEN ARRAY['transfer_id', 'reference']
      ELSE ARRAY['transfer_id']
    END
  );
  v_hash := soja_store_private.request_hash(_transition, _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  SELECT * INTO v_transfer FROM soja_store_private.stock_transfers t
  WHERE t.org_id = _org_id AND t.commission_id = _commission_id AND t.id = (_payload->>'transfer_id')::uuid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_TRANSFER_NOT_FOUND'; END IF;
  IF _expected_version IS DISTINCT FROM v_transfer.version THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
  END IF;
  IF (_transition IN ('dispatch_transfer', 'cancel_transfer') AND v_transfer.status <> 'requested')
    OR (_transition = 'receive_transfer' AND v_transfer.status NOT IN ('in_transit', 'partially_received')) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_TRANSFER_INVALID_STATUS';
  END IF;

  v_reference := nullif(btrim(_payload->>'reference'), '');
  IF length(v_reference) > 600 OR (_payload ? 'reference' AND jsonb_typeof(_payload->'reference') NOT IN ('string', 'null')) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_TRANSFER';
  END IF;

  v_previous := soja_store_private.stock_transfer_json(v_transfer);

  IF _transition = 'cancel_transfer' THEN
    v_status := 'cancelled';
  ELSIF _transition = 'dispatch_transfer' THEN
    -- Read the current unit under the same product lock as catalog and purchase commands.
    SELECT p.unit INTO v_unit FROM soja_store_private.products p
    JOIN soja_store_private.variants v ON v.product_id = p.id AND v.org_id = p.org_id AND v.commission_id = p.commission_id
    WHERE v.org_id = _org_id AND v.commission_id = _commission_id AND v.id = v_transfer.variant_id
    FOR SHARE OF p;
    IF v_unit IS DISTINCT FROM v_transfer.unit THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_TRANSFER_UNIT_CHANGED';
    END IF;

    v_status := 'in_transit';
    v_location_id := v_transfer.origin_id;
    v_movement_type := 'transfer_dispatch';
    v_quantity := -v_transfer.quantity;
  ELSE
    v_quantity := soja_store_private.purchase_decimal(_payload->>'quantity', false);
    IF v_transfer.received_quantity + v_quantity > v_transfer.quantity THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_TRANSFER_EXCEEDS_TRANSIT';
    END IF;

    v_status := CASE WHEN v_transfer.received_quantity + v_quantity = v_transfer.quantity THEN 'received' ELSE 'partially_received' END;
    v_location_id := v_transfer.destination_id;
    v_movement_type := 'transfer_receipt';
  END IF;

  IF v_movement_type IS NOT NULL THEN
    PERFORM 1 FROM soja_store_private.locations l
    WHERE l.org_id = _org_id AND l.commission_id = _commission_id AND l.id = v_location_id AND l.status = 'active'
    FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_TRANSFER_LOCATION_UNAVAILABLE'; END IF;

    PERFORM soja_store_private.lock_stock_location(_org_id, _commission_id, v_location_id);
    IF v_movement_type = 'transfer_dispatch' THEN
      SELECT s.quantity - s.reserved_quantity INTO v_available FROM soja_store_private.stock_positions s
      WHERE s.org_id = _org_id AND s.commission_id = _commission_id AND s.variant_id = v_transfer.variant_id
        AND s.location_id = v_location_id AND s.ownership = 'own' AND s.owner_supplier_id IS NULL AND s.destination = 'store'
      FOR UPDATE;
      IF coalesce(v_available, 0) < -v_quantity THEN
        RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_TRANSFER_INSUFFICIENT';
      END IF;
    END IF;

    INSERT INTO soja_store_private.stock_transfer_events
      (org_id, commission_id, transfer_id, variant_id, location_id, movement_type, quantity, reference, recorded_by)
    VALUES (_org_id, _commission_id, v_transfer.id, v_transfer.variant_id, v_location_id,
      v_movement_type, v_quantity, v_reference, auth.uid())
    RETURNING * INTO v_event;

    INSERT INTO soja_store_private.stock_movements
      (org_id, commission_id, variant_id, location_id, ownership, destination, movement_type, transfer_event_id,
      quantity, occurred_on, recorded_at, recorded_by)
    VALUES (_org_id, _commission_id, v_transfer.variant_id, v_location_id, 'own', 'store', v_movement_type,
      v_event.id, v_event.quantity,
      (v_event.recorded_at AT TIME ZONE 'America/Sao_Paulo')::date, v_event.recorded_at, auth.uid());
  END IF;

  UPDATE soja_store_private.stock_transfers t
  SET status = v_status, version = t.version + 1, updated_by = auth.uid(), updated_at = now(),
    received_quantity = t.received_quantity + CASE WHEN v_movement_type = 'transfer_receipt' THEN v_quantity ELSE 0 END
  WHERE t.org_id = _org_id AND t.commission_id = _commission_id AND t.id = v_transfer.id
  RETURNING * INTO v_transfer;

  v_result := jsonb_build_object('id', v_transfer.id, 'version', v_transfer.version, 'status', v_transfer.status);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, _transition, v_capability, v_hash,
    v_transfer.id, v_previous,
    soja_store_private.stock_transfer_json(v_transfer) || jsonb_build_object('event_id', v_event.id), v_result);
EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_TRANSFER';
END;
$$;

CREATE FUNCTION public.soja_store_dispatch_transfer(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT soja_store_private.transition_transfer(_org_id, _commission_id, _request_id, _expected_version, _payload, 'dispatch_transfer');
$$;

CREATE FUNCTION public.soja_store_receive_transfer(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT soja_store_private.transition_transfer(_org_id, _commission_id, _request_id, _expected_version, _payload, 'receive_transfer');
$$;

CREATE FUNCTION public.soja_store_cancel_transfer(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT soja_store_private.transition_transfer(_org_id, _commission_id, _request_id, _expected_version, _payload, 'cancel_transfer');
$$;

CREATE FUNCTION public.soja_store_transfers(
  _org_id uuid, _commission_id uuid, _status text DEFAULT NULL, _limit integer DEFAULT 30, _offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'stock.view');
  PERFORM soja_store_private.assert_purchase_page(_limit, _offset);
  IF _status IS NOT NULL AND _status NOT IN ('requested', 'in_transit', 'partially_received', 'received', 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_FILTER';
  END IF;

  RETURN (
    WITH matched AS MATERIALIZED (
      SELECT t.id FROM soja_store_private.stock_transfers t
      WHERE t.org_id = _org_id AND t.commission_id = _commission_id AND (_status IS NULL OR t.status = _status)
    ), page AS (
      SELECT t.* FROM matched m JOIN soja_store_private.stock_transfers t ON t.id = m.id
      ORDER BY t.updated_at DESC, t.id LIMIT _limit OFFSET _offset
    )
    SELECT jsonb_build_object('total', (SELECT count(*) FROM matched), 'items', coalesce((
      SELECT jsonb_agg(soja_store_private.stock_transfer_json(t) ORDER BY t.updated_at DESC, t.id) FROM page p
      JOIN soja_store_private.stock_transfers t ON t.id = p.id
    ), '[]'::jsonb))
  );
END;
$$;

CREATE FUNCTION public.soja_store_transfer(_org_id uuid, _commission_id uuid, _transfer_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_transfer soja_store_private.stock_transfers;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'stock.view');
  SELECT * INTO v_transfer FROM soja_store_private.stock_transfers t
  WHERE t.org_id = _org_id AND t.commission_id = _commission_id AND t.id = _transfer_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_TRANSFER_NOT_FOUND'; END IF;

  RETURN soja_store_private.stock_transfer_json(v_transfer) || jsonb_build_object('events', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', e.id, 'movement_type', e.movement_type, 'quantity', e.quantity::text,
      'reference', e.reference, 'recorded_at', e.recorded_at, 'movement_id', m.id
    ) ORDER BY e.recorded_at DESC, e.id)
    FROM soja_store_private.stock_transfer_events e
    JOIN soja_store_private.stock_movements m ON m.transfer_event_id = e.id
    WHERE e.org_id = _org_id AND e.commission_id = _commission_id AND e.transfer_id = _transfer_id
  ), '[]'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION soja_store_private.protect_transfer_location(),
  soja_store_private.stock_transfer_json(soja_store_private.stock_transfers),
  soja_store_private.transition_transfer(uuid, uuid, uuid, integer, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.soja_store_create_transfer(uuid, uuid, uuid, jsonb),
  public.soja_store_dispatch_transfer(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_receive_transfer(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_cancel_transfer(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_transfers(uuid, uuid, text, integer, integer),
  public.soja_store_transfer(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soja_store_create_transfer(uuid, uuid, uuid, jsonb),
  public.soja_store_dispatch_transfer(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_receive_transfer(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_cancel_transfer(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_transfers(uuid, uuid, text, integer, integer),
  public.soja_store_transfer(uuid, uuid, uuid) TO authenticated;

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
      SELECT m.id, m.variant_id, m.location_id, m.ownership, m.owner_supplier_id, m.destination,
        m.movement_type, m.purchase_id, m.receipt_id, m.receipt_line_id, m.inventory_count_id, m.transfer_event_id,
        m.quantity::text, m.occurred_on, m.recorded_at
      FROM soja_store_private.stock_movements m
      WHERE m.org_id = _org_id AND m.commission_id = _commission_id
        AND (_location_id IS NULL OR m.location_id = _location_id)
        AND (_variant_id IS NULL OR m.variant_id = _variant_id)
    ), page AS (
      SELECT m.id, m.variant_id, m.location_id, m.ownership, m.owner_supplier_id, m.destination,
        m.movement_type, m.purchase_id, m.receipt_id, m.inventory_count_id, t.id AS transfer_id, m.quantity, m.occurred_on, m.recorded_at,
        v.product_id, coalesce(c.product_name, p.product_name, t.product_name) AS product_name, coalesce(c.sku, p.sku, t.sku) AS sku,
        CASE WHEN c.id IS NOT NULL THEN c.variant_label WHEN t.id IS NOT NULL THEN t.variant_label ELSE p.variant_label END AS variant_label,
        coalesce(c.unit, p.unit, t.unit) AS unit, coalesce(c.location_name, o.location_name,
          CASE WHEN e.movement_type = 'transfer_dispatch' THEN t.origin_name ELSE t.destination_name END) AS location_name,
        s.name AS owner_supplier_name, coalesce(c.reason, t.reason) AS reason, coalesce(c.reference, e.reference) AS reference,
        c.previous_quantity::text, c.counted_quantity::text
      FROM (SELECT * FROM matched ORDER BY occurred_on DESC, recorded_at DESC, id LIMIT _limit OFFSET _offset) m
      JOIN soja_store_private.variants v ON v.id = m.variant_id
      LEFT JOIN soja_store_private.purchases o ON o.id = m.purchase_id
      LEFT JOIN soja_store_private.purchase_receipt_lines r ON r.id = m.receipt_line_id
      LEFT JOIN soja_store_private.purchase_lines p ON p.id = r.purchase_line_id
      LEFT JOIN soja_store_private.inventory_counts c ON c.id = m.inventory_count_id
      LEFT JOIN soja_store_private.stock_transfer_events e ON e.id = m.transfer_event_id
      LEFT JOIN soja_store_private.stock_transfers t ON t.id = e.transfer_id
      LEFT JOIN soja_store_private.suppliers s ON s.id = m.owner_supplier_id
    )
    SELECT jsonb_build_object('total', (SELECT count(*) FROM matched), 'items', coalesce((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.occurred_on DESC, p.recorded_at DESC, p.id) FROM page p
    ), '[]'::jsonb))
  );
END;
$$;

COMMIT;
