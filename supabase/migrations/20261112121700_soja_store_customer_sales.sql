BEGIN;

INSERT INTO soja_store_private.operational_capability_registry (capability)
VALUES ('customers.history') ON CONFLICT DO NOTHING;

CREATE INDEX soja_store_customer_sales_history ON soja_store_private.sales
  (org_id, commission_id, customer_id, occurred_on DESC, id) WHERE customer_id IS NOT NULL;

CREATE FUNCTION public.soja_store_customer_sales(
  _org_id uuid, _commission_id uuid, _customer_id uuid, _limit integer DEFAULT 10, _offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'customers.view');
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'sales.view');
  PERFORM soja_store_private.assert_purchase_page(_limit, _offset);
  IF NOT EXISTS (
    SELECT 1 FROM soja_store_private.customers c
    WHERE c.org_id = _org_id AND c.commission_id = _commission_id AND c.id = _customer_id
  ) THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_CUSTOMER_NOT_FOUND'; END IF;

  RETURN (
    WITH matched AS MATERIALIZED (
      SELECT s.id, s.status, s.occurred_on, s.total_cents, s.created_at
      FROM soja_store_private.sales s
      WHERE s.org_id = _org_id AND s.commission_id = _commission_id AND s.customer_id = _customer_id
    ), page AS (
      SELECT * FROM matched ORDER BY occurred_on DESC, created_at DESC, id LIMIT _limit OFFSET _offset
    )
    SELECT jsonb_build_object('total', (SELECT count(*) FROM matched), 'items', coalesce((
      SELECT jsonb_agg(to_jsonb(p) - 'created_at' ORDER BY p.occurred_on DESC, p.created_at DESC, p.id)
      FROM page p
    ), '[]'::jsonb))
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.soja_store_customer_sales(uuid, uuid, uuid, integer, integer)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soja_store_customer_sales(uuid, uuid, uuid, integer, integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
