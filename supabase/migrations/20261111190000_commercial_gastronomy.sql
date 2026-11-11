BEGIN;

-- A food point is a commercial child of a real structure. It has no geometry
-- of its own. The existing lot ID remains the target of sales and contracts.
ALTER TABLE public.map_entities DROP CONSTRAINT IF EXISTS map_entities_classification_check;
ALTER TABLE public.map_entities ADD CONSTRAINT map_entities_classification_check CHECK (classification IN (
  'SELLABLE_LOT', 'INTERNAL_STAND', 'FOOD_POINT', 'QUADRA', 'PAVILION', 'BUILDING',
  'RESTAURANT', 'FOOD_AREA', 'EVENT_VENUE', 'RESTROOM', 'CHEMICAL_RESTROOM',
  'GATE', 'PARKING', 'ROAD', 'PEDESTRIAN_PATH', 'GREEN_AREA', 'TREE', 'WATER',
  'ADMINISTRATION', 'SECURITY', 'EMERGENCY', 'SERVICE', 'ATTRACTION',
  'LIVESTOCK_AREA', 'RURAL_EXHIBITION', 'RESTRICTED_AREA', 'LANDMARK', 'OTHER'
));
ALTER TABLE public.map_entities DROP CONSTRAINT IF EXISTS map_entities_sellable_class_check;
ALTER TABLE public.map_entities ADD CONSTRAINT map_entities_sellable_class_check CHECK (
  (NOT is_sellable OR classification IN ('SELLABLE_LOT', 'INTERNAL_STAND', 'FOOD_POINT'))
  AND (classification <> 'FOOD_POINT' OR (parent_entity_id IS NOT NULL AND segment_id IS NOT NULL AND is_sellable))
);

ALTER TABLE public.commercial_lots
  ADD COLUMN IF NOT EXISTS commercial_unit text NOT NULL DEFAULT 'SQUARE_METER',
  ADD COLUMN IF NOT EXISTS unit_quantity smallint,
  ADD COLUMN IF NOT EXISTS display_order integer,
  ADD COLUMN IF NOT EXISTS food_type text,
  ADD COLUMN IF NOT EXISTS price_source jsonb;
ALTER TABLE public.commercial_lots DROP CONSTRAINT IF EXISTS commercial_lots_unit_check;
ALTER TABLE public.commercial_lots ADD CONSTRAINT commercial_lots_unit_check CHECK (
  (commercial_unit = 'SQUARE_METER' AND unit_quantity IS NULL)
  OR (commercial_unit = 'FOOD_POINT' AND unit_quantity IS NOT DISTINCT FROM 1
    AND display_order IS NOT NULL AND display_order > 0 AND price_source IS NOT NULL
    AND official_area_sqm IS NULL AND calculated_area_sqm IS NULL
    AND frontage_meters IS NULL AND depth_meters IS NULL AND area_validation_status = 'UNVALIDATED')
);

ALTER TABLE public.lot_sale_order_items
  ADD COLUMN IF NOT EXISTS commercial_unit text NOT NULL DEFAULT 'SQUARE_METER',
  ADD COLUMN IF NOT EXISTS unit_quantity_snapshot smallint,
  ADD COLUMN IF NOT EXISTS display_name_snapshot text,
  ADD COLUMN IF NOT EXISTS structure_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS structure_identifier_snapshot text,
  ADD COLUMN IF NOT EXISTS structure_name_snapshot text,
  ALTER COLUMN official_area_snapshot DROP NOT NULL,
  ALTER COLUMN price_per_sqm_snapshot DROP NOT NULL;
ALTER TABLE public.lot_sale_order_items DROP CONSTRAINT IF EXISTS lot_sale_order_items_unit_check;
ALTER TABLE public.lot_sale_order_items ADD CONSTRAINT lot_sale_order_items_unit_check CHECK (
  (commercial_unit = 'SQUARE_METER' AND unit_quantity_snapshot IS NULL
    AND official_area_snapshot IS NOT NULL AND price_per_sqm_snapshot IS NOT NULL)
  OR (commercial_unit = 'FOOD_POINT' AND unit_quantity_snapshot IS NOT DISTINCT FROM 1
    AND official_area_snapshot IS NULL AND price_per_sqm_snapshot IS NULL AND item_total > 0
    AND display_name_snapshot IS NOT NULL AND structure_id_snapshot IS NOT NULL
    AND structure_identifier_snapshot IS NOT NULL AND structure_name_snapshot IS NOT NULL)
);

-- The active association stays explicit. An attachment version also records
-- its original coverage so replacement and revision preserve the audit trail.
ALTER TABLE public.lot_contract_lots ADD COLUMN IF NOT EXISTS removed_at timestamptz;
ALTER TABLE public.lot_contract_versions ADD COLUMN IF NOT EXISTS covered_lot_ids uuid[];
ALTER TABLE public.lot_contracts
  ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES public.lot_sales(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.map_gastronomy_anchor_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH allowed AS MATERIALIZED (
    SELECT id FROM public.map_segments WHERE slug = 'gastronomia' AND public.map_can_access_segment(id)
  )
  SELECT DISTINCT a.id
    FROM public.map_entities e
    JOIN allowed s ON s.id = e.segment_id
    JOIN public.map_entities a ON a.id = e.parent_entity_id AND a.project_id = e.project_id
   WHERE e.classification = 'FOOD_POINT' AND NOT e.is_archived AND NOT a.is_archived;
$$;
REVOKE ALL ON FUNCTION public.map_gastronomy_anchor_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.map_gastronomy_anchor_ids() TO authenticated, service_role;
DROP POLICY IF EXISTS gastronomy_anchor_select ON public.map_entities;
CREATE POLICY gastronomy_anchor_select ON public.map_entities FOR SELECT TO authenticated
  USING (id IN (SELECT public.map_gastronomy_anchor_ids()));
DROP POLICY IF EXISTS gastronomy_anchor_geometry_select ON public.map_entity_geometries;
CREATE POLICY gastronomy_anchor_geometry_select ON public.map_entity_geometries FOR SELECT TO authenticated
  USING (is_current AND entity_id IN (SELECT public.map_gastronomy_anchor_ids()));

CREATE OR REPLACE FUNCTION public.map_segment_is_complete(_segment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT
    EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_entities e
      ON e.id = l.entity_id AND e.project_id = l.project_id
      WHERE e.segment_id = s.id AND e.project_id = s.project_id AND NOT e.is_archived AND l.archived_at IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.map_entities e
      WHERE e.segment_id = s.id AND e.project_id = s.project_id AND NOT e.is_archived
        AND NOT EXISTS (
          SELECT 1 FROM public.map_entity_geometries g
          JOIN public.map_entities anchor ON anchor.id = g.entity_id AND anchor.project_id = g.project_id
          WHERE g.project_id = s.project_id AND g.is_current AND NOT anchor.is_archived
            AND g.entity_id = CASE WHEN e.classification = 'FOOD_POINT' THEN e.parent_entity_id ELSE e.id END
            AND (e.classification <> 'FOOD_POINT' OR (s.slug = 'gastronomia' AND NOT anchor.is_sellable))
        )
    )
  FROM public.map_segments s WHERE s.id = _segment_id AND s.is_active), false);
$$;

-- Retain the existing canonical segment trigger and its lineage rules for
-- every other classification. Resolve food points only by their actual parent.

CREATE OR REPLACE FUNCTION public.set_map_entity_canonical_segment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  canonical_slug text;
  canonical_segment public.map_segments%ROWTYPE;
  inherited_segment_id uuid;
  lineage_count integer;
  classified_lineage_count integer;
  distinct_lineage_segments integer;
  lineage_assignment boolean := false;
  project_org_id uuid;
BEGIN
  IF (
    SELECT count(*)
    FROM public.map_segments segment
    WHERE segment.project_id = NEW.project_id
      AND segment.slug IN ('exporural', 'industria-comercio-servicos')
  ) <> 2 THEN
    PERFORM public.ensure_commission_map_segments(NEW.project_id);
  END IF;
  SELECT
    count(*),
    count(source_entity.segment_id),
    count(DISTINCT source_entity.segment_id),
    min(source_entity.segment_id::text)::uuid
  INTO
    lineage_count,
    classified_lineage_count,
    distinct_lineage_segments,
    inherited_segment_id
  FROM public.commercial_lots target_lot
  JOIN public.map_lot_lineage lineage ON lineage.target_lot_id = target_lot.id
  JOIN public.commercial_lots source_lot ON source_lot.id = lineage.source_lot_id
  JOIN public.map_entities source_entity ON source_entity.id = source_lot.entity_id
  WHERE target_lot.entity_id = NEW.id;

  IF lineage_count > 0 AND classified_lineage_count > 0 THEN
    IF classified_lineage_count <> lineage_count
      OR distinct_lineage_segments <> 1
    THEN
      RAISE EXCEPTION 'MAP_SEGMENT_LINEAGE_CONFLICT';
    END IF;

    SELECT segment.* INTO STRICT canonical_segment
    FROM public.map_segments segment
    WHERE segment.id = inherited_segment_id
      AND segment.project_id = NEW.project_id
      AND segment.is_active = true;
    lineage_assignment := true;
  ELSE
    IF NEW.classification = 'FOOD_POINT' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.map_entities a
        JOIN public.map_entity_geometries g ON g.entity_id = a.id AND g.project_id = a.project_id AND g.is_current
        WHERE a.id = NEW.parent_entity_id AND a.project_id = NEW.project_id
          AND NOT a.is_archived AND NOT a.is_sellable AND a.id <> NEW.id
      ) THEN RAISE EXCEPTION 'FOOD_POINT_ANCHOR_REQUIRED'; END IF;
      canonical_slug := 'gastronomia';
    ELSE
      canonical_slug := public.resolve_commission_map_segment_slug_v2(
        NEW.public_identifier, COALESCE(NEW.metadata, '{}'::jsonb)
      );
    END IF;

    IF canonical_slug IS NOT NULL THEN
      SELECT segment.* INTO STRICT canonical_segment
      FROM public.map_segments segment
      WHERE segment.project_id = NEW.project_id
        AND segment.slug = canonical_slug
        AND segment.is_active = true;
    ELSIF TG_OP = 'INSERT' AND NEW.segment_id IS NOT NULL THEN
      RAISE EXCEPTION 'MAP_SEGMENT_ASSIGNMENT_INVALID';
    ELSIF TG_OP = 'UPDATE'
      AND NEW.segment_id IS NOT NULL
      AND NEW.segment_id IS DISTINCT FROM OLD.segment_id
    THEN
      RAISE EXCEPTION 'MAP_SEGMENT_ASSIGNMENT_INVALID';
    ELSE
      IF TG_OP = 'UPDATE'
        AND OLD.segment_id IS NOT NULL
        AND NOT lineage_assignment
        AND auth.uid() IS NOT NULL
      THEN
        SELECT project.org_id INTO STRICT project_org_id
        FROM public.map_projects project
        WHERE project.id = NEW.project_id;
        IF NOT public.map_has_explicit_capability(project_org_id, 'map.admin') THEN
          RAISE EXCEPTION 'MAP_SEGMENT_BOUNDARY_ADMIN_REQUIRED';
        END IF;
      END IF;
      NEW.segment_id := NULL;
      NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
        - 'segmentId'
        - 'segmentCode'
        - 'segmentName';
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.segment_id IS NOT NULL
    AND canonical_segment.id IS DISTINCT FROM OLD.segment_id
    AND NOT lineage_assignment
    AND auth.uid() IS NOT NULL
  THEN
    SELECT project.org_id INTO STRICT project_org_id
    FROM public.map_projects project
    WHERE project.id = NEW.project_id;
    IF NOT public.map_has_explicit_capability(project_org_id, 'map.admin') THEN
      RAISE EXCEPTION 'MAP_SEGMENT_BOUNDARY_ADMIN_REQUIRED';
    END IF;
  END IF;

  NEW.segment_id := canonical_segment.id;
  NEW.metadata := jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(NEW.metadata, '{}'::jsonb),
        '{segmentId}',
        to_jsonb(canonical_segment.slug),
        true
      ),
      '{segmentCode}',
      to_jsonb(CASE canonical_segment.slug
        WHEN 'exporural' THEN 'EXPORURAL' WHEN 'espaco-automovel' THEN 'ESPACO_AUTOMOVEL'
        WHEN 'gastronomia' THEN 'GASTRONOMIA'
        ELSE 'INDUSTRIA_COMERCIO_SERVICOS'
      END),
      true
    ),
    '{segmentName}',
    to_jsonb(canonical_segment.display_name),
    true
  );
  RETURN NEW;
END;
$function$;

-- Keep the existing 2028 rules for area-based items, including manual totals
-- and the explicit Exporural pricing group. Food points read the active
-- FIXED_TOTAL once for both stages.
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
    l.commercial_unit, l.unit_quantity, fp.base_price AS fixed_total
  FROM public.commercial_lots l JOIN public.map_entities e ON e.id=l.entity_id
  LEFT JOIN public.commercial_lot_corner_audit ca ON ca.lot_id=l.id
  LEFT JOIN public.lot_prices fp ON l.commercial_unit='FOOD_POINT' AND fp.lot_id=l.id
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
    CASE WHEN commercial_unit='FOOD_POINT' THEN fixed_total
      WHEN official_area_sqm>0 AND ren_tie=1 THEN round(official_area_sqm*rule_ren_ppsqm,2) END ren_default,
    CASE WHEN commercial_unit='FOOD_POINT' THEN fixed_total
      WHEN official_area_sqm>0 AND seg_tie=1 THEN round(official_area_sqm*rule_seg_ppsqm,2) END seg_default
  FROM resolved r
)
SELECT lot_id, project_id, public_identifier, pavilion, block, lot_num, status, corner_status,
  corner_confirmed, official_area_sqm, area_validation_status, renovacao_rule_id,
  CASE WHEN commercial_unit='FOOD_POINT' AND fixed_total IS NOT NULL THEN 'Preço oficial por ponto'
    WHEN ren_override IS NOT NULL THEN 'Valor manual' ELSE renovacao_rule_label END renovacao_rule_label,
  (CASE WHEN ren_override IS NOT NULL THEN round(ren_override/nullif(official_area_sqm,0),2)
    ELSE rule_ren_ppsqm END)::numeric(12,2) renovacao_price_per_sqm,
  segunda_rule_id,
  CASE WHEN commercial_unit='FOOD_POINT' AND fixed_total IS NOT NULL THEN 'Preço oficial por ponto'
    WHEN seg_override IS NOT NULL THEN 'Valor manual' ELSE segunda_rule_label END segunda_rule_label,
  (CASE WHEN seg_override IS NOT NULL THEN round(seg_override/nullif(official_area_sqm,0),2)
    ELSE rule_seg_ppsqm END)::numeric(12,2) segunda_price_per_sqm,
  coalesce(ren_override,ren_default) renovacao_total, coalesce(seg_override,seg_default) segunda_total,
  CASE WHEN commercial_unit='FOOD_POINT' THEN CASE WHEN fixed_total IS NOT NULL THEN 'OK' ELSE 'SEM_REGRA' END
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

CREATE OR REPLACE FUNCTION public.guard_food_point_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_unit text; v_price numeric;
BEGIN
  SELECT l.commercial_unit INTO v_unit FROM public.commercial_lots l
    WHERE l.id=NEW.lot_id AND l.commercial_unit='FOOD_POINT' FOR UPDATE;
  IF v_unit IS DISTINCT FROM 'FOOD_POINT' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.lot_sales s WHERE s.lot_id=NEW.lot_id AND s.id<>NEW.id AND s.status IN ('OPEN','CONFIRMED')) THEN
    RAISE EXCEPTION 'FOOD_POINT_ACTIVE_SALE';
  END IF;
  IF TG_OP='INSERT' THEN
    SELECT renovacao_total INTO v_price FROM public.commercial_lot_pricing_2028 WHERE lot_id=NEW.lot_id;
    IF v_price IS NULL OR NEW.negotiated_value IS DISTINCT FROM v_price THEN RAISE EXCEPTION 'FOOD_POINT_PRICE_MISMATCH'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_food_point_sale() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_food_point_sale ON public.lot_sales;
CREATE TRIGGER guard_food_point_sale BEFORE INSERT OR UPDATE OF lot_id, status ON public.lot_sales
  FOR EACH ROW WHEN (NEW.status IN ('OPEN','CONFIRMED')) EXECUTE FUNCTION public.guard_food_point_sale();

CREATE OR REPLACE FUNCTION public.retire_food_point_contracts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.lot_contracts SET is_active=false, updated_at=now()
    WHERE sale_id=NEW.id AND scope='LOT' AND is_active;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.retire_food_point_contracts() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS retire_food_point_contracts ON public.lot_sales;
CREATE TRIGGER retire_food_point_contracts AFTER UPDATE OF status ON public.lot_sales
  FOR EACH ROW WHEN (NEW.status='REVERTED' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.retire_food_point_contracts();

CREATE OR REPLACE FUNCTION public.commercial_sale_has_active_contract_coverage(
  p_contract public.lot_contracts, p_order_id uuid, p_sale_id uuid, p_lot_ids uuid[]
) RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN p_contract.scope='LOT' THEN p_contract.lot_id=ANY(p_lot_ids)
    AND (p_contract.sale_id IS NULL OR p_contract.sale_id=p_sale_id OR EXISTS (
      SELECT 1 FROM public.lot_sale_order_items i
      WHERE i.order_id=p_order_id AND i.sale_id=p_contract.sale_id AND i.contract_state<>'CANCELLED'
    ))
    ELSE p_contract.order_id=p_order_id AND EXISTS (
      SELECT 1 FROM public.lot_contract_lots cl
      WHERE cl.contract_id=p_contract.id AND cl.removed_at IS NULL AND cl.lot_id=ANY(p_lot_ids)
    ) END;
$$;
REVOKE ALL ON FUNCTION public.commercial_sale_has_active_contract_coverage(public.lot_contracts,uuid,uuid,uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.snapshot_food_point_sale_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  SELECT l.unit_quantity, l.display_name, a.id, a.public_identifier,
    CASE WHEN a.public_identifier='C2' THEN 'Restaurante' ELSE a.name END
  INTO STRICT NEW.unit_quantity_snapshot, NEW.display_name_snapshot, NEW.structure_id_snapshot,
    NEW.structure_identifier_snapshot, NEW.structure_name_snapshot
  FROM public.commercial_lots l
  JOIN public.map_entities e ON e.id=l.entity_id AND e.project_id=l.project_id
  JOIN public.map_entities a ON a.id=e.parent_entity_id AND a.project_id=l.project_id
  WHERE l.id=NEW.lot_id AND l.commercial_unit='FOOD_POINT';
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.snapshot_food_point_sale_item() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS snapshot_food_point_sale_item ON public.lot_sale_order_items;
CREATE TRIGGER snapshot_food_point_sale_item BEFORE INSERT ON public.lot_sale_order_items
  FOR EACH ROW WHEN (NEW.commercial_unit='FOOD_POINT') EXECUTE FUNCTION public.snapshot_food_point_sale_item();

-- A cancelled item is a historical record. The same point can be added again
-- with its own sale and snapshot, while only one item remains active.
CREATE UNIQUE INDEX IF NOT EXISTS lot_sale_order_items_active_lot_uidx
  ON public.lot_sale_order_items(order_id, lot_id) WHERE contract_state <> 'CANCELLED';
DROP INDEX IF EXISTS public.lot_sale_order_items_order_lot_uidx;

CREATE OR REPLACE FUNCTION public.commercial_sale_revision_scope(p_lot_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN l.commercial_unit='FOOD_POINT' THEN 'food:' || e.parent_entity_id
    WHEN e.parent_entity_id IS NOT NULL THEN 'parent:' || e.parent_entity_id
    WHEN e.segment_id IS NOT NULL THEN 'segment:' || e.segment_id
    END
  FROM public.commercial_lots l JOIN public.map_entities e ON e.id=l.entity_id AND e.project_id=l.project_id
  WHERE l.id=p_lot_id;
$$;
REVOKE ALL ON FUNCTION public.commercial_sale_revision_scope(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_commercial_sale_order_core(p_idempotency_key text, p_stage text, p_lot_ids uuid[], p_buyer_name text, p_document_number text, p_phone text, p_email text, p_payment_type text, p_installment_count integer, p_payment_method text, p_first_due_date date, p_installments jsonb, p_expected_total numeric, p_notes text, p_exhibitor_id uuid DEFAULT NULL::uuid, p_fee_admin numeric DEFAULT 0, p_fee_ppci numeric DEFAULT 0, p_fee_cleaning_license numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_existing public.lot_sale_orders%ROWTYPE; v_project_id uuid; v_org_id uuid; v_order_id uuid; v_lot record;
  v_price numeric; v_total numeric := 0; v_area numeric := 0; v_rule_id uuid; v_rule_label text;
  v_item_total numeric; v_sale_id uuid; v_inst jsonb; v_inst_sum numeric := 0; v_count integer := 0;
  v_sellable boolean; v_salesperson_name text; v_fees numeric; v_final numeric; v_n integer; v_type text; v_method text;
  v_fa numeric := round(coalesce(p_fee_admin,0),2); v_fp numeric := round(coalesce(p_fee_ppci,0),2); v_fc numeric := round(coalesce(p_fee_cleaning_license,0),2);
  v_idx integer := 0;
BEGIN
  IF coalesce(trim(p_idempotency_key), '') = '' THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('sale_order:' || trim(p_idempotency_key)));
  SELECT * INTO v_existing FROM public.lot_sale_orders WHERE idempotency_key = trim(p_idempotency_key);
  IF FOUND THEN
    SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_existing.project_id;
    IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_sales')
       OR v_existing.salesperson_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
    END IF;
    RETURN v_existing.id;
  END IF;

  IF p_stage IS NULL OR p_stage NOT IN ('RENOVACAO','SEGUNDA_ETAPA') THEN RAISE EXCEPTION 'INVALID_STAGE'; END IF;
  IF p_lot_ids IS NULL OR array_length(p_lot_ids, 1) IS NULL THEN RAISE EXCEPTION 'NO_LOTS_SELECTED'; END IF;
  IF coalesce(trim(p_buyer_name), '') = '' THEN RAISE EXCEPTION 'BUYER_REQUIRED'; END IF;
  IF v_fa < 0 OR v_fp < 0 OR v_fc < 0 THEN RAISE EXCEPTION 'INVALID_FEE'; END IF;
  v_fees := v_fa + v_fp + v_fc;

  v_method := upper(coalesce(trim(p_payment_method), ''));
  IF v_method NOT IN ('PIX','BOLETO_AVISTA','BOLETO_PARCELADO') THEN RAISE EXCEPTION 'INVALID_PAYMENT_METHOD'; END IF;
  v_n := coalesce(jsonb_array_length(p_installments), 0);
  IF v_method IN ('PIX','BOLETO_AVISTA') AND v_n <> 1 THEN RAISE EXCEPTION 'INSTALLMENT_COUNT_INVALID'; END IF;
  IF v_method = 'BOLETO_PARCELADO' AND (v_n < 2 OR v_n > 36) THEN RAISE EXCEPTION 'INSTALLMENT_COUNT_INVALID'; END IF;
  v_type := CASE WHEN v_method = 'BOLETO_PARCELADO' THEN 'INSTALLMENTS' ELSE 'CASH' END;

  v_salesperson_name := coalesce((SELECT nullif(btrim(p.full_name), '') FROM public.profiles AS p WHERE p.user_id = auth.uid()), 'Equipe comercial');

  SELECT l.project_id INTO v_project_id FROM public.commercial_lots l WHERE l.id = p_lot_ids[1];
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF p_exhibitor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.commercial_exhibitors WHERE id = p_exhibitor_id AND org_id = v_org_id) THEN
    RAISE EXCEPTION 'EXHIBITOR_NOT_FOUND';
  END IF;

  INSERT INTO public.lot_sale_orders (
    project_id, buyer_name, document_number, phone, email, stage, official_area_total, negotiated_total, payment_type, installment_count,
    payment_method, first_due_date, notes, salesperson_user_id, idempotency_key, exhibitor_id, fee_admin, fee_ppci, fee_cleaning_license, fees_total, spaces_subtotal
  ) VALUES (
    v_project_id, trim(p_buyer_name), nullif(trim(p_document_number), ''), nullif(trim(p_phone), ''), nullif(trim(p_email), ''), p_stage, 0, 0, v_type, v_n,
    v_method, (p_installments->0->>'due_date')::date, nullif(trim(p_notes), ''), auth.uid(), trim(p_idempotency_key), p_exhibitor_id, v_fa, v_fp, v_fc, v_fees, 0
  ) RETURNING id INTO v_order_id;

  FOR v_lot IN SELECT l.* FROM public.commercial_lots l WHERE l.id = ANY(p_lot_ids) AND l.archived_at IS NULL ORDER BY l.id FOR UPDATE LOOP
    v_count := v_count + 1;
    IF v_lot.project_id <> v_project_id THEN RAISE EXCEPTION 'LOT_PROJECT_MISMATCH:%', v_lot.public_identifier; END IF;
    SELECT e.is_sellable INTO v_sellable FROM public.commercial_sale_eligibility e WHERE e.lot_id = v_lot.id;
    IF v_sellable IS NOT TRUE THEN RAISE EXCEPTION 'LOT_NOT_SELLABLE:%', v_lot.public_identifier; END IF;
    SELECT CASE WHEN p_stage = 'RENOVACAO' THEN v.renovacao_price_per_sqm ELSE v.segunda_price_per_sqm END,
           CASE WHEN p_stage = 'RENOVACAO' THEN v.renovacao_rule_id ELSE v.segunda_rule_id END,
           CASE WHEN p_stage = 'RENOVACAO' THEN v.renovacao_rule_label ELSE v.segunda_rule_label END,
           CASE WHEN p_stage = 'RENOVACAO' THEN v.renovacao_total ELSE v.segunda_total END
      INTO v_price, v_rule_id, v_rule_label, v_item_total FROM public.commercial_lot_pricing_2028 v WHERE v.lot_id = v_lot.id;
    IF v_item_total IS NULL OR v_item_total <= 0
      OR (v_lot.commercial_unit='SQUARE_METER' AND (coalesce(v_price,0)<=0 OR coalesce(v_lot.official_area_sqm,0)<=0)) THEN
      RAISE EXCEPTION 'LOT_WITHOUT_OFFICIAL_PRICE:%', v_lot.public_identifier;
    END IF;
    v_total := v_total + v_item_total;
    v_area := v_area + coalesce(v_lot.official_area_sqm,0);
    INSERT INTO public.lot_sales (lot_id, buyer_name, document_number, negotiated_value, sale_date, salesperson_user_id, salesperson_name, payment_status, internal_notes, status)
    VALUES (v_lot.id, trim(p_buyer_name), nullif(trim(p_document_number), ''), v_item_total, current_date, auth.uid(), v_salesperson_name, 'PENDING', nullif(trim(p_notes), ''), 'OPEN')
    RETURNING id INTO v_sale_id;
    INSERT INTO public.lot_sale_order_items (order_id, lot_id, public_identifier, official_area_snapshot, price_per_sqm_snapshot, pricing_rule_id, pricing_rule_label, pricing_stage, item_total, original_status, sale_id, contract_state, commercial_unit)
    VALUES (v_order_id, v_lot.id, v_lot.public_identifier, v_lot.official_area_sqm, v_price, v_rule_id, v_rule_label, p_stage, v_item_total, v_lot.status, v_sale_id, 'PENDING_SIGNATURE', v_lot.commercial_unit);
    UPDATE public.lot_reservations SET status = 'CONVERTED', updated_at = now() WHERE lot_id = v_lot.id AND status = 'ACTIVE';
    UPDATE public.lot_negotiations SET status = 'WON', updated_at = now() WHERE lot_id = v_lot.id AND status = 'ACTIVE';
    UPDATE public.commercial_lots SET status = 'SALE_OPEN', updated_by = auth.uid(), updated_at = now() WHERE id = v_lot.id;
    INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
    VALUES (v_lot.id, v_lot.status, 'SALE_OPEN', coalesce(nullif(trim(p_notes), ''), 'Venda em aberto registrada'), auth.uid());
    INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
    VALUES (v_org_id, v_lot.project_id, v_lot.entity_id, v_lot.id, 'LOT_SALE_OPEN', jsonb_build_object('status', v_lot.status),
      jsonb_build_object('status', 'SALE_OPEN', 'sale_order_id', v_order_id, 'stage', p_stage, 'item_total', v_item_total), 'Venda em aberto registrada', auth.uid());
  END LOOP;

  IF v_count <> array_length(p_lot_ids, 1) THEN RAISE EXCEPTION 'LOT_UNAVAILABLE_OR_MISSING'; END IF;
  v_final := v_total + v_fees;
  IF p_expected_total IS DISTINCT FROM v_final THEN RAISE EXCEPTION 'TOTAL_MISMATCH:%:%', p_expected_total, v_final; END IF;

  FOR v_inst IN SELECT * FROM jsonb_array_elements(p_installments) LOOP
    v_idx := v_idx + 1;
    IF (v_inst->>'amount')::numeric <= 0 OR round((v_inst->>'amount')::numeric, 2) <> (v_inst->>'amount')::numeric THEN RAISE EXCEPTION 'INSTALLMENT_AMOUNT_INVALID'; END IF;
    IF (v_inst->>'due_date') IS NULL OR (v_inst->>'due_date') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'INSTALLMENT_DATE_INVALID'; END IF;
    v_inst_sum := v_inst_sum + (v_inst->>'amount')::numeric;
    INSERT INTO public.lot_sale_installments (order_id, installment_number, due_date, amount)
    VALUES (v_order_id, v_idx, (v_inst->>'due_date')::date, (v_inst->>'amount')::numeric);
  END LOOP;
  IF v_inst_sum <> v_final THEN RAISE EXCEPTION 'INSTALLMENTS_MISMATCH:%:%', v_inst_sum, v_final; END IF;

  UPDATE public.lot_sale_orders SET official_area_total = v_area, spaces_subtotal = v_total, negotiated_total = v_final, updated_at = now() WHERE id = v_order_id;
  RETURN v_order_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.register_commercial_sale_order_core(text,text,uuid[],text,text,text,text,text,integer,text,date,jsonb,numeric,text,uuid,numeric,numeric,numeric)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_commercial_sale_core(p_lot_id uuid, p_buyer_name text, p_document_number text, p_negotiated_value numeric, p_sale_date date, p_salesperson_name text, p_contract_number text, p_payment_status text, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_lot public.commercial_lots%ROWTYPE; v_org_id uuid; v_sale_id uuid;
BEGIN
  SELECT * INTO v_lot FROM public.commercial_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_lot.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_lot.commercial_unit='FOOD_POINT' THEN RAISE EXCEPTION 'USE_COMMERCIAL_CHECKOUT'; END IF;
  IF v_lot.status NOT IN ('RESERVED', 'IN_NEGOTIATION', 'AVAILABLE') THEN RAISE EXCEPTION 'LOT_CANNOT_BE_SOLD'; END IF;
  IF coalesce(trim(p_buyer_name), '') = '' OR coalesce(trim(p_salesperson_name), '') = '' THEN RAISE EXCEPTION 'SALE_PARTIES_REQUIRED'; END IF;
  IF p_negotiated_value < 0 THEN RAISE EXCEPTION 'INVALID_SALE_VALUE'; END IF;
  INSERT INTO public.lot_sales (lot_id, buyer_name, document_number, negotiated_value, sale_date, salesperson_user_id, salesperson_name, contract_number, payment_status, internal_notes, status)
  VALUES (p_lot_id, trim(p_buyer_name), nullif(trim(p_document_number), ''), p_negotiated_value, p_sale_date, auth.uid(), trim(p_salesperson_name), nullif(trim(p_contract_number), ''), p_payment_status, p_notes, 'OPEN')
  RETURNING id INTO v_sale_id;
  UPDATE public.lot_reservations SET status = 'CONVERTED', updated_at = now() WHERE lot_id = p_lot_id AND status = 'ACTIVE';
  UPDATE public.lot_negotiations SET status = 'WON', updated_at = now() WHERE lot_id = p_lot_id AND status = 'ACTIVE';
  UPDATE public.commercial_lots SET status = 'SALE_OPEN', updated_by = auth.uid(), updated_at = now() WHERE id = p_lot_id;
  INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by) VALUES (p_lot_id, v_lot.status, 'SALE_OPEN', coalesce(nullif(trim(p_notes), ''), 'Venda em aberto registrada'), auth.uid());
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
  VALUES (v_org_id, v_lot.project_id, v_lot.entity_id, p_lot_id, 'LOT_SALE_OPEN', jsonb_build_object('status', v_lot.status), jsonb_build_object('status', 'SALE_OPEN', 'sale_id', v_sale_id), p_notes, auth.uid());
  RETURN v_sale_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public._revise_sale_order_items_core(p_order_id uuid, p_add_lot_ids uuid[], p_remove_item_ids uuid[], p_fee_admin numeric, p_fee_ppci numeric, p_fee_cleaning numeric, p_installment_count integer, p_reason text, p_expected_updated_at timestamp with time zone, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order public.lot_sale_orders%ROWTYPE; v_org uuid; v_item record; v_lot record;
  v_add uuid[] := coalesce(p_add_lot_ids, '{}'); v_rem uuid[] := coalesce(p_remove_item_ids, '{}');
  v_removed_lots uuid[] := '{}'; v_new_state text; v_new_status text; v_price numeric; v_ppsqm numeric;
  v_rule uuid; v_rule_label text; v_sale_id uuid; v_ref record; v_before jsonb; v_after jsonb;
  v_subtotal numeric; v_area numeric; v_fees numeric; v_total numeric; v_paid numeric; v_paid_n int;
  v_count int; v_open_n int; v_last_due date; v_cents bigint; v_each bigint; v_i int; v_n int; v_reason text;
  v_active int; v_scopes text[]; v_has_food boolean; v_sellable boolean;
BEGIN
  v_reason := nullif(btrim(coalesce(p_reason,'')), '');
  IF v_reason IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF array_length(v_add,1) IS NULL AND array_length(v_rem,1) IS NULL
     AND p_fee_admin IS NULL AND p_fee_ppci IS NULL AND p_fee_cleaning IS NULL AND p_installment_count IS NULL THEN
    RAISE EXCEPTION 'NOTHING_TO_CHANGE'; END IF;
  SELECT * INTO v_order FROM public.lot_sale_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'ORDER_NOT_ACTIVE'; END IF;
  IF p_expected_updated_at IS NOT NULL AND date_trunc('milliseconds', v_order.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) THEN
    RAISE EXCEPTION 'ORDER_CHANGED'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = v_order.project_id;

  SELECT array_agg(DISTINCT public.commercial_sale_revision_scope(i.lot_id)),
         coalesce(bool_or(i.commercial_unit='FOOD_POINT'),false)
    INTO v_scopes, v_has_food
    FROM public.lot_sale_order_items i WHERE i.order_id=p_order_id AND i.contract_state<>'CANCELLED';
  IF EXISTS (SELECT 1 FROM unnest(v_add) AS add(lot_id)
    WHERE NOT coalesce(public.commercial_sale_revision_scope(add.lot_id)=ANY(v_scopes),false)) THEN
    RAISE EXCEPTION 'LOT_OUTSIDE_ORDER_SCOPE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lot_sale_order_items i
    WHERE i.order_id=p_order_id AND i.id=ANY(v_rem) AND i.lot_id=ANY(v_add)) THEN
    RAISE EXCEPTION 'LOT_ALREADY_IN_ORDER';
  END IF;
  PERFORM 1 FROM public.commercial_lots l
  WHERE l.id=ANY(v_add) OR l.id IN (
    SELECT lot_id FROM public.lot_sale_order_items WHERE order_id=p_order_id AND id=ANY(v_rem)
  ) ORDER BY l.id FOR UPDATE;

  v_before := jsonb_build_object('lots', (SELECT jsonb_agg(public_identifier ORDER BY public_identifier) FROM public.lot_sale_order_items WHERE order_id=p_order_id AND contract_state IN ('PENDING_SIGNATURE','SIGNED','LEGACY_UNVERIFIED')),
    'spaces_subtotal', v_order.spaces_subtotal, 'fees_total', v_order.fees_total, 'negotiated_total', v_order.negotiated_total, 'installment_count', v_order.installment_count);

  -- estado herdado pelos lotes novos
  IF EXISTS (SELECT 1 FROM public.lot_sale_order_items WHERE order_id=p_order_id AND contract_state='PENDING_SIGNATURE' AND NOT (id = ANY(v_rem))) THEN
    v_new_state := 'PENDING_SIGNATURE'; v_new_status := 'SALE_OPEN';
  ELSIF EXISTS (SELECT 1 FROM public.lot_sale_order_items WHERE order_id=p_order_id AND contract_state IN ('SIGNED','LEGACY_UNVERIFIED') AND NOT (id = ANY(v_rem))) THEN
    v_new_state := 'SIGNED'; v_new_status := 'SOLD';
  ELSIF v_has_food AND NOT EXISTS (SELECT 1 FROM public.lot_sale_order_items WHERE order_id=p_order_id AND contract_state='PENDING_SIGNATURE')
    AND EXISTS (SELECT 1 FROM public.lot_sale_order_items WHERE order_id=p_order_id AND contract_state IN ('SIGNED','LEGACY_UNVERIFIED')) THEN
    v_new_state := 'SIGNED'; v_new_status := 'SOLD';
  ELSE v_new_state := 'PENDING_SIGNATURE'; v_new_status := 'SALE_OPEN'; END IF;

  -- remoções
  v_n := 0;
  FOR v_item IN SELECT i.*, l.status lot_status, l.entity_id FROM public.lot_sale_order_items i JOIN public.commercial_lots l ON l.id=i.lot_id
     WHERE i.order_id=p_order_id AND i.id = ANY(v_rem) ORDER BY i.id FOR UPDATE OF i, l LOOP
    v_n := v_n + 1;
    IF v_item.contract_state NOT IN ('PENDING_SIGNATURE','SIGNED','LEGACY_UNVERIFIED') THEN RAISE EXCEPTION 'ITEM_NOT_ACTIVE:%', v_item.public_identifier; END IF;
    UPDATE public.lot_sale_order_items SET contract_state='CANCELLED', cancelled_at=now(), cancelled_by=p_actor WHERE id=v_item.id;
    UPDATE public.lot_sales SET status='REVERTED', reverted_at=now(), reverted_by=p_actor WHERE id=v_item.sale_id AND status IN ('OPEN','CONFIRMED');
    UPDATE public.commercial_lots SET status='AVAILABLE', updated_by=p_actor, updated_at=now() WHERE id=v_item.lot_id;
    INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by) VALUES (v_item.lot_id, v_item.lot_status, 'AVAILABLE', 'Retirado da venda: '||v_reason, p_actor);
    INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
    VALUES (v_org, v_order.project_id, v_item.entity_id, v_item.lot_id, 'LOT_SALE_ITEM_REMOVED', jsonb_build_object('status', v_item.lot_status),
      jsonb_build_object('status','AVAILABLE','sale_order_id',p_order_id,'item_id',v_item.id), v_reason, p_actor);
    UPDATE public.lot_contract_lots cl SET removed_at=now()
    FROM public.lot_contracts c WHERE cl.contract_id=c.id AND c.order_id=p_order_id
      AND c.scope='ORDER_ITEMS' AND cl.lot_id=v_item.lot_id AND cl.removed_at IS NULL;
    v_removed_lots := v_removed_lots || v_item.lot_id;
  END LOOP;
  IF v_n <> coalesce(array_length(v_rem,1),0) THEN RAISE EXCEPTION 'ITEM_NOT_IN_ORDER'; END IF;

  -- adições
  SELECT * INTO v_ref FROM public.lot_sales s WHERE s.id = (SELECT sale_id FROM public.lot_sale_order_items WHERE order_id=p_order_id AND sale_id IS NOT NULL ORDER BY created_at LIMIT 1);
  v_n := 0;
  FOR v_lot IN SELECT l.*, pr.renovacao_total, pr.renovacao_price_per_sqm, pr.renovacao_rule_id, pr.renovacao_rule_label,
        pr.segunda_total, pr.segunda_price_per_sqm, pr.segunda_rule_id, pr.segunda_rule_label
      FROM public.commercial_lots l LEFT JOIN public.commercial_lot_pricing_2028 pr ON pr.lot_id=l.id
     WHERE l.id = ANY(v_add) ORDER BY l.id FOR UPDATE OF l LOOP
    v_n := v_n + 1;
    IF v_lot.project_id <> v_order.project_id OR v_lot.archived_at IS NOT NULL THEN RAISE EXCEPTION 'LOT_NOT_IN_PROJECT:%', v_lot.public_identifier; END IF;
    IF v_lot.status <> 'AVAILABLE' THEN RAISE EXCEPTION 'LOT_NOT_AVAILABLE:%', v_lot.public_identifier; END IF;
    IF v_lot.commercial_unit='FOOD_POINT' THEN
      SELECT is_sellable INTO v_sellable FROM public.commercial_sale_eligibility WHERE lot_id=v_lot.id;
      IF v_sellable IS NOT TRUE THEN RAISE EXCEPTION 'LOT_NOT_AVAILABLE:%', v_lot.public_identifier; END IF;
    END IF;
    IF v_order.stage = 'RENOVACAO' THEN v_price := v_lot.renovacao_total; v_ppsqm := v_lot.renovacao_price_per_sqm; v_rule := v_lot.renovacao_rule_id; v_rule_label := v_lot.renovacao_rule_label;
    ELSE v_price := v_lot.segunda_total; v_ppsqm := v_lot.segunda_price_per_sqm; v_rule := v_lot.segunda_rule_id; v_rule_label := v_lot.segunda_rule_label; END IF;
    IF v_price IS NULL THEN RAISE EXCEPTION 'LOT_PRICE_UNAVAILABLE:%', v_lot.public_identifier; END IF;
    INSERT INTO public.lot_sales (lot_id, buyer_name, buyer_trade_name, document_number, negotiated_value, sale_date, salesperson_user_id, salesperson_name, internal_notes, payment_status, status)
    VALUES (v_lot.id, v_order.buyer_name, v_order.buyer_trade_name, v_order.document_number, v_price, coalesce(v_ref.sale_date, current_date),
      coalesce(v_ref.salesperson_user_id, v_order.salesperson_user_id), v_ref.salesperson_name, v_ref.internal_notes, 'PENDING',
      CASE WHEN v_new_state='SIGNED' THEN 'CONFIRMED' ELSE 'OPEN' END) RETURNING id INTO v_sale_id;
    INSERT INTO public.lot_sale_order_items (order_id, lot_id, public_identifier, official_area_snapshot, price_per_sqm_snapshot, pricing_rule_id, pricing_rule_label, pricing_stage, item_total, original_status, sale_id, contract_state, signed_at, signed_by, commercial_unit)
    VALUES (p_order_id, v_lot.id, v_lot.public_identifier, v_lot.official_area_sqm, v_ppsqm, v_rule, v_rule_label, v_order.stage, v_price, 'AVAILABLE', v_sale_id,
      v_new_state, CASE WHEN v_new_state='SIGNED' THEN now() END, CASE WHEN v_new_state='SIGNED' THEN p_actor END, v_lot.commercial_unit);
    UPDATE public.commercial_lots SET status=v_new_status, updated_by=p_actor, updated_at=now() WHERE id=v_lot.id;
    INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by) VALUES (v_lot.id, 'AVAILABLE', v_new_status, 'Adicionado à venda: '||v_reason, p_actor);
    INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
    VALUES (v_org, v_order.project_id, v_lot.entity_id, v_lot.id, 'LOT_SALE_ITEM_ADDED', jsonb_build_object('status','AVAILABLE'),
      jsonb_build_object('status',v_new_status,'sale_order_id',p_order_id), v_reason, p_actor);
    -- Orders with food points retain the selected coverage of each file.
    IF NOT v_has_food AND v_lot.commercial_unit='SQUARE_METER' THEN
      INSERT INTO public.lot_contract_lots (contract_id, lot_id, created_by)
        SELECT c.id, v_lot.id, p_actor FROM public.lot_contracts c WHERE c.order_id=p_order_id AND c.scope='ORDER_ITEMS'
      ON CONFLICT (contract_id, lot_id) DO UPDATE SET removed_at=NULL;
    END IF;
  END LOOP;
  IF v_n <> coalesce(array_length(v_add,1),0) THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;

  SELECT count(*) INTO v_active FROM public.lot_sale_order_items WHERE order_id=p_order_id AND contract_state IN ('PENDING_SIGNATURE','SIGNED','LEGACY_UNVERIFIED');
  IF v_active = 0 THEN RAISE EXCEPTION 'ORDER_WOULD_BE_EMPTY'; END IF;

  -- totais
  SELECT coalesce(sum(item_total),0), coalesce(sum(official_area_snapshot),0) INTO v_subtotal, v_area
    FROM public.lot_sale_order_items WHERE order_id=p_order_id AND contract_state IN ('PENDING_SIGNATURE','SIGNED','LEGACY_UNVERIFIED');
  UPDATE public.lot_sale_orders SET
    fee_admin = coalesce(p_fee_admin, fee_admin), fee_ppci = coalesce(p_fee_ppci, fee_ppci), fee_cleaning_license = coalesce(p_fee_cleaning, fee_cleaning_license)
   WHERE id=p_order_id RETURNING * INTO v_order;
  v_fees := coalesce(v_order.fee_admin,0)+coalesce(v_order.fee_ppci,0)+coalesce(v_order.fee_cleaning_license,0);
  v_total := v_subtotal + v_fees;

  -- parcelas
  SELECT coalesce(sum(amount),0), count(*) INTO v_paid, v_paid_n FROM public.lot_sale_installments WHERE order_id=p_order_id AND (payment_status='PAID' OR paid_at IS NOT NULL);
  SELECT count(*), max(due_date) INTO v_open_n, v_last_due FROM public.lot_sale_installments WHERE order_id=p_order_id AND payment_status='PENDING' AND paid_at IS NULL;
  v_count := coalesce(p_installment_count, v_order.installment_count, v_paid_n + v_open_n);
  IF v_has_food AND (v_count<1 OR v_count>36 OR (p_installment_count IS NOT NULL AND
    ((v_order.payment_method='BOLETO_PARCELADO' AND v_count<2) OR (v_order.payment_method IN ('PIX','BOLETO_AVISTA') AND v_count<>1)))) THEN
    RAISE EXCEPTION 'INVALID_INSTALLMENT_COUNT';
  END IF;
  IF v_count < v_paid_n + 1 AND v_total > v_paid THEN RAISE EXCEPTION 'INVALID_INSTALLMENT_COUNT'; END IF;
  IF v_total < v_paid THEN RAISE EXCEPTION 'TOTAL_BELOW_PAID'; END IF;
  IF (v_open_n + v_paid_n) > 0 AND (v_total <> v_order.negotiated_total OR v_count <> v_paid_n + v_open_n) THEN
    -- remove excedentes e cria faltantes mantendo vencimentos existentes
    DELETE FROM public.lot_sale_installments WHERE order_id=p_order_id AND payment_status='PENDING' AND paid_at IS NULL AND installment_number > v_count;
    v_last_due := coalesce((SELECT max(due_date) FROM public.lot_sale_installments WHERE order_id=p_order_id), v_order.first_due_date, current_date);
    FOR v_i IN (SELECT coalesce(max(installment_number),0)+1 FROM public.lot_sale_installments WHERE order_id=p_order_id)..v_count LOOP
      v_last_due := (v_last_due + interval '1 month')::date;
      INSERT INTO public.lot_sale_installments (order_id, installment_number, due_date, amount, payment_status) VALUES (p_order_id, v_i, v_last_due, 0, 'PENDING');
    END LOOP;
    SELECT count(*) INTO v_open_n FROM public.lot_sale_installments WHERE order_id=p_order_id AND payment_status='PENDING' AND paid_at IS NULL;
    IF v_open_n > 0 THEN
      v_cents := round((v_total - v_paid) * 100);
      v_each := v_cents / v_open_n;
      UPDATE public.lot_sale_installments SET amount = v_each / 100.0, updated_at = now() WHERE order_id=p_order_id AND payment_status='PENDING' AND paid_at IS NULL;
      UPDATE public.lot_sale_installments SET amount = (v_each + (v_cents - v_each * v_open_n)) / 100.0
       WHERE id = (SELECT id FROM public.lot_sale_installments WHERE order_id=p_order_id AND payment_status='PENDING' AND paid_at IS NULL ORDER BY installment_number DESC LIMIT 1);
    END IF;
    v_count := v_paid_n + v_open_n;
  END IF;

  UPDATE public.lot_sale_orders SET spaces_subtotal=v_subtotal, official_area_total=v_area, fees_total=v_fees, negotiated_total=v_total,
    installment_count = CASE WHEN (v_open_n + v_paid_n) > 0 THEN v_count ELSE installment_count END, updated_at=now()
   WHERE id=p_order_id RETURNING * INTO v_order;

  v_after := jsonb_build_object('lots', (SELECT jsonb_agg(public_identifier ORDER BY public_identifier) FROM public.lot_sale_order_items WHERE order_id=p_order_id AND contract_state IN ('PENDING_SIGNATURE','SIGNED','LEGACY_UNVERIFIED')),
    'spaces_subtotal', v_order.spaces_subtotal, 'fees_total', v_order.fees_total, 'negotiated_total', v_order.negotiated_total, 'installment_count', v_order.installment_count);
  INSERT INTO public.lot_sale_order_revisions (order_id, added_lot_ids, removed_lot_ids, before_state, after_state, reason, actor_user_id)
  VALUES (p_order_id, v_add, v_removed_lots, v_before, v_after, v_reason, p_actor);
  RETURN jsonb_build_object('orderId', p_order_id, 'before', v_before, 'after', v_after, 'updatedAt', v_order.updated_at);
END; $function$;

REVOKE ALL ON FUNCTION public.register_commercial_sale_core(uuid,text,text,numeric,date,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._revise_sale_order_items_core(uuid,uuid[],uuid[],numeric,numeric,numeric,integer,text,timestamptz,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancel_sale_order_items(p_order_id uuid, p_item_ids uuid[], p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order public.lot_sale_orders%ROWTYPE; v_org_id uuid; v_item record;
  v_has_food boolean;
  v_cancelled integer := 0; v_skipped integer := 0; v_remaining integer; v_open_items integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN RAISE EXCEPTION 'NO_ITEMS_SELECTED'; END IF;
  SELECT * INTO v_order FROM public.lot_sale_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_order.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF v_order.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'ORDER_NOT_ACTIVE'; END IF;

  FOR v_item IN
    SELECT i.*, l.status AS lot_status, l.entity_id, l.project_id AS lot_project_id
      FROM public.lot_sale_order_items i
      JOIN public.commercial_lots l ON l.id = i.lot_id
     WHERE i.order_id = p_order_id AND i.id = ANY(p_item_ids)
     ORDER BY i.id
     FOR UPDATE OF i, l
  LOOP
    IF v_item.contract_state = 'CANCELLED' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    IF v_item.contract_state <> 'PENDING_SIGNATURE' THEN
      RAISE EXCEPTION 'ITEM_NOT_PENDING:%', v_item.public_identifier;
    END IF;
    IF v_item.lot_status <> 'SALE_OPEN' THEN
      RAISE EXCEPTION 'LOT_NOT_SALE_OPEN:%', v_item.public_identifier;
    END IF;
    UPDATE public.lot_sale_order_items
       SET contract_state = 'CANCELLED', cancelled_at = now(), cancelled_by = auth.uid()
     WHERE id = v_item.id;
    UPDATE public.lot_contract_lots cl SET removed_at=now()
    FROM public.lot_contracts c WHERE cl.contract_id=c.id AND c.order_id=p_order_id
      AND cl.lot_id=v_item.lot_id AND cl.removed_at IS NULL;
    UPDATE public.lot_sales SET status = 'REVERTED' WHERE id = v_item.sale_id AND status = 'OPEN';
    UPDATE public.commercial_lots SET status = 'AVAILABLE', updated_by = auth.uid(), updated_at = now() WHERE id = v_item.lot_id;
    INSERT INTO public.lot_status_history (lot_id, previous_status, new_status, reason, changed_by)
    VALUES (v_item.lot_id, 'SALE_OPEN', 'AVAILABLE', coalesce(nullif(trim(p_reason), ''), 'Venda em aberto cancelada'), auth.uid());
    INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason, actor_user_id)
    VALUES (v_org_id, v_item.lot_project_id, v_item.entity_id, v_item.lot_id, 'LOT_SALE_CANCELLED',
      jsonb_build_object('status', 'SALE_OPEN'), jsonb_build_object('status', 'AVAILABLE', 'sale_order_id', p_order_id, 'item_id', v_item.id),
      coalesce(nullif(trim(p_reason), ''), 'Venda em aberto cancelada'), auth.uid());
    v_cancelled := v_cancelled + 1;
  END LOOP;

  IF v_cancelled + v_skipped <> array_length(p_item_ids, 1) THEN
    RAISE EXCEPTION 'ITEM_NOT_IN_ORDER';
  END IF;

  SELECT count(*) FILTER (WHERE contract_state = 'PENDING_SIGNATURE'),
         count(*) FILTER (WHERE contract_state IN ('PENDING_SIGNATURE','SIGNED','LEGACY_UNVERIFIED'))
    INTO v_remaining, v_open_items
    FROM public.lot_sale_order_items WHERE order_id = p_order_id;

  SELECT EXISTS (SELECT 1 FROM public.lot_sale_order_items WHERE order_id=p_order_id AND commercial_unit='FOOD_POINT')
    INTO v_has_food;
  IF v_open_items = 0 THEN
    IF v_has_food AND EXISTS (SELECT 1 FROM public.lot_sale_installments WHERE order_id=p_order_id AND (payment_status='PAID' OR paid_at IS NOT NULL)) THEN
      RAISE EXCEPTION 'TOTAL_BELOW_PAID';
    END IF;
    UPDATE public.lot_sale_orders
       SET status = 'REVERTED', reverted_at = now(), reverted_by = auth.uid(), updated_at = now()
     WHERE id = p_order_id;
  ELSIF v_has_food AND v_cancelled>0 THEN
    -- Reconcile the remaining principal and pending payments in the same
    -- transaction. The shared revision code keeps paid installments intact.
    PERFORM public._revise_sale_order_items_core(p_order_id,'{}','{}',coalesce(v_order.fee_admin,0),
      NULL,NULL,NULL,coalesce(nullif(btrim(p_reason),''),'Cancelamento parcial da venda'),NULL,auth.uid());
  ELSE
    UPDATE public.lot_sale_orders SET updated_at = now() WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object('orderId', p_order_id, 'cancelled', v_cancelled, 'skipped', v_skipped, 'pendingRemaining', v_remaining);
END;
$function$;

CREATE OR REPLACE FUNCTION public.attach_order_contract(p_order_id uuid, p_lot_ids uuid[], p_storage_path text, p_original_name text, p_mime_type text, p_file_size bigint, p_contract_number text DEFAULT NULL::text, p_contract_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_order public.lot_sale_orders%ROWTYPE; v_org uuid; v_contract uuid; v_version int; v_version_id uuid; v_lot uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_lot_ids IS NULL OR array_length(p_lot_ids,1) IS NULL THEN RAISE EXCEPTION 'NO_ITEMS_SELECTED'; END IF;
  SELECT * INTO v_order FROM public.lot_sale_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = v_order.project_id;
  IF NOT public.map_has_explicit_capability(v_org, 'map.manage_contracts') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_lot_ids) x(lot_id) WHERE NOT EXISTS (
      SELECT 1 FROM public.lot_sale_order_items i WHERE i.order_id = p_order_id AND i.lot_id = x.lot_id AND i.contract_state <> 'CANCELLED')) THEN
    RAISE EXCEPTION 'ITEM_NOT_IN_ORDER'; END IF;
  IF p_storage_path NOT LIKE v_org::text || '/orders/' || p_order_id::text || '/%' THEN RAISE EXCEPTION 'INVALID_CONTRACT_STORAGE_PATH'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'map-contracts' AND name = p_storage_path) THEN RAISE EXCEPTION 'CONTRACT_OBJECT_NOT_FOUND'; END IF;
  IF p_mime_type NOT IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document') OR p_file_size <= 0 OR p_file_size > 15728640 THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_FILE'; END IF;

  IF p_contract_id IS NOT NULL THEN
    SELECT id, active_version INTO v_contract, v_version FROM public.lot_contracts
     WHERE id = p_contract_id AND scope = 'ORDER_ITEMS' AND order_id = p_order_id AND is_active FOR UPDATE;
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
  INSERT INTO public.map_activity_logs (org_id, project_id, action, after_state, actor_user_id)
  VALUES (v_org, v_order.project_id, CASE WHEN v_version = 1 THEN 'ORDER_CONTRACT_UPLOADED' ELSE 'ORDER_CONTRACT_REPLACED' END,
    jsonb_build_object('order_id', p_order_id, 'contract_id', v_contract, 'version', v_version, 'lot_ids', to_jsonb(p_lot_ids)), auth.uid());
  RETURN jsonb_build_object('contractId', v_contract, 'version', v_version, 'versionId', v_version_id);
END $function$;

CREATE OR REPLACE FUNCTION public.register_lot_contract_version(p_lot_id uuid, p_storage_path text, p_original_name text, p_mime_type text, p_file_size bigint, p_contract_number text, p_expected_sale_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_lot public.commercial_lots%ROWTYPE; v_org_id uuid; v_contract_id uuid; v_version integer; v_version_id uuid; v_sale_id uuid;
BEGIN
  SELECT * INTO v_lot FROM public.commercial_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org_id FROM public.map_projects WHERE id = v_lot.project_id;
  IF NOT public.map_has_explicit_capability(v_org_id, 'map.manage_contracts') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  IF p_storage_path NOT LIKE v_org_id::text || '/' || p_lot_id::text || '/%' THEN RAISE EXCEPTION 'INVALID_CONTRACT_STORAGE_PATH'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'map-contracts' AND name = p_storage_path) THEN RAISE EXCEPTION 'CONTRACT_OBJECT_NOT_FOUND'; END IF;
  IF v_lot.commercial_unit='FOOD_POINT' THEN
    IF p_mime_type NOT IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      OR p_file_size IS NULL OR p_file_size<=0 OR p_file_size>15728640 THEN RAISE EXCEPTION 'INVALID_CONTRACT_FILE'; END IF;
    SELECT id INTO v_sale_id FROM public.lot_sales WHERE lot_id=p_lot_id AND status IN ('OPEN','CONFIRMED');
    IF v_sale_id IS NULL THEN RAISE EXCEPTION 'SALE_NOT_FOUND'; END IF;
    IF p_expected_sale_id IS DISTINCT FROM v_sale_id THEN RAISE EXCEPTION 'SALE_CHANGED'; END IF;
    UPDATE public.lot_contracts SET is_active=false, updated_at=now()
      WHERE lot_id=p_lot_id AND scope='LOT' AND is_active AND sale_id IS DISTINCT FROM v_sale_id;
  END IF;
  SELECT id, active_version INTO v_contract_id, v_version FROM public.lot_contracts WHERE lot_id = p_lot_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.lot_contracts (lot_id, contract_number, active_version, created_by, sale_id) VALUES (p_lot_id, nullif(trim(p_contract_number), ''), 1, auth.uid(), v_sale_id) RETURNING id, active_version INTO v_contract_id, v_version;
  ELSE
    v_version := v_version + 1;
    UPDATE public.lot_contract_versions SET superseded_at = now() WHERE contract_id = v_contract_id AND superseded_at IS NULL;
    UPDATE public.lot_contracts SET active_version = v_version, contract_number = coalesce(nullif(trim(p_contract_number), ''), contract_number), updated_at = now() WHERE id = v_contract_id;
  END IF;
  INSERT INTO public.lot_contract_versions (contract_id, version, storage_path, original_name, mime_type, file_size, uploaded_by, covered_lot_ids)
  VALUES (v_contract_id, v_version, p_storage_path, p_original_name, p_mime_type, p_file_size, auth.uid(), ARRAY[p_lot_id]) RETURNING id INTO v_version_id;
  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, after_state, actor_user_id)
  VALUES (v_org_id, v_lot.project_id, v_lot.entity_id, p_lot_id, CASE WHEN v_version = 1 THEN 'CONTRACT_UPLOADED' ELSE 'CONTRACT_REPLACED' END, jsonb_build_object('contract_id', v_contract_id, 'version', v_version), auth.uid());
  RETURN v_version_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.register_lot_contract_version(uuid,text,text,text,bigint,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_lot_contract_version(uuid,text,text,text,bigint,text,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.register_lot_contract_version(p_lot_id uuid, p_storage_path text, p_original_name text, p_mime_type text, p_file_size bigint, p_contract_number text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.register_lot_contract_version(p_lot_id,p_storage_path,p_original_name,p_mime_type,p_file_size,p_contract_number,NULL::uuid);
$$;
REVOKE ALL ON FUNCTION public.register_lot_contract_version(uuid,text,text,text,bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_lot_contract_version(uuid,text,text,text,bigint,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_commercial_sale_order_detail(p_order_id uuid DEFAULT NULL::uuid, p_sale_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_project uuid; v_org uuid; v_docs boolean; v_header jsonb; v_items jsonb; v_inst jsonb := '[]'::jsonb; v_lots uuid[]; v_active_lots uuid[]; v_sales uuid[]; v_active_sales uuid[]; v_contracts jsonb := NULL;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_order_id IS NOT NULL THEN
    SELECT project_id INTO v_project FROM public.lot_sale_orders WHERE id = p_order_id;
  ELSE
    SELECT l.project_id INTO v_project FROM public.lot_sales s JOIN public.commercial_lots l ON l.id = s.lot_id WHERE s.id = p_sale_id;
    v_active_lots := v_lots;
    v_sales := ARRAY[p_sale_id];
    v_active_sales := v_sales;
  END IF;
  IF v_project IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = v_project;
  IF NOT public.map_has_explicit_capability(v_org, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  v_docs := public.map_has_explicit_capability(v_org, 'map.manage_contracts');

  IF p_order_id IS NOT NULL THEN
    SELECT jsonb_build_object('kind','ORDER','orderId',o.id,'projectId',o.project_id,'reference','PV-'||upper(left(o.id::text,8)),
      'createdAt',o.created_at,'status',o.status,'buyerName',o.buyer_name,'buyerTradeName',o.buyer_trade_name,
      'documentNumber',o.document_number,'phone',o.phone,'email',o.email,'stage',o.stage,
      'negotiatedTotal',o.negotiated_total,'spacesSubtotal',o.spaces_subtotal,'feeAdmin',o.fee_admin,'feePpci',o.fee_ppci,
      'feeCleaning',o.fee_cleaning_license,'feesTotal',o.fees_total,'paymentMethod',o.payment_method,
      'installmentCount',o.installment_count,'firstDueDate',o.first_due_date,'officialAreaTotal',o.official_area_total)
    INTO v_header FROM public.lot_sale_orders o WHERE o.id = p_order_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('itemId',i.id,'saleId',i.sale_id,'lotId',i.lot_id,'entityId',l.entity_id,'publicIdentifier',i.public_identifier,
      'lotNumber',l.lot_number,'displayName',coalesce(i.display_name_snapshot,l.display_name),'areaSnapshot',i.official_area_snapshot,
      'commercialUnit',i.commercial_unit,'unitQuantity',i.unit_quantity_snapshot,
      'structureIdentifier',i.structure_identifier_snapshot,'structureName',i.structure_name_snapshot,'itemTotal',i.item_total,
      'pricingStage',i.pricing_stage,'contractState',i.contract_state,'signedAt',i.signed_at,'cancelledAt',i.cancelled_at,'lotStatus',l.status)
      ORDER BY i.public_identifier, i.created_at), '[]'::jsonb), array_agg(i.lot_id),
      array_agg(i.lot_id) FILTER(WHERE i.contract_state<>'CANCELLED'), array_agg(i.sale_id),
      array_agg(i.sale_id) FILTER(WHERE i.contract_state<>'CANCELLED')
    INTO v_items, v_lots, v_active_lots, v_sales, v_active_sales FROM public.lot_sale_order_items i JOIN public.commercial_lots l ON l.id = i.lot_id WHERE i.order_id = p_order_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('number',n.installment_number,'dueDate',n.due_date,'amount',n.amount,
      'paymentStatus',n.payment_status,'paidAt',n.paid_at) ORDER BY n.installment_number), '[]'::jsonb)
    INTO v_inst FROM public.lot_sale_installments n WHERE n.order_id = p_order_id;
  ELSE
    SELECT jsonb_build_object('kind','LEGACY','saleId',s.id,'projectId',l.project_id,'reference','LG-'||upper(left(s.id::text,8)),
      'createdAt',s.created_at,'status',s.status,'buyerName',s.buyer_name,'buyerTradeName',s.buyer_trade_name,
      'documentNumber',s.document_number,'negotiatedTotal',s.negotiated_value,'paymentStatus',s.payment_status,
      'saleDate',s.sale_date,'contractNumber',s.contract_number),
      jsonb_build_array(jsonb_build_object('itemId',NULL,'lotId',l.id,'entityId',l.entity_id,'publicIdentifier',l.public_identifier,
      'lotNumber',l.lot_number,'displayName',l.display_name,'areaSnapshot',l.official_area_sqm,'itemTotal',s.negotiated_value,
      'contractState','LEGACY_UNVERIFIED','lotStatus',l.status)), ARRAY[l.id]
    INTO v_header, v_items, v_lots FROM public.lot_sales s JOIN public.commercial_lots l ON l.id = s.lot_id WHERE s.id = p_sale_id;
    v_active_lots := v_lots;
    v_sales := ARRAY[p_sale_id];
    v_active_sales := v_sales;
  END IF;

  IF v_docs THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',c.id,'scope',c.scope,'contractNumber',c.contract_number,
      'activeVersion',c.active_version,'createdAt',c.created_at,
      'lotIds', CASE WHEN c.scope='LOT' THEN
        CASE WHEN c.is_active AND c.lot_id=ANY(v_active_lots) AND (c.sale_id IS NULL OR c.sale_id=ANY(v_active_sales))
          THEN jsonb_build_array(c.lot_id) ELSE '[]'::jsonb END
        ELSE (SELECT coalesce(jsonb_agg(cl.lot_id),'[]'::jsonb) FROM public.lot_contract_lots cl
          WHERE cl.contract_id=c.id AND cl.removed_at IS NULL AND cl.lot_id=ANY(v_active_lots)) END,
      'historicalLotIds', CASE WHEN c.scope='LOT' THEN jsonb_build_array(c.lot_id)
        ELSE (SELECT coalesce(jsonb_agg(cl.lot_id),'[]'::jsonb) FROM public.lot_contract_lots cl WHERE cl.contract_id=c.id) END,
      'versions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'storagePath',v.storage_path,'originalName',v.original_name,
        'mimeType',v.mime_type,'fileSize',v.file_size,'uploadedAt',v.uploaded_at,'supersededAt',v.superseded_at,'coveredLotIds',v.covered_lot_ids) ORDER BY v.version DESC),'[]'::jsonb)
        FROM public.lot_contract_versions v WHERE v.contract_id=c.id)) ORDER BY c.created_at), '[]'::jsonb)
    INTO v_contracts FROM public.lot_contracts c
    WHERE (c.scope='LOT' AND c.lot_id=ANY(v_lots)
        AND ((c.sale_id IS NULL AND c.is_active) OR c.sale_id=ANY(v_sales)))
      OR (p_order_id IS NOT NULL AND c.scope='ORDER_ITEMS' AND c.is_active AND c.order_id=p_order_id);
  END IF;
  RETURN jsonb_build_object('header',v_header,'items',v_items,'installments',v_inst,'contracts',v_contracts,'documentsAccessible',v_docs);
END $function$;

CREATE OR REPLACE FUNCTION public.set_lot_price_override(p_lot_id uuid, p_stage text, p_total numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_org uuid;v_project uuid;v_before numeric;v_uid uuid:=auth.uid();v_role text;v_name text; BEGIN IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF; IF p_stage NOT IN ('RENOVACAO','SEGUNDA_ETAPA') THEN RAISE EXCEPTION 'INVALID_STAGE'; END IF; IF p_total IS NULL OR p_total<0 OR p_total>100000000 OR p_total<>round(p_total,2) THEN RAISE EXCEPTION 'INVALID_VALUE'; END IF; SELECT p.org_id,l.project_id INTO v_org,v_project FROM public.commercial_lots l JOIN public.map_projects p ON p.id=l.project_id WHERE l.id=p_lot_id AND l.archived_at IS NULL; IF v_org IS NULL THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF; v_role:=public.get_user_org_role(v_uid,v_org); IF NOT(v_role IN ('admin','gestor') OR public.has_role(v_uid,'admin') OR public.map_has_explicit_capability(v_org,'map.edit') OR public.map_has_explicit_capability(v_org,'map.manage_lots') OR public.map_has_explicit_capability(v_org,'map.admin') OR public.map_has_explicit_capability(v_org,'full_access')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF; IF EXISTS (SELECT 1 FROM public.commercial_lots WHERE id=p_lot_id AND commercial_unit='FOOD_POINT') THEN
   RAISE EXCEPTION 'FOOD_POINT_FIXED_PRICE';
 END IF;
 SELECT full_name INTO v_name FROM public.profiles WHERE user_id=v_uid LIMIT 1; SELECT CASE WHEN p_stage='RENOVACAO' THEN renovacao_total ELSE segunda_total END INTO v_before FROM public.commercial_lot_pricing_2028 WHERE lot_id=p_lot_id; INSERT INTO public.commercial_lot_price_overrides(lot_id,stage,total,previous_total,updated_by) VALUES(p_lot_id,p_stage,round(p_total,2),v_before,v_uid) ON CONFLICT(lot_id,stage) DO UPDATE SET total=EXCLUDED.total,previous_total=v_before,updated_by=v_uid,updated_at=now(); UPDATE public.commercial_lots SET updated_at=now() WHERE id=p_lot_id; INSERT INTO public.map_activity_logs(org_id,project_id,lot_id,action,before_state,after_state,actor_user_id) VALUES(v_org,v_project,p_lot_id,'price_override_set',jsonb_build_object('stage',p_stage,'total',v_before),jsonb_build_object('stage',p_stage,'total',round(p_total,2),'actor_name',v_name),v_uid); RETURN jsonb_build_object('lot_id',p_lot_id,'stage',p_stage,'previous_total',v_before,'total',round(p_total,2)); END $function$;

CREATE OR REPLACE FUNCTION public.commercial_map_revision(p_project_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid;
  v_sig text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = p_project_id;
  IF v_org IS NULL OR NOT public.can_view_commercial_map(v_org) THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;

  WITH project_contracts AS MATERIALIZED (
    SELECT c.id, c.scope, c.updated_at, c.is_active, c.contract_number
    FROM public.lot_contracts c JOIN public.commercial_lots l ON l.id = c.lot_id
    WHERE c.scope = 'LOT' AND l.project_id = p_project_id
    UNION ALL
    SELECT c.id, c.scope, c.updated_at, c.is_active, c.contract_number
    FROM public.lot_contracts c JOIN public.lot_sale_orders o ON o.id = c.order_id
    WHERE c.scope = 'ORDER_ITEMS' AND o.project_id = p_project_id
  )
  SELECT md5(concat_ws('|',
    (SELECT max(updated_at)::text || ':' || count(*) FROM public.commercial_lots WHERE project_id = p_project_id),
    (SELECT md5(coalesce(string_agg(concat_ws(',', f.lot_id, f.base_price, f.is_active, f.pricing_mode), ';' ORDER BY f.id), ''))
      FROM public.lot_prices f JOIN public.commercial_lots l ON l.id=f.lot_id
      WHERE l.project_id=p_project_id AND l.commercial_unit='FOOD_POINT' AND f.is_active),
    (SELECT max(updated_at)::text || ':' || count(*) FROM public.map_entities WHERE project_id = p_project_id),
    (SELECT max(updated_at)::text || ':' || count(*) FROM public.map_entity_geometries WHERE project_id = p_project_id AND is_current),
    (SELECT max(updated_at)::text || ':' || count(*) FROM public.commercial_price_rules WHERE project_id = p_project_id OR project_id IS NULL),
    (SELECT max(o.updated_at)::text || ':' || count(*) FROM public.commercial_lot_price_overrides o JOIN public.commercial_lots l ON l.id = o.lot_id WHERE l.project_id = p_project_id),
    (SELECT max(updated_at)::text || ':' || count(*) FROM public.lot_sale_orders WHERE project_id = p_project_id),
    (SELECT max(i.updated_at)::text || ':' || count(*) FROM public.lot_sale_installments i JOIN public.lot_sale_orders o ON o.id = i.order_id WHERE o.project_id = p_project_id),
    (SELECT md5(coalesce(string_agg(concat_ws(',', c.id, c.scope, c.updated_at, c.is_active, c.contract_number), ';' ORDER BY c.id), ''))
       FROM project_contracts c),
    (SELECT md5(coalesce(string_agg(concat_ws(',', cl.contract_id, cl.lot_id, cl.removed_at), ';' ORDER BY cl.contract_id, cl.lot_id, cl.removed_at), ''))
       FROM public.lot_contract_lots cl JOIN project_contracts c ON c.id = cl.contract_id),
    (SELECT max(r.updated_at)::text || ':' || count(*) FROM public.lot_reservations r JOIN public.commercial_lots l ON l.id = r.lot_id WHERE l.project_id = p_project_id),
    (SELECT md5(coalesce(string_agg(concat_ws(',', s.id, s.status, s.reverted_at, s.negotiated_value, s.buyer_name, s.buyer_trade_name, s.contract_number), ';' ORDER BY s.id), ''))
       FROM public.lot_sales s JOIN public.commercial_lots l ON l.id = s.lot_id WHERE l.project_id = p_project_id),
    (SELECT md5(coalesce(string_agg(concat_ws(',', it.id, it.lot_id, it.contract_state, it.signed_at, it.cancelled_at, it.item_total), ';' ORDER BY it.id), ''))
       FROM public.lot_sale_order_items it JOIN public.lot_sale_orders o ON o.id = it.order_id WHERE o.project_id = p_project_id)
  )) INTO v_sig;
  RETURN v_sig;
END;
$function$;

DROP FUNCTION IF EXISTS public.list_commercial_sale_orders(uuid,text,text,boolean,text,date,date,integer,integer);
CREATE OR REPLACE FUNCTION public.list_commercial_sale_orders(p_project_id uuid, p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_has_document boolean DEFAULT NULL::boolean, p_payment_method text DEFAULT NULL::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0, p_segment_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_docs boolean; v_q text; v_total integer; v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id = p_project_id;
  IF v_org IS NULL OR NOT public.map_has_explicit_capability(v_org, 'map.manage_sales') THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  v_docs := public.map_has_explicit_capability(v_org, 'map.manage_contracts');
  IF p_has_document IS NOT NULL AND NOT v_docs THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  v_q := nullif(lower(trim(coalesce(p_search, ''))), '');
  WITH orders AS (
    SELECT o.id AS record_id, 'ORDER'::text AS kind, o.id AS order_id, NULL::uuid AS sale_id,
      'PV-' || upper(left(o.id::text, 8)) AS reference, o.created_at, o.status,
      o.buyer_name, o.buyer_trade_name, public.commercial_buyer_display_name(o.buyer_trade_name, o.buyer_name) AS display_name,
      o.negotiated_total, o.spaces_subtotal, o.fees_total, o.payment_method, o.installment_count,
      count(i.id)::int AS item_count,
      count(i.id) FILTER (WHERE i.contract_state <> 'CANCELLED')::int AS active_count,
      count(i.id) FILTER (WHERE i.contract_state = 'SIGNED')::int AS signed_count,
      count(i.id) FILTER (WHERE i.contract_state = 'PENDING_SIGNATURE')::int AS pending_count,
      count(i.id) FILTER (WHERE i.contract_state = 'CANCELLED')::int AS cancelled_count,
      count(i.id) FILTER (WHERE i.contract_state = 'LEGACY_UNVERIFIED')::int AS legacy_count,
      coalesce(sum(i.item_total) FILTER (WHERE i.contract_state <> 'CANCELLED'), 0) AS active_items_total,
      array_agg(i.lot_id ORDER BY i.public_identifier) FILTER (WHERE i.contract_state <> 'CANCELLED') AS lot_ids,
      string_agg(concat_ws(' ',i.public_identifier,l.lot_number,coalesce(i.display_name_snapshot,l.display_name),
        i.structure_identifier_snapshot,i.structure_name_snapshot,CASE WHEN i.commercial_unit='FOOD_POINT' THEN 'Gastronomia' END), ' ') AS space_text,
      array_agg(DISTINCT CASE WHEN i.commercial_unit='FOOD_POINT' THEN 'gastronomia' ELSE seg.slug END)
        FILTER (WHERE i.contract_state<>'CANCELLED' OR o.reverted_at IS NOT NULL) AS segment_slugs,
      jsonb_agg(jsonb_build_object('name',i.display_name_snapshot,'structure',i.structure_name_snapshot)
        ORDER BY i.public_identifier) FILTER (WHERE i.commercial_unit='FOOD_POINT'
          AND (i.contract_state<>'CANCELLED' OR o.reverted_at IS NOT NULL)) AS food_points
    FROM public.lot_sale_orders o
    JOIN public.lot_sale_order_items i ON i.order_id = o.id
    LEFT JOIN public.commercial_lots l ON l.id = i.lot_id
    LEFT JOIN public.map_entities e ON e.id=l.entity_id AND e.project_id=o.project_id
    LEFT JOIN public.map_segments seg ON seg.id=e.segment_id AND seg.project_id=o.project_id
    WHERE o.project_id = p_project_id AND (o.reverted_at IS NULL OR EXISTS (
      SELECT 1 FROM public.lot_sale_order_items fi WHERE fi.order_id=o.id AND fi.commercial_unit='FOOD_POINT'
    ))
    GROUP BY o.id
  ), legacy AS (
    SELECT s.id AS record_id, 'LEGACY'::text AS kind, NULL::uuid AS order_id, s.id AS sale_id,
      'LG-' || upper(left(s.id::text, 8)) AS reference, s.created_at, s.status,
      s.buyer_name, s.buyer_trade_name, public.commercial_buyer_display_name(s.buyer_trade_name, s.buyer_name) AS display_name,
      s.negotiated_value AS negotiated_total, NULL::numeric AS spaces_subtotal, NULL::numeric AS fees_total, NULL::text AS payment_method, NULL::int AS installment_count,
      1 AS item_count, 1 AS active_count, 0 AS signed_count, 0 AS pending_count, 0 AS cancelled_count, 1 AS legacy_count,
      s.negotiated_value AS active_items_total, ARRAY[s.lot_id] AS lot_ids,
      coalesce(l.public_identifier,'') || ' ' || coalesce(l.lot_number,'') || ' ' || coalesce(l.display_name,'') || ' ' || coalesce(s.contract_number,'') AS space_text,
      ARRAY[seg.slug], NULL::jsonb
    FROM public.lot_sales s JOIN public.commercial_lots l ON l.id=s.lot_id
    LEFT JOIN public.map_entities e ON e.id=l.entity_id AND e.project_id=l.project_id
    LEFT JOIN public.map_segments seg ON seg.id=e.segment_id AND seg.project_id=l.project_id
    WHERE l.project_id = p_project_id AND s.reverted_at IS NULL AND s.status <> 'REVERTED'
      AND NOT EXISTS (SELECT 1 FROM public.lot_sale_order_items oi WHERE oi.sale_id = s.id)
  ), base AS (SELECT * FROM orders UNION ALL SELECT * FROM legacy),
  enriched AS (
    SELECT b.*,
      CASE WHEN v_docs THEN (SELECT count(DISTINCT c.id)::int FROM public.lot_contracts c
        WHERE c.is_active AND EXISTS (SELECT 1 FROM public.lot_contract_versions v WHERE v.contract_id = c.id AND v.superseded_at IS NULL)
          AND public.commercial_sale_has_active_contract_coverage(c,b.order_id,b.sale_id,b.lot_ids)) END AS document_count,
      CASE WHEN v_docs THEN (SELECT string_agg(DISTINCT c.contract_number, ' ') FROM public.lot_contracts c
        WHERE c.is_active AND public.commercial_sale_has_active_contract_coverage(c,b.order_id,b.sale_id,b.lot_ids)) END AS contract_numbers,
      (SELECT count(*)::int FROM public.lot_sale_installments n WHERE n.order_id = b.order_id AND (n.paid_at IS NOT NULL OR n.payment_status = 'PAID')) AS paid_installments
    FROM base b
  ), filtered AS (
    SELECT * FROM enriched e
    WHERE (v_q IS NULL OR lower(concat_ws(' ', e.reference, e.buyer_name, e.buyer_trade_name, e.space_text, e.contract_numbers)) LIKE '%' || v_q || '%')
      AND (p_status IS NULL
        OR (p_status = 'PENDING' AND e.pending_count > 0)
        OR (p_status = 'SIGNED' AND e.signed_count > 0 AND e.pending_count = 0)
        OR (p_status = 'PARTIAL' AND e.signed_count > 0 AND e.pending_count > 0)
        OR (p_status = 'CANCELLED_PARTIAL' AND e.cancelled_count > 0)
        OR (p_status = 'LEGACY' AND (e.kind = 'LEGACY' OR e.legacy_count > 0)))
      AND (p_has_document IS NULL OR (p_has_document = (e.document_count > 0)))
      AND (p_segment_slug IS NULL OR p_segment_slug=ANY(e.segment_slugs))
      AND (p_payment_method IS NULL OR e.payment_method = p_payment_method)
      AND (p_from IS NULL OR e.created_at >= p_from::timestamptz)
      AND (p_to IS NULL OR e.created_at < (p_to + 1)::timestamptz)
  )
  SELECT (SELECT count(*) FROM filtered)::int,
    coalesce((SELECT jsonb_agg(to_jsonb(x) - 'space_text' - 'buyer_name_search' - 'contract_numbers' - 'document_count'
        || jsonb_build_object('document_count',x.documents_visible) ORDER BY x.created_at DESC) FROM (
      SELECT f.*, CASE WHEN v_docs THEN f.document_count END AS documents_visible FROM filtered f
      ORDER BY f.created_at DESC, f.record_id LIMIT greatest(1, least(coalesce(p_limit,25), 100)) OFFSET greatest(coalesce(p_offset,0),0)) x), '[]'::jsonb)
  INTO v_total, v_rows;
  RETURN jsonb_build_object('total', v_total, 'rows', v_rows, 'documentsAccessible', v_docs);
END $function$;
REVOKE ALL ON FUNCTION public.list_commercial_sale_orders(uuid,text,text,boolean,text,date,date,integer,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_commercial_sale_orders(uuid,text,text,boolean,text,date,date,integer,integer,text) TO authenticated;

DROP FUNCTION IF EXISTS public.export_commercial_sale_orders(uuid,text,text,boolean,text,date,date,text);
CREATE OR REPLACE FUNCTION public.export_commercial_sale_orders(p_project_id uuid, p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_has_document boolean DEFAULT NULL::boolean, p_payment_method text DEFAULT NULL::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_signature_selection text DEFAULT 'ALL'::text, p_segment_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid; v_docs boolean; result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT org_id INTO v_org FROM public.map_projects WHERE id=p_project_id;
  IF v_org IS NULL OR NOT public.map_has_explicit_capability(v_org,'map.manage_sales') THEN
    RAISE EXCEPTION 'MAP_PERMISSION_DENIED';
  END IF;
  IF p_signature_selection NOT IN ('ALL','SIGNED','PENDING') OR p_signature_selection IS NULL THEN
    RAISE EXCEPTION 'INVALID_SIGNATURE_SELECTION';
  END IF;
  v_docs := public.map_has_explicit_capability(v_org,'map.manage_contracts');
  IF p_has_document IS NOT NULL AND NOT v_docs THEN RAISE EXCEPTION 'MAP_PERMISSION_DENIED'; END IF;
  WITH RECURSIVE walk AS (
    SELECT l.id lot_id,e.id,e.parent_entity_id,e.classification,e.name,e.segment_id,ARRAY[e.id] path,0 depth
    FROM public.commercial_lots l JOIN public.map_entities e ON e.id=l.entity_id
    WHERE l.project_id=p_project_id AND e.project_id=p_project_id
    UNION ALL
    SELECT w.lot_id,e.id,e.parent_entity_id,e.classification,e.name,e.segment_id,w.path||e.id,w.depth+1
    FROM walk w JOIN public.map_entities e ON e.id=w.parent_entity_id AND e.project_id=p_project_id
    WHERE NOT e.id=ANY(w.path) AND w.depth<64
  ), locations AS (
    SELECT w.lot_id,
      (array_agg(w.name ORDER BY w.depth) FILTER (WHERE w.depth>0 AND w.classification='PAVILION'))[1] pavilion_name,
      (array_agg(w.segment_id ORDER BY w.depth) FILTER (WHERE w.segment_id IS NOT NULL))[1] segment_id
    FROM walk w GROUP BY w.lot_id
  ), lot_info AS (
    SELECT l.id, nullif(concat_ws(' · ', coalesce(loc.pavilion_name, CASE WHEN l.block ~* '^[A-Z]{1,2}$' THEN 'Quadra '||l.block END),
      CASE WHEN g.display_name IS DISTINCT FROM loc.pavilion_name THEN g.display_name END),'') location,
      coalesce(CASE WHEN l.lot_number IS NOT NULL THEN (CASE WHEN loc.pavilion_name IS NOT NULL THEN 'Módulo ' ELSE 'Lote ' END)||l.lot_number END, nullif(l.display_name,''), nullif(l.public_identifier,'')) lot_label
    FROM public.commercial_lots l LEFT JOIN locations loc ON loc.lot_id=l.id
    LEFT JOIN public.map_segments g ON g.id=loc.segment_id AND g.project_id=p_project_id
    WHERE l.project_id=p_project_id
  ), orders AS (
    SELECT o.id record_id,'ORDER'::text kind,o.id order_id,NULL::uuid sale_id,
      'PV-'||upper(left(o.id::text,8)) reference,o.created_at,o.buyer_name,o.buyer_trade_name,o.document_number,
      CASE WHEN count(i.id) FILTER (WHERE i.contract_state='CANCELLED')>0
        AND o.spaces_subtotal IS DISTINCT FROM sum(i.item_total) FILTER (WHERE i.contract_state<>'CANCELLED')
        THEN NULL ELSE o.negotiated_total END AS negotiated_total,o.payment_method,
      count(i.id)::int item_count,count(i.id) FILTER(WHERE i.contract_state<>'CANCELLED')::int active_count,
      count(i.id) FILTER(WHERE i.contract_state='SIGNED')::int signed_count,
      count(i.id) FILTER(WHERE i.contract_state='PENDING_SIGNATURE')::int pending_count,
      count(i.id) FILTER(WHERE i.contract_state='CANCELLED')::int cancelled_count,
      count(i.id) FILTER(WHERE i.contract_state='LEGACY_UNVERIFIED')::int legacy_count,
      CASE WHEN count(i.id) FILTER(WHERE i.contract_state='SIGNED')=count(i.signed_at) FILTER(WHERE i.contract_state='SIGNED') THEN max(i.signed_at) FILTER(WHERE i.contract_state='SIGNED') END signed_at,
      array_agg(i.lot_id ORDER BY i.public_identifier) FILTER(WHERE i.contract_state<>'CANCELLED') lot_ids,
      string_agg(concat_ws(' ',i.public_identifier,l.lot_number,coalesce(i.display_name_snapshot,l.display_name),
        i.structure_identifier_snapshot,i.structure_name_snapshot,CASE WHEN i.commercial_unit='FOOD_POINT' THEN 'Gastronomia' END), ' ') AS space_text,
      array_agg(DISTINCT CASE WHEN i.commercial_unit='FOOD_POINT' THEN 'gastronomia' ELSE seg.slug END)
        FILTER (WHERE i.contract_state<>'CANCELLED' OR o.reverted_at IS NOT NULL) AS segment_slugs,
      count(*) FILTER (WHERE i.commercial_unit='FOOD_POINT' AND i.contract_state<>'CANCELLED')::int AS food_point_count,
      NULL::text legacy_contract_number
    FROM public.lot_sale_orders o JOIN public.lot_sale_order_items i ON i.order_id=o.id
    LEFT JOIN public.commercial_lots l ON l.id=i.lot_id
    LEFT JOIN public.map_entities e ON e.id=l.entity_id AND e.project_id=o.project_id
    LEFT JOIN public.map_segments seg ON seg.id=e.segment_id AND seg.project_id=o.project_id
    WHERE o.project_id=p_project_id AND (o.reverted_at IS NULL OR EXISTS (
      SELECT 1 FROM public.lot_sale_order_items fi WHERE fi.order_id=o.id AND fi.commercial_unit='FOOD_POINT'
    )) GROUP BY o.id
  ), legacy AS (
    SELECT s.id,'LEGACY'::text,NULL::uuid,s.id,'LG-'||upper(left(s.id::text,8)),s.created_at,
      s.buyer_name,s.buyer_trade_name,s.document_number,s.negotiated_value,NULL::text,
      1,1,0,0,0,1,NULL::timestamptz,ARRAY[s.lot_id],
      coalesce(l.public_identifier,'')||' '||coalesce(l.lot_number,'')||' '||coalesce(l.display_name,'')||' '||coalesce(s.contract_number,''),
      ARRAY[seg.slug], 0,s.contract_number
    FROM public.lot_sales s JOIN public.commercial_lots l ON l.id=s.lot_id
    LEFT JOIN public.map_entities e ON e.id=l.entity_id AND e.project_id=l.project_id
    LEFT JOIN public.map_segments seg ON seg.id=e.segment_id AND seg.project_id=l.project_id
    WHERE l.project_id=p_project_id AND s.reverted_at IS NULL AND s.status<>'REVERTED'
      AND NOT EXISTS(SELECT 1 FROM public.lot_sale_order_items i WHERE i.sale_id=s.id)
  ), base AS (SELECT * FROM orders UNION ALL SELECT * FROM legacy), enriched AS (
    SELECT b.*,
      CASE WHEN v_docs THEN (SELECT count(DISTINCT c.id)::int FROM public.lot_contracts c
        WHERE c.is_active AND EXISTS(SELECT 1 FROM public.lot_contract_versions v WHERE v.contract_id=c.id AND v.superseded_at IS NULL)
          AND public.commercial_sale_has_active_contract_coverage(c,b.order_id,b.sale_id,b.lot_ids)) END document_count,
      CASE WHEN v_docs THEN (SELECT string_agg(DISTINCT c.contract_number,' ') FROM public.lot_contracts c
        WHERE c.is_active AND public.commercial_sale_has_active_contract_coverage(c,b.order_id,b.sale_id,b.lot_ids)) END contract_numbers,
      (SELECT jsonb_agg(jsonb_build_object('location',q.location,'lots',q.lots) ORDER BY q.location NULLS LAST) FROM (
         SELECT detail.location,jsonb_agg(detail.label ORDER BY detail.label) lots FROM (
           SELECT CASE WHEN i.commercial_unit='FOOD_POINT'
             THEN concat_ws(' · ','Gastronomia',i.structure_name_snapshot,i.structure_identifier_snapshot) ELSE li.location END AS location,
             CASE WHEN i.commercial_unit='FOOD_POINT'
             THEN i.display_name_snapshot||' (1 ponto de alimentação)' ELSE li.lot_label END AS label
           FROM lot_info li LEFT JOIN public.lot_sale_order_items i ON i.lot_id=li.id
             AND i.order_id=b.order_id AND (i.contract_state<>'CANCELLED' OR cardinality(b.lot_ids) IS NULL)
           WHERE li.id=ANY(b.lot_ids) OR (b.food_point_count=0 AND i.commercial_unit='FOOD_POINT' AND cardinality(b.lot_ids) IS NULL)
         ) detail GROUP BY detail.location
       ) q) locations,
      (SELECT jsonb_build_object('number',min(c.contract_number),'createdAt',min(c.created_at))
       FROM public.lot_contracts c
       WHERE v_docs AND cardinality(b.lot_ids)>0 AND c.is_active AND public.commercial_sale_has_active_contract_coverage(c,b.order_id,b.sale_id,b.lot_ids)
       -- LOT documents have no sale/order identity; a resold lot can retain an
       -- older active document. Only an explicit order link can prove ownership.
       HAVING count(*)=1 AND bool_and(
          (c.scope='ORDER_ITEMS' AND c.order_id=b.order_id AND NOT EXISTS(SELECT 1 FROM unnest(b.lot_ids) AS current_lots(id) WHERE NOT EXISTS(SELECT 1 FROM public.lot_contract_lots cl WHERE cl.contract_id=c.id AND cl.removed_at IS NULL AND cl.lot_id=current_lots.id))
           AND NOT EXISTS(SELECT 1 FROM public.lot_contract_lots cl WHERE cl.contract_id=c.id AND cl.removed_at IS NULL AND NOT cl.lot_id=ANY(b.lot_ids)))
       )) sole_contract
    FROM base b
  ), filtered AS (
    SELECT * FROM enriched e WHERE
      (nullif(trim(coalesce(p_search,'')),'') IS NULL OR lower(concat_ws(' ',e.reference,e.buyer_name,e.buyer_trade_name,e.space_text,e.contract_numbers)) LIKE '%'||lower(trim(p_search))||'%')
      AND (p_status IS NULL OR (p_status='PENDING' AND e.pending_count>0) OR (p_status='SIGNED' AND e.signed_count>0 AND e.pending_count=0)
        OR (p_status='PARTIAL' AND e.signed_count>0 AND e.pending_count>0) OR (p_status='CANCELLED_PARTIAL' AND e.cancelled_count>0)
        OR (p_status='LEGACY' AND (e.kind='LEGACY' OR e.legacy_count>0)))
      AND (p_has_document IS NULL OR p_has_document=(e.document_count>0))
      AND (p_segment_slug IS NULL OR p_segment_slug=ANY(e.segment_slugs))
      AND (p_payment_method IS NULL OR e.payment_method=p_payment_method)
      AND (p_from IS NULL OR e.created_at>=p_from::timestamptz)
      AND (p_to IS NULL OR e.created_at<(p_to+1)::timestamptz)
      AND (p_signature_selection='ALL' OR (p_signature_selection='PENDING' AND e.pending_count>0)
        OR (p_signature_selection='SIGNED' AND e.active_count>0 AND e.active_count=e.signed_count))
  )
  SELECT jsonb_build_object('generatedAt',statement_timestamp(),'projectName',(SELECT name FROM public.map_projects WHERE id=p_project_id),
    'rows',coalesce(jsonb_agg(jsonb_build_object(
      'identification',CASE WHEN f.kind='LEGACY' AND nullif(trim(f.legacy_contract_number),'') IS NOT NULL THEN 'Contrato '||f.legacy_contract_number||' · Registro legado '||f.reference
        WHEN nullif(f.sole_contract->>'number','') IS NOT NULL THEN 'Contrato '||(f.sole_contract->>'number')||' · '||CASE WHEN f.kind='ORDER' THEN 'Pedido ' ELSE 'Registro legado ' END||f.reference
        WHEN f.kind='ORDER' THEN 'Pedido '||f.reference ELSE 'Registro legado '||f.reference END,
      'legalName',f.buyer_name,'tradeName',f.buyer_trade_name,'document',f.document_number,
      'createdAt',f.sole_contract->>'createdAt','value',f.negotiated_total,
      'documents',CASE WHEN v_docs AND f.food_point_count>0 THEN (SELECT jsonb_agg(jsonb_build_object(
         'name',coalesce(nullif(c.contract_number,''),v.original_name),
         'spaces',(SELECT jsonb_agg(coalesce(i.display_name_snapshot,l.display_name) ORDER BY i.public_identifier)
           FROM public.lot_sale_order_items i JOIN public.commercial_lots l ON l.id=i.lot_id
           WHERE i.order_id=f.order_id AND i.contract_state<>'CANCELLED'
             AND ((c.scope='LOT' AND c.lot_id=i.lot_id AND (c.sale_id IS NULL OR c.sale_id=i.sale_id))
               OR (c.scope='ORDER_ITEMS' AND EXISTS (SELECT 1 FROM public.lot_contract_lots cl
                 WHERE cl.contract_id=c.id AND cl.lot_id=i.lot_id AND cl.removed_at IS NULL)))))
         ORDER BY c.created_at,c.id)
       FROM public.lot_contracts c JOIN public.lot_contract_versions v ON v.contract_id=c.id AND v.superseded_at IS NULL
       WHERE c.is_active AND public.commercial_sale_has_active_contract_coverage(c,f.order_id,f.sale_id,f.lot_ids))
       END,
      'locations',coalesce(f.locations,'[]'::jsonb),
      'signatureStatus',CASE WHEN f.active_count=0 THEN 'Cancelado'
        WHEN f.pending_count>0 AND f.signed_count>0 AND f.legacy_count=0 THEN 'Parcialmente assinado'
        WHEN f.pending_count>0 AND f.legacy_count>0 THEN 'Aguardando assinatura · situação de parte dos itens não informada'
        WHEN f.pending_count>0 THEN 'Aguardando assinatura'
        WHEN f.active_count=f.signed_count AND f.signed_count>0 THEN 'Assinado'
        ELSE 'Situação de assinatura não informada' END,
      'signatureCompletedAt',CASE WHEN f.active_count>0 AND f.active_count=f.signed_count THEN f.signed_at END,
      'excludedFromCurrentTotal',f.active_count=0
    ) ORDER BY f.created_at DESC,f.record_id),'[]'::jsonb)) INTO result FROM filtered f;
  RETURN result;
END $function$;
REVOKE ALL ON FUNCTION public.export_commercial_sale_orders(uuid,text,text,boolean,text,date,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_commercial_sale_orders(uuid,text,text,boolean,text,date,date,text,text) TO authenticated;

-- Extend the worker report's existing scope and coverage without changing its
-- authorization, financial projection or versioned JSON contract.
DO $migration$
DECLARE
  v_definition text;
  v_before text;
BEGIN
  IF to_regprocedure('public.workers_map_commercial_report(uuid,jsonb)') IS NULL THEN RETURN; END IF;
  v_definition := pg_get_functiondef('public.workers_map_commercial_report(uuid,jsonb)'::regprocedure);
  IF strpos(v_definition, '''commercialUnit'',r.commercial_unit') > 0 THEN RETURN; END IF;
  v_before := v_definition;
  v_definition := replace(v_definition, 'OR l.official_area_sqm IS NULL)',
    'OR (l.commercial_unit=''SQUARE_METER'' AND l.official_area_sqm IS NULL))');
  v_definition := replace(v_definition, 'SELECT r.*,l.lot_number', 'SELECT r.*,l.commercial_unit,l.lot_number');
  v_definition := replace(v_definition, 'OR r.historical_area IS NULL OR',
    'OR (r.commercial_unit=''SQUARE_METER'' AND r.historical_area IS NULL) OR');
  v_definition := replace(v_definition, 'FROM selected WHERE historical_area IS NULL',
    'FROM selected WHERE commercial_unit=''SQUARE_METER'' AND historical_area IS NULL');
  v_definition := replace(v_definition, 'SELECT l.*,e.geometry,e.is_archived entity_archived,',
    'SELECT l.*,e.geometry,e.is_archived entity_archived, CASE WHEN l.commercial_unit=''FOOD_POINT'' THEN EXISTS (
      SELECT 1 FROM entities anchor WHERE anchor.id=e.parent_entity_id AND NOT anchor.is_archived AND anchor.geometry IS NOT NULL
    ) END AS food_anchor_valid,');
  v_definition := replace(v_definition, 'FROM inventory WHERE geometry IS NULL',
    'FROM inventory WHERE (commercial_unit=''SQUARE_METER'' AND geometry IS NULL) OR (commercial_unit=''FOOD_POINT'' AND food_anchor_valid IS NOT TRUE)');
  v_definition := replace(v_definition, 'FROM inventory WHERE official_area_sqm IS NULL',
    'FROM inventory WHERE commercial_unit=''SQUARE_METER'' AND official_area_sqm IS NULL');
  v_definition := replace(v_definition, 'WHERE cl.contract_id=c.id',
    'WHERE cl.contract_id=c.id AND cl.removed_at IS NULL');
  v_definition := replace(v_definition, '''historicalArea'',r.historical_area',
    '''commercialUnit'',r.commercial_unit,''historicalArea'',r.historical_area');
  v_definition := replace(v_definition, '''currentArea'',l.official_area_sqm',
    '''commercialUnit'',l.commercial_unit,''currentArea'',l.official_area_sqm');
  IF v_definition = v_before OR strpos(v_definition, '''commercialUnit'',r.commercial_unit') = 0
    OR strpos(v_definition, 'SELECT r.*,l.commercial_unit,l.lot_number') = 0
    OR strpos(v_definition, 'END AS food_anchor_valid') = 0
    OR strpos(v_definition, 'FROM selected WHERE historical_area IS NULL') > 0
    OR strpos(v_definition, 'FROM inventory WHERE official_area_sqm IS NULL') > 0 THEN
    RAISE EXCEPTION 'COMMERCIAL_REPORT_DEFINITION_CHANGED';
  END IF;
  EXECUTE v_definition;
END $migration$;

-- Plan1, column J (TOTAL), Sugestão COMERCIALIZAÇÃO PONTOS ALIMENTAÇÃO
-- fenasoja 2028 - resumido.xlsx. The published cartographic identifiers resolve
-- anchors inside the same active project used by the official 2028 prices.
DO $seed$
DECLARE
  v_project constant uuid := '0538d132-34dd-4347-a33c-526edac7339c';
  v_segment uuid;
  v_point record;
  v_anchor public.map_entities%ROWTYPE;
  v_entity_id uuid;
  v_lot_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.map_projects WHERE id=v_project AND NOT is_archived)
    OR NOT EXISTS (SELECT 1 FROM public.map_segments WHERE project_id=v_project AND slug='exporural' AND is_active)
  THEN RAISE EXCEPTION 'GASTRONOMY_PROJECT_NOT_FOUND'; END IF;

  INSERT INTO public.map_segments (project_id, slug, name, display_name, source_reference,
    boundary_data, camera_config, visual_config, required_capability)
  VALUES (v_project, 'gastronomia', 'Gastronomia', 'Gastronomia',
    'Plan1 · coluna J (TOTAL) · Pontos de alimentação Fenasoja 2028',
    '{"resolution":"structure-anchors"}',
    '{"direction":[0.48,0.84,0.38],"padding":1.22,"minDistanceRatio":0.1,"maxDistanceRatio":2.2}',
    '{"surface":"#916226","edge":"#674216","accent":"#f2d49c","foreground":"#452e17"}',
    'gastronomia_access')
  ON CONFLICT (project_id, slug) DO NOTHING;
  SELECT id INTO STRICT v_segment FROM public.map_segments WHERE project_id=v_project AND slug='gastronomia';

  FOR v_point IN SELECT * FROM (VALUES
    ('C1','GAST-C1-01',1,'Restaurante Fenasoja','Buffet',85107.00,'J3',NULL::text,NULL::integer),
    ('C2','GAST-C2-01',1,'Restaurante Central','Buffet',50107.00,'J4',NULL,NULL),
    ('C2','GAST-C2-02',2,'Pizzaria','Pizza',32357.00,'J5',NULL,NULL),
    ('D1','GAST-D1-01',1,'Ponto de alimentação 01','Lanche',33000.00,'J7','Alameda Gastronômica',2),
    ('D1','GAST-D1-02',2,'Ponto de alimentação 02','Lanche',33000.00,'J8','Alameda Gastronômica',3),
    ('C4','GAST-C4-01',1,'Churrascaria Exporural','Churrasco',17500.00,'J33',NULL,NULL),
    ('D4','GAST-D4-01',1,'Restaurante Exposição Animais','Buffet',25200.00,'J9','Restaurante Exposição Animais',NULL),
    ('D3','GAST-D3-01',1,'Ponto de alimentação 01',NULL,22780.00,'J26','Via do Mirante',1),
    ('D3','GAST-D3-02',2,'Ponto de alimentação 02',NULL,22780.00,'J27','Via do Mirante',2),
    ('D3','GAST-D3-03',3,'Ponto de alimentação 03',NULL,22780.00,'J28','Via do Mirante',3),
    ('D3','GAST-D3-04',4,'Ponto de alimentação 04',NULL,22780.00,'J29','Via do Mirante',4),
    ('D3','GAST-D3-05',5,'Ponto de alimentação 05',NULL,19150.00,'J30','Via do Mirante',5)
  ) AS initial(anchor_code, point_code, sort_order, display_name, food_type, price, cell, original_label, original_number)
  LOOP
    SELECT a.* INTO STRICT v_anchor FROM public.map_entities a
      WHERE a.project_id=v_project AND a.public_identifier=v_point.anchor_code AND NOT a.is_archived
        AND NOT a.is_sellable AND EXISTS (SELECT 1 FROM public.map_entity_geometries g
          WHERE g.entity_id=a.id AND g.project_id=v_project AND g.is_current);
    IF EXISTS (SELECT 1 FROM public.commercial_lots l WHERE l.project_id=v_project AND l.public_identifier=v_point.point_code) THEN
      IF NOT EXISTS (SELECT 1 FROM public.commercial_lots l JOIN public.map_entities e ON e.id=l.entity_id
        WHERE l.project_id=v_project AND l.public_identifier=v_point.point_code AND l.commercial_unit='FOOD_POINT'
          AND e.parent_entity_id=v_anchor.id AND e.segment_id=v_segment AND e.public_identifier=v_point.point_code) THEN
        RAISE EXCEPTION 'GASTRONOMY_POINT_IDENTITY_CONFLICT:%', v_point.point_code;
      END IF;
      CONTINUE;
    END IF;
    INSERT INTO public.map_entities (project_id,layer_id,parent_entity_id,segment_id,public_identifier,name,
      classification,verification_status,is_sellable)
    VALUES (v_project,v_anchor.layer_id,v_anchor.id,v_segment,v_point.point_code,v_point.display_name,'FOOD_POINT','VERIFIED',true)
    RETURNING id INTO v_entity_id;
    INSERT INTO public.commercial_lots (project_id,entity_id,public_identifier,display_name,status,commercial_unit,unit_quantity,
      display_order,food_type,price_source)
    VALUES (v_project,v_entity_id,v_point.point_code,v_point.display_name,'AVAILABLE','FOOD_POINT',1,
      v_point.sort_order,v_point.food_type,jsonb_strip_nulls(jsonb_build_object(
        'workbook','Sugestão COMERCIALIZAÇÃO PONTOS ALIMENTAÇÃO fenasoja 2028 - resumido.xlsx',
        'sheet','Plan1','cell',v_point.cell,'column','TOTAL','exercise',2028,'initialTotal',v_point.price,
        'structure',v_point.anchor_code,'originalLabel',v_point.original_label,'originalNumber',v_point.original_number)))
    RETURNING id INTO v_lot_id;
    INSERT INTO public.lot_prices (lot_id,pricing_mode,base_price,is_active)
    VALUES (v_lot_id,'FIXED_TOTAL',v_point.price,true);
  END LOOP;
END $seed$;

NOTIFY pgrst, 'reload schema';
COMMIT;
