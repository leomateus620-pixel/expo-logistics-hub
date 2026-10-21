-- Session-local helpers. Run as the existing migration owner; never expose RPCs.
CREATE OR REPLACE FUNCTION pg_temp.exporural_state(p uuid, ids uuid[])
RETURNS jsonb LANGUAGE sql AS $state$
SELECT jsonb_build_object(
 'project',(SELECT to_jsonb(x) FROM public.map_projects x WHERE id=p),
 'segment',(SELECT to_jsonb(x) FROM public.map_segments x WHERE project_id=p AND slug='exporural'),
 'entities',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.map_entities x WHERE project_id=p AND (ids IS NULL OR id=ANY(ids))),'[]'),
 'geometries',coalesce((SELECT jsonb_agg(to_jsonb(x)-'native_geometry' ORDER BY x.id) FROM public.map_entity_geometries x WHERE project_id=p AND (ids IS NULL OR entity_id=ANY(ids))),'[]'),
 'geometry_versions',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.map_geometry_versions x WHERE project_id=p AND (ids IS NULL OR entity_id=ANY(ids))),'[]'),
 'lots',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.commercial_lots x WHERE project_id=p AND (ids IS NULL OR entity_id=ANY(ids))),'[]'),
 'rules',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.commercial_price_rules x WHERE project_id=p OR project_id IS NULL),'[]'),
 'prices',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_prices x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'overrides',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.commercial_lot_price_overrides x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'reservations',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_reservations x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'negotiations',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_negotiations x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'sales',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_sales x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'orders',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_sale_orders x WHERE x.project_id=p AND (ids IS NULL OR x.id IN (SELECT i.order_id FROM public.lot_sale_order_items i JOIN public.commercial_lots l ON l.id=i.lot_id WHERE l.entity_id=ANY(ids)))),'[]'),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_sale_order_items x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'installments',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_sale_installments x JOIN public.lot_sale_orders o ON o.id=x.order_id WHERE o.project_id=p AND (ids IS NULL OR o.id IN (SELECT i.order_id FROM public.lot_sale_order_items i JOIN public.commercial_lots l ON l.id=i.lot_id WHERE l.entity_id=ANY(ids)))),'[]'),
 'contracts',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_contracts x WHERE x.id IN (SELECT c.id FROM public.lot_contracts c JOIN public.commercial_lots l ON l.id=c.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids)) UNION SELECT cl.contract_id FROM public.lot_contract_lots cl JOIN public.commercial_lots l ON l.id=cl.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids)))),'[]'),
 'contract_lots',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.contract_id,x.lot_id) FROM public.lot_contract_lots x JOIN public.commercial_lots l ON l.id=x.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids))),'[]'),
 'contract_versions',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.lot_contract_versions x WHERE x.contract_id IN (SELECT c.id FROM public.lot_contracts c JOIN public.commercial_lots l ON l.id=c.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids)) UNION SELECT cl.contract_id FROM public.lot_contract_lots cl JOIN public.commercial_lots l ON l.id=cl.lot_id WHERE l.project_id=p AND (ids IS NULL OR l.entity_id=ANY(ids)))),'[]'),
 'lineage',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.map_lot_lineage x WHERE x.source_lot_id IN (SELECT id FROM public.commercial_lots WHERE project_id=p AND (ids IS NULL OR entity_id=ANY(ids))) OR x.target_lot_id IN (SELECT id FROM public.commercial_lots WHERE project_id=p AND (ids IS NULL OR entity_id=ANY(ids)))),'[]')
);
$state$;

CREATE OR REPLACE FUNCTION pg_temp.exporural_business(s jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT s-'project'-'segment'-'entities'-'geometries'-'geometry_versions'-'lots'-'rules'-'prices'-'lineage';
$$;
