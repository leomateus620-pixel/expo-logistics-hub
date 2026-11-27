BEGIN;

-- O lote principal reaproveita a estrutura J. Cada ponto conserva seu lote,
-- entidade, preço histórico, estado persistido e registros comerciais.
ALTER TABLE public.commercial_lots
  ADD COLUMN commercial_package_role text,
  ADD COLUMN commercial_package_principal_lot_id uuid REFERENCES public.commercial_lots(id) ON DELETE RESTRICT,
  ADD COLUMN commercial_package_reconciliation_pending boolean NOT NULL DEFAULT false,
  DROP CONSTRAINT commercial_lots_unit_check;
ALTER TABLE public.commercial_lots
  ADD CONSTRAINT commercial_lots_unit_check CHECK (
    (commercial_unit = 'SQUARE_METER' AND unit_quantity IS NULL)
    OR (commercial_unit = 'FOOD_POINT' AND unit_quantity IS NOT DISTINCT FROM 1
      AND display_order IS NOT NULL AND display_order > 0 AND price_source IS NOT NULL
      AND official_area_sqm IS NULL AND calculated_area_sqm IS NULL
      AND frontage_meters IS NULL AND depth_meters IS NULL AND area_validation_status = 'UNVALIDATED')
    OR (commercial_unit = 'FIXED_PACKAGE' AND unit_quantity IS NOT DISTINCT FROM 1
      AND official_area_sqm IS NULL AND price_source IS NOT NULL)
  ),
  ADD CONSTRAINT commercial_lots_package_check CHECK (
    CASE commercial_package_role
      WHEN 'PRINCIPAL' THEN commercial_package_principal_lot_id IS NULL AND commercial_unit = 'FIXED_PACKAGE'
        AND (NOT commercial_package_reconciliation_pending OR status = 'BLOCKED')
      WHEN 'COMPONENT' THEN commercial_package_principal_lot_id IS NOT NULL
        AND commercial_package_principal_lot_id <> id AND commercial_unit = 'FOOD_POINT'
        AND NOT commercial_package_reconciliation_pending
      ELSE commercial_package_role IS NULL AND commercial_package_principal_lot_id IS NULL
        AND commercial_unit <> 'FIXED_PACKAGE' AND NOT commercial_package_reconciliation_pending
    END
  );

CREATE INDEX commercial_lots_package_principal_idx
  ON public.commercial_lots(commercial_package_principal_lot_id)
  WHERE commercial_package_principal_lot_id IS NOT NULL;

ALTER TABLE public.lot_sale_order_items DROP CONSTRAINT lot_sale_order_items_unit_check;
ALTER TABLE public.lot_sale_order_items ADD CONSTRAINT lot_sale_order_items_unit_check CHECK (
  (commercial_unit = 'SQUARE_METER' AND unit_quantity_snapshot IS NULL
    AND official_area_snapshot IS NOT NULL AND price_per_sqm_snapshot IS NOT NULL)
  OR (commercial_unit IN ('FOOD_POINT', 'FIXED_PACKAGE') AND unit_quantity_snapshot IS NOT DISTINCT FROM 1
    AND official_area_snapshot IS NULL AND price_per_sqm_snapshot IS NULL AND item_total > 0
    AND display_name_snapshot IS NOT NULL AND structure_id_snapshot IS NOT NULL
    AND structure_identifier_snapshot IS NOT NULL AND structure_name_snapshot IS NOT NULL)
);

CREATE TABLE public.commercial_package_components (
  principal_lot_id uuid NOT NULL REFERENCES public.commercial_lots(id) ON DELETE RESTRICT,
  component_lot_id uuid PRIMARY KEY REFERENCES public.commercial_lots(id) ON DELETE RESTRICT,
  position smallint NOT NULL CHECK (position > 0),
  display_name text NOT NULL,
  composition_amount numeric(14,2) NOT NULL CHECK (composition_amount > 0),
  UNIQUE (principal_lot_id, position),
  CHECK (principal_lot_id <> component_lot_id)
);

CREATE TABLE public.commercial_package_order_components (
  order_item_id uuid NOT NULL REFERENCES public.lot_sale_order_items(id) ON DELETE RESTRICT,
  component_lot_id uuid NOT NULL REFERENCES public.commercial_lots(id) ON DELETE RESTRICT,
  position smallint NOT NULL,
  public_identifier text NOT NULL,
  display_name text NOT NULL,
  composition_amount numeric(14,2) NOT NULL,
  PRIMARY KEY (order_item_id, component_lot_id),
  UNIQUE (order_item_id, position)
);
ALTER TABLE public.commercial_package_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_package_order_components ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_package_components, public.commercial_package_order_components FROM PUBLIC, anon, authenticated;

-- A infraestrutura visual J continua uma atração e serve de âncora para
-- Gastronomia. O principal resolve seu segmento a partir do vínculo validado.
CREATE OR REPLACE FUNCTION public.resolve_commission_map_segment_slug_v2(_public_identifier text, _metadata jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN _metadata->>'commercialPackageRole' = 'PRINCIPAL'
      AND _metadata ? 'commercialPackageAnchorEntityId' THEN 'gastronomia'
    ELSE COALESCE(
      public.resolve_commission_map_segment_slug(_public_identifier, _metadata),
      CASE WHEN upper(COALESCE(_public_identifier,'')) ~ '^QUADRA-(U|P|T|O)$'
             OR upper(COALESCE(_public_identifier,'')) ~ '^Q-(U|P|T|O)-[0-9]{2}$'
           THEN 'espaco-automovel' END
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.map_segment_is_complete(_segment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT
    EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_entities e
      ON e.id = l.entity_id AND e.project_id = l.project_id
      WHERE e.segment_id = s.id AND e.project_id = s.project_id AND NOT e.is_archived AND l.archived_at IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.map_entities e
      LEFT JOIN public.commercial_lots l ON l.entity_id = e.id AND l.project_id = e.project_id
        AND l.commercial_package_role = 'PRINCIPAL' AND l.archived_at IS NULL
      WHERE e.segment_id = s.id AND e.project_id = s.project_id AND NOT e.is_archived
        AND NOT EXISTS (
          SELECT 1 FROM public.map_entity_geometries g
          JOIN public.map_entities anchor ON anchor.id = g.entity_id AND anchor.project_id = g.project_id
          WHERE g.project_id = s.project_id AND g.is_current AND NOT anchor.is_archived
            AND g.entity_id = CASE
              WHEN e.classification = 'FOOD_POINT' THEN e.parent_entity_id
              WHEN l.id IS NOT NULL THEN (e.metadata->>'commercialPackageAnchorEntityId')::uuid
              ELSE e.id END
            AND ((e.classification <> 'FOOD_POINT' AND l.id IS NULL)
              OR (s.slug = 'gastronomia' AND NOT anchor.is_sellable))
        )
    )
  FROM public.map_segments s WHERE s.id = _segment_id AND s.is_active), false);
$$;

DO $stallonne$
DECLARE
  v_project constant uuid := '0538d132-34dd-4347-a33c-526edac7339c';
  v_name constant text := 'Parque de Diversões Stallonne';
  v_segment uuid;
  v_anchor public.map_entities%ROWTYPE;
  v_lot public.commercial_lots%ROWTYPE;
  v_point record;
  v_child public.commercial_lots%ROWTYPE;
  v_candidate_ids uuid[];
  v_children uuid[] := '{}';
  v_conflict boolean;
  v_price public.lot_prices%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('commercial-stallonne-package-2028', 0));

  SELECT s.id INTO STRICT v_segment
  FROM public.map_segments s JOIN public.map_projects p ON p.id = s.project_id
  WHERE p.id = v_project AND NOT p.is_archived AND s.slug = 'gastronomia' AND s.is_active;

  SELECT e.* INTO STRICT v_anchor
  FROM public.map_entities e JOIN public.map_entity_geometries g ON g.entity_id = e.id
    AND g.project_id = e.project_id AND g.is_current
  WHERE e.project_id = v_project AND e.public_identifier = 'J' AND e.classification = 'ATTRACTION'
    AND NOT e.is_archived AND NOT e.is_sellable
    AND lower(normalize(trim(e.name))) IN (
      'parque de diversões', 'parque de diversoes', 'parque de diversões stallonne', 'parque de diversoes stallonne'
    )
    AND (e.segment_id IS NULL OR e.segment_id = v_segment)
  FOR UPDATE OF e;

  FOR v_point IN SELECT * FROM (VALUES
    ('GAST-J-01', 1, 'Pipoca, crepes, algodão-doce e maçã do amor', 19040.00),
    ('GAST-J-02', 2, 'Lanches e bebidas (food truck)', 22560.00),
    ('GAST-J-03', 3, 'Sorvete', 10680.00)
  ) AS point(code, position, display_name, amount)
  LOOP
    SELECT l.* INTO STRICT v_child
    FROM public.commercial_lots l JOIN public.map_entities e ON e.id = l.entity_id AND e.project_id = l.project_id
    WHERE l.project_id = v_project AND l.archived_at IS NULL AND l.commercial_unit = 'FOOD_POINT'
      AND l.public_identifier = v_point.code AND e.public_identifier = v_point.code
      AND e.parent_entity_id = v_anchor.id AND e.segment_id = v_segment
      AND e.classification = 'FOOD_POINT' AND NOT e.is_archived
    FOR UPDATE OF l, e;
    v_children := array_append(v_children, v_child.id);
  END LOOP;

  -- Mesmo um cadastro incompleto ou arquivado pode ser indício de duplicidade.
  SELECT array_agg(l.id ORDER BY l.id) INTO v_candidate_ids
  FROM public.commercial_lots l JOIN public.map_entities e ON e.id = l.entity_id AND e.project_id = l.project_id
  WHERE l.project_id = v_project AND NOT (l.id = ANY(v_children)) AND (
    l.entity_id = v_anchor.id OR l.public_identifier = 'PARK-STALLONNE'
    OR e.metadata->>'commercialPackageRole' = 'PRINCIPAL'
    OR EXISTS (
      SELECT 1 FROM unnest(ARRAY[l.display_name, e.name, l.public_identifier, e.public_identifier]) label
      WHERE lower(normalize(trim(label))) IN (
        'parque de diversões', 'parque de diversoes', 'parque de diversões stallonne',
        'parque de diversoes stallonne', 'parque stallonne', 'park stallonne', 'stallonne'
      )
    )
    OR (e.parent_entity_id = v_anchor.id AND l.commercial_unit <> 'FOOD_POINT')
  );
  IF cardinality(v_candidate_ids) > 1 THEN
    RAISE EXCEPTION 'STALLONNE_PRINCIPAL_AMBIGUOUS:%', v_candidate_ids;
  END IF;
  IF v_candidate_ids IS NOT NULL THEN
    SELECT l.* INTO STRICT v_lot FROM public.commercial_lots l JOIN public.map_entities e ON e.id = l.entity_id
    WHERE l.id = v_candidate_ids[1] AND l.archived_at IS NULL AND NOT e.is_archived
      AND (e.id = v_anchor.id OR (e.parent_entity_id = v_anchor.id AND e.classification <> 'FOOD_POINT'))
      AND (e.segment_id IS NULL OR e.segment_id = v_segment)
      AND l.official_area_sqm IS NULL AND l.commercial_unit <> 'FOOD_POINT'
    FOR UPDATE OF l, e;
  END IF;

  SELECT
    EXISTS (SELECT 1 FROM public.commercial_lots l WHERE l.id = ANY(v_children) AND l.status <> 'AVAILABLE')
    OR EXISTS (SELECT 1 FROM public.lot_sales s WHERE s.lot_id = ANY(v_children) AND s.status <> 'REVERTED')
    OR EXISTS (SELECT 1 FROM public.lot_reservations r WHERE r.lot_id = ANY(v_children) AND r.status = 'ACTIVE')
    OR EXISTS (SELECT 1 FROM public.lot_negotiations n WHERE n.lot_id = ANY(v_children) AND n.status = 'ACTIVE')
    OR EXISTS (SELECT 1 FROM public.lot_sale_order_items i JOIN public.lot_sale_orders o ON o.id = i.order_id
      WHERE i.lot_id = ANY(v_children) AND i.contract_state <> 'CANCELLED' AND o.status = 'CONFIRMED')
    OR EXISTS (SELECT 1 FROM public.lot_contracts c
      LEFT JOIN public.lot_contract_lots cl ON cl.contract_id = c.id AND cl.removed_at IS NULL
      WHERE c.is_active AND (c.lot_id = ANY(v_children) OR cl.lot_id = ANY(v_children)))
  INTO v_conflict;

  IF v_lot.id IS NULL THEN
    INSERT INTO public.commercial_lots (
      project_id, entity_id, public_identifier, display_name, status, commercial_unit, unit_quantity,
      price_source, commercial_package_role, commercial_package_reconciliation_pending
    ) VALUES (
      v_project, v_anchor.id, 'PARK-STALLONNE', v_name, CASE WHEN v_conflict THEN 'BLOCKED' ELSE 'AVAILABLE' END,
      'FIXED_PACKAGE', 1, '{"exercise":2028,"compositionBase":200000}', 'PRINCIPAL', v_conflict
    ) RETURNING * INTO v_lot;
  ELSE
    -- Uma unidade já comercializada só é reutilizável após verificar todos os
    -- registros relacionados. O rollout do catálogo não converte vendas.
    IF EXISTS (SELECT 1 FROM public.lot_sales WHERE lot_id = v_lot.id)
      OR EXISTS (SELECT 1 FROM public.lot_sale_order_items WHERE lot_id = v_lot.id)
      OR EXISTS (SELECT 1 FROM public.lot_reservations WHERE lot_id = v_lot.id AND status = 'ACTIVE')
      OR EXISTS (SELECT 1 FROM public.lot_negotiations WHERE lot_id = v_lot.id AND status = 'ACTIVE')
      OR EXISTS (SELECT 1 FROM public.lot_contracts c LEFT JOIN public.lot_contract_lots cl
        ON cl.contract_id = c.id AND cl.removed_at IS NULL
        WHERE c.is_active AND (c.lot_id = v_lot.id OR cl.lot_id = v_lot.id))
      OR (v_conflict AND v_lot.status NOT IN ('AVAILABLE', 'BLOCKED')) THEN
      RAISE EXCEPTION 'STALLONNE_EXISTING_PRINCIPAL_REQUIRES_REVIEW:%', v_lot.id;
    END IF;
    UPDATE public.commercial_lots SET display_name = v_name, commercial_unit = 'FIXED_PACKAGE', unit_quantity = 1,
      commercial_package_role = 'PRINCIPAL', commercial_package_reconciliation_pending = v_conflict,
      status = CASE WHEN v_conflict THEN 'BLOCKED' ELSE status END,
      price_source = coalesce(price_source, '{}'::jsonb) || '{"exercise":2028,"compositionBase":200000}'::jsonb
    WHERE id = v_lot.id;
  END IF;

  SELECT * INTO v_price FROM public.lot_prices WHERE lot_id = v_lot.id AND is_active FOR UPDATE;
  IF FOUND THEN
    IF v_price.pricing_mode <> 'FIXED_TOTAL' OR v_price.base_price IS DISTINCT FROM 252280.00
      OR v_price.price_per_sqm IS NOT NULL THEN
      RAISE EXCEPTION 'STALLONNE_PRINCIPAL_PRICE_CONFLICT:%', v_lot.id;
    END IF;
  ELSE
    INSERT INTO public.lot_prices(lot_id, pricing_mode, base_price, is_active)
    VALUES (v_lot.id, 'FIXED_TOTAL', 252280.00, true);
  END IF;

  UPDATE public.map_entities SET
    name = CASE WHEN id = v_anchor.id THEN name ELSE v_name END,
    segment_id = v_segment,
    metadata = metadata || jsonb_build_object(
      'commercialPackageRole', 'PRINCIPAL',
      'commercialPackagePrincipalLotId', v_lot.id,
      'commercialPackageAnchorEntityId', v_anchor.id,
      'commercialPackageReconciliationPending', v_conflict
    )
  WHERE id = v_lot.entity_id;

  FOR v_point IN SELECT * FROM (VALUES
    ('GAST-J-01', 1, 'Pipoca, crepes, algodão-doce e maçã do amor', 19040.00),
    ('GAST-J-02', 2, 'Lanches e bebidas (food truck)', 22560.00),
    ('GAST-J-03', 3, 'Sorvete', 10680.00)
  ) AS point(code, position, display_name, amount)
  LOOP
    UPDATE public.commercial_lots SET commercial_package_role = 'COMPONENT',
      commercial_package_principal_lot_id = v_lot.id
    WHERE id = ANY(v_children) AND public_identifier = v_point.code RETURNING * INTO STRICT v_child;
    INSERT INTO public.commercial_package_components(
      principal_lot_id, component_lot_id, position, display_name, composition_amount
    ) VALUES (v_lot.id, v_child.id, v_point.position, v_point.display_name, v_point.amount);
    UPDATE public.map_entities SET metadata = metadata || jsonb_build_object(
      'commercialPackageRole', 'COMPONENT', 'commercialPackagePrincipalLotId', v_lot.id,
      'commercialPackageComponentName', v_point.display_name
    ) WHERE id = v_child.entity_id;
  END LOOP;
END $stallonne$;

-- Conserva as regras vigentes para área e pontos independentes.
CREATE OR REPLACE VIEW public.commercial_lot_pricing_2028 WITH (security_invoker = on) AS
WITH lot_base AS (
  SELECT l.id lot_id, l.project_id, l.entity_id, l.public_identifier,
    CASE WHEN l.block ~ '^P[0-9]+$' THEN NULL::text ELSE l.block END block,
    l.status, l.official_area_sqm, l.area_validation_status,
    nullif(regexp_replace(coalesce(l.lot_number,''),'\D','','g'),'')::int lot_num,
    CASE WHEN l.block ~ '^P[0-9]+$' THEN l.block END pavilion,
    coalesce(ca.classification,'NOT_AUDITED') corner_status,
    coalesce(ca.classification,'')='CORNER_CONFIRMED' corner_confirmed,
    CASE WHEN e.metadata->>'pricingGroup'='quadra-r-01-12' AND l.block='R'
      AND l.public_identifier='EXPORURAL-AREA-56878' THEN 1 END pricing_group_num,
    l.commercial_unit, l.unit_quantity, l.commercial_package_role, fp.base_price AS fixed_total
  FROM public.commercial_lots l JOIN public.map_entities e ON e.id=l.entity_id
  LEFT JOIN public.commercial_lot_corner_audit ca ON ca.lot_id=l.id
  LEFT JOIN public.lot_prices fp ON l.commercial_unit IN ('FOOD_POINT','FIXED_PACKAGE') AND l.commercial_package_role IS DISTINCT FROM 'COMPONENT' AND fp.lot_id=l.id
    AND fp.is_active AND fp.pricing_mode='FIXED_TOTAL' AND fp.base_price>0 AND fp.price_per_sqm IS NULL
  WHERE l.archived_at IS NULL AND NOT e.is_archived
), matched AS (
  SELECT b.lot_id, r.stage, r.id rule_id, r.label,
    CASE WHEN b.pricing_group_num=1 AND r.stage='SEGUNDA_ETAPA' AND r.block='R'
      AND r.range_start=1 AND r.range_end=12 THEN 30.25::numeric ELSE r.price_per_sqm END price_per_sqm,
    rank() OVER(PARTITION BY b.lot_id,r.stage ORDER BY r.priority DESC) rnk
  FROM lot_base b JOIN public.commercial_price_rules r ON r.is_active AND r.exercise=2028
    AND r.scope_type<>'EXCLUSION' AND (r.project_id IS NULL OR r.project_id=b.project_id)
    AND (r.pavilion_identifier IS NULL OR r.pavilion_identifier=b.pavilion)
    AND (r.block IS NULL OR r.block=b.block) AND (r.pavilion_identifier IS NOT NULL OR r.block IS NOT NULL)
    AND (r.range_start IS NULL OR coalesce(b.pricing_group_num,b.lot_num) BETWEEN r.range_start AND r.range_end)
    AND (r.is_corner IS NULL OR r.is_corner=b.corner_confirmed)
  WHERE b.commercial_unit='SQUARE_METER'
), top_matches AS (
  SELECT lot_id, stage, rule_id, label, price_per_sqm, count(*) OVER(PARTITION BY lot_id,stage) tie_count
  FROM matched WHERE rnk=1
), resolved AS (
  SELECT b.*, ren.rule_id renovacao_rule_id, ren.label renovacao_rule_label, ren.price_per_sqm rule_ren_ppsqm,
    ren.tie_count ren_tie, seg.rule_id segunda_rule_id, seg.label segunda_rule_label,
    seg.price_per_sqm rule_seg_ppsqm, seg.tie_count seg_tie, ovr.total ren_override, ovs.total seg_override
  FROM lot_base b
  LEFT JOIN top_matches ren ON ren.lot_id=b.lot_id AND ren.stage='RENOVACAO'
  LEFT JOIN top_matches seg ON seg.lot_id=b.lot_id AND seg.stage='SEGUNDA_ETAPA'
  LEFT JOIN public.commercial_lot_price_overrides ovr ON b.commercial_unit='SQUARE_METER' AND ovr.lot_id=b.lot_id AND ovr.stage='RENOVACAO'
  LEFT JOIN public.commercial_lot_price_overrides ovs ON b.commercial_unit='SQUARE_METER' AND ovs.lot_id=b.lot_id AND ovs.stage='SEGUNDA_ETAPA'
), calc AS (
  SELECT r.*,
    CASE WHEN commercial_unit IN ('FOOD_POINT','FIXED_PACKAGE') THEN fixed_total
      WHEN official_area_sqm>0 AND ren_tie=1 THEN round(official_area_sqm*rule_ren_ppsqm,2) END ren_default,
    CASE WHEN commercial_unit IN ('FOOD_POINT','FIXED_PACKAGE') THEN fixed_total
      WHEN official_area_sqm>0 AND seg_tie=1 THEN round(official_area_sqm*rule_seg_ppsqm,2) END seg_default
  FROM resolved r
)
SELECT lot_id, project_id, public_identifier, pavilion, block, lot_num, status, corner_status,
  corner_confirmed, official_area_sqm, area_validation_status, renovacao_rule_id,
  CASE WHEN commercial_unit='FIXED_PACKAGE' AND fixed_total IS NOT NULL THEN 'Locação do Parque Stallonne'
    WHEN commercial_unit='FOOD_POINT' AND fixed_total IS NOT NULL THEN 'Preço oficial por ponto'
    WHEN ren_override IS NOT NULL THEN 'Valor manual' ELSE renovacao_rule_label END renovacao_rule_label,
  (CASE WHEN ren_override IS NOT NULL THEN round(ren_override/nullif(official_area_sqm,0),2)
    ELSE rule_ren_ppsqm END)::numeric(12,2) renovacao_price_per_sqm,
  segunda_rule_id,
  CASE WHEN commercial_unit='FIXED_PACKAGE' AND fixed_total IS NOT NULL THEN 'Locação do Parque Stallonne'
    WHEN commercial_unit='FOOD_POINT' AND fixed_total IS NOT NULL THEN 'Preço oficial por ponto'
    WHEN seg_override IS NOT NULL THEN 'Valor manual' ELSE segunda_rule_label END segunda_rule_label,
  (CASE WHEN seg_override IS NOT NULL THEN round(seg_override/nullif(official_area_sqm,0),2)
    ELSE rule_seg_ppsqm END)::numeric(12,2) segunda_price_per_sqm,
  coalesce(ren_override,ren_default) renovacao_total, coalesce(seg_override,seg_default) segunda_total,
  CASE WHEN commercial_package_role='COMPONENT' THEN 'SEM_REGRA'
    WHEN commercial_unit IN ('FOOD_POINT','FIXED_PACKAGE') THEN CASE WHEN fixed_total IS NOT NULL THEN 'OK' ELSE 'SEM_REGRA' END
    WHEN ren_override IS NOT NULL AND seg_override IS NOT NULL THEN 'OK'
    WHEN coalesce(official_area_sqm,0)<=0 THEN 'SEM_AREA'
    WHEN (ren_override IS NULL AND coalesce(ren_tie,0)>1) OR (seg_override IS NULL AND coalesce(seg_tie,0)>1) THEN 'REGRA_AMBIGUA'
    WHEN pavilion='P7' AND coalesce(ren_override,ren_default) IS NOT NULL THEN 'OK'
    WHEN (ren_override IS NULL AND renovacao_rule_id IS NULL) OR (seg_override IS NULL AND segunda_rule_id IS NULL) THEN 'SEM_REGRA'
    ELSE 'OK' END resolution_status,
  ren_default renovacao_default_total, seg_default segunda_default_total, (ren_override IS NOT NULL) renovacao_is_manual,
  (seg_override IS NOT NULL) segunda_is_manual, entity_id, commercial_unit, unit_quantity
FROM calc;

CREATE OR REPLACE VIEW public.commercial_sale_eligibility WITH (security_invoker = on) AS
WITH hist AS (
  SELECT lot_id, count(*) FILTER (WHERE reason IS DISTINCT FROM
    'Lote numerado importado da referência oficial 2026.3; validação comercial pendente.') commercial_entries
  FROM public.lot_status_history GROUP BY lot_id
), base AS (
  SELECT l.id lot_id, l.project_id, l.public_identifier, l.block, l.status, l.official_area_sqm,
    p.resolution_status, (l.block='P7' AND p.renovacao_total IS NULL) is_unpriced_pavilion,
    EXISTS (SELECT 1 FROM public.lot_sales s WHERE s.lot_id=l.id AND coalesce(s.status,'ACTIVE')<>'REVERTED') has_active_sale,
    EXISTS (SELECT 1 FROM public.lot_reservations r WHERE r.lot_id=l.id AND r.status='ACTIVE') has_active_reservation,
    EXISTS (SELECT 1 FROM public.lot_negotiations n WHERE n.lot_id=l.id AND n.status='ACTIVE') has_active_negotiation,
    EXISTS (SELECT 1 FROM public.lot_contracts c WHERE c.lot_id=l.id AND c.is_active
      AND (l.commercial_unit='SQUARE_METER' OR EXISTS (
        SELECT 1 FROM public.lot_sales s WHERE s.id=c.sale_id AND s.status IN ('OPEN','CONFIRMED')
      ))) has_active_contract,
    l.archived_at, coalesce(h.commercial_entries,0) commercial_entries, l.commercial_unit,
    l.commercial_package_role, l.commercial_package_reconciliation_pending,
    (l.commercial_unit='FOOD_POINT' AND EXISTS (
      SELECT 1 FROM public.map_entities e
      JOIN public.map_segments s ON s.id=e.segment_id AND s.project_id=l.project_id AND s.slug='gastronomia' AND s.is_active
      JOIN public.map_entities a ON a.id=e.parent_entity_id AND a.project_id=l.project_id AND NOT a.is_archived AND NOT a.is_sellable
      JOIN public.map_entity_geometries g ON g.entity_id=a.id AND g.project_id=l.project_id AND g.is_current
      WHERE e.id=l.entity_id AND e.project_id=l.project_id AND e.classification='FOOD_POINT' AND NOT e.is_archived
    )) has_valid_anchor
  FROM public.commercial_lots l LEFT JOIN hist h ON h.lot_id=l.id
  LEFT JOIN public.commercial_lot_pricing_2028 p ON p.lot_id=l.id
), decisions AS (
  SELECT *,
    CASE WHEN status IN ('AVAILABLE','RESERVED','IN_NEGOTIATION') THEN 'COMMERCIAL_OPEN'
      WHEN commercial_unit='SQUARE_METER' AND status='BLOCKED' AND commercial_entries=0 THEN 'TECHNICAL_BLOCK'
      WHEN status='BLOCKED' THEN 'COMMERCIAL_BLOCK' ELSE 'CLOSED' END status_origin,
    CASE WHEN archived_at IS NOT NULL THEN 'ARQUIVADO'
      WHEN commercial_package_role='COMPONENT' THEN 'INCLUIDO_NO_PACOTE'
      WHEN commercial_package_reconciliation_pending THEN 'CONCILIACAO_PENDENTE'
      WHEN commercial_unit='FOOD_POINT' AND NOT has_valid_anchor THEN 'ESTRUTURA_INVALIDA'
      WHEN commercial_unit='SQUARE_METER' AND coalesce(official_area_sqm,0)<=0 THEN 'SEM_AREA_OFICIAL'
      WHEN resolution_status IS DISTINCT FROM 'OK' THEN 'SEM_PRECO_2028'
      WHEN has_active_sale THEN 'VENDA_ATIVA' WHEN has_active_reservation THEN 'RESERVA_ATIVA'
      WHEN has_active_negotiation THEN 'NEGOCIACAO_ATIVA' WHEN has_active_contract THEN 'CONTRATO_ATIVO'
      WHEN status='AVAILABLE' OR (commercial_unit='SQUARE_METER' AND
        (status IN ('RESERVED','IN_NEGOTIATION') OR (status='BLOCKED' AND commercial_entries=0))) THEN NULL
      WHEN status='BLOCKED' THEN 'BLOQUEIO_COMERCIAL_EXPLICITO' ELSE 'STATUS_NAO_VENDAVEL' END ineligible_reason
  FROM base
)
SELECT lot_id, project_id, public_identifier, block, status, official_area_sqm, resolution_status, is_unpriced_pavilion,
  has_active_sale, has_active_reservation, has_active_negotiation, has_active_contract, status_origin,
  ineligible_reason, ineligible_reason IS NULL AS is_sellable, commercial_unit
FROM decisions;

-- Os campos do pacote só mudam por uma migração aprovada.
CREATE FUNCTION public.guard_commercial_package_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.commercial_package_role IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND (
      (NEW.commercial_package_role, NEW.commercial_package_principal_lot_id, NEW.commercial_package_reconciliation_pending)
      IS DISTINCT FROM (OLD.commercial_package_role, OLD.commercial_package_principal_lot_id, OLD.commercial_package_reconciliation_pending)
      OR (OLD.commercial_package_role IS NOT NULL AND
        (NEW.project_id, NEW.entity_id, NEW.commercial_unit, NEW.public_identifier, NEW.archived_at)
        IS DISTINCT FROM (OLD.project_id, OLD.entity_id, OLD.commercial_unit, OLD.public_identifier, OLD.archived_at))
      OR (OLD.commercial_package_role = 'COMPONENT' AND NEW.status IS DISTINCT FROM OLD.status
        AND (OLD.status IN ('SOLD', 'SALE_OPEN') OR NEW.status IN ('SOLD', 'SALE_OPEN')))
    )) THEN
    RAISE EXCEPTION 'COMMERCIAL_PACKAGE_IDENTITY_LOCKED';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_commercial_package_identity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER commercial_package_identity_guard
BEFORE INSERT OR UPDATE ON public.commercial_lots
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_package_identity();

CREATE FUNCTION public.guard_commercial_package_entity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF (NEW.metadata->'commercialPackageRole', NEW.metadata->'commercialPackagePrincipalLotId',
      NEW.metadata->'commercialPackageAnchorEntityId', NEW.metadata->'commercialPackageReconciliationPending',
      NEW.metadata->'commercialPackageComponentName')
    IS DISTINCT FROM (OLD.metadata->'commercialPackageRole', OLD.metadata->'commercialPackagePrincipalLotId',
      OLD.metadata->'commercialPackageAnchorEntityId', OLD.metadata->'commercialPackageReconciliationPending',
      OLD.metadata->'commercialPackageComponentName')
    OR (OLD.metadata ? 'commercialPackageRole' AND
      (NEW.project_id, NEW.public_identifier, NEW.classification, NEW.parent_entity_id, NEW.is_archived)
      IS DISTINCT FROM (OLD.project_id, OLD.public_identifier, OLD.classification, OLD.parent_entity_id, OLD.is_archived)) THEN
    RAISE EXCEPTION 'COMMERCIAL_PACKAGE_IDENTITY_LOCKED';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_commercial_package_entity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER commercial_package_entity_guard
BEFORE UPDATE OF metadata, project_id, public_identifier, classification, parent_entity_id, is_archived ON public.map_entities
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_package_entity();

CREATE FUNCTION public.guard_commercial_package_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_lot public.commercial_lots%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.lot_id IS DISTINCT FROM OLD.lot_id
    AND EXISTS (SELECT 1 FROM public.commercial_lots WHERE id = OLD.lot_id AND commercial_package_role IS NOT NULL) THEN
    RAISE EXCEPTION 'COMMERCIAL_PACKAGE_IDENTITY_LOCKED';
  END IF;
  SELECT * INTO v_lot FROM public.commercial_lots
  WHERE id = NEW.lot_id AND commercial_package_role IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF v_lot.commercial_package_role = 'COMPONENT' THEN
    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.lot_id IS DISTINCT FROM OLD.lot_id
      OR NEW.negotiated_value IS DISTINCT FROM OLD.negotiated_value THEN
      RAISE EXCEPTION 'COMMERCIAL_PACKAGE_COMPONENT';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF v_lot.commercial_package_reconciliation_pending THEN RAISE EXCEPTION 'COMMERCIAL_PACKAGE_RECONCILIATION_REQUIRED'; END IF;
    IF v_lot.status <> 'AVAILABLE' OR EXISTS (SELECT 1 FROM public.lot_sales s
      WHERE s.lot_id = v_lot.id AND s.status IN ('OPEN', 'CONFIRMED')) THEN
      RAISE EXCEPTION 'COMMERCIAL_PACKAGE_UNAVAILABLE';
    END IF;
    IF NEW.status <> 'OPEN' THEN RAISE EXCEPTION 'USE_COMMERCIAL_CHECKOUT'; END IF;
  END IF;
  IF NEW.negotiated_value IS DISTINCT FROM 252280.00 THEN RAISE EXCEPTION 'COMMERCIAL_PACKAGE_PRICE_MISMATCH'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'CONFIRMED' AND OLD.status IS DISTINCT FROM NEW.status
    AND NOT EXISTS (
      SELECT 1 FROM public.lot_sale_order_items i JOIN public.lot_contracts c
        ON c.order_id = i.order_id AND c.scope = 'ORDER_ITEMS' AND c.is_active
      JOIN public.lot_contract_versions v ON v.contract_id = c.id AND v.version = c.active_version
      WHERE i.sale_id = NEW.id AND i.contract_state = 'SIGNED' AND v.mime_type = 'application/pdf'
        AND cardinality(v.covered_lot_ids) = 4 AND i.lot_id = ANY(v.covered_lot_ids)
    ) THEN
    RAISE EXCEPTION 'COMMERCIAL_PACKAGE_CONTRACT_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_commercial_package_sale() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER commercial_package_sale_guard
BEFORE INSERT OR UPDATE OF lot_id, status, negotiated_value ON public.lot_sales
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_package_sale();

CREATE FUNCTION public.require_commercial_package_checkout()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.commercial_lots WHERE id = NEW.lot_id AND commercial_package_role = 'PRINCIPAL')
    AND NOT EXISTS (SELECT 1 FROM public.lot_sale_order_items
      WHERE sale_id = NEW.id AND lot_id = NEW.lot_id AND commercial_unit = 'FIXED_PACKAGE'
        AND item_total = NEW.negotiated_value) THEN
    RAISE EXCEPTION 'USE_COMMERCIAL_CHECKOUT';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.require_commercial_package_checkout() FROM PUBLIC, anon, authenticated;
CREATE CONSTRAINT TRIGGER commercial_package_checkout_required
AFTER INSERT ON public.lot_sales DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.require_commercial_package_checkout();

CREATE FUNCTION public.guard_commercial_package_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_role text;
  v_order public.lot_sale_orders%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.lot_id IS DISTINCT FROM OLD.lot_id
    AND EXISTS (SELECT 1 FROM public.commercial_lots WHERE id = OLD.lot_id AND commercial_package_role IS NOT NULL) THEN
    RAISE EXCEPTION 'COMMERCIAL_PACKAGE_IDENTITY_LOCKED';
  END IF;
  SELECT commercial_package_role INTO v_role FROM public.commercial_lots WHERE id = NEW.lot_id;
  IF v_role = 'COMPONENT' THEN
    RAISE EXCEPTION 'COMMERCIAL_PACKAGE_COMPONENT';
  END IF;
  IF v_role IS DISTINCT FROM 'PRINCIPAL' AND NEW.commercial_unit = 'FIXED_PACKAGE' THEN
    RAISE EXCEPTION 'COMMERCIAL_PACKAGE_ITEM_INVALID';
  END IF;
  IF v_role = 'PRINCIPAL' THEN
    IF NEW.commercial_unit <> 'FIXED_PACKAGE' OR NEW.item_total IS DISTINCT FROM 252280.00
      OR (TG_OP = 'UPDATE' AND (NEW.order_id, NEW.lot_id, NEW.sale_id)
        IS DISTINCT FROM (OLD.order_id, OLD.lot_id, OLD.sale_id)) THEN
      RAISE EXCEPTION 'COMMERCIAL_PACKAGE_ITEM_INVALID';
    END IF;
    SELECT * INTO STRICT v_order FROM public.lot_sale_orders WHERE id = NEW.order_id FOR UPDATE;
    IF coalesce(v_order.fee_admin, 0) <> 0 OR coalesce(v_order.fee_ppci, 0) <> 0
      OR coalesce(v_order.fee_cleaning_license, 0) <> 0 OR coalesce(v_order.fees_total, 0) <> 0 THEN
      RAISE EXCEPTION 'COMMERCIAL_PACKAGE_NO_EXTRA_FEES';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lot_sale_order_items i WHERE i.order_id = NEW.order_id AND i.id <> NEW.id) THEN
      RAISE EXCEPTION 'COMMERCIAL_PACKAGE_EXCLUSIVE_CHECKOUT';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.lot_sale_order_items i
    WHERE i.order_id = NEW.order_id AND i.commercial_unit = 'FIXED_PACKAGE') THEN
    RAISE EXCEPTION 'COMMERCIAL_PACKAGE_EXCLUSIVE_CHECKOUT';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_commercial_package_line() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER commercial_package_line_guard BEFORE INSERT OR UPDATE OF lot_id, order_id, sale_id,
  commercial_unit, item_total, contract_state ON public.lot_sale_order_items
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_package_line();

CREATE FUNCTION public.snapshot_commercial_package()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO public.commercial_package_order_components (
    order_item_id, component_lot_id, position, public_identifier, display_name, composition_amount
  )
  SELECT NEW.id, l.id, c.position, l.public_identifier, c.display_name, c.composition_amount
  FROM public.commercial_package_components c JOIN public.commercial_lots l ON l.id = c.component_lot_id
  WHERE c.principal_lot_id = NEW.lot_id AND l.archived_at IS NULL
    AND l.commercial_package_principal_lot_id = NEW.lot_id AND l.project_id = (
      SELECT project_id FROM public.commercial_lots WHERE id = NEW.lot_id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 3 THEN RAISE EXCEPTION 'COMMERCIAL_PACKAGE_INCOMPLETE'; END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_commercial_package() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER commercial_package_component_snapshot AFTER INSERT ON public.lot_sale_order_items
FOR EACH ROW WHEN (NEW.commercial_unit = 'FIXED_PACKAGE') EXECUTE FUNCTION public.snapshot_commercial_package();

CREATE FUNCTION public.snapshot_commercial_package_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  SELECT l.unit_quantity, l.display_name, a.id, a.public_identifier, a.name
  INTO STRICT NEW.unit_quantity_snapshot, NEW.display_name_snapshot, NEW.structure_id_snapshot,
    NEW.structure_identifier_snapshot, NEW.structure_name_snapshot
  FROM public.commercial_lots l
  JOIN public.map_entities e ON e.id = l.entity_id AND e.project_id = l.project_id
  JOIN public.map_entities a ON a.id = (e.metadata->>'commercialPackageAnchorEntityId')::uuid AND a.project_id = l.project_id
  WHERE l.id = NEW.lot_id AND l.commercial_package_role = 'PRINCIPAL'
    AND a.public_identifier = 'J' AND a.classification = 'ATTRACTION' AND NOT a.is_archived;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_commercial_package_line() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER commercial_package_line_snapshot BEFORE INSERT ON public.lot_sale_order_items
FOR EACH ROW WHEN (NEW.commercial_unit = 'FIXED_PACKAGE') EXECUTE FUNCTION public.snapshot_commercial_package_line();

CREATE FUNCTION public.guard_commercial_package_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lot_sale_order_items i
    WHERE i.order_id = NEW.id AND i.commercial_unit = 'FIXED_PACKAGE') THEN
    RETURN NEW;
  END IF;
  IF coalesce(NEW.fee_admin,0) <> 0 OR coalesce(NEW.fee_ppci,0) <> 0
    OR coalesce(NEW.fee_cleaning_license,0) <> 0 OR coalesce(NEW.fees_total,0) <> 0
    OR NEW.negotiated_total IS DISTINCT FROM 252280.00 OR NEW.spaces_subtotal IS DISTINCT FROM 252280.00 THEN
    RAISE EXCEPTION 'COMMERCIAL_PACKAGE_NO_EXTRA_FEES';
  END IF;
  IF NEW.status = 'REVERTED' AND NEW.status IS DISTINCT FROM OLD.status
    AND EXISTS (SELECT 1 FROM public.lot_sale_installments i WHERE i.order_id = NEW.id
      AND (i.payment_status = 'PAID' OR i.paid_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'TOTAL_BELOW_PAID';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_commercial_package_order() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER commercial_package_order_guard BEFORE UPDATE OF fee_admin, fee_ppci, fee_cleaning_license,
  fees_total, negotiated_total, spaces_subtotal, status ON public.lot_sale_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_package_order();

CREATE FUNCTION public.guard_commercial_package_lot_action()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_old_lot uuid;
  v_new_lot uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old_lot := OLD.lot_id; END IF;
  IF TG_OP <> 'DELETE' THEN v_new_lot := NEW.lot_id; END IF;
  IF EXISTS (SELECT 1 FROM public.commercial_lots
    WHERE id IN (v_old_lot, v_new_lot) AND commercial_package_role IS NOT NULL) THEN
    RAISE EXCEPTION 'USE_COMMERCIAL_PACKAGE_CHECKOUT';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_commercial_package_lot_action() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER commercial_package_reservation_guard BEFORE INSERT OR UPDATE OF lot_id, status ON public.lot_reservations
FOR EACH ROW WHEN (NEW.status = 'ACTIVE') EXECUTE FUNCTION public.guard_commercial_package_lot_action();
CREATE TRIGGER commercial_package_negotiation_guard BEFORE INSERT OR UPDATE OF lot_id, status ON public.lot_negotiations
FOR EACH ROW WHEN (NEW.status = 'ACTIVE') EXECUTE FUNCTION public.guard_commercial_package_lot_action();
CREATE TRIGGER commercial_package_individual_contract_guard BEFORE INSERT OR UPDATE OF lot_id, scope, is_active ON public.lot_contracts
FOR EACH ROW WHEN (NEW.scope = 'LOT' AND NEW.is_active) EXECUTE FUNCTION public.guard_commercial_package_lot_action();

CREATE TRIGGER commercial_package_fixed_price_guard BEFORE INSERT OR UPDATE OR DELETE ON public.lot_prices
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_package_lot_action();
CREATE TRIGGER commercial_package_price_override_guard BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_lot_price_overrides
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_package_lot_action();

-- O fluxo de anexo do pedido expande cobertura a partir do snapshot, sem criar itens avulsos.
CREATE OR REPLACE FUNCTION public.attach_order_contract(p_order_id uuid, p_lot_ids uuid[], p_storage_path text, p_original_name text, p_mime_type text, p_file_size bigint, p_contract_number text DEFAULT NULL::text, p_contract_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_order public.lot_sale_orders%ROWTYPE; v_org uuid; v_contract uuid; v_version int; v_version_id uuid; v_lot uuid; v_before jsonb;
  v_package_item uuid; v_package_lot uuid; v_package_lots uuid[]; v_retry jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_lot_ids IS NULL OR array_length(p_lot_ids,1) IS NULL THEN RAISE EXCEPTION 'NO_ITEMS_SELECTED'; END IF;
  SELECT * INTO v_order FROM public.lot_sale_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = v_order.project_id;
  IF public.map_has_explicit_capability(v_org, 'map.manage_contracts') IS NOT TRUE THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_order.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'ORDER_NOT_ACTIVE'; END IF;
  p_lot_ids := ARRAY(SELECT DISTINCT id FROM unnest(p_lot_ids) AS selected(id) ORDER BY id);

  SELECT i.id, i.lot_id INTO v_package_item, v_package_lot
  FROM public.lot_sale_order_items i WHERE i.order_id = p_order_id
    AND i.commercial_unit = 'FIXED_PACKAGE' AND i.contract_state <> 'CANCELLED';
  IF v_package_item IS NOT NULL THEN
    SELECT array_agg(id ORDER BY id) INTO v_package_lots FROM (
      SELECT v_package_lot AS id UNION ALL
      SELECT component_lot_id FROM public.commercial_package_order_components WHERE order_item_id = v_package_item
    ) AS covered;
    IF cardinality(v_package_lots) IS DISTINCT FROM 4 OR (p_lot_ids IS DISTINCT FROM ARRAY[v_package_lot]
      AND p_lot_ids IS DISTINCT FROM v_package_lots) THEN
      RAISE EXCEPTION 'COMMERCIAL_PACKAGE_CONTRACT_SCOPE';
    END IF;
    IF p_mime_type IS DISTINCT FROM 'application/pdf' THEN RAISE EXCEPTION 'COMMERCIAL_PACKAGE_PDF_REQUIRED'; END IF;
    p_lot_ids := ARRAY[v_package_lot];
  ELSIF EXISTS (SELECT 1 FROM public.commercial_lots
    WHERE id = ANY(p_lot_ids) AND commercial_package_role IS NOT NULL) THEN
    RAISE EXCEPTION 'COMMERCIAL_PACKAGE_COMPONENT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_lot_ids) AS requested(lot_id) WHERE NOT EXISTS (
      SELECT 1 FROM public.lot_sale_order_items i
      JOIN public.commercial_lots l ON l.id = i.lot_id AND l.project_id = v_order.project_id
      JOIN public.lot_sales s ON s.id = i.sale_id AND s.lot_id = l.id
      WHERE i.order_id = p_order_id AND i.lot_id = requested.lot_id AND l.archived_at IS NULL
        AND ((i.contract_state = 'PENDING_SIGNATURE' AND s.status = 'OPEN' AND l.status = 'SALE_OPEN')
          OR (i.contract_state IN ('SIGNED', 'LEGACY_UNVERIFIED') AND s.status = 'CONFIRMED' AND l.status = 'SOLD'))
    )
  ) THEN RAISE EXCEPTION 'ITEM_NOT_IN_ORDER'; END IF;
  p_lot_ids := coalesce(v_package_lots, p_lot_ids);
  IF p_storage_path IS NULL OR p_storage_path NOT LIKE v_org::text || '/orders/' || p_order_id::text || '/%' THEN RAISE EXCEPTION 'INVALID_CONTRACT_STORAGE_PATH'; END IF;
  PERFORM public.lock_commercial_contract_upload(p_storage_path);
  IF p_mime_type IS NULL OR p_file_size IS NULL OR p_mime_type NOT IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document') OR p_file_size <= 0 OR p_file_size > 15728640 THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_FILE'; END IF;

  IF v_package_item IS NOT NULL THEN
    SELECT jsonb_build_object('contractId', c.id, 'version', v.version, 'versionId', v.id) INTO v_retry
    FROM public.lot_contract_versions v JOIN public.lot_contracts c ON c.id = v.contract_id
    WHERE c.order_id = p_order_id AND c.scope = 'ORDER_ITEMS' AND v.storage_path = p_storage_path
      AND v.uploaded_by = auth.uid() AND v.covered_lot_ids = p_lot_ids
      AND (p_contract_id IS NULL OR c.id = p_contract_id)
      AND (v.original_name, v.mime_type, v.file_size) IS NOT DISTINCT FROM (p_original_name, p_mime_type, p_file_size);
    IF v_retry IS NOT NULL THEN RETURN v_retry; END IF;
    IF p_contract_id IS NULL AND EXISTS (
      SELECT 1 FROM public.lot_contracts c
      WHERE c.order_id = p_order_id AND c.scope = 'ORDER_ITEMS' AND c.is_active
    ) THEN RAISE EXCEPTION 'COMMERCIAL_PACKAGE_CONTRACT_EXISTS'; END IF;
  END IF;

  IF p_contract_id IS NOT NULL THEN
    SELECT c.id, c.active_version, jsonb_build_object('contract_id', c.id, 'order_id', p_order_id,
      'version', c.active_version, 'contract_number', c.contract_number,
      'lot_ids', ARRAY(SELECT cl.lot_id FROM public.lot_contract_lots cl WHERE cl.contract_id = c.id AND cl.removed_at IS NULL ORDER BY cl.lot_id))
    INTO v_contract, v_version, v_before
    FROM public.lot_contracts c
    WHERE c.id = p_contract_id AND c.scope = 'ORDER_ITEMS' AND c.order_id = p_order_id AND c.is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CONTRACT_NOT_FOUND'; END IF;
    v_version := v_version + 1;
    UPDATE public.lot_contract_versions SET superseded_at = now() WHERE contract_id = v_contract AND superseded_at IS NULL;
    UPDATE public.lot_contracts SET active_version = v_version, contract_number = coalesce(nullif(trim(p_contract_number),''), contract_number), updated_at = now() WHERE id = v_contract;
    UPDATE public.lot_contract_lots SET removed_at=now()
      WHERE contract_id=v_contract AND lot_id<>ALL(p_lot_ids) AND removed_at IS NULL;
  ELSE
    INSERT INTO public.lot_contracts (lot_id, order_id, scope, contract_number, active_version, created_by)
    VALUES (NULL, p_order_id, 'ORDER_ITEMS', nullif(trim(p_contract_number),''), 1, auth.uid()) RETURNING id, active_version INTO v_contract, v_version;
  END IF;
  FOREACH v_lot IN ARRAY p_lot_ids LOOP
    INSERT INTO public.lot_contract_lots (contract_id, lot_id, created_by) VALUES (v_contract, v_lot, auth.uid()) ON CONFLICT (contract_id, lot_id) DO UPDATE SET removed_at=NULL;
  END LOOP;
  INSERT INTO public.lot_contract_versions (contract_id, version, storage_path, original_name, mime_type, file_size, uploaded_by, covered_lot_ids)
  VALUES (v_contract, v_version, p_storage_path, p_original_name, p_mime_type, p_file_size, auth.uid(), ARRAY(SELECT DISTINCT id FROM unnest(p_lot_ids) id ORDER BY id)) RETURNING id INTO v_version_id;
  INSERT INTO public.map_activity_logs (org_id, project_id, action, before_state, after_state, actor_user_id)
  SELECT v_org, v_order.project_id, CASE WHEN v_version = 1 THEN 'ORDER_CONTRACT_UPLOADED' ELSE 'ORDER_CONTRACT_REPLACED' END,
    v_before, jsonb_build_object('order_id', p_order_id, 'contract_id', v_contract, 'version', v_version,
      'version_id', v_version_id, 'lot_ids', p_lot_ids, 'contract_number', c.contract_number, 'original_name', p_original_name), auth.uid()
  FROM public.lot_contracts c WHERE c.id = v_contract;
  RETURN jsonb_build_object('contractId', v_contract, 'version', v_version, 'versionId', v_version_id);
END $function$;

CREATE FUNCTION public.guard_commercial_package_contract_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.lot_contracts c JOIN public.commercial_lots l ON l.id = c.lot_id
    WHERE c.id = NEW.contract_id AND c.scope = 'LOT' AND l.commercial_package_role IS NOT NULL) THEN
    RAISE EXCEPTION 'USE_COMMERCIAL_PACKAGE_CHECKOUT';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_commercial_package_contract_version() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER commercial_package_contract_version_guard BEFORE INSERT ON public.lot_contract_versions
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_package_contract_version();

CREATE FUNCTION public.retire_commercial_package_contract()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.commercial_lots WHERE id = NEW.lot_id AND commercial_package_role = 'PRINCIPAL') THEN
    UPDATE public.lot_contract_lots SET removed_at = NEW.removed_at
    WHERE contract_id = NEW.contract_id AND removed_at IS NULL;
    UPDATE public.lot_contracts SET is_active = false WHERE id = NEW.contract_id AND scope = 'ORDER_ITEMS';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.retire_commercial_package_contract() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER commercial_package_retire_contract AFTER UPDATE OF removed_at ON public.lot_contract_lots
FOR EACH ROW WHEN (OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL)
EXECUTE FUNCTION public.retire_commercial_package_contract();

CREATE OR REPLACE FUNCTION public.revise_sale_order_items(
  p_order_id uuid, p_add_lot_ids uuid[] DEFAULT '{}', p_remove_item_ids uuid[] DEFAULT '{}',
  p_fee_admin numeric DEFAULT NULL, p_fee_ppci numeric DEFAULT NULL, p_fee_cleaning numeric DEFAULT NULL,
  p_installment_count integer DEFAULT NULL, p_reason text DEFAULT NULL, p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT p.org_id INTO v_org FROM public.lot_sale_orders o JOIN public.map_projects p ON p.id=o.project_id WHERE o.id=p_order_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF NOT public.map_has_explicit_capability(v_org, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.lot_sale_order_items i JOIN public.commercial_lots l ON l.id = i.lot_id
    WHERE i.order_id = p_order_id AND l.commercial_package_role IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM public.commercial_lots l WHERE l.id = ANY(p_add_lot_ids)
      AND l.project_id = (SELECT project_id FROM public.lot_sale_orders WHERE id = p_order_id)
      AND l.commercial_package_role IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'COMMERCIAL_PACKAGE_REVISION_REQUIRES_RECONCILIATION';
  END IF;
  RETURN public._revise_sale_order_items_core(p_order_id, p_add_lot_ids, p_remove_item_ids, p_fee_admin, p_fee_ppci, p_fee_cleaning, p_installment_count, p_reason, p_expected_updated_at, auth.uid());
END; $$;

CREATE OR REPLACE FUNCTION public.get_food_point_sale_snapshot(p_lot_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org uuid;
  v_lot_id uuid;
  v_sales boolean;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT p.org_id, coalesce(l.commercial_package_principal_lot_id, l.id) INTO v_org, v_lot_id FROM public.commercial_lots l
  JOIN public.map_projects p ON p.id = l.project_id
  WHERE l.id = p_lot_id AND l.commercial_unit IN ('FOOD_POINT', 'FIXED_PACKAGE') AND l.archived_at IS NULL;
  v_sales := public.map_has_explicit_capability(v_org, 'map.manage_sales') IS TRUE;
  IF v_org IS NULL OR NOT (v_sales OR public.can_view_commercial_map(v_org) IS TRUE
    OR public.map_has_explicit_capability(v_org, 'map.manage_contracts') IS TRUE) THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;
  SELECT jsonb_build_object('signatureState', coalesce(i.contract_state, 'LEGACY_UNVERIFIED'),
    'negotiatedValue', CASE WHEN v_sales THEN s.negotiated_value END,
    'orderFees', CASE WHEN v_sales THEN o.fees_total END)
  INTO v_result FROM public.lot_sales s
  LEFT JOIN public.lot_sale_order_items i ON i.sale_id = s.id AND i.lot_id = s.lot_id AND i.contract_state <> 'CANCELLED'
  LEFT JOIN public.lot_sale_orders o ON o.id = i.order_id
  WHERE s.lot_id = v_lot_id AND s.status IN ('OPEN', 'CONFIRMED') ORDER BY s.created_at DESC LIMIT 1;
  RETURN v_result;
END;
$$;

-- Os links públicos recebem somente a inclusão e a disponibilidade do pacote.
CREATE FUNCTION app_private.public_map_package_projection(
  p_lot_id uuid, p_role text, p_principal_lot_id uuid, p_entity_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE v_principal public.commercial_lots%ROWTYPE;
BEGIN
  IF p_role IS NULL THEN RETURN '{}'::jsonb; END IF;
  SELECT * INTO STRICT v_principal FROM public.commercial_lots
  WHERE id = coalesce(p_principal_lot_id, p_lot_id) AND commercial_package_role = 'PRINCIPAL';
  RETURN jsonb_build_object(
    'packageRole', p_role,
    'packagePrincipalLotId', CASE WHEN v_principal.entity_id = ANY(p_entity_ids) AND p_role = 'COMPONENT' THEN v_principal.id END,
    'packageReconciliationPending', v_principal.commercial_package_reconciliation_pending,
    'commercialUnit', CASE WHEN p_role = 'PRINCIPAL' THEN 'FIXED_PACKAGE' ELSE 'FOOD_POINT' END,
    'availability', CASE WHEN v_principal.status = 'SALE_OPEN' THEN 'SALE_OPEN'
      ELSE public.public_map_lot_availability(v_principal.status::text) END,
    'buyerName', null, 'buyerIdentityEligible', false, 'buyerGroupKey', null, 'buyerTradeName', null,
    'pricing', jsonb_build_object('resolutionStatus', 'SEM_REGRA')
  );
END;
$$;
REVOKE ALL ON FUNCTION app_private.public_map_package_projection(uuid,text,uuid,uuid[]) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.public_map_sold_company_projection(
  _link public.public_map_links, _entity_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF (
    (_link.slug = 'exporural' AND _link.scope_kind = 'SEGMENT' AND _link.scope_key = 'exporural')
    OR (_link.slug = 'industria-comercio-servicos-externo' AND _link.scope_kind = 'SEGMENT_EXTERNAL'
        AND _link.scope_key = 'industria-comercio-servicos')
    OR (_link.slug = 'espaco-automovel' AND _link.scope_kind = 'ENTITY_SET')
  ) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  RETURN (
    WITH confirmed AS MATERIALIZED (
      SELECT l.id AS lot_id, s.id AS sale_id, s.created_at,
             nullif(regexp_replace(s.buyer_trade_name, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '') AS trade_name
      FROM public.commercial_lots l
      JOIN public.lot_sales s ON s.lot_id = l.id AND s.status = 'CONFIRMED' AND s.reverted_at IS NULL
      WHERE l.project_id = _link.project_id AND l.entity_id = ANY(_entity_ids)
        AND l.status = 'SOLD' AND l.archived_at IS NULL AND l.commercial_package_role IS NULL
    ), links AS (
      SELECT c.sale_id, count(i.id) AS item_count, count(o.id) AS active_count,
             (array_agg(o.id) FILTER (WHERE o.id IS NOT NULL))[1] AS order_id
      FROM confirmed c
      LEFT JOIN public.lot_sale_order_items i ON i.sale_id = c.sale_id AND i.lot_id = c.lot_id
      LEFT JOIN public.lot_sale_orders o ON o.id = i.order_id AND o.project_id = _link.project_id
        AND o.status = 'CONFIRMED' AND o.reverted_at IS NULL
        AND i.contract_state IN ('SIGNED', 'LEGACY_UNVERIFIED') AND i.cancelled_at IS NULL
      GROUP BY c.sale_id
    ), members AS (
      SELECT c.lot_id, c.sale_id, c.trade_name, coalesce(o.updated_at, c.created_at) AS name_order,
             CASE WHEN ex.id IS NOT NULL THEN 'exhibitor:' || ex.id::text
                  WHEN o.id IS NOT NULL THEN 'order:' || o.id::text
                  ELSE 'sale:' || c.sale_id::text END AS identity
      FROM confirmed c
      JOIN links b ON b.sale_id = c.sale_id
      LEFT JOIN public.lot_sale_orders o ON o.id = b.order_id AND b.active_count = 1
      LEFT JOIN public.commercial_exhibitors ex ON ex.id = o.exhibitor_id AND ex.org_id = _link.org_id
      WHERE b.item_count = 0 OR b.active_count > 0
    ), companies AS (
      -- The exhibitor UUID verifies identity. The name comes from a confirmed
      -- sale in this scope because the exhibitor record can receive draft edits.
      -- Use a cleared name from the newest eligible snapshot as well.
      SELECT DISTINCT ON (m.identity) m.identity, m.trade_name,
             encode(sha256(convert_to('public-map-company/v1:' || _link.id || ':' || m.identity, 'UTF8')), 'hex') AS group_key
      FROM members m
      ORDER BY m.identity, m.name_order DESC NULLS LAST, m.sale_id
    )
    SELECT coalesce(jsonb_object_agg(m.lot_id::text, jsonb_build_object(
      'buyerIdentityEligible', true,
      'buyerGroupKey', c.group_key,
      'buyerTradeName', c.trade_name
    )), '{}'::jsonb)
    FROM members m JOIN companies c USING (identity)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.public_map_inventory_revision(
  v_link public.public_map_links, v_entity_ids uuid[], v_companies jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_entity_rev text;
  v_geometry_rev text;
  v_lot_rev text;
  v_pricing_rev text;
  v_project_rev text;
  v_lot_count integer;
BEGIN
  SELECT
    coalesce(md5(count(*)::text || coalesce(max(e.updated_at), 'epoch'::timestamptz)::text), 'none'),
    coalesce(md5(count(g.id)::text || coalesce(max(g.updated_at), 'epoch'::timestamptz)::text
                 || coalesce(sum(g.version), 0)::text), 'none')
    INTO v_entity_rev, v_geometry_rev
  FROM public.map_entities e
  LEFT JOIN public.map_entity_geometries g ON g.entity_id = e.id AND g.is_current = true
  WHERE e.id = ANY(v_entity_ids);

  WITH lot AS (
    SELECT l.id, greatest(l.updated_at, principal.updated_at) AS updated_at, l.official_area_sqm,
           l.commercial_package_role,
           coalesce(principal.status, l.status) AS status, s.buyer_name, s.buyer_trade_name, s.created_at AS sale_updated_at
      FROM public.commercial_lots l
      LEFT JOIN public.commercial_lots principal ON principal.id = l.commercial_package_principal_lot_id
      LEFT JOIN public.lot_sales s ON s.lot_id = l.id AND s.status = 'CONFIRMED' AND l.commercial_package_role IS NULL
     WHERE l.entity_id = ANY(v_entity_ids)
       AND l.archived_at IS NULL
  )
  SELECT count(*) FILTER (WHERE commercial_package_role IS DISTINCT FROM 'COMPONENT')::integer,
         coalesce(md5(count(*)::text
                      || coalesce(max(updated_at), 'epoch'::timestamptz)::text
                      || coalesce(max(sale_updated_at), 'epoch'::timestamptz)::text
                      || coalesce(sum(official_area_sqm), 0)::text
                      || coalesce(string_agg(concat_ws(':', id, status, buyer_name, buyer_trade_name), '|' ORDER BY id), '')), 'none')
    INTO v_lot_count, v_lot_rev
  FROM lot;

  IF v_companies IS NOT NULL THEN
    v_lot_rev := md5(v_lot_rev || ':' || v_companies::text);
  END IF;

  SELECT coalesce(md5(count(*)::text
                      || coalesce(sum(coalesce(p.renovacao_total, 0) + coalesce(p.segunda_total, 0)), 0)::text
                      || coalesce(string_agg(coalesce(p.resolution_status, '-'), ',' ORDER BY p.lot_id), '')), 'none')
    INTO v_pricing_rev
  FROM public.commercial_lot_pricing_2028 p
  JOIN public.commercial_lots l ON l.id = p.lot_id AND l.archived_at IS NULL
  WHERE l.entity_id = ANY(v_entity_ids) AND l.commercial_package_role IS NULL;

  SELECT coalesce(md5(pr.active_version::text || coalesce(pr.reference_revision, '-')
                      || coalesce(pr.updated_at, 'epoch'::timestamptz)::text), 'none')
    INTO v_project_rev
  FROM public.map_projects pr
  WHERE pr.id = v_link.project_id;

  RETURN jsonb_build_object(
    'slug', v_link.slug,
    'revision', md5(concat_ws('|', v_entity_rev, v_geometry_rev, v_lot_rev, v_pricing_rev, v_project_rev)),
    'entityRevision', v_entity_rev,
    'geometryRevision', v_geometry_rev,
    'lotRevision', v_lot_rev,
    'pricingRevision', v_pricing_rev,
    'projectRevision', v_project_rev,
    'lotCount', v_lot_count,
    'serverTime', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.public_map_inventory(_slug text, _token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_link public.public_map_links;
  v_result jsonb;
  v_entity_ids uuid[];
  v_companies jsonb;
  v_no_company constant jsonb := '{"buyerIdentityEligible":false,"buyerGroupKey":null,"buyerTradeName":null}'::jsonb;
BEGIN
  v_link := public.public_map_resolve_link(_slug, _token);
  v_entity_ids := ARRAY(SELECT entity_id FROM public.public_map_scope_entity_ids(v_link.id));
  v_companies := app_private.public_map_sold_company_projection(v_link, v_entity_ids);

  WITH ent AS (
    SELECT e.*, g.geometry, g.elevation, g.extrusion_height, g.rotation, g.version, g.calibration_version, g.id AS geometry_id
      FROM public.map_entities e
      LEFT JOIN public.map_entity_geometries g ON g.entity_id = e.id AND g.is_current = true
     WHERE e.id = ANY(v_entity_ids)
  ), lot AS (
    SELECT l.*, p.renovacao_price_per_sqm, p.renovacao_total, p.renovacao_rule_label,
           p.segunda_price_per_sqm, p.segunda_total, p.segunda_rule_label, p.resolution_status,
           CASE WHEN l.status = 'SOLD'
             THEN public.commercial_buyer_display_name(s.buyer_trade_name, s.buyer_name)
           END AS buyer_name
      FROM public.commercial_lots l
      LEFT JOIN public.commercial_lot_pricing_2028 p ON p.lot_id = l.id
      LEFT JOIN public.lot_sales s ON s.lot_id = l.id AND s.status = 'CONFIRMED' AND l.commercial_package_role IS NULL
     WHERE l.entity_id = ANY(v_entity_ids)
       AND l.archived_at IS NULL
  )
  SELECT jsonb_build_object(
    'scope', jsonb_build_object(
      'slug', v_link.slug,
      'name', v_link.display_name,
      'kind', v_link.scope_kind,
      'lotCount', (SELECT count(*) FROM lot WHERE commercial_package_role IS DISTINCT FROM 'COMPONENT'),
      'officialAreaSqm', (SELECT coalesce(sum(official_area_sqm), 0) FROM lot),
      'pavilionIdentifier', CASE WHEN v_link.scope_kind = 'PAVILION' THEN v_link.scope_key ELSE NULL END,
      'segmentSlug', CASE WHEN v_link.scope_kind LIKE 'SEGMENT%' THEN v_link.scope_key ELSE NULL END
    ),
    'project', (
      SELECT jsonb_build_object(
        'id', pr.id, 'name', pr.name, 'coordinateSystem', pr.coordinate_system,
        'referenceWidth', pr.reference_width, 'referenceHeight', pr.reference_height,
        'activeVersion', pr.active_version, 'referenceRevision', pr.reference_revision
      ) FROM public.map_projects pr WHERE pr.id = v_link.project_id
    ),
    'layers', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', la.id, 'projectId', la.project_id, 'key', la.layer_key, 'name', la.name,
        'description', la.description, 'color', la.color, 'opacity', la.opacity,
        'isVisible', la.is_visible, 'isLocked', la.is_locked, 'sortOrder', la.sort_order
      ) ORDER BY la.sort_order)
      FROM public.map_layers la
      WHERE la.id IN (SELECT DISTINCT layer_id FROM ent)
    ), '[]'::jsonb),
    'entities', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'projectId', e.project_id, 'layerId', e.layer_id,
        'parentEntityId', e.parent_entity_id, 'segmentId', e.segment_id,
        'publicIdentifier', e.public_identifier, 'name', e.name, 'description', e.description,
        'classification', e.classification, 'verificationStatus', e.verification_status,
        'isSellable', e.is_sellable, 'isArchived', e.is_archived,
        'metadata', coalesce(e.metadata, '{}'::jsonb),
        'geometry', jsonb_build_object(
          'id', e.geometry_id,
          'type', 'Polygon',
          'coordinates', coalesce(e.geometry->'coordinates', '[]'::jsonb),
          'elevation', coalesce(e.elevation, 0),
          'extrusionHeight', coalesce(e.extrusion_height, 0),
          'rotation', coalesce(e.rotation, 0),
          'geometryVersion', coalesce(e.version, 1),
          'calibrationVersion', e.calibration_version
        )
      )) FROM ent e
    ), '[]'::jsonb),
    'lots', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'entityId', l.entity_id, 'publicIdentifier', l.public_identifier,
        'block', l.block, 'lotNumber', l.lot_number, 'levelLabel', l.level_label,
        'displayName', l.display_name,
        'availability', public.public_map_lot_availability(l.status::text),
        -- Compatibility field for older clients in the external scopes.
        'buyerName', CASE WHEN v_companies IS NULL THEN l.buyer_name
                          ELSE v_companies -> l.id::text ->> 'buyerTradeName' END,
        'officialAreaSqm', l.official_area_sqm,
        'isCorner', l.is_corner, 'isCovered', l.is_covered,
        'infrastructure', coalesce(to_jsonb(l.infrastructure), '[]'::jsonb),
        'hasElectricity', l.has_electricity, 'hasWater', l.has_water, 'hasInternet', l.has_internet,
        'pricing', jsonb_build_object(
          'resolutionStatus', coalesce(l.resolution_status, 'SEM_REGRA'),
          'renovacaoPricePerSqm', l.renovacao_price_per_sqm,
          'renovacaoTotal', l.renovacao_total,
          'renovacaoRuleLabel', l.renovacao_rule_label,
          'segundaPricePerSqm', l.segunda_price_per_sqm,
          'segundaTotal', l.segunda_total,
          'segundaRuleLabel', l.segunda_rule_label
        )
      ) || CASE WHEN v_companies IS NULL THEN '{}'::jsonb
                ELSE coalesce(v_companies -> l.id::text, v_no_company) END
        || app_private.public_map_package_projection(
          l.id, l.commercial_package_role, l.commercial_package_principal_lot_id, v_entity_ids
        ) ORDER BY l.id) FROM lot l
    ), '[]'::jsonb),
    'revision', (app_private.public_map_inventory_revision(v_link, v_entity_ids, v_companies)->>'revision')
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.public_map_lot(_slug text, _token text, _lot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_link public.public_map_links;
  v_result jsonb;
  v_entity_ids uuid[];
  v_companies jsonb;
  v_no_company constant jsonb := '{"buyerIdentityEligible":false,"buyerGroupKey":null,"buyerTradeName":null}'::jsonb;
BEGIN
  v_link := public.public_map_resolve_link(_slug, _token);
  v_entity_ids := ARRAY(SELECT entity_id FROM public.public_map_scope_entity_ids(v_link.id));
  v_companies := app_private.public_map_sold_company_projection(v_link, v_entity_ids);

  SELECT jsonb_build_object(
    'id', l.id, 'entityId', l.entity_id, 'publicIdentifier', l.public_identifier,
    'block', l.block, 'lotNumber', l.lot_number, 'levelLabel', l.level_label,
    'displayName', l.display_name,
    'availability', public.public_map_lot_availability(l.status::text),
    'buyerName', CASE WHEN v_companies IS NOT NULL THEN v_companies -> l.id::text ->> 'buyerTradeName'
                      WHEN l.status = 'SOLD' THEN public.commercial_buyer_display_name(s.buyer_trade_name, s.buyer_name) END,
    'officialAreaSqm', l.official_area_sqm,
    'isCorner', l.is_corner, 'isCovered', l.is_covered,
    'infrastructure', coalesce(to_jsonb(l.infrastructure), '[]'::jsonb),
    'hasElectricity', l.has_electricity, 'hasWater', l.has_water, 'hasInternet', l.has_internet,
    'pavilion', p.pavilion,
    'pricing', jsonb_build_object(
      'resolutionStatus', coalesce(p.resolution_status, 'SEM_REGRA'),
      'renovacaoPricePerSqm', p.renovacao_price_per_sqm,
      'renovacaoTotal', p.renovacao_total,
      'renovacaoRuleLabel', p.renovacao_rule_label,
      'segundaPricePerSqm', p.segunda_price_per_sqm,
      'segundaTotal', p.segunda_total,
      'segundaRuleLabel', p.segunda_rule_label
    )
  ) || CASE WHEN v_companies IS NULL THEN '{}'::jsonb
            ELSE coalesce(v_companies -> l.id::text, v_no_company) END
    || app_private.public_map_package_projection(
      l.id, l.commercial_package_role, l.commercial_package_principal_lot_id, v_entity_ids
    ) INTO v_result
    FROM public.commercial_lots l
    LEFT JOIN public.commercial_lot_pricing_2028 p ON p.lot_id = l.id
    LEFT JOIN public.lot_sales s ON s.lot_id = l.id AND s.status = 'CONFIRMED' AND l.commercial_package_role IS NULL
   WHERE l.id = _lot_id
     AND l.archived_at IS NULL
     AND l.entity_id = ANY(v_entity_ids);

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'PUBLIC_MAP_LOT_OUT_OF_SCOPE' USING ERRCODE = '42501';
  END IF;

  RETURN v_result;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
