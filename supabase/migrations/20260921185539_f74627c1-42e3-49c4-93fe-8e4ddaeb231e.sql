DO $$
DECLARE
  v_ids uuid[];
  v_count int;
BEGIN
  SELECT array_agg(id) INTO v_ids
  FROM public.commercial_lots
  WHERE public_identifier IN ('Q-E-13','Q-E-11','Q-D-12','Q-D-11')
    AND archived_at IS NULL;

  v_count := coalesce(array_length(v_ids, 1), 0);
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'Esperados 4 lotes alvo, encontrados %', v_count;
  END IF;

  UPDATE public.commercial_lots
  SET is_corner = true,
      updated_at = now()
  WHERE id = ANY(v_ids)
    AND is_corner IS DISTINCT FROM true;

  INSERT INTO public.commercial_lot_corner_audit
    (lot_id, project_id, classification, db_is_corner, method, notes, audited_at)
  SELECT l.id,
         l.project_id,
         'CORNER_CONFIRMED',
         true,
         'OFFICIAL_MANUAL_REVIEW_2028',
         'Correção oficial 2028: lote de esquina confirmado pela organização (Q-E-13, Q-E-11, Q-D-12, Q-D-11).',
         now()
  FROM public.commercial_lots l
  WHERE l.id = ANY(v_ids)
  ON CONFLICT (lot_id) DO UPDATE
  SET classification = 'CORNER_CONFIRMED',
      db_is_corner = true,
      method = 'OFFICIAL_MANUAL_REVIEW_2028',
      notes = EXCLUDED.notes,
      audited_at = now(),
      updated_at = now()
  WHERE public.commercial_lot_corner_audit.classification IS DISTINCT FROM 'CORNER_CONFIRMED'
     OR public.commercial_lot_corner_audit.db_is_corner IS DISTINCT FROM true;

  SELECT count(*) INTO v_count
  FROM public.commercial_lot_pricing_2028 p
  WHERE p.lot_id = ANY(v_ids)
    AND p.corner_confirmed
    AND p.resolution_status = 'OK'
    AND p.renovacao_price_per_sqm = 55.00
    AND p.segunda_price_per_sqm = 61.00;

  IF v_count <> 4 THEN
    RAISE EXCEPTION 'Validação de precificação de esquina falhou: % de 4 lotes conformes', v_count;
  END IF;
END
$$;