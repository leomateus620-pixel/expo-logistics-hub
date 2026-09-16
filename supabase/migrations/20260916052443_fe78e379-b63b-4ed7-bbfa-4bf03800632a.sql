DO $$
DECLARE
  v_actor uuid := 'b8fd1e36-b46c-4eff-bb75-372b676ce123';
  v_target integer;
  v_updated integer;
BEGIN
  SELECT count(*) INTO v_target
  FROM public.commercial_lots l
  JOIN public.commercial_sale_eligibility e ON e.lot_id = l.id
  WHERE l.archived_at IS NULL AND l.status = 'BLOCKED' AND e.is_sellable;

  IF v_target <> 1408 THEN
    RAISE EXCEPTION 'DIVERGENCIA_ELEGIBILIDADE: esperado 1408, encontrado %', v_target;
  END IF;

  CREATE TEMP TABLE _released ON COMMIT DROP AS
  SELECT l.id, l.status AS previous_status
  FROM public.commercial_lots l
  JOIN public.commercial_sale_eligibility e ON e.lot_id = l.id
  WHERE l.archived_at IS NULL AND l.status = 'BLOCKED' AND e.is_sellable
  FOR UPDATE OF l;

  UPDATE public.commercial_lots l
  SET status = 'AVAILABLE', updated_at = now()
  FROM _released r
  WHERE l.id = r.id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
  SELECT r.id, r.previous_status, 'AVAILABLE',
         'Liberação comercial 2028 após validação de área oficial e precificação.',
         v_actor
  FROM _released r;

  RAISE NOTICE 'Lotes liberados: %', v_updated;
END $$;