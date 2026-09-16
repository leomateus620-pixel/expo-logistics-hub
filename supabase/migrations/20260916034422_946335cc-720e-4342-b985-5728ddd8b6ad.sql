CREATE OR REPLACE FUNCTION public.apply_lot_price_rules_2028(p_stage text, p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_applied integer := 0;
  v_skipped_manual integer := 0;
  v_skipped_commercial integer := 0;
  v_pending integer := 0;
  v_excluded integer := 0;
  v_unchanged integer := 0;
  v_rec record;
  v_price numeric(14,2);
  v_authorized boolean;
BEGIN
  IF p_stage NOT IN ('RENOVACAO','SEGUNDA_ETAPA') THEN
    RAISE EXCEPTION 'INVALID_STAGE';
  END IF;

  IF auth.uid() IS NULL THEN
    v_authorized := current_user IN ('postgres','service_role','supabase_admin');
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.map_projects p
      WHERE public.map_has_explicit_capability(p.org_id, 'map.manage_lots')
    ) INTO v_authorized;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  FOR v_rec IN
    SELECT v.*,
           CASE WHEN p_stage = 'RENOVACAO' THEN v.renovacao_price_per_sqm ELSE v.segunda_price_per_sqm END AS sqm,
           CASE WHEN p_stage = 'RENOVACAO' THEN v.renovacao_total ELSE v.segunda_total END AS total,
           CASE WHEN p_stage = 'RENOVACAO' THEN v.renovacao_rule_id ELSE v.segunda_rule_id END AS rule_id
    FROM public.commercial_lot_pricing_2028 v
  LOOP
    IF v_rec.resolution_status = 'EXCLUIDO' THEN
      v_excluded := v_excluded + 1;
      CONTINUE;
    END IF;

    IF v_rec.resolution_status <> 'OK' OR v_rec.total IS NULL THEN
      v_pending := v_pending + 1;
      CONTINUE;
    END IF;

    IF v_rec.status IN ('SOLD','RESERVED','IN_NEGOTIATION')
       OR EXISTS (SELECT 1 FROM public.lot_contracts c WHERE c.lot_id = v_rec.lot_id)
       OR EXISTS (SELECT 1 FROM public.lot_reservations rs WHERE rs.lot_id = v_rec.lot_id AND rs.status = 'ACTIVE')
    THEN
      v_skipped_commercial := v_skipped_commercial + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.lot_prices lp
      WHERE lp.lot_id = v_rec.lot_id AND lp.is_active AND lp.source = 'MANUAL'
        AND (lp.price_per_sqm IS NOT NULL OR lp.base_price IS NOT NULL OR lp.asking_price IS NOT NULL)
    ) THEN
      v_skipped_manual := v_skipped_manual + 1;
      CONTINUE;
    END IF;

    v_price := v_rec.total;

    IF EXISTS (
      SELECT 1 FROM public.lot_prices lp
      WHERE lp.lot_id = v_rec.lot_id AND lp.is_active AND lp.source = 'RULE_2028'
        AND lp.stage = p_stage AND lp.price_per_sqm = v_rec.sqm AND lp.asking_price = v_price
        AND lp.area_used_sqm = v_rec.official_area_sqm
    ) THEN
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;

    v_applied := v_applied + 1;

    IF NOT p_dry_run THEN
      UPDATE public.lot_prices
         SET is_active = false, valid_until = now()
       WHERE lot_id = v_rec.lot_id AND is_active;

      INSERT INTO public.lot_prices (
        lot_id, pricing_mode, price_per_sqm, asking_price, valid_from, is_active,
        source, stage, rule_id, area_used_sqm, notes, created_by
      ) VALUES (
        v_rec.lot_id, 'PRICE_PER_SQUARE_METER', v_rec.sqm, v_price, now(), true,
        'RULE_2028', p_stage, v_rec.rule_id, v_rec.official_area_sqm,
        'Motor oficial 2028 - ' || COALESCE(
          CASE WHEN p_stage = 'RENOVACAO' THEN v_rec.renovacao_rule_label ELSE v_rec.segunda_rule_label END, ''),
        auth.uid()
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'stage', p_stage,
    'dryRun', p_dry_run,
    'applied', v_applied,
    'unchanged', v_unchanged,
    'skippedManual', v_skipped_manual,
    'skippedCommercial', v_skipped_commercial,
    'pending', v_pending,
    'excluded', v_excluded
  );
END;
$$;