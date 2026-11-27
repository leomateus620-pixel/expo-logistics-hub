BEGIN;

-- Classify the package as Gastronomia without discarding any historical
-- component sales. Reconciliation will retire their commercial contribution
-- through the usual sale states, independently of cash allocations.
CREATE OR REPLACE FUNCTION public._financial_scenario_lots(project uuid)
RETURNS TABLE(lot_id uuid,category text,issue text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH RECURSIVE entities AS MATERIALIZED (
  SELECT e.id,e.parent_entity_id,e.classification,e.public_identifier,e.metadata,e.is_archived,
   p.category pavilion,s.slug segment,
   e.parent_entity_id IS NOT NULL AND parent.id IS NULL parent_missing
  FROM public.map_entities e
  LEFT JOIN public.map_entities parent ON parent.id=e.parent_entity_id AND parent.project_id=project
  LEFT JOIN public.financial_scenario_pavilions p ON p.entity_id=e.id AND p.project_id=project
  LEFT JOIN public.map_segments s ON s.id=e.segment_id AND s.project_id=project AND s.is_active
  WHERE e.project_id=project
 ), walk AS (
  SELECT l.id lot_id,l.block,l.commercial_unit,l.commercial_package_role,e.*,ARRAY[e.id] path,0 depth,false cycle
  FROM public.commercial_lots l JOIN entities e ON e.id=l.entity_id WHERE l.project_id=project
  UNION ALL
  SELECT w.lot_id,w.block,w.commercial_unit,w.commercial_package_role,e.*,w.path||e.id,w.depth+1,e.id=ANY(w.path)
  FROM walk w JOIN entities e ON e.id=w.parent_entity_id WHERE NOT w.cycle AND w.depth<64
 ), facts AS (
  SELECT w.lot_id,
   bool_or(w.depth=0 AND (w.commercial_unit IN ('FOOD_POINT','FIXED_PACKAGE') OR w.classification='FOOD_POINT')) food_unit,
   bool_or(w.depth=0 AND w.segment='gastronomia' AND (
    (w.commercial_unit='FOOD_POINT' AND w.classification='FOOD_POINT')
    OR (w.commercial_unit='FIXED_PACKAGE' AND w.commercial_package_role='PRINCIPAL')
   )) gastronomy,
   (array_agg(w.pavilion ORDER BY w.depth) FILTER(WHERE w.depth>0 AND w.pavilion IS NOT NULL))[1] pavilion,
   (array_agg(w.segment ORDER BY w.depth) FILTER(WHERE w.segment IS NOT NULL))[1] segment,
   bool_or(w.cycle OR w.depth=64 OR w.is_archived OR w.parent_missing) broken,
   bool_or(w.classification='PAVILION' AND w.pavilion IS NULL) unknown_pavilion,
   bool_or(w.depth=0 AND (w.classification IN ('INTERNAL_STAND','PAVILION') OR w.metadata?'pavilionPublicIdentifier' OR w.metadata?'pavilionModuleKey' OR coalesce(w.block,'')~*'^P[0-9]+$')) interior,
   bool_or(w.classification='QUADRA' AND w.block IS NOT NULL AND upper(w.public_identifier)<> 'QUADRA-'||upper(btrim(w.block))) block_conflict
  FROM walk w GROUP BY w.lot_id
 ) SELECT lot_id,CASE WHEN food_unit THEN CASE WHEN gastronomy THEN 'food_points' END
  WHEN broken OR unknown_pavilion THEN NULL WHEN pavilion IS NOT NULL THEN pavilion WHEN interior OR block_conflict THEN NULL
  WHEN segment='espaco-automovel' THEN 'automotive' WHEN segment='exporural' THEN 'exporural'
  WHEN segment='industria-comercio-servicos' THEN 'external_ics' END,
  CASE WHEN food_unit THEN CASE WHEN gastronomy IS NOT TRUE THEN 'FOOD_POINT_SCOPE_INVALID' END
   WHEN broken THEN 'PARENT_INVALID' WHEN unknown_pavilion THEN 'PAVILION_UNREGISTERED' WHEN pavilion IS NOT NULL THEN NULL
   WHEN interior THEN 'INTERIOR_WITHOUT_PARENT' WHEN block_conflict THEN 'BLOCK_CONFLICT' WHEN segment IS NULL THEN 'SEGMENT_MISSING' END FROM facts
$$;
REVOKE ALL ON FUNCTION public._financial_scenario_lots(uuid) FROM PUBLIC,anon,authenticated;

-- Count the park once in the current inventory. The scenario sale and cash
-- bases remain sourced from their corresponding records.
CREATE OR REPLACE FUNCTION public._financial_scenario_food_inventory(project uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object(
  'units',count(*)::int,
  'packageUnits',(count(*) FILTER (WHERE l.commercial_unit='FIXED_PACKAGE'))::int,
  'pricedUnits',count(p.renovacao_total)::int,
  'availableUnits',(count(*) FILTER (WHERE l.status='AVAILABLE'))::int,
  'tableCents',coalesce(sum(round(p.renovacao_total*100)),0)::bigint::text,
  'availableTableCents',coalesce(sum(round(p.renovacao_total*100)) FILTER (WHERE l.status='AVAILABLE'),0)::bigint::text)
 FROM public.commercial_lots l
 JOIN public.map_entities e ON e.id=l.entity_id AND e.project_id=l.project_id
 JOIN public.map_segments s ON s.id=e.segment_id AND s.project_id=l.project_id
  AND s.slug='gastronomia' AND s.is_active
 LEFT JOIN public.commercial_lot_pricing_2028 p ON p.lot_id=l.id AND p.entity_id=e.id
  AND p.resolution_status<>'EXCLUIDO' AND p.renovacao_total>=0
 WHERE l.project_id=project
  AND ((l.commercial_unit='FOOD_POINT' AND e.classification='FOOD_POINT')
    OR (l.commercial_unit='FIXED_PACKAGE' AND l.commercial_package_role='PRINCIPAL'))
  AND l.commercial_package_role IS DISTINCT FROM 'COMPONENT'
  AND l.archived_at IS NULL AND NOT e.is_archived
$$;
REVOKE ALL ON FUNCTION public._financial_scenario_food_inventory(uuid) FROM PUBLIC,anon,authenticated;

-- An existing package-component order can still be consulted and its
-- pre-existing obligations can receive movements. It cannot originate a new
-- schedule or a new receivable independently of the package.
CREATE FUNCTION public.commercial_package_is_component_order(p_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(bool_or(lot.commercial_package_role='COMPONENT'),false)
   AND count(*) FILTER (
     WHERE item.contract_state<>'CANCELLED' AND lot.commercial_package_role IS DISTINCT FROM 'COMPONENT'
   )=0
 FROM public.lot_sale_order_items item
 JOIN public.commercial_lots lot ON lot.id=item.lot_id
 WHERE item.order_id=p_order_id
$$;

CREATE FUNCTION public.commercial_package_guard_component_schedule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
   IF (NEW.order_id, NEW.installment_number, NEW.amount, NEW.due_date)
     IS NOT DISTINCT FROM (OLD.order_id, OLD.installment_number, OLD.amount, OLD.due_date)
     THEN RETURN NEW;
   END IF;
 END IF;
 IF TG_OP<>'INSERT' AND public.commercial_package_is_component_order(OLD.order_id) THEN
   RAISE EXCEPTION 'COMMERCIAL_PACKAGE_COMPONENT_INSTALLMENTS' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF public.commercial_package_is_component_order(NEW.order_id) THEN
   RAISE EXCEPTION 'COMMERCIAL_PACKAGE_COMPONENT_INSTALLMENTS' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER commercial_package_component_schedule_guard
 BEFORE INSERT OR DELETE OR UPDATE OF order_id, installment_number, amount, due_date ON public.lot_sale_installments
 FOR EACH ROW EXECUTE FUNCTION public.commercial_package_guard_component_schedule();

CREATE FUNCTION public.financial_guard_commercial_package_obligation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE package_order_id uuid; package_order_active boolean;
BEGIN
 IF NEW.source_type IS DISTINCT FROM 'parcela_comercial' THEN RETURN NEW; END IF;
 SELECT installment.order_id INTO package_order_id
 FROM public.lot_sale_installments installment WHERE installment.id=NEW.source_id;
 IF public.commercial_package_is_component_order(package_order_id) AND NOT EXISTS (
     SELECT 1 FROM public.financial_obligations obligation
     WHERE obligation.source_type=NEW.source_type AND obligation.source_id=NEW.source_id
   ) THEN
   RAISE EXCEPTION 'COMMERCIAL_PACKAGE_COMPONENT_RECEIVABLE' USING ERRCODE='23514';
 END IF;
 -- Serialize the first obligation against cancellation of the package.
 SELECT sale_order.status='CONFIRMED' AND sale_order.reverted_at IS NULL
 INTO package_order_active FROM public.lot_sale_orders sale_order
 WHERE sale_order.id=package_order_id AND EXISTS (
   SELECT 1 FROM public.lot_sale_order_items item
   WHERE item.order_id=sale_order.id AND item.commercial_unit='FIXED_PACKAGE'
 ) FOR SHARE OF sale_order;
 IF package_order_active IS FALSE THEN
   RAISE EXCEPTION 'ORDER_NOT_ACTIVE' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER financial_commercial_package_obligation_guard
 BEFORE INSERT OR UPDATE OF source_type, source_id ON public.financial_obligations
 FOR EACH ROW EXECUTE FUNCTION public.financial_guard_commercial_package_obligation();

CREATE FUNCTION public.financial_guard_commercial_package_cancellation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM public.lot_sale_order_items item
   WHERE item.order_id=NEW.id AND item.commercial_unit='FIXED_PACKAGE'
 ) AND EXISTS (
   SELECT 1 FROM public.lot_sale_installments installment
   JOIN public.financial_obligations obligation ON obligation.source_id=installment.id
     AND obligation.source_type='parcela_comercial'
   WHERE installment.order_id=NEW.id
 ) THEN
   RAISE EXCEPTION 'COMMERCIAL_PACKAGE_RECEIVABLE_EXISTS' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER financial_commercial_package_cancellation_guard
 BEFORE UPDATE OF status, reverted_at ON public.lot_sale_orders
 FOR EACH ROW WHEN ((NEW.status IS DISTINCT FROM OLD.status AND NEW.status<>'CONFIRMED')
  OR (NEW.reverted_at IS NOT NULL AND OLD.reverted_at IS NULL))
 EXECUTE FUNCTION public.financial_guard_commercial_package_cancellation();

REVOKE ALL ON FUNCTION public.commercial_package_is_component_order(uuid),
 public.commercial_package_guard_component_schedule(),public.financial_guard_commercial_package_obligation(),
 public.financial_guard_commercial_package_cancellation()
 FROM PUBLIC,anon,authenticated;

COMMIT;
