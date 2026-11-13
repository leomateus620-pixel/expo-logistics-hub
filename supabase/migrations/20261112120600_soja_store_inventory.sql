BEGIN;

INSERT INTO soja_store_private.operational_capability_registry (capability)
VALUES ('stock.manage') ON CONFLICT DO NOTHING;

-- Keep the same ledger and origin constraints used by purchase receipts.
LOCK TABLE soja_store_private.stock_movements IN ACCESS EXCLUSIVE MODE;

CREATE TABLE soja_store_private.stock_positions (
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  ownership text NOT NULL CHECK (ownership IN ('own', 'third_party')),
  owner_supplier_id uuid,
  destination text NOT NULL CHECK (destination = 'store'),
  quantity numeric NOT NULL CHECK (quantity >= 0),
  reserved_quantity numeric NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0 AND reserved_quantity <= quantity),
  version integer NOT NULL CHECK (version >= 1),
  last_movement_at timestamptz NOT NULL,
  UNIQUE NULLS NOT DISTINCT (org_id, commission_id, variant_id, location_id, ownership, owner_supplier_id, destination),
  FOREIGN KEY (org_id, commission_id, variant_id)
    REFERENCES soja_store_private.variants(org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, location_id)
    REFERENCES soja_store_private.locations(org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, owner_supplier_id)
    REFERENCES soja_store_private.suppliers(org_id, commission_id, id),
  CHECK ((ownership = 'own' AND owner_supplier_id IS NULL) OR (ownership = 'third_party' AND owner_supplier_id IS NOT NULL))
);

CREATE INDEX soja_store_stock_positions_location
  ON soja_store_private.stock_positions (org_id, commission_id, location_id, variant_id);

INSERT INTO soja_store_private.stock_positions
  (org_id, commission_id, variant_id, location_id, ownership, owner_supplier_id, destination, quantity, version, last_movement_at)
SELECT org_id, commission_id, variant_id, location_id, ownership, owner_supplier_id, destination,
  sum(quantity), count(*)::integer, max(recorded_at)
FROM soja_store_private.stock_movements
GROUP BY org_id, commission_id, variant_id, location_id, ownership, owner_supplier_id, destination;

CREATE TABLE soja_store_private.inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('opening_count', 'inventory_adjustment')),
  previous_quantity numeric(18,6) NOT NULL CHECK (previous_quantity >= 0),
  counted_quantity numeric(18,6) NOT NULL CHECK (counted_quantity >= 0),
  delta numeric(18,6) GENERATED ALWAYS AS (counted_quantity - previous_quantity) STORED,
  previous_version integer NOT NULL CHECK (previous_version >= 0),
  product_name text NOT NULL,
  variant_label text,
  sku text NOT NULL,
  unit text NOT NULL,
  location_name text NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 600),
  reference text CHECK (length(reference) BETWEEN 1 AND 600),
  occurred_on date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL,
  FOREIGN KEY (org_id, commission_id, variant_id)
    REFERENCES soja_store_private.variants(org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, location_id)
    REFERENCES soja_store_private.locations(org_id, commission_id, id),
  UNIQUE (org_id, commission_id, id, variant_id, location_id, kind, delta),
  CHECK (kind <> 'opening_count' OR (previous_quantity = 0 AND previous_version = 0))
);

CREATE UNIQUE INDEX soja_store_inventory_one_opening
  ON soja_store_private.inventory_counts (org_id, commission_id, variant_id, location_id)
  WHERE kind = 'opening_count';

ALTER TABLE soja_store_private.stock_movements
  ALTER COLUMN purchase_id DROP NOT NULL,
  ALTER COLUMN receipt_id DROP NOT NULL,
  ALTER COLUMN receipt_line_id DROP NOT NULL,
  ALTER COLUMN unit_cost DROP NOT NULL,
  DROP CONSTRAINT stock_movements_movement_type_check,
  DROP CONSTRAINT stock_movements_quantity_check,
  ADD COLUMN inventory_count_id uuid UNIQUE,
  ADD CONSTRAINT soja_store_movement_origin CHECK (
    (movement_type = 'purchase_receipt' AND purchase_id IS NOT NULL AND receipt_id IS NOT NULL
      AND receipt_line_id IS NOT NULL AND inventory_count_id IS NULL AND quantity > 0 AND unit_cost IS NOT NULL)
    OR (movement_type IN ('opening_count', 'inventory_adjustment') AND purchase_id IS NULL AND receipt_id IS NULL
      AND receipt_line_id IS NULL AND inventory_count_id IS NOT NULL AND ownership = 'own'
      AND owner_supplier_id IS NULL AND destination = 'store' AND unit_cost IS NULL)
  ),
  ADD CONSTRAINT soja_store_movement_inventory_origin
    FOREIGN KEY (org_id, commission_id, inventory_count_id, variant_id, location_id, movement_type, quantity)
    REFERENCES soja_store_private.inventory_counts (org_id, commission_id, id, variant_id, location_id, kind, delta);

ALTER TABLE soja_store_private.inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.stock_positions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soja_store_private.inventory_counts, soja_store_private.stock_positions
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER soja_store_inventory_counts_immutable
  BEFORE UPDATE OR DELETE ON soja_store_private.inventory_counts
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.reject_stock_history_change();

-- All position writers serialize per location, including the existing purchase RPC.
-- A later writer spanning locations must lock them in stable UUID order before inserting movements.
CREATE FUNCTION soja_store_private.lock_stock_location(_org_id uuid, _commission_id uuid, _location_id uuid)
RETURNS void LANGUAGE sql SET search_path = '' AS $$
  SELECT pg_advisory_xact_lock(hashtextextended(concat_ws(':', 'soja-store-stock', _org_id, _commission_id, _location_id), 0));
$$;

CREATE FUNCTION soja_store_private.project_stock_movement()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_position soja_store_private.stock_positions;
  v_quantity numeric;
BEGIN
  PERFORM soja_store_private.lock_stock_location(NEW.org_id, NEW.commission_id, NEW.location_id);

  SELECT * INTO v_position
  FROM soja_store_private.stock_positions s
  WHERE s.org_id = NEW.org_id AND s.commission_id = NEW.commission_id AND s.variant_id = NEW.variant_id
    AND s.location_id = NEW.location_id AND s.ownership = NEW.ownership AND s.destination = NEW.destination
    AND s.owner_supplier_id IS NOT DISTINCT FROM NEW.owner_supplier_id
  FOR UPDATE;

  v_quantity := coalesce(v_position.quantity, 0) + NEW.quantity;
  IF v_quantity < coalesce(v_position.reserved_quantity, 0) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STOCK_INSUFFICIENT';
  END IF;
  IF FOUND THEN
    UPDATE soja_store_private.stock_positions s
    SET quantity = v_quantity, version = s.version + 1, last_movement_at = greatest(s.last_movement_at, NEW.recorded_at)
    WHERE s.org_id = NEW.org_id AND s.commission_id = NEW.commission_id AND s.variant_id = NEW.variant_id
      AND s.location_id = NEW.location_id AND s.ownership = NEW.ownership AND s.destination = NEW.destination
      AND s.owner_supplier_id IS NOT DISTINCT FROM NEW.owner_supplier_id;
  ELSE
    INSERT INTO soja_store_private.stock_positions
      (org_id, commission_id, variant_id, location_id, ownership, owner_supplier_id, destination, quantity, version, last_movement_at)
    VALUES (NEW.org_id, NEW.commission_id, NEW.variant_id, NEW.location_id, NEW.ownership,
      NEW.owner_supplier_id, NEW.destination, v_quantity, 1, NEW.recorded_at);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER soja_store_project_stock_movement
  AFTER INSERT ON soja_store_private.stock_movements
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.project_stock_movement();

CREATE FUNCTION soja_store_private.protect_counted_product_unit()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.unit IS DISTINCT FROM OLD.unit AND EXISTS (
    SELECT 1 FROM soja_store_private.variants v
    JOIN soja_store_private.stock_positions s
      ON s.org_id = v.org_id AND s.commission_id = v.commission_id AND s.variant_id = v.id
    WHERE v.org_id = OLD.org_id AND v.commission_id = OLD.commission_id AND v.product_id = OLD.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_PRODUCT_UNIT_IN_USE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER soja_store_counted_product_unit
  BEFORE UPDATE OF unit ON soja_store_private.products
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.protect_counted_product_unit();

CREATE FUNCTION soja_store_private.protect_stock_location()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'archived' AND OLD.status <> 'archived' AND EXISTS (
    SELECT 1 FROM soja_store_private.stock_positions s
    WHERE s.org_id = OLD.org_id AND s.commission_id = OLD.commission_id AND s.location_id = OLD.id AND s.quantity > 0
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_LOCATION_HAS_STOCK';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER soja_store_location_with_stock
  BEFORE UPDATE OF status ON soja_store_private.locations
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.protect_stock_location();

CREATE FUNCTION public.soja_store_inventory_position(
  _org_id uuid, _commission_id uuid, _variant_id uuid, _location_id uuid
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_position soja_store_private.stock_positions;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'stock.manage');

  IF NOT EXISTS (
    SELECT 1 FROM soja_store_private.locations l
    WHERE l.org_id = _org_id AND l.commission_id = _commission_id AND l.id = _location_id AND l.status = 'active'
  ) OR NOT EXISTS (
    SELECT 1 FROM soja_store_private.variants v
    JOIN soja_store_private.products p
      ON p.org_id = v.org_id AND p.commission_id = v.commission_id AND p.id = v.product_id
    WHERE v.org_id = _org_id AND v.commission_id = _commission_id AND v.id = _variant_id AND v.active AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_STOCK_POSITION_UNAVAILABLE';
  END IF;

  SELECT * INTO v_position FROM soja_store_private.stock_positions s
  WHERE s.org_id = _org_id AND s.commission_id = _commission_id AND s.variant_id = _variant_id
    AND s.location_id = _location_id AND s.ownership = 'own' AND s.owner_supplier_id IS NULL AND s.destination = 'store';

  RETURN jsonb_build_object('quantity', coalesce(v_position.quantity, 0)::text,
    'available_quantity', (coalesce(v_position.quantity, 0) - coalesce(v_position.reserved_quantity, 0))::text,
    'version', coalesce(v_position.version, 0), 'has_movement', v_position.version IS NOT NULL);
END;
$$;

CREATE FUNCTION public.soja_store_record_inventory(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_capability constant text := 'stock.manage';
  v_command constant text := 'record_inventory';
  v_hash bytea;
  v_result jsonb;
  v_variant soja_store_private.variants;
  v_product soja_store_private.products;
  v_location soja_store_private.locations;
  v_position soja_store_private.stock_positions;
  v_count soja_store_private.inventory_counts;
  v_movement_id uuid;
  v_variant_id uuid;
  v_product_id uuid;
  v_location_id uuid;
  v_kind text;
  v_quantity_text text;
  v_quantity numeric(18,6);
  v_reason text;
  v_reference text;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, v_capability);
  IF jsonb_typeof(_payload) IS DISTINCT FROM 'object' OR octet_length(_payload::text) > 4096 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_INVENTORY';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(_payload) f(key)
    WHERE f.key NOT IN ('variant_id', 'location_id', 'kind', 'quantity', 'reason', 'reference')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_INVENTORY';
  END IF;

  v_hash := soja_store_private.request_hash(v_command, _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  v_variant_id := (_payload->>'variant_id')::uuid;
  v_location_id := (_payload->>'location_id')::uuid;
  v_kind := _payload->>'kind';
  v_quantity_text := _payload->>'quantity';
  v_reason := nullif(btrim(_payload->>'reason'), '');
  v_reference := nullif(btrim(_payload->>'reference'), '');
  IF v_variant_id IS NULL OR v_location_id IS NULL OR v_kind IS NULL
    OR v_kind NOT IN ('opening_count', 'inventory_adjustment')
    OR v_quantity_text IS NULL OR v_quantity_text !~ '^[0-9]{1,12}([.][0-9]{1,6})?$'
    OR jsonb_typeof(_payload->'reason') IS DISTINCT FROM 'string'
    OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 3 AND 600
    OR (_payload ? 'reference' AND jsonb_typeof(_payload->'reference') NOT IN ('string', 'null'))
    OR length(v_reference) > 600
    OR _expected_version IS NULL OR _expected_version < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_INVENTORY';
  END IF;
  v_quantity := v_quantity_text::numeric;

  SELECT * INTO v_location FROM soja_store_private.locations
  WHERE org_id = _org_id AND commission_id = _commission_id AND id = v_location_id AND status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_STOCK_POSITION_UNAVAILABLE'; END IF;

  SELECT product_id INTO v_product_id FROM soja_store_private.variants
  WHERE org_id = _org_id AND commission_id = _commission_id AND id = v_variant_id;
  SELECT * INTO v_product FROM soja_store_private.products
  WHERE org_id = _org_id AND commission_id = _commission_id AND id = v_product_id AND status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_STOCK_POSITION_UNAVAILABLE'; END IF;

  SELECT * INTO v_variant FROM soja_store_private.variants
  WHERE org_id = _org_id AND commission_id = _commission_id AND id = v_variant_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_STOCK_POSITION_UNAVAILABLE'; END IF;

  PERFORM soja_store_private.lock_stock_location(_org_id, _commission_id, v_location_id);
  SELECT * INTO v_position FROM soja_store_private.stock_positions s
  WHERE s.org_id = _org_id AND s.commission_id = _commission_id AND s.variant_id = v_variant_id
    AND s.location_id = v_location_id AND s.ownership = 'own' AND s.owner_supplier_id IS NULL AND s.destination = 'store'
  FOR UPDATE;

  IF _expected_version IS DISTINCT FROM coalesce(v_position.version, 0) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
  END IF;
  IF v_kind = 'opening_count' AND v_position.version IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_OPENING_ALREADY_RECORDED';
  END IF;
  IF v_kind = 'inventory_adjustment' AND v_position.version IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_OPENING_REQUIRED';
  END IF;
  IF v_quantity < coalesce(v_position.reserved_quantity, 0) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STOCK_INSUFFICIENT';
  END IF;

  INSERT INTO soja_store_private.inventory_counts
    (org_id, commission_id, variant_id, location_id, kind, previous_quantity, counted_quantity, previous_version,
      product_name, variant_label, sku, unit, location_name, reason, reference, occurred_on, recorded_by)
  VALUES (_org_id, _commission_id, v_variant_id, v_location_id, v_kind, coalesce(v_position.quantity, 0), v_quantity,
    _expected_version, v_product.name, v_variant.label, v_variant.sku, v_product.unit, v_location.name, v_reason, v_reference,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date, auth.uid())
  RETURNING * INTO v_count;

  INSERT INTO soja_store_private.stock_movements
    (org_id, commission_id, variant_id, location_id, ownership, destination, movement_type, inventory_count_id,
      quantity, occurred_on, recorded_at, recorded_by)
  VALUES (_org_id, _commission_id, v_variant_id, v_location_id, 'own', 'store', v_kind, v_count.id,
    v_count.delta, v_count.occurred_on, v_count.recorded_at, auth.uid())
  RETURNING id INTO v_movement_id;

  v_result := jsonb_build_object('id', v_count.id, 'version', _expected_version + 1, 'status', 'recorded',
    'quantity', v_quantity::text, 'movement_id', v_movement_id);
  RETURN soja_store_private.finish_request(
    _org_id, _commission_id, _request_id, v_command, v_capability, v_hash, v_count.id,
    jsonb_build_object('quantity', coalesce(v_position.quantity, 0)::text, 'version', _expected_version),
    to_jsonb(v_count) - ARRAY['org_id', 'commission_id'] || jsonb_build_object('movement_id', v_movement_id), v_result
  );
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_INVENTORY';
END;
$$;

CREATE FUNCTION public.soja_store_inventory_options(
  _org_id uuid, _commission_id uuid, _search text DEFAULT NULL, _limit integer DEFAULT 30,
  _location_id uuid DEFAULT NULL, _variant_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_search text := lower(nullif(btrim(_search), ''));
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'stock.manage');
  PERFORM soja_store_private.assert_purchase_page(_limit, 0);
  IF length(v_search) > 160 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_FILTER'; END IF;
  RETURN jsonb_build_object(
    'locations', coalesce((
      SELECT jsonb_agg(to_jsonb(l) ORDER BY lower(l.name), l.id)
      FROM (
        SELECT l.id, l.name
        FROM soja_store_private.locations l
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

REVOKE EXECUTE ON FUNCTION soja_store_private.lock_stock_location(uuid, uuid, uuid),
  soja_store_private.project_stock_movement(), soja_store_private.protect_counted_product_unit(),
  soja_store_private.protect_stock_location() FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.soja_store_inventory_position(uuid, uuid, uuid, uuid),
  public.soja_store_record_inventory(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_inventory_options(uuid, uuid, text, integer, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soja_store_inventory_position(uuid, uuid, uuid, uuid),
  public.soja_store_record_inventory(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_inventory_options(uuid, uuid, text, integer, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.soja_store_stock(
  _org_id uuid, _commission_id uuid, _location_id uuid DEFAULT NULL, _variant_id uuid DEFAULT NULL,
  _limit integer DEFAULT 30, _offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'stock.view');
  PERFORM soja_store_private.assert_purchase_page(_limit, _offset);
  RETURN (
    WITH balances AS MATERIALIZED (
      SELECT s.variant_id, s.location_id, s.ownership, s.owner_supplier_id, s.destination, s.quantity::text,
        s.reserved_quantity::text, (s.quantity - s.reserved_quantity)::text AS available_quantity, s.last_movement_at
      FROM soja_store_private.stock_positions s
      WHERE s.org_id = _org_id AND s.commission_id = _commission_id
        AND (_location_id IS NULL OR s.location_id = _location_id)
        AND (_variant_id IS NULL OR s.variant_id = _variant_id)
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
        m.movement_type, m.purchase_id, m.receipt_id, m.receipt_line_id, m.inventory_count_id,
        m.quantity::text, m.occurred_on, m.recorded_at
      FROM soja_store_private.stock_movements m
      WHERE m.org_id = _org_id AND m.commission_id = _commission_id
        AND (_location_id IS NULL OR m.location_id = _location_id)
        AND (_variant_id IS NULL OR m.variant_id = _variant_id)
    ), page AS (
      SELECT m.id, m.variant_id, m.location_id, m.ownership, m.owner_supplier_id, m.destination,
        m.movement_type, m.purchase_id, m.receipt_id, m.inventory_count_id, m.quantity, m.occurred_on, m.recorded_at,
        v.product_id, coalesce(c.product_name, p.product_name) AS product_name, coalesce(c.sku, p.sku) AS sku,
        CASE WHEN c.id IS NOT NULL THEN c.variant_label ELSE p.variant_label END AS variant_label,
        coalesce(c.unit, p.unit) AS unit, coalesce(c.location_name, o.location_name) AS location_name,
        s.name AS owner_supplier_name, c.reason, c.reference,
        c.previous_quantity::text, c.counted_quantity::text
      FROM (SELECT * FROM matched ORDER BY occurred_on DESC, recorded_at DESC, id LIMIT _limit OFFSET _offset) m
      JOIN soja_store_private.variants v ON v.id = m.variant_id
      LEFT JOIN soja_store_private.purchases o ON o.id = m.purchase_id
      LEFT JOIN soja_store_private.purchase_receipt_lines r ON r.id = m.receipt_line_id
      LEFT JOIN soja_store_private.purchase_lines p ON p.id = r.purchase_line_id
      LEFT JOIN soja_store_private.inventory_counts c ON c.id = m.inventory_count_id
      LEFT JOIN soja_store_private.suppliers s ON s.id = m.owner_supplier_id
    )
    SELECT jsonb_build_object('total', (SELECT count(*) FROM matched), 'items', coalesce((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.occurred_on DESC, p.recorded_at DESC, p.id) FROM page p
    ), '[]'::jsonb))
  );
END;
$$;

COMMIT;
