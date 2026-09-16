-- ===== Regras oficiais de preço 2028 =====
CREATE TABLE public.commercial_price_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.map_projects(id) ON DELETE CASCADE,
  exercise integer NOT NULL DEFAULT 2028,
  stage text NOT NULL CHECK (stage IN ('RENOVACAO','SEGUNDA_ETAPA')),
  scope_type text NOT NULL CHECK (scope_type IN ('PAVILION','MODULE_RANGE','BLOCK','LOT_RANGE','CORNER','ARTESANATO','EXCLUSION')),
  pavilion_identifier text,
  block text,
  range_start integer,
  range_end integer,
  is_corner boolean,
  price_per_sqm numeric(12,2),
  priority integer NOT NULL,
  label text NOT NULL,
  source text NOT NULL DEFAULT 'POLITICAS_CESSAO_ESPACOS_2028',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_price_rules_range_chk CHECK (
    (range_start IS NULL AND range_end IS NULL)
    OR (range_start IS NOT NULL AND range_end IS NOT NULL AND range_end >= range_start)
  ),
  CONSTRAINT commercial_price_rules_price_chk CHECK (
    scope_type = 'EXCLUSION' OR (price_per_sqm IS NOT NULL AND price_per_sqm > 0)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_price_rules TO authenticated;
GRANT ALL ON public.commercial_price_rules TO service_role;
ALTER TABLE public.commercial_price_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY commercial_price_rules_select ON public.commercial_price_rules
FOR SELECT TO authenticated
USING (
  project_id IS NULL
  OR EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = commercial_price_rules.project_id AND public.can_view_commercial_map(p.org_id))
);

CREATE POLICY commercial_price_rules_manage ON public.commercial_price_rules
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = commercial_price_rules.project_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_lots')))
WITH CHECK (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = commercial_price_rules.project_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_lots')));

CREATE INDEX commercial_price_rules_lookup_idx
  ON public.commercial_price_rules (project_id, exercise, stage, is_active);

CREATE TRIGGER commercial_price_rules_updated_at
BEFORE UPDATE ON public.commercial_price_rules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== Auditoria geométrica de esquinas =====
CREATE TABLE public.commercial_lot_corner_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL UNIQUE REFERENCES public.commercial_lots(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.map_projects(id) ON DELETE CASCADE,
  classification text NOT NULL CHECK (classification IN ('CORNER_CONFIRMED','NOT_CORNER','REVIEW_REQUIRED')),
  db_is_corner boolean NOT NULL DEFAULT false,
  adjacent_roads jsonb NOT NULL DEFAULT '[]'::jsonb,
  intersection_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  method text NOT NULL DEFAULT 'GEOMETRIC_BLOCK_VERTEX_V1',
  notes text,
  audited_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_lot_corner_audit TO authenticated;
GRANT ALL ON public.commercial_lot_corner_audit TO service_role;
ALTER TABLE public.commercial_lot_corner_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY commercial_lot_corner_audit_select ON public.commercial_lot_corner_audit
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = commercial_lot_corner_audit.project_id AND public.can_view_commercial_map(p.org_id)));

CREATE POLICY commercial_lot_corner_audit_manage ON public.commercial_lot_corner_audit
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = commercial_lot_corner_audit.project_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_lots')))
WITH CHECK (EXISTS (SELECT 1 FROM public.map_projects p WHERE p.id = commercial_lot_corner_audit.project_id AND public.map_has_explicit_capability(p.org_id, 'map.manage_lots')));

CREATE TRIGGER commercial_lot_corner_audit_updated_at
BEFORE UPDATE ON public.commercial_lot_corner_audit
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== Rastreabilidade no histórico de preços =====
ALTER TABLE public.lot_prices
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS stage text,
  ADD COLUMN IF NOT EXISTS rule_id uuid REFERENCES public.commercial_price_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS area_used_sqm numeric(12,2),
  ADD COLUMN IF NOT EXISTS notes text;

-- ===== Consulta oficial de precificação 2028 =====
CREATE OR REPLACE VIEW public.commercial_lot_pricing_2028
WITH (security_invoker = on) AS
WITH lot_base AS (
  SELECT
    l.id AS lot_id,
    l.project_id,
    l.public_identifier,
    l.block,
    l.status,
    l.official_area_sqm,
    l.area_validation_status,
    NULLIF(regexp_replace(COALESCE(l.lot_number, ''), '\D', '', 'g'), '')::int AS lot_num,
    e.metadata->>'pavilionIdentifier' AS pavilion,
    COALESCE(ca.classification, 'NOT_AUDITED') AS corner_status,
    (COALESCE(ca.classification, '') = 'CORNER_CONFIRMED') AS corner_confirmed
  FROM public.commercial_lots l
  JOIN public.map_entities e ON e.id = l.entity_id
  LEFT JOIN public.commercial_lot_corner_audit ca ON ca.lot_id = l.id
  WHERE l.archived_at IS NULL AND e.is_archived = false
),
matched AS (
  SELECT
    b.lot_id,
    r.stage,
    r.id AS rule_id,
    r.label,
    r.price_per_sqm,
    r.priority,
    RANK() OVER (PARTITION BY b.lot_id, r.stage ORDER BY r.priority DESC) AS rnk
  FROM lot_base b
  JOIN public.commercial_price_rules r
    ON r.is_active
   AND r.exercise = 2028
   AND r.scope_type <> 'EXCLUSION'
   AND (r.project_id IS NULL OR r.project_id = b.project_id)
   AND (r.pavilion_identifier IS NULL OR r.pavilion_identifier = b.pavilion)
   AND (r.block IS NULL OR r.block = b.block)
   AND (r.range_start IS NULL OR (b.lot_num IS NOT NULL AND b.lot_num BETWEEN r.range_start AND r.range_end))
   AND (r.is_corner IS NULL OR r.is_corner = b.corner_confirmed)
  WHERE b.pavilion IS DISTINCT FROM 'P7'
),
top_matches AS (
  SELECT lot_id, stage, rule_id, label, price_per_sqm, COUNT(*) OVER (PARTITION BY lot_id, stage) AS tie_count
  FROM matched
  WHERE rnk = 1
),
resolved AS (
  SELECT
    b.*,
    ren.rule_id AS renovacao_rule_id, ren.label AS renovacao_rule_label,
    ren.price_per_sqm AS renovacao_price_per_sqm, ren.tie_count AS renovacao_tie_count,
    seg.rule_id AS segunda_rule_id, seg.label AS segunda_rule_label,
    seg.price_per_sqm AS segunda_price_per_sqm, seg.tie_count AS segunda_tie_count
  FROM lot_base b
  LEFT JOIN top_matches ren ON ren.lot_id = b.lot_id AND ren.stage = 'RENOVACAO'
  LEFT JOIN top_matches seg ON seg.lot_id = b.lot_id AND seg.stage = 'SEGUNDA_ETAPA'
)
SELECT
  r.lot_id,
  r.project_id,
  r.public_identifier,
  r.pavilion,
  r.block,
  r.lot_num,
  r.status,
  r.corner_status,
  r.corner_confirmed,
  r.official_area_sqm,
  r.area_validation_status,
  r.renovacao_rule_id,
  r.renovacao_rule_label,
  r.renovacao_price_per_sqm,
  r.segunda_rule_id,
  r.segunda_rule_label,
  r.segunda_price_per_sqm,
  CASE WHEN r.pavilion = 'P7' THEN NULL
       WHEN COALESCE(r.official_area_sqm, 0) <= 0 THEN NULL
       WHEN COALESCE(r.renovacao_tie_count, 0) <> 1 THEN NULL
       ELSE ROUND(r.official_area_sqm * r.renovacao_price_per_sqm, 2) END AS renovacao_total,
  CASE WHEN r.pavilion = 'P7' THEN NULL
       WHEN COALESCE(r.official_area_sqm, 0) <= 0 THEN NULL
       WHEN COALESCE(r.segunda_tie_count, 0) <> 1 THEN NULL
       ELSE ROUND(r.official_area_sqm * r.segunda_price_per_sqm, 2) END AS segunda_total,
  CASE
    WHEN r.pavilion = 'P7' THEN 'EXCLUIDO'
    WHEN COALESCE(r.official_area_sqm, 0) <= 0 THEN 'SEM_AREA'
    WHEN COALESCE(r.renovacao_tie_count, 0) > 1 OR COALESCE(r.segunda_tie_count, 0) > 1 THEN 'REGRA_AMBIGUA'
    WHEN r.renovacao_rule_id IS NULL OR r.segunda_rule_id IS NULL THEN 'SEM_REGRA'
    ELSE 'OK'
  END AS resolution_status
FROM resolved r;

GRANT SELECT ON public.commercial_lot_pricing_2028 TO authenticated;
GRANT SELECT ON public.commercial_lot_pricing_2028 TO service_role;

-- ===== Aplicação das regras (com simulação) =====
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
  v_rec record;
  v_price numeric(14,2);
  v_authorized boolean;
BEGIN
  IF p_stage NOT IN ('RENOVACAO','SEGUNDA_ETAPA') THEN
    RAISE EXCEPTION 'INVALID_STAGE';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.map_projects p
    WHERE public.map_has_explicit_capability(p.org_id, 'map.manage_lots')
  ) INTO v_authorized;

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
    'skippedManual', v_skipped_manual,
    'skippedCommercial', v_skipped_commercial,
    'pending', v_pending,
    'excluded', v_excluded
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_lot_price_rules_2028(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_lot_price_rules_2028(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_lot_price_rules_2028(text, boolean) TO service_role;